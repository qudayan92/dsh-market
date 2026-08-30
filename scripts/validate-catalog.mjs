#!/usr/bin/env node
/**
 * Offline, dependency-free validation for YOUR private plugin catalog.
 *
 * The rules mirror the live snapshot gate (scripts/validate-registry.mjs),
 * aligned with what the dsh-market runtime actually enforces at install time
 * (asRegistry in src/registry.ts + installTargetFor / parseSourceUrl /
 * NPM_NAME_RE in src/sources.ts). The one deliberate difference: the private
 * catalog has no awesome-dsh-plugin.com `page` link, so the `page` rule (E8)
 * is dropped — the field is optional and unused by the runtime.
 *
 * Usage:
 *   node scripts/validate-catalog.mjs [path/to/plugins.json]
 *   (default: private-catalog/plugins.json)
 *
 * Exit code 0 = ok, 1 = errors. Warnings never fail the run.
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const DEFAULT = fileURLToPath(new URL('../private-catalog/plugins.json', import.meta.url))
const TARGET = process.argv[2] ? fileURLToPath(new URL(`../${process.argv[2]}`, import.meta.url)) : DEFAULT

// npm package-name syntax (scoped or simple), per npm rules.
const NPM_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
// repo root, or a /tree/<branch>/<subpath> monorepo subpackage.
const GITHUB_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(\/tree\/[^/]+\/(.+))?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const INSTALL_RE = /^dsh plugin --profile \S+ add (.+)$/
const SHOT_HOSTS = new Set(['raw.githubusercontent.com', 'user-images.githubusercontent.com', 'camo.githubusercontent.com', 'github.com'])

const now = new Date()

function fail(errors, entry, code, msg) {
  errors.push({ entry: entry && entry.name ? entry.name : '<catalog>', code, msg })
}

/** owner/repo of a GitHub release archive, or null. Mirrors releaseTarballTarget. */
function releaseTargetRepo(target) {
  let url
  try { url = new URL(target) } catch { return null }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
  if (!url.pathname.endsWith('.tgz') && !url.pathname.endsWith('.tar.gz')) return null
  const segments = url.pathname.split('/').filter((s) => s !== '')
  if (segments.length < 4 || segments[2] !== 'releases') return null
  return `${segments[0]}/${segments[1]}`.toLowerCase()
}

