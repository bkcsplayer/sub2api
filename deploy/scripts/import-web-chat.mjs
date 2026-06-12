#!/usr/bin/env node
/**
 * Import pasted web/CLI chat into knowledge pipeline (P3 web capture lite).
 *
 * Usage:
 *   node import-web-chat.mjs conversation.md
 *   node import-web-chat.mjs --title "Gemini 讨论" --deposit < chat.txt
 *
 * File format (flexible):
 *   ## 用户 / ## User / Q:
 *   ## 助手 / ## Assistant / A:
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCardMarkdown,
  distillConversation,
  loadDistillPrompt,
  resolveIndexTarget,
  slugify,
} from './knowledge-distill.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')

function loadEnv() {
  const env = {}
  const p = path.join(deployRoot, '.env')
  if (!fs.existsSync(p)) return env
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

function parseConversation(raw, title) {
  const blocks = raw.split(/\n(?=##\s*(用户|User|提问|助手|Assistant|回答|AI)\b)/i)
  const turns = []
  for (const block of blocks) {
    const m = block.match(/^##\s*(用户|User|提问)\s*\n+([\s\S]*)/i)
    if (m) {
      turns.push({ role: 'user', content: m[2].trim() })
      continue
    }
    const a = block.match(/^##\s*(助手|Assistant|回答|AI)\s*\n+([\s\S]*)/i)
    if (a) turns.push({ role: 'assistant', content: a[2].trim() })
  }
  if (!turns.length) {
    const parts = raw.split(/\n---+\n/)
    if (parts.length >= 2) {
      turns.push({ role: 'user', content: parts[0].trim() })
      turns.push({ role: 'assistant', content: parts.slice(1).join('\n---\n').trim() })
    } else {
      turns.push({ role: 'user', content: title || 'Imported chat' })
      turns.push({ role: 'assistant', content: raw.trim() })
    }
  }
  return turns
}

function formatConversation(messages) {
  return messages
    .map((m) => `### ${m.role === 'user' ? '用户' : '助手'}\n${m.content}`)
    .join('\n\n')
}

async function pushToKhoj(absPath, relativePath) {
  const khojUrl = (process.env.KHOJ_LOCAL_URL || 'http://127.0.0.1:5871').replace(/\/$/, '')
  const form = new FormData()
  form.append('files', new Blob([fs.readFileSync(absPath)], { type: 'text/markdown' }), relativePath)
  const res = await fetch(`${khojUrl}/api/content?client=cherry`, { method: 'PATCH', body: form })
  if (!res.ok) throw new Error(`Khoj ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

async function main() {
  const env = loadEnv()
  const titleFlag = process.argv.indexOf('--title')
  const title = titleFlag >= 0 ? process.argv[titleFlag + 1] : 'Web 对话导入'
  const file = process.argv.find((a) => a.endsWith('.md') || a.endsWith('.txt'))
  const raw = file ? fs.readFileSync(path.resolve(file), 'utf8') : fs.readFileSync(0, 'utf8')

  const messages = parseConversation(raw, title)
  const conversationText = formatConversation(messages)
  const distillPrompt = loadDistillPrompt(deployRoot)

  const { card } = await distillConversation({
    conversationText,
    distillPrompt,
    apiBase: env.SUB2API_REMOTE_URL || 'https://api.coolapihub.khtain.com/v1/',
    apiKey: env.SUB2API_API_KEY,
    model: env.CHERRY_DISTILL_MODEL || 'claude-sonnet-4-6',
  })

  if (!card.worth_saving) {
    console.log('AI judged not worth saving. Use a more substantive conversation.')
    process.exit(1)
  }

  card.title = card.title || title
  const markdown = buildCardMarkdown(card, { model: 'web-import', conversationText })
  const autoIndex = env.CHERRY_DEPOSIT_AUTO_INDEX || 'high'
  const target = resolveIndexTarget(card, autoIndex)

  const day = new Date().toISOString().slice(0, 10)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const slug = slugify(card.title)
  const filename = `${stamp}-web-${slug}.md`

  if (target === 'cards') {
    const dir = path.join(deployRoot, 'brain', 'imports', 'cherry', 'cards', day)
    fs.mkdirSync(dir, { recursive: true })
    const abs = path.join(dir, filename)
    fs.writeFileSync(abs, markdown, 'utf8')
    const rel = `cherry/cards/${day}/${filename}`
    await pushToKhoj(abs, rel)
    console.log(`Imported → Khoj: ${rel}`)
  } else {
    const dir = path.join(deployRoot, 'brain', 'data', 'cherry', 'pending')
    fs.mkdirSync(dir, { recursive: true })
    const abs = path.join(dir, `pending-${filename}`)
    fs.writeFileSync(abs, markdown, 'utf8')
    console.log(`Imported → pending: ${path.basename(abs)}`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
