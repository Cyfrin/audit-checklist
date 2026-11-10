// Shared helpers for reading, walking and writing checklist.json.
//
// checklist.json is consumed at runtime by Remix IDE (checklist explorer modal +
// /audit agent), so its shape is a contract. See scripts/validate.mjs for the rules.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CHECKLIST_PATH = join(ROOT, 'checklist.json')

export const isItem = (node) => !!node && typeof node.id === 'string' && typeof node.question === 'string'

export function readJson (path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Serialize exactly like Python's json.dumps(obj, indent=4, ensure_ascii=True),
 * which is how upstream (Solodit) produces checklist.json. Keeping byte-identical
 * output means a script run only shows the lines it actually changed.
 */
export function serialize (data, { indent = 4, trailingNewline = false } = {}) {
  const out = JSON.stringify(data, null, indent)
    .replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
  return trailingNewline ? out + '\n' : out
}

export function writeJson (path, data, opts) {
  writeFileSync(path, serialize(data, opts))
}

export const loadChecklist = () => readJson(CHECKLIST_PATH)
export const saveChecklist = (data) => writeJson(CHECKLIST_PATH, data)

/** Depth-first walk. visit(node, path) where path is the list of category names above node. */
export function walk (nodes, visit, path = []) {
  for (const node of nodes) {
    visit(node, path)
    if (!isItem(node) && Array.isArray(node.data)) walk(node.data, visit, [...path, node.category])
  }
}

export function allItems (checklist) {
  const items = []
  walk(checklist, (node, path) => { if (isItem(node)) items.push({ item: node, path }) })
  return items
}

/** Find a category node by its name path, e.g. ['Basics', 'Version Issues', 'Solidity Version Issues']. */
export function findCategory (checklist, names) {
  let level = checklist
  let node = null
  for (const name of names) {
    node = level.find((n) => !isItem(n) && n.category === name)
    if (!node) throw new Error(`Category not found: ${names.join(' > ')}`)
    level = node.data
  }
  return node
}

/** Next free numeric suffix for ids shaped `${prefix}-<n>`. */
export function nextId (category, prefix) {
  let max = 0
  for (const n of category.data) {
    const m = isItem(n) && n.id.startsWith(prefix + '-') && /^\d+$/.test(n.id.slice(prefix.length + 1))
    if (m) max = Math.max(max, Number(n.id.slice(prefix.length + 1)))
  }
  return () => `${prefix}-${++max}`
}
