#!/usr/bin/env node
/**
 * Private-catalog expansion draft (WS: content curation).
 *
 * This fork's market serves `private-catalog/plugins.json` as a CURRATED
 * WHITELIST. This tool pulls HIGH-QUALITY, npm-published, non-deprecated,
 * bilingual candidates from the upstream awesome-dsh-plugin snapshot
 * (`data/registry-snapshot.json`) — the source the curator samples from — and
 * writes a schema-valid draft (`private-catalog/expansion-draft.json`) with the
 * `categories` and `plugins` needed to paste into the real catalog.
 *
 * The draft is a STARTING POINT for human curation, not an auto-merge: the
 * private catalog is a trust/whitelist decision, so every entry must still be
 * reviewed before it ships.
 *
 * Quality weights mirror `qualityScore` in src/client/market-data.ts, so the
 * sort here and the market's own "质量" sort agree.
 *
 * Usage: node scripts/catalog-expansion.mjs [--out <file>] [--top <n>] [--per-cat <k>]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SNAPSHOT = fileURLToPath(new URL('../data/registry-snapshot.json', import.meta.url))
const PRIVATE = fileURLToPath(new URL('../private-catalog/plugins.json', import.meta.url))
const DEFAULT_OUT = fileURLToPath(new URL('../private-catalog/expansion-draft.json', import.meta.url))

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i === -1 || process.argv[i + 1] === undefined ? dflt : process.argv[i + 1]
}
const outArg = arg('--out', null)
const OUT = outArg === null ? DEFAULT_OUT : path.resolve(process.cwd(), outArg)
const TOP = Number(arg('--top', '30'))
const PER_CAT = Number(arg('--per-cat', '3'))

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
const privateCat = JSON.parse(fs.readFileSync(PRIVATE, 'utf8'))
const catMeta = snapshot.categories || {}
const existing = new Set([
  ...(privateCat.plugins || []).map((p) => (p.npm || '').toLowerCase()).filter(Boolean),
  ...(privateCat.plugins || []).map((p) => p.name),
])

/** Mirrors qualityScore in src/client/market-data.ts. */
function quality(p) {
  let s = 0
  if (p.npm) s += 45
  else if (p.tarball) s += 32
  else if (typeof p.url === 'string' && /\/tree\//.test(p.url)) s += 10
  else s += 16
  if (typeof p.downloads === 'number') s += p.downloads > 0 ? 18 : 3
  if (typeof p.stars === 'number') s += p.stars > 0 ? 12 : 2
  if (p.screenshots && p.screenshots.length > 0) s += 6
  const en = (p.description && p.description.en) || ''
  const zh = (p.description && p.description.zh) || ''
  if (en.length >= 20 && zh.length >= 20) s += 4
  if (p.deprecated) s -= 30
  return s
}

function bilingual(p) {
  const d = p.description
  return !!(d && d.en && d.zh)
}

const nameCount = new Map()
for (const p of snapshot.plugins) nameCount.set(p.name, (nameCount.get(p.name) || 0) + 1)

const eligible = snapshot.plugins
  .filter((p) => typeof p.npm === 'string' && p.npm && !p.deprecated && bilingual(p))
  .filter((p) => !existing.has((p.npm || '').toLowerCase()) && !existing.has(p.name))
  .map((p) => ({ p, score: quality(p) - ((nameCount.get(p.name) || 1) - 1) * 5 }))
  .sort((a, b) => b.score - a.score)

// Balanced selection: per-category top K, then top global to reach TOP.
const byCat = new Map()
for (const e of eligible) {
  const cat = e.p.category
  if (!byCat.has(cat)) byCat.set(cat, [])
  byCat.get(cat).push(e)
}
const chosen = []
const picked = new Set()
for (const [cat, list] of byCat) {
  for (const e of list.slice(0, PER_CAT)) {
    if (chosen.length >= TOP) break
    if (!picked.has(e)) { chosen.push(e); picked.add(e) }
  }
  if (chosen.length >= TOP) break
}
for (const e of eligible) {
  if (chosen.length >= TOP) break
  if (!picked.has(e)) { chosen.push(e); picked.add(e) }
}

const usedCats = new Set(chosen.map((e) => e.p.category))
const categories = Object.fromEntries(
  [...usedCats].sort().map((id) => [id, catMeta[id] || { en: id, zh: id }]),
)

const plugins = chosen.map(({ p }) => {
  const out = {
    name: p.name,
    owner: p.owner,
    url: p.url,
    category: p.category,
    description: { en: p.description.en, zh: p.description.zh },
  }
  if (p.npm) out.npm = p.npm
  if (typeof p.stars === 'number') out.stars = p.stars
  if (typeof p.downloads === 'number') out.downloads = p.downloads
  if (p.screenshots && p.screenshots.length > 0) out.screenshots = p.screenshots
  out.install = p.install
  out.added = p.added
  return out
})

const draft = {
  name: privateCat.name,
  url: privateCat.url,
  source: privateCat.source,
  updated: snapshot.updated,
  count: plugins.length,
  categories,
  plugins,
}

fs.writeFileSync(OUT, JSON.stringify(draft, null, 2) + '\n')

const score = (e) => e.score
console.log(`catalog-expansion: ${OUT}`)
console.log(`  eligible (npm, bilingual, not already listed): ${eligible.length}`)
console.log(`  selected: ${chosen.length} across ${usedCats.size} categories`)
console.log(`  top by score:`)
for (const e of chosen.slice(0, 10)) {
  console.log(`    ${String(e.score).padStart(3)}  ${e.p.category.padEnd(10)} ${e.p.name} (${e.p.owner})`)
}
console.log(`  category coverage: ${[...usedCats].sort().join(', ')}`)
