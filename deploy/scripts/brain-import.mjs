/**
 * Import web chat or page clip into knowledge pipeline (shared by CLI + bridge + extension).
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  buildCardMarkdown,
  distillConversation,
  formatConversation,
  loadDistillPrompt,
  resolveIndexTarget,
  slugify,
} from './knowledge-distill.mjs'

export function parseWebChat(raw, title) {
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
      turns.push({ role: 'user', content: title || 'Imported content' })
      turns.push({ role: 'assistant', content: raw.trim() })
    }
  }
  return turns
}

export function buildPageTurns({ title, url, content }) {
  const header = [`# ${title || '网页摘录'}`, url ? `来源: ${url}` : ''].filter(Boolean).join('\n')
  return [
    { role: 'user', content: `${header}\n\n${content}`.trim() },
    { role: 'assistant', content: '（网页摘录，待提炼为知识卡片）' },
  ]
}

async function pushToKhoj(khojUrl, absPath, relativePath) {
  const form = new FormData()
  form.append('files', new Blob([fs.readFileSync(absPath)], { type: 'text/markdown' }), relativePath)
  const res = await fetch(`${khojUrl}/api/content?client=brain-extension`, { method: 'PATCH', body: form })
  if (!res.ok) throw new Error(`Khoj ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

export async function importBrainContent({
  deployRoot,
  type = 'chat',
  title = '导入内容',
  content,
  url = '',
  deposit = true,
  source = 'extension',
}) {
  if (!content?.trim()) throw new Error('content is empty')

  const env = {}
  const envPath = path.join(deployRoot, '.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].trim()
    }
  }

  const apiBase = env.SUB2API_REMOTE_URL || 'https://api.coolapihub.khtain.com/v1/'
  const apiKey = env.SUB2API_API_KEY || ''
  const model = env.CHERRY_DISTILL_MODEL || 'claude-sonnet-4-6'
  const autoIndex = env.CHERRY_DEPOSIT_AUTO_INDEX || 'high'
  const khojUrl = (env.KHOJ_LOCAL_URL || 'http://127.0.0.1:5871').replace(/\/$/, '')

  const cardsDir = path.join(deployRoot, 'brain', 'imports', 'cherry', 'cards')
  const pendingDir = path.join(deployRoot, 'brain', 'data', 'cherry', 'pending')
  const rawDir = path.join(deployRoot, 'brain', 'data', 'cherry', 'raw')
  for (const d of [cardsDir, pendingDir, rawDir]) fs.mkdirSync(d, { recursive: true })

  const turns = type === 'page' ? buildPageTurns({ title, url, content }) : parseWebChat(content, title)
  const conversationText = formatConversation(turns)

  const rawName = `${slugify(title)}-${Date.now()}.md`
  const rawPath = path.join(rawDir, rawName)
  fs.writeFileSync(
    rawPath,
    `# ${title}\n\nsource: ${source}\nurl: ${url}\n\n${conversationText}\n`,
    'utf8',
  )

  if (!deposit) {
    return { ok: true, deposited: false, raw: path.relative(deployRoot, rawPath) }
  }

  let distillPrompt
  try {
    distillPrompt = loadDistillPrompt(deployRoot)
  } catch {
    throw new Error('deposit-distill-prompt.md missing')
  }

  const { card } = await distillConversation({
    conversationText,
    distillPrompt,
    apiBase,
    apiKey,
    model,
  })

  if (!card || typeof card !== 'object') {
    throw new Error('AI 提炼结果解析失败，请重试')
  }

  if (!card.worth_saving) {
    return {
      ok: true,
      deposited: false,
      reason: 'not_worth_saving',
      title: card.title || title,
      raw: path.relative(deployRoot, rawPath).replace(/\\/g, '/'),
    }
  }

  card.title = card.title || title
  const target = resolveIndexTarget(card, autoIndex)
  if (target === 'skip') {
    return {
      ok: true,
      deposited: false,
      reason: 'skip',
      title: card.title,
      raw: path.relative(deployRoot, rawPath).replace(/\\/g, '/'),
    }
  }

  const cardMd = buildCardMarkdown(card, {
    model,
    source,
    url,
    conversationText: conversationText.length < 12000 ? conversationText : undefined,
  })
  const cardName = `${slugify(card.title)}-${Date.now()}.md`
  const destDir = target === 'cards' ? cardsDir : pendingDir
  const cardPath = path.join(destDir, cardName)
  fs.writeFileSync(cardPath, cardMd, 'utf8')

  let indexed = false
  if (target === 'cards') {
    const rel = path.relative(path.join(deployRoot, 'brain', 'imports'), cardPath).replace(/\\/g, '/')
    await pushToKhoj(khojUrl, cardPath, rel)
    indexed = true
  }

  return {
    ok: true,
    deposited: true,
    indexed,
    pending: target === 'pending',
    title: card.title,
    confidence: card.confidence,
    card: path.relative(deployRoot, cardPath).replace(/\\/g, '/'),
    raw: path.relative(deployRoot, rawPath).replace(/\\/g, '/'),
  }
}
