import fs from 'node:fs'
import path from 'node:path'

export function formatConversation(messages = []) {
  return messages
    .map((m) => {
      const role = m.role || m.type || 'unknown'
      const label =
        role === 'user' || role === 'human'
          ? '用户'
          : role === 'assistant'
            ? '助手'
            : role === 'system'
              ? '系统'
              : role
      const body = normalizeContent(m.content)
      if (!body || role === 'system') return null
      return `### ${label}\n${body}`
    })
    .filter(Boolean)
    .join('\n\n')
}

export function normalizeContent(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      if (typeof block === 'string') return block
      if (block?.type === 'text' || block?.type === 'input_text') return block.text || ''
      if (block?.type === 'image') return '[image]'
      return block?.text || ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function extractJsonObject(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function distillConversation({
  conversationText,
  distillPrompt,
  apiBase,
  apiKey,
  model,
}) {
  const base = apiBase.endsWith('/') ? apiBase : `${apiBase}/`
  const res = await fetch(`${base}chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: distillPrompt },
        {
          role: 'user',
          content: `请提炼以下对话：\n\n${conversationText}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Distill API ${res.status}: ${errText.slice(0, 300)}`)
  }

  const json = await res.json()
  const raw = json.choices?.[0]?.message?.content?.trim() || ''
  const card = extractJsonObject(raw)
  if (!card) throw new Error(`Distill parse failed: ${raw.slice(0, 200)}`)
  return { card, raw }
}

export function buildCardMarkdown(card, meta = {}) {
  const now = new Date()
  const tags = Array.isArray(card.tags) ? card.tags : []
  const stack = Array.isArray(card.stack) ? card.stack : []
  const commands = Array.isArray(card.commands) ? card.commands : []

  const frontmatter = [
    '---',
    'source: cherry-studio',
    'kind: knowledge-card',
    `type: ${card.type || 'concept'}`,
    `confidence: ${card.confidence || 'medium'}`,
    `para: ${card.para || 'Resources'}`,
    `model: ${meta.model || 'unknown'}`,
    `created: ${now.toISOString()}`,
    `title: ${JSON.stringify(card.title || '未命名知识')}`,
    `tags: [${[...tags, 'cherry', 'distilled'].map((t) => JSON.stringify(t)).join(', ')}]`,
    stack.length ? `stack: [${stack.map((s) => JSON.stringify(s)).join(', ')}]` : null,
    '---',
  ]
    .filter(Boolean)
    .join('\n')

  const sections = [
    frontmatter,
    '',
    `# ${card.title || '未命名知识'}`,
    '',
    card.summary ? `## 摘要\n\n${card.summary}` : null,
    card.problem ? `## 问题\n\n${card.problem}` : null,
    card.solution ? `## 方案\n\n${card.solution}` : null,
    commands.length
      ? `## 关键命令\n\n${commands.map((c) => `- \`${c}\``).join('\n')}`
      : null,
    meta.conversationText
      ? `## 原始对话（归档）\n\n${meta.conversationText}`
      : null,
    '',
  ].filter((s) => s !== null)

  return sections.join('\n')
}

export function slugify(title) {
  return (title || 'untitled')
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'untitled'
}

export function loadDistillPrompt(deployRoot) {
  const p = path.join(deployRoot, 'brain', 'profile', 'deposit-distill-prompt.md')
  return fs.readFileSync(p, 'utf8')
}

export function resolveIndexTarget(card, autoIndexMode) {
  if (!card?.worth_saving) return 'skip'
  if (autoIndexMode === 'manual') return 'pending'
  if (autoIndexMode === 'always') return 'cards'
  const conf = (card.confidence || 'low').toLowerCase()
  if (autoIndexMode === 'high') return conf === 'high' ? 'cards' : 'pending'
  return conf === 'low' ? 'pending' : 'cards'
}
