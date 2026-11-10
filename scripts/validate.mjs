#!/usr/bin/env node
// Validate checklist.json against what Remix IDE relies on.
//
//   node scripts/validate.mjs                 # structure + formatting
//   node scripts/validate.mjs --base origin/main   # also fail if any id/category was removed vs that git ref
//
// Rules (errors fail the run, warnings are printed only):
//  - Root is an array of categories; category = { category, description, data[] }.
//  - Item = { id, question, description, remediation?, references?: string[], tags?: string[] }.
//  - Ids are globally unique; sibling category names are unique.
//  - A top-level category holds either items or subcategories, never both: Remix only
//    exposes `Main` or `Main::Sub` as selectable, so direct items of a mixed top-level
//    category would never be loaded.
//  - Existing ids and category paths are never removed or renamed (--base): renaming a
//    category changes the filename Remix saves it under, orphaning users' saved audits.
//  - File is serialized canonically (see lib/checklist.mjs) so diffs stay minimal.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { CHECKLIST_PATH, ROOT, isItem, serialize, walk } from './lib/checklist.mjs'

const args = process.argv.slice(2)
const baseRef = args.includes('--base') ? args[args.indexOf('--base') + 1] : null

const errors = []
const warnings = []
const err = (where, msg) => errors.push(`${where}: ${msg}`)
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

const raw = readFileSync(CHECKLIST_PATH, 'utf8')
let data
try {
  data = JSON.parse(raw)
} catch (e) {
  console.error(`checklist.json is not valid JSON: ${e.message}`)
  process.exit(1)
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string')

if (!Array.isArray(data)) {
  console.error('checklist.json root must be an array of categories')
  process.exit(1)
}

const ids = new Map()
const questions = new Map()

function checkCategory (node, path) {
  const where = [...path, node.category ?? '<unnamed>'].join(' > ')
  if (!isNonEmptyString(node.category)) err(where, 'category name missing')
  if (typeof node.description !== 'string') err(where, 'category description must be a string')
  if (!Array.isArray(node.data) || node.data.length === 0) return err(where, 'category data must be a non-empty array')

  const names = new Set()
  for (const child of node.data) {
    if (isItem(child)) continue
    if (names.has(child.category)) err(where, `duplicate subcategory "${child.category}"`)
    names.add(child.category)
  }
  if (path.length === 0) {
    const hasItems = node.data.some(isItem)
    const hasSubs = node.data.some((c) => !isItem(c))
    if (hasItems && hasSubs) err(where, 'top-level category mixes items and subcategories; Remix would drop the direct items')
  }
}

function checkItem (item, path) {
  const where = `${path.join(' > ')} > ${item.id}`
  for (const key of ['id', 'question', 'description']) {
    if (!isNonEmptyString(item[key])) err(where, `"${key}" must be a non-empty string`)
  }
  if (item.remediation !== undefined && typeof item.remediation !== 'string') err(where, '"remediation" must be a string')
  if (item.references !== undefined && !isStringArray(item.references)) err(where, '"references" must be an array of strings')
  if (item.tags !== undefined && !isStringArray(item.tags)) err(where, '"tags" must be an array of strings')
  for (const ref of item.references ?? []) {
    if (!/^https?:\/\/\S+$/.test(ref)) warn(where, `reference is not a URL: ${ref}`)
  }
  const known = new Set(['id', 'question', 'description', 'remediation', 'references', 'tags'])
  for (const key of Object.keys(item)) if (!known.has(key)) warn(where, `unknown field "${key}"`)

  if (ids.has(item.id)) err(where, `duplicate id (also at ${ids.get(item.id)})`)
  ids.set(item.id, path.join(' > '))
  const q = item.question?.trim().toLowerCase()
  if (q && questions.has(q)) warn(where, `duplicate question (same as ${questions.get(q)})`)
  if (q) questions.set(q, item.id)
  if (item.tags?.includes('needs-review')) warn(where, 'auto-generated item still tagged "needs-review"')
}

const topNames = new Set()
for (const node of data) {
  if (isItem(node)) { err('root', `item ${node.id} at top level; items must live inside a category`); continue }
  if (topNames.has(node.category)) err('root', `duplicate top-level category "${node.category}"`)
  topNames.add(node.category)
}

walk(data, (node, path) => {
  if (!node || typeof node !== 'object') return err(path.join(' > ') || 'root', 'non-object entry')
  if (isItem(node)) checkItem(node, path)
  else checkCategory(node, path)
})

if (serialize(data) !== raw) {
  err('format', 'checklist.json is not canonically formatted; run `node scripts/format.mjs`')
}

if (baseRef) {
  let baseRaw
  try {
    baseRaw = execFileSync('git', ['show', `${baseRef}:checklist.json`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
  } catch (e) {
    err('base', `could not read checklist.json at ${baseRef}`)
  }
  if (baseRaw) {
    const base = JSON.parse(baseRaw)
    const catPaths = (tree) => {
      const s = new Set()
      walk(tree, (n, p) => { if (!isItem(n)) s.add([...p, n.category].join(' > ')) })
      return s
    }
    const baseIds = new Set()
    walk(base, (n) => { if (isItem(n)) baseIds.add(n.id) })
    for (const id of baseIds) if (!ids.has(id)) err('compat', `id ${id} was removed or renamed (present in ${baseRef})`)
    const nowCats = catPaths(data)
    for (const p of catPaths(base)) if (!nowCats.has(p)) err('compat', `category "${p}" was removed or renamed (present in ${baseRef})`)
  }
}

for (const w of warnings) console.warn(`warning  ${w}`)
for (const e of errors) console.error(`error    ${e}`)
console.log(`\n${ids.size} items, ${topNames.size} top-level categories — ${errors.length} error(s), ${warnings.length} warning(s)`)
process.exit(errors.length ? 1 : 0)