function main() {
  const errors = []
  const warnings = []

  let raw
  try {
    raw = JSON.parse(fs.readFileSync(TARGET, 'utf8'))
  } catch (e) {
    console.error(`validate-catalog: cannot read ${TARGET}: ${e.message}`)
    process.exit(1)
  }

  const plugins = raw && raw.plugins
  if (!Array.isArray(plugins)) {
    console.error('validate-catalog: catalog.plugins is not an array')
    process.exit(1)
  }
  if (plugins.length === 0) {
    console.error('validate-catalog: catalog.plugins is empty — the market rejects an empty catalog (asRegistry)')
    process.exit(1)
  }

  const categories = new Set(Object.keys((raw && raw.categories) || {}))
  const requiredStrings = ['name', 'owner', 'url', 'category', 'install', 'added']

  const identSeen = new Map()
  const nameToEntries = new Map()
  let subpathCount = 0

  for (const p of plugins) {
    // E1 — required string fields
    for (const f of requiredStrings) {
      if (typeof p[f] !== 'string' || p[f].length === 0) {
        fail(errors, p, 'E1', `missing or empty string field "${f}"`)
      }
    }

    // E2 — bilingual description (the market renders zh + en)
    if (
      typeof p.description !== 'object' || p.description === null ||
      typeof p.description.en !== 'string' || p.description.en.length === 0 ||
      typeof p.description.zh !== 'string' || p.description.zh.length === 0
    ) {
      fail(errors, p, 'E2', 'description must be an object with non-empty "en" and "zh" strings')
    }

    // E3 — npm type & syntax. The install route uses `npm` (when present) as
    // the pnpm target, so a malformed name would silently break install.
    if (!(p.npm === null || typeof p.npm === 'string')) {
      fail(errors, p, 'E3', 'npm must be null or a string')
    } else if (p.npm && !NPM_NAME_RE.test(p.npm)) {
      fail(errors, p, 'E3', `npm "${p.npm}" is not a valid npm package name`)
    }

    // E4 — stars: non-negative integer or null
    if (p.stars !== null && p.stars !== undefined
      && (typeof p.stars !== 'number' || !Number.isInteger(p.stars) || p.stars < 0)) {
      fail(errors, p, 'E4', `stars must be a non-negative integer or null, got ${JSON.stringify(p.stars)}`)
    }

    // E5 — url shape (repo root or tree subpath). The install route's
    // parseSourceUrl only accepts github.com/owner/repo, so this is mandatory
    // even for npm-published plugins — the url is what the identity guard and
    // install-target resolution read; the bytes come from npm.
    const um = typeof p.url === 'string' ? p.url.match(GITHUB_URL_RE) : null
    if (!um) {
      fail(errors, p, 'E5', `url is not a github.com repo/tree url: ${p.url}`)
    } else if (um[4] !== undefined) {
      subpathCount++
    }

    // E6 — owner matches url owner
    if (um && p.owner !== um[1]) {
      fail(errors, p, 'E6', `owner "${p.owner}" does not match url owner "${um[1]}"`)
    }

    // E7 — category whitelist
    if (!categories.has(p.category)) {
      fail(errors, p, 'E7', `category "${p.category}" is not in the declared whitelist`)
    }

    // E9 — added date, not future
    if (typeof p.added !== 'string' || !DATE_RE.test(p.added)) {
      fail(errors, p, 'E9', `added "${p.added}" is not YYYY-MM-DD`)
    } else {
      const dt = new Date(p.added + 'T00:00:00Z')
      if (Number.isNaN(dt.getTime())) fail(errors, p, 'E9', `added "${p.added}" is not a valid date`)
      else if (dt > now) fail(errors, p, 'E9', `added "${p.added}" is in the future`)
    }

    // E10 — install references the real target (npm name, or github:...)
    const im = typeof p.install === 'string' ? p.install.match(INSTALL_RE) : null
    if (!im) {
      fail(errors, p, 'E10', `install must match "dsh plugin --profile <p> add <target>": ${p.install}`)
    } else {
      const target = im[1].replace(/^"(.*)"$/, '$1')
      if (p.npm) {
        if (target !== p.npm) fail(errors, p, 'E10', `install target "${target}" does not match npm "${p.npm}"`)
      } else if (um) {
        const expect = `github:${um[1]}/${um[2]}`
        const release = releaseTargetRepo(target)
        if (release !== null) {
          if (release !== `${um[1]}/${um[2]}`.toLowerCase()) {
            fail(errors, p, 'E10', `release archive "${target}" belongs to ${release}, not ${um[1]}/${um[2]}`)
          }
        } else if (!target.startsWith(expect)) {
          fail(errors, p, 'E10', `install target "${target}" does not reference ${expect}`)
        }
      }
    }

    // E12 — screenshots (optional): 1-8 https URLs on GitHub image hosting.
    if (p.screenshots !== undefined) {
      if (!Array.isArray(p.screenshots) || p.screenshots.length === 0 || p.screenshots.length > 8) {
        fail(errors, p, 'E12', 'screenshots must be an array of 1-8 URLs when present')
      } else {
        for (const shot of p.screenshots) {
          let parsed = null
          try { parsed = new URL(String(shot)) } catch { /* fails below */ }
          if (parsed === null || parsed.protocol !== 'https:' || !SHOT_HOSTS.has(parsed.hostname)) {
            fail(errors, p, 'E12', `screenshot must be an https URL on GitHub hosting: ${String(shot)}`)
          }
        }
      }
    }

    // E11 — true install-identity uniqueness
    let identity
    if (p.npm) identity = `npm:${p.npm}`
    else if (um) {
      const sp = um[4] ?? (im && (im[1].match(/#path:\/(.+)$/) || [])[1]) ?? ''
      identity = `gh:${um[1]}/${um[2]}#${sp}`
    } else identity = `??:${p.url}`
    if (identSeen.has(identity)) {
      fail(errors, p, 'E11', `duplicate install identity with "${identSeen.get(identity)}"`)
    } else identSeen.set(identity, p.name)

    const seen = nameToEntries.get(p.name)
    if (seen) seen.push(p.owner)
    else nameToEntries.set(p.name, [p.owner])
  }

  // E12 — count integrity
  if (typeof raw.count === 'number' && raw.count !== plugins.length) {
    fail(errors, null, 'E12', `top-level count ${raw.count} != plugins.length ${plugins.length}`)
  }

  let nameCollisionGroups = 0
  for (const [name, owners] of nameToEntries) {
    if (owners.length > 1) {
      nameCollisionGroups++
      warnings.push(`display name "${name}" used by ${owners.length} entries (owners: ${owners.join(', ')})`)
    }
  }
  const gitOnly = plugins.filter((p) => p.npm === null).length

  console.log(`validate-catalog: ${TARGET}`)
  console.log(`  plugins: ${plugins.length} | categories: ${categories.size} | npm-published: ${plugins.length - gitOnly} | git-only: ${gitOnly} | monorepo-subpath: ${subpathCount}`)

  if (errors.length > 0) {
    console.error(`\n  ${errors.length} error(s):`)
    for (const e of errors) console.error(`   [${e.code}] ${e.entry}: ${e.msg}`)
    console.log(`\n  warnings: ${warnings.length}`)
    process.exit(1)
  }
  console.log(`  warnings: ${warnings.length}`)
  for (const w of warnings) console.log(`   - ${w}`)
  console.log('\n  catalog ok ✓')
}

main()
