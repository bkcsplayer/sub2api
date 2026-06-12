#!/usr/bin/env node
/**
 * Export knowledge cards as a content outline (自媒体 / 课程素材工坊 lite).
 *
 * Usage:
 *   node export-knowledge-outline.mjs
 *   node export-knowledge-outline.mjs --para Projects --tag khoj
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')
const CARDS_DIR = path.join(deployRoot, 'brain', 'imports', 'cherry', 'cards')
const OUT_DIR = path.join(deployRoot, 'brain', 'exports')

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.+)$/)
    if (kv) fm[kv[1]] = kv[2].replace(/^"|"$/g, '')
  }
  return fm
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

function main() {
  const paraFilter = process.argv.includes('--para')
    ? process.argv[process.argv.indexOf('--para') + 1]
    : null
  const tagFilter = process.argv.includes('--tag')
    ? process.argv[process.argv.indexOf('--tag') + 1]
    : null

  const cards = walkCards(CARDS_DIR).map((abs) => {
    const text = fs.readFileSync(abs, 'utf8')
    const fm = parseFrontmatter(text)
    const titleMatch = text.match(/^#\s+(.+)$/m)
    return {
      abs,
      rel: path.relative(path.join(deployRoot, 'brain', 'imports'), abs).replace(/\\/g, '/'),
      title: titleMatch?.[1] || fm.title || path.basename(abs),
      para: fm.para || 'Resources',
      type: fm.type || 'concept',
      created: fm.created || '',
      tags: (fm.tags || '').replace(/[[\]]/g, '').split(',').map((t) => t.trim()).filter(Boolean),
      summary: (text.match(/## 摘要\s*\n+([\s\S]*?)(\n## |\Z)/)?.[1] || '').trim(),
    }
  })

  let filtered = cards
  if (paraFilter) filtered = filtered.filter((c) => c.para === paraFilter)
  if (tagFilter) filtered = filtered.filter((c) => c.tags.some((t) => t.includes(tagFilter)))

  filtered.sort((a, b) => (a.created < b.created ? 1 : -1))

  const byPara = {}
  for (const c of filtered) {
    byPara[c.para] = byPara[c.para] || []
    byPara[c.para].push(c)
  }

  const lines = [
    '# 第二大脑 · 知识素材大纲',
    '',
    `生成时间：${new Date().toISOString()}`,
    `卡片数量：${filtered.length}`,
    '',
  ]

  for (const [para, items] of Object.entries(byPara)) {
    lines.push(`## ${para}`, '')
    for (const c of items) {
      lines.push(`### ${c.title}`)
      lines.push(`- 类型：${c.type} | 标签：${c.tags.join(', ') || '—'}`)
      if (c.summary) lines.push(`- 摘要：${c.summary}`)
      lines.push(`- 文件：\`${c.rel}\``)
      lines.push('')
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const outPath = path.join(OUT_DIR, `outline-${stamp}.md`)
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(outPath)
}

main()
