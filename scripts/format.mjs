#!/usr/bin/env node
// Rewrite checklist.json in canonical form (4-space indent, ASCII-escaped, no trailing newline).
import { loadChecklist, saveChecklist } from './lib/checklist.mjs'

saveChecklist(loadChecklist())
console.log('checklist.json formatted')
