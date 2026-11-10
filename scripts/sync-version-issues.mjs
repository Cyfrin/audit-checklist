#!/usr/bin/env node
// Sync "Basics > Version Issues" with the upstream sources of truth:
//   - Solidity compiler bugs:  ethereum/solidity docs/bugs.json + docs/bugs_by_version.json
//   - OpenZeppelin Contracts:  GitHub Security Advisories (npm @openzeppelin/contracts[-upgradeable])
//
//   node scripts/sync-version-issues.mjs           # dry run: report what would change
//   node scripts/sync-version-issues.mjs --write   # update ref/ files and checklist.json
//
// Coverage is tracked in each item's `tags`, which Remix does not render:
//   solc bugs     → "solc:<BugName>" (unique key) plus the "SOL-YYYY-N" uid, which some bugs share
//   OZ advisories → "GHSA-xxxx-xxxx-xxxx" (plus aliases for duplicate advisories of the same issue) Items that predate tagging are matched once by version
// range + wording and tagged in place. Uncovered bugs get a drafted item tagged
// "needs-review": the wording is templated from the source and should be tightened by
// a human before release (validate.mjs warns while the tag is present).
//
// Solc bugs only fixed before SOLC_MIN_FIXED (pre-2017 compilers) are skipped, matching
// upstream's original selection; override with --solc-min-fixed <version>.
//
// Set GITHUB_TOKEN (e.g. in a git-ignored .env, loaded by `npm run sync:versions`) to
// avoid GitHub's unauthenticated API rate limit of 60 requests/hour.

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ROOT, allItems, findCategory, isItem, loadChecklist, nextId, readJson, saveChecklist, writeJson
} from './lib/checklist.mjs'

const argv = process.argv.slice(2)
const WRITE = argv.includes('--write')
const SOLC_MIN_FIXED = argv.includes('--solc-min-fixed') ? argv[argv.indexOf('--solc-min-fixed') + 1] : '0.4.11'

const SOLC_RAW = 'https://raw.githubusercontent.com/ethereum/solidity/develop/docs'
const SOLC_BUGS_DOC = 'https://docs.soliditylang.org/en/latest/bugs.html'
const OZ_PACKAGES = ['@openzeppelin/contracts', '@openzeppelin/contracts-upgradeable']
const SVI_PATH = ['Basics', 'Version Issues', 'Solidity Version Issues']
const OVI_PATH = ['Basics', 'Version Issues', 'OpenZeppelin Version Issues']
const REF_SOLC = join(ROOT, 'ref', '1-solidity_bugs.json')
const REF_OZ = join(ROOT, 'ref', '1-openzeppelin_bugs.json')

// ── fetching ────────────────────────────────────────────────────────────────

async function get (url, { json = true } = {}) {
  const headers = { 'User-Agent': 'audit-checklist-sync', Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com')) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`)
  return json ? res.json() : res.text()
}

async function fetchSolc () {
  const [bugsText, byVersion] = await Promise.all([
    get(`${SOLC_RAW}/bugs.json`, { json: false }),
    get(`${SOLC_RAW}/bugs_by_version.json`)
  ])
  return { bugsText, bugs: JSON.parse(bugsText), byVersion }
}

async function fetchOz () {
  const byId = new Map()
  for (const pkg of OZ_PACKAGES) {
    for (let page = 1; ; page++) {
      const batch = await get(`https://api.github.com/advisories?ecosystem=npm&affects=${encodeURIComponent(pkg)}&per_page=100&page=${page}`)
      for (const adv of batch) if (!adv.withdrawn_at && !byId.has(adv.ghsa_id)) byId.set(adv.ghsa_id, adv)
      if (batch.length < 100) break
    }
  }
  return [...byId.values()].sort((a, b) => b.published_at.localeCompare(a.published_at))
}

// ── version helpers ─────────────────────────────────────────────────────────

const semverKey = (v) => v.split(/[.-]/).slice(0, 3).map((n) => n.padStart(4, '0')).join('.')

/** {min, max} of solc releases affected by a bug, from bugs_by_version.json. */
function solcAffected (name, byVersion) {
  const versions = Object.keys(byVersion).filter((v) => byVersion[v].bugs.includes(name)).sort((a, b) => semverKey(a).localeCompare(semverKey(b)))
  return versions.length ? { min: versions[0], max: versions[versions.length - 1] } : null
}

/** Same label style as the existing items: "=0.8.8", "~0.4.11", "0.6.7~0.8.20". */
function solcRangeLabel (bug, aff) {
  if (!aff) return bug.fixed ? `<${bug.fixed}` : 'unknown'
  if (aff.min === aff.max) return `=${aff.max}`
  return bug.introduced ? `${aff.min}~${aff.max}` : `~${aff.max}`
}

/** Parse "(version 0.6.7~0.8.20)" / "(version ~0.4.11)" / "(version =0.8.8)" from a question. */
function parseSolcLabel (question) {
  const m = question.match(/\(version\s*([^)]*)\)\s*$/)
  if (!m) return null
  const s = m[1].trim()
  if (s.startsWith('=')) return { lo: s.slice(1), hi: s.slice(1) }
  const [lo, hi] = s.split('~').map((x) => x.trim())
  return hi ? { lo: lo || null, hi } : null
}

