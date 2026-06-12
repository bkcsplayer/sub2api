#!/usr/bin/env node
/**
 * Approve pending knowledge cards → move to imports/cherry/cards + push Khoj.
 *
 * Usage:
 *   node approve-pending-deposit.mjs           # list pending
 *   node approve-pending-deposit.mjs --all    # approve all
 *   node approve-pending-deposit.mjs <id>     # approve one (filename prefix)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')
const PENDING_DIR = path.join(deployRoot, 'brain', 'data', 'cherry', 'pending')
const CARDS_DIR = path.join(deployRoot, 'brain', 'imports', 'cherry', 'cards')
const KHOJ_URL = (
  process.env.KHOJ_LOCAL_URL || `http://127.0.0.1:${process.env.KHOJ_PORT || 5871}`
).replace(/\/$/, '')

async function pushToKhoj(absPath, relativePath) {
  const form = new FormData()
  const data = fs.readFileSync(absPath)
  form.append('files', new Blob([data], { type: 'text/markdown' }), relativePath)
  const res = await fetch(`${KHOJ_URL}/api/content?client=cherry`, {
    method: 'PATCH',
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Khoj upload ${res.status}: ${text.slice(0, 200)}`)
  }
}

function listPending() {
  if (!fs.existsSync(PENDING_DIR)) return []
  return fs
    .readdirSync(PENDING_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
}

async function approveOne(filename) {
  const src = path.join(PENDING_DIR, filename)
  if (!fs.existsSync(src)) throw new Error(`Not found: ${filename}`)

  const day = new Date().toISOString().slice(0, 10)
  const destDir = path.join(CARDS_DIR, day)
  fs.mkdirSync(destDir, { recursive: true })
  const destName = filename.replace(/^pending-/, '')
  const dest = path.join(destDir, destName)
  fs.copyFileSync(src, dest)
  fs.unlinkSync(src)

  const rel = `cherry/cards/${day}/${destName}`
  await pushToKhoj(dest, rel)
  console.log(`Approved: ${rel}`)
  if (process.argv.includes('--sync-obsidian')) {
    const { execSync } = await import('node:child_process')
    execSync('node sync-cards-to-obsidian.mjs', { cwd: path.dirname(fileURLToPath(import.meta.url)), stdio: 'inherit' })
  }
}

async function main() {
  const args = process.argv.slice(2)
  const pending = listPending()

  if (!args.length) {
    if (!pending.length) {
      console.log('No pending cards.')
      return
    }
    console.log('Pending knowledge cards:')
    for (const f of pending) console.log(`  - ${f}`)
    console.log('\nApprove: node approve-pending-deposit.mjs --all | <filename-prefix>')
    return
  }

  if (args[0] === '--all') {
    for (const f of pending) await approveOne(f)
    return
  }

  const match = pending.find((f) => f.startsWith(args[0]))
  if (!match) throw new Error(`No pending file matching: ${args[0]}`)
  await approveOne(match)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
