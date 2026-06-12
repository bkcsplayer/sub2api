#!/usr/bin/env node
/**
 * Move pre-P1 raw cherry dumps out of imports/ and remove from Khoj index.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')
const importsRoot = path.join(deployRoot, 'brain', 'imports', 'cherry')
const legacyRoot = path.join(deployRoot, 'brain', 'data', 'cherry', 'legacy-raw')
const KHOJ_URL = (
  process.env.KHOJ_LOCAL_URL || `http://127.0.0.1:${process.env.KHOJ_PORT || 5871}`
).replace(/\/$/, '')

function isLegacyRaw(absPath) {
  const rel = path.relative(importsRoot, absPath).replace(/\\/g, '/')
  if (rel.startsWith('cards/')) return false
  if (rel === 'test.md') return true
  // old layout: YYYY-MM-DD/*.md without kind:knowledge-card
  if (/^\d{4}-\d{2}-\d{2}\/.+\.md$/.test(rel)) {
    const text = fs.readFileSync(absPath, 'utf8')
    return !text.includes('kind: knowledge-card')
  }
  return false
}

async function deleteFromKhoj(filename) {
  const url = `${KHOJ_URL}/api/content/file?filename=${encodeURIComponent(filename)}`
  const res = await fetch(url, { method: 'DELETE' })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Khoj delete ${filename}: ${res.status} ${text.slice(0, 120)}`)
  }
}

function walkMd(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    if (fs.statSync(abs).isDirectory()) out.push(...walkMd(abs))
    else if (name.endsWith('.md')) out.push(abs)
  }
  return out
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const files = walkMd(importsRoot).filter(isLegacyRaw)
  if (!files.length) {
    console.log('No legacy raw imports found.')
    return
  }

  console.log(`Found ${files.length} legacy file(s):`)
  for (const abs of files) {
    const rel = `cherry/${path.relative(importsRoot, abs).replace(/\\/g, '/')}`
    console.log(`  - ${rel}`)
    if (dryRun) continue

    const dest = path.join(legacyRoot, path.relative(importsRoot, abs))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(abs, dest)
    fs.unlinkSync(abs)
    await deleteFromKhoj(rel)
    console.log(`    moved → legacy-raw, removed from Khoj`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