/** GHSA "">= 4.0.0, < 4.9.3" → ">=4.0.0 <4.9.3" (the existing label style). */
const ozRangeLabel = (range) => range.replace(/\s*,\s*/g, ' ').replace(/(>=|<=|<|>|=)\s+/g, '$1').trim()

function ozRanges (adv) {
  const pick = (pkg) => adv.vulnerabilities.filter((v) => v.package.name === pkg)
  const vulns = pick(OZ_PACKAGES[0]).length ? pick(OZ_PACKAGES[0]) : pick(OZ_PACKAGES[1])
  return vulns.map((v) => ({ range: ozRangeLabel(v.vulnerable_version_range), patched: v.first_patched_version }))
}

const upperBounds = (s) => new Set([...s.matchAll(/<=?\s*([0-9][\w.-]*)/g)].map((m) => m[1].replace(/-.*$/, '')))

/**
 * Fold advisories describing the same issue: they share a fixed-version bound and
 * their impact text largely overlaps. The earliest published one is kept.
 */
function dedupeAdvisories (advisories) {
  const byAge = [...advisories].sort((a, b) => a.published_at.localeCompare(b.published_at))
  const canonical = []
  const aliases = new Map()
  for (const adv of byAge) {
    const bounds = new Set(ozRanges(adv).flatMap((r) => [...upperBounds(r.range)]))
    const twin = canonical.find((c) => {
      const cb = ozRanges(c).flatMap((r) => [...upperBounds(r.range)])
      // Real re-filings are near-verbatim (≥0.98); distinct bugs with similar phrasing
      // (e.g. ERC165Checker vs SignatureChecker "may revert") score ~0.85.
      return cb.some((b) => bounds.has(b)) && overlap(ozImpact(c), ozImpact(adv)) >= 0.95
    })
    if (twin) aliases.set(adv.ghsa_id, twin.ghsa_id)
    else canonical.push(adv)
  }
  return { canonical: canonical.reverse(), aliases }
}

// ── fuzzy wording match (tie-breaker only; version range must already agree) ─

const STOP = new Set('the a an of to in and or is are be may can for with on by does contract contracts that this use uses using when if not from as at it its which could version openzeppelin solidity'.split(' '))
const words = (s) => new Set((s.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w)))
function overlap (a, b) {
  const A = words(a); const B = words(b)
  let n = 0
  for (const w of A) if (B.has(w)) n++
  return n / Math.max(1, Math.min(A.size, B.size))
}

/** Greedy best-score assignment of sources → items. scoreFn returns null when ineligible. */
function assign (sources, items, scoreFn) {
  const pairs = []
  for (const s of sources) for (const it of items) {
    const sc = scoreFn(s, it)
    if (sc !== null) pairs.push({ s, it, sc })
  }
  pairs.sort((a, b) => b.sc - a.sc)
  const usedS = new Set(); const usedI = new Set(); const out = []
  for (const p of pairs) {
    if (usedS.has(p.s) || usedI.has(p.it)) continue
    usedS.add(p.s); usedI.add(p.it); out.push(p)
  }
  return out
}

// ── item drafting ───────────────────────────────────────────────────────────

const clean = (s) => s.replace(/``/g, '`').replace(/\s+/g, ' ').trim()
const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1)
const firstSentence = (s) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim().replace(/[.!?]$/, '')

function describeConditions (c = {}) {
  const parts = []
  if (c.optimizer === true) parts.push('the optimizer is enabled')
  if (c.optimizer === false) parts.push('the optimizer is disabled')
  if (c.yulOptimizer === true) parts.push('the Yul optimizer is enabled')
  if (c.viaIR === true) parts.push('compiling via IR (`viaIR: true`)')
  if (c.viaIR === false) parts.push('using the legacy (non-IR) pipeline')
  if (c.ABIEncoderV2 === true) parts.push('ABI coder v2 is used')
  if (c.evmVersion) parts.push(`the target EVM version is ${c.evmVersion}`)
  return parts.length ? ` Only affects builds where ${parts.join(' and ')}.` : ''
}

