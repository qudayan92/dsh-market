#!/usr/bin/env node
/**
 * Merge the curation draft into the private catalog, preserving what is there.
 *
 * Reads `private-catalog/plugins.json` (the live whitelist) and
 * `private-catalog/expansion-draft.json` (curated candidates), and writes the
 * union back to `plugins.json`:
 *   - existing entry objects are kept UNCHANGED,
 *   - draft entries are appended unless their install identity already exists,
 *   - `categories` is the union of both,
 *   - `count` is recomputed to match `plugins.length`.
 *
 * Pure data merge; it never deletes an existing entry. Idempotent: running it
 * again after a merge is a no-op (the draft entries are already present, so
 * the dedupe skips them).
 *
 * Usage: node scripts/merge-catalog.mjs [--draft <file>] [--out <file>]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRIVATE = fileURLToPath(new URL('../private-catalog/plugins.json', import.meta.url))
const DRAFT = fileURLToPath(new URL('../private-catalog/expansion-draft.json', import.meta.url))

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name)
  return i === -1 || process.argv[i + 1] === undefined ? dflt : process.argv[i + 1]
}
const draftArg = arg('--draft', null)
const outArg = arg('--out', null)
const draftPath = draftArg === null ? DRAFT : path.resolve(process.cwd(), draftArg)
const outPath = outArg === null ? PRIVATE : path.resolve(process.cwd(), outArg)

const cat = JSON.parse(fs.readFileSync(PRIVATE, 'utf8'))
const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'))

const identity = (p) => (p.npm || `${p.url}#${p.category}`).toLowerCase()
const seen = new Set((cat.plugins || []).map(identity))
const added = []
for (const p of draft.plugins || []) {
  const key = identity(p)
  if (seen.has(key)) continue
  seen.add(key)
  added.push(p)
}

const categories = { ...(cat.categories || {}), ...(draft.categories || {}) }
const merged = {
  ...cat,
  categories,
  count: (cat.plugins || []).length + added.length,
  plugins: [...(cat.plugins || []), ...added],
}

fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n')
console.log(`merge-catalog: ${outPath}`)
console.log(`  existing: ${(cat.plugins || []).length} | draft: ${(draft.plugins || []).length} | added: ${added.length} | total: ${merged.plugins.length}`)
console.log(`  categories: ${Object.keys(categories).length}`)
