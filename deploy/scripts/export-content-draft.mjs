#!/usr/bin/env node
/**
 * Turn knowledge cards into content drafts (课程 / 小红书 / X thread).
 *
 * Usage:
 *   node export-content-draft.mjs --format course
 *   node export-content-draft.mjs --format xhs --tag khoj
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')
const CARDS_DIR = path.join(deployRoot, 'brain', 'imports', 'cherry', 'cards')
const OUT_DIR = path.join(deployRoot, 'brain', 'exports')

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

function parseCard(abs) {
  const text = fs.readFileSync(abs, 'utf8')
  const pick = (h) => (text.match(new RegExp(`## ${h}\\s*\\n+([\\s\S]*?)(\\n## |\\Z)`))?.[1] || '').trim()
  return {
    title: text.match(/^#\s+(.+)$/m)?.[1] || path.basename(abs, '.md'),
    summary: pick('摘要'),
    problem: pick('问题'),
    solution: pick('方案'),
    commands: pick('关键命令'),
    tags: (text.match(/^tags:.*$/m)?.[0] || '').replace(/.*\[/, '').replace(/\].*/, '').split(',').map((t) => t.replace(/"/g, '').trim()).filter(Boolean),
  }
}

function draftCourse(cards) {
  const lines = ['# 课程素材包', `生成：${new Date().toISOString()}`, '']
  cards.forEach((c, i) => {
    lines.push(
      `## 第 ${i + 1} 讲：${c.title}`,
      '',
      '### 学习目标',
      `- 理解并能复现：${c.title}`,
      '',
      '### 问题场景',
      c.problem || c.summary || '—',
      '',
      '### 解决方案',
      c.solution || '—',
      '',
    )
    if (c.commands) lines.push('### 实操', '', c.commands, '')
    lines.push('---', '')
  })
  return lines.join('\n')
}

function draftXhs(cards) {
  const lines = ['# 小红书素材包', '']
  for (const c of cards) {
    const tags = (c.tags.length ? c.tags : ['个人成长', '效率工具']).slice(0, 5)
    lines.push(
      `## ${c.title}`,
      '',
      c.summary || c.solution || c.problem,
      '',
      `标签：${tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ')}`,
      '',
      '---',
      '',
    )
  }
  return lines.join('\n')
}

function draftThread(cards) {
  const lines = ['# X / Thread 素材', '']
  for (const c of cards) {
    lines.push(`### ${c.title}`, '', `1/ ${c.problem || c.summary}`, '', `2/ ${c.solution}`, '', '---', '')
  }
  return lines.join('\n')
}

function main() {
  const fmtIdx = process.argv.indexOf('--format')
  const format = fmtIdx >= 0 ? process.argv[fmtIdx + 1] : 'course'
  const tagIdx = process.argv.indexOf('--tag')
  const tag = tagIdx >= 0 ? process.argv[tagIdx + 1] : null

  let cards = walkCards(CARDS_DIR).map(parseCard)
  if (tag) cards = cards.filter((c) => c.tags.some((t) => t.includes(tag)))
  if (!cards.length) {
    console.error('No cards found.')
    process.exit(1)
  }

  const body =
    format === 'xhs' ? draftXhs(cards) : format === 'thread' ? draftThread(cards) : draftCourse(cards)

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const out = path.join(OUT_DIR, `draft-${format}-${new Date().toISOString().slice(0, 10)}.md`)
  fs.writeFileSync(out, body, 'utf8')
  console.log(out)
}

main()