function draftSolcItem (bug, aff, id) {
  return {
    id,
    question: `Does the contract hit the compiler bug where ${lcFirst(firstSentence(clean(bug.summary)))}? (version ${solcRangeLabel(bug, aff)})`,
    // The one-paragraph summary, like upstream items; the full write-up is behind the reference.
    description: `${clean(bug.summary)}${describeConditions(bug.conditions)}`,
    remediation: bug.fixed ? `Compile with solc ${bug.fixed} or later.` : 'Use the latest Solidity version.',
    references: [bug.link ?? SOLC_BUGS_DOC],
    tags: [bug.uid, `solc:${bug.name}`, `severity:${bug.severity}`, 'needs-review']
  }
}

/** The advisory's "Impact" prose: markdown headings dropped, Patches/Workarounds/... cut off. */
function ozImpact (adv) {
  const body = (adv.description ?? '')
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join(' ')
  return clean(body).split(/\s(?=Patches|Workarounds|References|For more information)\b/)[0]
}

function ozDescription (adv) {
  const impact = ozImpact(adv)
  return impact.length > 700 ? impact.slice(0, 697).replace(/\s\S*$/, '') + '...' : impact || clean(adv.summary)
}

function draftOzItem (adv, id) {
  const ranges = ozRanges(adv)
  const patched = [...new Set(ranges.map((r) => r.patched).filter(Boolean))]
  return {
    id,
    question: `Is the contract affected by "${clean(adv.summary).replace(/^OpenZeppelin Contracts( and Contracts Upgradeable)?('s)?\s*/i, '')}"? (version ${ranges.map((r) => r.range).join(' / ')})`,
    description: ozDescription(adv),
    remediation: patched.length ? `Upgrade OpenZeppelin Contracts to ${patched.join(' / ')} or later.` : 'Use the latest stable OpenZeppelin version.',
    references: [adv.html_url],
    tags: [adv.ghsa_id, `severity:${adv.severity}`, 'needs-review']
  }
}

// ── main ────────────────────────────────────────────────────────────────────

const tagged = (item, re) => (item.tags ?? []).find((t) => re.test(t))
const addTag = (item, tag) => { item.tags = [...new Set([...(item.tags ?? []), tag])] }

const checklist = loadChecklist()
const svi = findCategory(checklist, SVI_PATH)
const ovi = findCategory(checklist, OVI_PATH)
const coveredElsewhere = new Set(allItems(checklist).flatMap(({ item }) => item.tags ?? []))
const report = { tagged: [], drafted: [], aliases: [] }

console.log('Fetching solc bugs and OpenZeppelin advisories...')
const [solc, oz] = await Promise.all([fetchSolc(), fetchOz()])

// Solidity: tag legacy items, then draft the rest.
{
  const tooOld = (b) => b.fixed && semverKey(b.fixed) < semverKey(SOLC_MIN_FIXED)
  const pending = solc.bugs.filter((b) => !coveredElsewhere.has(`solc:${b.name}`))
  const skipped = pending.filter(tooOld)
  if (skipped.length) report.skipped = `${skipped.length} solc bug(s) fixed before ${SOLC_MIN_FIXED} (${skipped.map((b) => b.uid).join(', ')})`
  const sources = pending.filter((b) => !tooOld(b)).map((b) => ({ b, aff: solcAffected(b.name, solc.byVersion) }))
  const legacy = svi.data.filter((it) => isItem(it) && !tagged(it, /^solc:/))
  const matches = assign(sources, legacy, ({ b, aff }, it) => {
    const lbl = parseSolcLabel(it.question)
    if (!lbl || !aff || lbl.hi !== aff.max) return null
    const loOk = lbl.lo === null || lbl.lo === aff.min || lbl.lo === '0.0.1' || !b.introduced
    if (!loOk) return null
    return 1 + overlap(`${it.question} ${it.description}`, `${b.summary} ${b.description}`)
  })
  const matched = new Set()
  for (const { s, it } of matches) {
    addTag(it, s.b.uid); addTag(it, `solc:${s.b.name}`); matched.add(s.b.name)
    report.tagged.push(`${it.id} ← ${s.b.uid} ${s.b.name}`)
  }
  const untagged = svi.data.filter((it) => isItem(it) && !tagged(it, /^solc:/)).map((it) => it.id)
  if (untagged.length) report.untaggedSolc = untagged
  const next = nextId(svi, 'SOL-Basics-VI-SVI')
  for (const { b, aff } of sources) {
    if (matched.has(b.name)) continue
    const item = draftSolcItem(b, aff, next())
    svi.data.push(item)
    report.drafted.push(`${item.id} ← ${b.uid} ${b.name} [${b.severity}]`)
  }
}

