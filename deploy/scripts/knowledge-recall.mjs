/** Search Khoj and inject relevant notes before Cherry chat (P2 recall). */

import { normalizeContent } from './knowledge-distill.mjs'
import { stripTriggerMarkers } from './knowledge-triggers.mjs'

export const RECALL_MARKER = '[second-brain-recall]'

function pickTitle(entry) {
  const m = entry.match(/^title:\s*"?([^"\n]+)"?/m)
  if (m) return m[1].trim()
  const heading = entry.match(/^#\s+(.+)$/m)
  if (heading) return heading[1].trim()
  return entry.slice(0, 80).replace(/\s+/g, ' ')
}

function pickSummary(entry) {
  const m = entry.match(/## 摘要\s*\n+([\s\S]*?)(\n## |\n---|\Z)/)
  if (m) return m[1].trim().slice(0, 280)
  const m2 = entry.match(/## 方案\s*\n+([\s\S]*?)(\n## |\Z)/)
  if (m2) return m2[1].trim().slice(0, 280)
  return entry.replace(/^---[\s\S]*?---\s*/m, '').trim().slice(0, 220)
}

export async function searchKhoj({ khojUrl, query, limit = 3 }) {
  const url = `${khojUrl.replace(/\/$/, '')}/api/search?q=${encodeURIComponent(query)}&n=${limit}`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) return []
  const data = await res.json()
  const rows = Array.isArray(data) ? data : data.value || []
  return rows
}

export function buildRecallPrompt(hits, { minScore = 0.18 } = {}) {
  // Khoj: lower score = better match
  const ranked = [...hits].sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
  const preferCards = ranked.filter((h) => (h.additional?.file || '').includes('/cards/'))
  const pool = preferCards.length ? preferCards : ranked
  const chosen = pool.filter((h) => (h.score ?? 1) <= minScore).slice(0, 3)
  if (!chosen.length) return ''

  const lines = chosen.map((hit, i) => {
    const file = hit.additional?.file || 'unknown'
    const title = pickTitle(hit.entry || '')
    const summary = pickSummary(hit.entry || '')
    return `${i + 1}. **${title}** (${file})\n   ${summary}`
  })

  return [
    '以下为用户知识库中与当前问题可能相关的历史记录（自动检索，供参考；若已过时请忽略）：',
    ...lines,
    '若历史方案适用，优先提醒用户并在此基础上补充，避免从零重复排查。',
    RECALL_MARKER,
  ].join('\n')
}

export function extractQueryFromRequest(requestBody) {
  let req
  try {
    req = JSON.parse(requestBody)
  } catch {
    return ''
  }
  const messages = req.messages || []
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i].role || messages[i].type
    if (role === 'user' || role === 'human') {
      const text = stripTriggerMarkers(normalizeContent(messages[i].content))
      if (text.length >= 4) return text.slice(0, 500)
    }
  }
  return ''
}

export function injectRecallIntoRequest(requestBody, recallPrompt) {
  if (!recallPrompt) return requestBody

  let req
  try {
    req = JSON.parse(requestBody)
  } catch {
    return requestBody
  }
  if (!Array.isArray(req.messages)) return requestBody

  const already = req.messages.some((m) => {
    const c = typeof m.content === 'string' ? m.content : ''
    return c.includes(RECALL_MARKER)
  })
  if (already) return requestBody

  req.messages = [{ role: 'system', content: recallPrompt }, ...req.messages]
  return JSON.stringify(req)
}

export async function enrichRequestWithRecall(requestBody, { khojUrl, enabled, minScore, limit }) {
  if (!enabled) return requestBody
  const query = extractQueryFromRequest(requestBody)
  if (!query || query.length < 6) return requestBody

  try {
    const hits = await searchKhoj({ khojUrl, query, limit })
    const recallPrompt = buildRecallPrompt(hits, { minScore })
    return injectRecallIntoRequest(requestBody, recallPrompt)
  } catch {
    return requestBody
  }
}
