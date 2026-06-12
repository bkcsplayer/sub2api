#!/usr/bin/env node
/**
 * Copy knowledge cards into Obsidian vault using PARA folders.
 * Khoj indexes brain/obsidian-vault via Docker mount /data/obsidian.
 *
 * Usage: node sync-cards-to-obsidian.mjs [--all]
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')
const CARDS_DIR = path.join(deployRoot, 'brain', 'imports', 'cherry', 'cards')
const VAULT_ROOT = path.join(deployRoot, 'brain', 'obsidian-vault')
const STATE_PATH = path.join(deployRoot, 'brain', 'data', 'obsidian-sync-state.json')

const PARA_DIRS = {
  Projects: 'Projects',
  Areas: 'Areas',
  Resources: 'Resources',
  Archives: 'Archives',
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return { synced: {} }
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

function walkCards(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    if (fs.statSync(abs).isDirectory()) out.push(...walkCards(abs))
    else if (name.endsWith('.md')) out.push(abs)
  }
  return out
}

function parsePara(text) {
  const m = text.match(/^para:\s*(.+)$/m)
  const raw = m?.[1]?.trim() || 'Resources'
  return PARA_DIRS[raw] ? raw : 'Resources'
}

function safeName(name) {
  return (name || 'untitled')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function main() {
  const syncAll = process.argv.includes('--all')
  const state = loadState()
  let copied = 0

  for (const abs of walkCards(CARDS_DIR)) {
    const text = fs.readFileSync(abs, 'utf8')
    const hash = createHash('sha256').update(text).digest('hex')
    const rel = path.relative(CARDS_DIR, abs).replace(/\\/g, '/')
    if (!syncAll && state.synced[rel] === hash) continue

    const title = text.match(/^#\s+(.+)$/m)?.[1] || path.basename(abs, '.md')
    const para = parsePara(text)
    const destDir = path.join(VAULT_ROOT, PARA_DIRS[para])
    fs.mkdirSync(destDir, { recursive: true })

    const dest = path.join(destDir, `${safeName(title)}.md`)
    fs.copyFileSync(abs, dest)
    state.synced[rel] = hash
    copied++
    console.log(`Synced: ${para}/${safeName(title)}.md`)
  }

  saveState(state)
  console.log(copied ? `Done. ${copied} card(s) → obsidian-vault` : 'No new cards to sync.')
}

main()