// OpenZeppelin: same approach, matching on the upper bounds of the version range.
// GitHub sometimes files the same issue twice (once per package, or re-published), so
// duplicates are folded into the earliest advisory and carried as alias tags.
{
  const { canonical, aliases } = dedupeAdvisories(oz)
  for (const [dup, of] of aliases) report.aliases.push(`${dup} = ${of}`)
  const sources = canonical.filter((a) => !coveredElsewhere.has(a.ghsa_id))
  const legacy = ovi.data.filter((it) => isItem(it) && !tagged(it, /^GHSA-/))
  const matches = assign(sources, legacy, (adv, it) => {
    const itemBounds = upperBounds(it.question)
    const advBounds = new Set(ozRanges(adv).flatMap((r) => [...upperBounds(r.range)]))
    const shared = [...advBounds].filter((b) => itemBounds.has(b)).length
    if (!shared) return null
    return shared + overlap(`${it.question} ${it.description}`, `${adv.summary} ${adv.description}`)
  })
  const matched = new Set()
  const tagWithAliases = (it, adv) => {
    addTag(it, adv.ghsa_id)
    for (const [dup, of] of aliases) if (of === adv.ghsa_id) addTag(it, dup)
  }
  for (const { s, it } of matches) {
    tagWithAliases(it, s); matched.add(s.ghsa_id)
    report.tagged.push(`${it.id} ← ${s.ghsa_id} ${clean(s.summary).slice(0, 70)}`)
  }
  const next = nextId(ovi, 'SOL-Basics-VI-OVI')
  for (const adv of sources) {
    if (matched.has(adv.ghsa_id)) continue
    const item = draftOzItem(adv, next())
    tagWithAliases(item, adv)
    item.tags.push(item.tags.splice(item.tags.indexOf('needs-review'), 1)[0])
    ovi.data.push(item)
    report.drafted.push(`${item.id} ← ${adv.ghsa_id} ${clean(adv.summary).slice(0, 70)} [${adv.severity}]`)
  }
  const untagged = ovi.data.filter((it) => isItem(it) && !tagged(it, /^GHSA-/)).map((it) => it.id)
  if (untagged.length) report.untaggedOz = untagged
}

console.log(`\nTagged ${report.tagged.length} existing item(s):`)
for (const l of report.tagged) console.log(`  ${l}`)
console.log(`\nDrafted ${report.drafted.length} new item(s) (tagged needs-review):`)
for (const l of report.drafted) console.log(`  ${l}`)
if (report.aliases.length) console.log(`\nDuplicate advisories folded together: ${report.aliases.join(', ')}`)
if (report.skipped) console.log(`\nSkipped ${report.skipped}`)
if (report.untaggedSolc) console.log(`\nSolidity items with no matching compiler bug (left as-is): ${report.untaggedSolc.join(', ')}`)
if (report.untaggedOz) console.log(`OpenZeppelin items with no matching advisory (left as-is): ${report.untaggedOz.join(', ')}`)

if (!WRITE) {
  console.log('\nDry run — nothing written. Re-run with --write to apply.')
} else {
  writeFileSync(REF_SOLC, solc.bugsText)
  const prevOz = readJson(REF_OZ)
  writeJson(REF_OZ, {
    source: 'https://github.com/advisories?query=ecosystem%3Anpm+%40openzeppelin%2Fcontracts',
    previousSource: prevOz.previousSource ?? prevOz.source,
    issues: oz.map((a) => ({
      ghsa: a.ghsa_id,
      cve: a.cve_id,
      version: ozRanges(a).map((r) => r.range).join(' || '),
      patched: [...new Set(ozRanges(a).map((r) => r.patched).filter(Boolean))].join(' || '),
      vulnerability: clean(a.summary),
      severity: a.severity,
      published: a.published_at.slice(0, 10),
      url: a.html_url
    }))
  }, { indent: 2, trailingNewline: true })
  saveChecklist(checklist)
  console.log('\nWrote checklist.json, ref/1-solidity_bugs.json, ref/1-openzeppelin_bugs.json')
}
