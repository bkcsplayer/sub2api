#!/usr/bin/env node
/**
 * Cherry Studio → VPS Sub2API proxy with knowledge distillation.
 *
 * Default (trigger mode): only #沉淀 / 解决了 等触发时，AI 提炼知识卡片 → Khoj。
 * 闲聊与测试对话只写 audit 日志，不污染搜索索引。
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCardMarkdown,
  distillConversation,
  formatConversation,
  loadDistillPrompt,
  normalizeContent,
  resolveIndexTarget,
  slugify,
} from './knowledge-distill.mjs'
import {
  buildProfileSystemPrompt,
  injectProfileIntoRequest,
  loadUserProfile,
} from './knowledge-profile.mjs'
import { enrichRequestWithRecall } from './knowledge-recall.mjs'
import { auditPreview, shouldDeposit, stripTriggerMarkers } from './knowledge-triggers.mjs'
import { importBrainContent } from './brain-import.mjs'
import { fetchCockpitData } from './knowledge-cockpit.mjs'
import { renderCockpitHtml } from './cockpit-dashboard.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')

function loadEnv() {
  const envPath = path.join(deployRoot, '.env')
  const env = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnv()
const UPSTREAM_HOST = env.SUB2API_UPSTREAM_HOST || 'api.coolapihub.khtain.com'
const UPSTREAM_PORT = 443
const LISTEN_HOST = env.CHERRY_BRIDGE_HOST || '127.0.0.1'
const LISTEN_PORT = Number(env.CHERRY_BRIDGE_PORT || 5892)
const KHOJ_URL = (env.KHOJ_LOCAL_URL || `http://127.0.0.1:${env.KHOJ_PORT || 5871}`).replace(/\/$/, '')
const API_BASE = env.SUB2API_REMOTE_URL || 'https://api.coolapihub.khtain.com/v1/'
const API_KEY = env.SUB2API_API_KEY || ''
const DISTILL_MODEL = env.CHERRY_DISTILL_MODEL || 'claude-sonnet-4-6'
const DEPOSIT_MODE = env.CHERRY_DEPOSIT_MODE || 'trigger'
const AUTO_INDEX = env.CHERRY_DEPOSIT_AUTO_INDEX || 'high'
const INJECT_PROFILE = env.CHERRY_INJECT_PROFILE !== 'false'
const RECALL_ENABLED = env.CHERRY_RECALL_ENABLED !== 'false'
const RECALL_MIN_SCORE = Number(env.CHERRY_RECALL_MIN_SCORE || 0.18)
const RECALL_LIMIT = Number(env.CHERRY_RECALL_LIMIT || 3)

const CARDS_DIR = path.join(deployRoot, 'brain', 'imports', 'cherry', 'cards')
const PENDING_DIR = path.join(deployRoot, 'brain', 'data', 'cherry', 'pending')
const RAW_DIR = path.join(deployRoot, 'brain', 'data', 'cherry', 'raw')
const AUDIT_PATH = path.join(deployRoot, 'brain', 'data', 'cherry', 'audit.jsonl')
const STATE_PATH = path.join(deployRoot, 'brain', 'data', 'cherry-sync-state.json')

for (const d of [CARDS_DIR, PENDING_DIR, RAW_DIR, path.dirname(AUDIT_PATH)]) {
  fs.mkdirSync(d, { recursive: true })
}

const profileYaml = loadUserProfile(deployRoot)
const profilePrompt = INJECT_PROFILE ? buildProfileSystemPrompt(profileYaml) : ''
let distillPrompt = ''
try {
  distillPrompt = loadDistillPrompt(deployRoot)
} catch {
  console.warn('[bridge] deposit-distill-prompt.md missing; distillation disabled')
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return { hashes: [] }
  }
}

function saveState(state) {
  state.hashes = state.hashes.slice(-5000)
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex')
}

function appendAudit(entry) {
  fs.appendFileSync(AUDIT_PATH, `${JSON.stringify(entry)}\n`, 'utf8')
}

function shouldCapture(urlPath, method) {
  if (method !== 'POST') return false
  return (
    urlPath === '/v1/chat/completions' ||
    urlPath === '/v1/messages' ||
    urlPath.startsWith('/v1/messages') ||
    urlPath === '/v1/responses'
  )
}

function extractUserText(messages = []) {
  const parts = []
  for (const msg of messages) {
    const role = msg.role || msg.type
    if (role !== 'user' && role !== 'human') continue
    parts.push(normalizeContent(msg.content))
  }
  return parts.filter(Boolean).join('\n\n').trim()
}

function extractLastUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i].role || messages[i].type
    if (role === 'user' || role === 'human') {
      return normalizeContent(messages[i].content)
    }
  }
  return ''
}

function extractAssistantFromJson(body, urlPath) {
  try {
    const json = JSON.parse(body)
    if (urlPath.includes('/messages')) {
      const blocks = json.content || []
      return blocks.map((b) => b.text || '').join('\n').trim()
    }
    const choice = json.choices?.[0]
    if (choice?.message?.content) {
      return typeof choice.message.content === 'string'
        ? choice.message.content.trim()
        : normalizeContent(choice.message.content)
    }
    if (choice?.text) return String(choice.text).trim()
    if (json.output_text) return String(json.output_text).trim()
    return ''
  } catch {
    return ''
  }
}

function isSseResponse(contentType, responseBody, requestBody) {
  try {
    const req = JSON.parse(requestBody)
    if (req.stream === true) return true
  } catch {
    // ignore
  }
  const body = (responseBody || '').trimStart()
  if (body.startsWith('{') || body.startsWith('[')) return false
  if ((contentType || '').includes('text/event-stream')) return true
  return body.includes('data:')
}

function extractAssistantFromSse(body, urlPath) {
  const chunks = []
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const json = JSON.parse(payload)
      if (urlPath.includes('/messages')) {
        if (json.type === 'content_block_delta' && json.delta?.text) chunks.push(json.delta.text)
        if (json.delta?.type === 'text_delta' && json.delta?.text) chunks.push(json.delta.text)
      } else {
        const delta = json.choices?.[0]?.delta
        if (delta?.content) chunks.push(delta.content)
        if (typeof delta?.text === 'string') chunks.push(delta.text)
      }
    } catch {
      // ignore
    }
  }
  return chunks.join('').trim()
}

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

function saveRawExchange({ model, conversationText, urlPath }) {
  const day = new Date().toISOString().slice(0, 10)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const digest = sha(conversationText).slice(0, 8)
  const filename = `${stamp}-${digest}.md`
  const abs = path.join(RAW_DIR, day, filename)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const body = [
    '---',
    'source: cherry-studio',
    'kind: raw-exchange',
    `model: ${model}`,
    `endpoint: ${urlPath}`,
    `created: ${new Date().toISOString()}`,
    '---',
    '',
    conversationText,
    '',
  ].join('\n')
  fs.writeFileSync(abs, body, 'utf8')
  return abs
}

async function writeCardFile(markdown, { title, target }) {
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const stamp = now.toISOString().replace(/[:.]/g, '-')
  const slug = slugify(title)
  const digest = sha(markdown).slice(0, 8)
  const filename = `${stamp}-${slug}-${digest}.md`

  if (target === 'pending') {
    const abs = path.join(PENDING_DIR, `pending-${filename}`)
    fs.writeFileSync(abs, markdown, 'utf8')
    return { abs, rel: null, pendingName: path.basename(abs) }
  }

  const abs = path.join(CARDS_DIR, day, filename)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, markdown, 'utf8')
  const rel = `cherry/cards/${day}/${filename}`
  return { abs, rel, pendingName: null }
}

async function processDeposit({ urlPath, requestBody, responseBody, statusCode, contentType }) {
  if (statusCode < 200 || statusCode >= 300) return
  if (DEPOSIT_MODE === 'off') return

  let req
  try {
    req = JSON.parse(requestBody)
  } catch {
    return
  }

  const messages = req.messages || []
  const lastUser = extractLastUserText(messages)
  if (!lastUser || lastUser.length < 2) return

  const isSse = isSseResponse(contentType, responseBody, requestBody)
  const assistantText = isSse
    ? extractAssistantFromSse(responseBody, urlPath)
    : extractAssistantFromJson(responseBody, urlPath)
  if (!assistantText || assistantText.length < 2) return

  const model = req.model || 'unknown'
  const trigger = shouldDeposit(lastUser, DEPOSIT_MODE)
  const userPreview = auditPreview(lastUser)

  if (!trigger.deposit) {
    appendAudit({
      ts: new Date().toISOString(),
      model,
      preview: userPreview,
      deposited: false,
      reason: trigger.reason,
    })
    return
  }

  if (!distillPrompt || !API_KEY) {
    console.error('[deposit] missing distill prompt or SUB2API_API_KEY')
    return
  }

  const conversationText = formatConversation(
    messages.map((m) => {
      const role = m.role || m.type
      if (role === 'user' || role === 'human') {
        return { ...m, content: stripTriggerMarkers(normalizeContent(m.content)) }
      }
      return m
    }),
  )

  const digest = sha(`${model}\n${conversationText}\n${assistantText}`)
  const state = loadState()
  if (state.hashes.includes(digest)) {
    appendAudit({ ts: new Date().toISOString(), model, preview: userPreview, deposited: false, reason: 'duplicate' })
    return
  }

  saveRawExchange({ model, conversationText, urlPath })

  try {
    const { card } = await distillConversation({
      conversationText,
      distillPrompt,
      apiBase: API_BASE,
      apiKey: API_KEY,
      model: DISTILL_MODEL,
    })

    if (!card.worth_saving) {
      appendAudit({
        ts: new Date().toISOString(),
        model,
        preview: userPreview,
        deposited: false,
        reason: 'not_worth_saving',
        title: card.title || null,
      })
      console.log(`[deposit] skipped (not worth): ${userPreview}`)
      return
    }

    const target = resolveIndexTarget(card, AUTO_INDEX)
    if (target === 'skip') return

    const includeRaw = trigger.explicit || (conversationText.length < 4000)
    const markdown = buildCardMarkdown(card, {
      model,
      conversationText: includeRaw ? conversationText : undefined,
    })

    const { abs, rel, pendingName } = await writeCardFile(markdown, {
      title: card.title,
      target,
    })

    if (target === 'cards' && rel) {
      await pushToKhoj(abs, rel)
      state.hashes.push(digest)
      saveState(state)
      console.log(`[deposit] card → Khoj: ${rel} (${card.title})`)
      appendAudit({
        ts: new Date().toISOString(),
        model,
        preview: userPreview,
        deposited: true,
        target: 'cards',
        title: card.title,
        confidence: card.confidence,
      })
    } else {
      console.log(`[deposit] pending review: ${pendingName} (${card.title}, ${card.confidence})`)
      appendAudit({
        ts: new Date().toISOString(),
        model,
        preview: userPreview,
        deposited: false,
        target: 'pending',
        pending: pendingName,
        title: card.title,
        confidence: card.confidence,
      })
    }
  } catch (err) {
    console.error('[deposit] failed:', err.message)
    appendAudit({
      ts: new Date().toISOString(),
      model,
      preview: userPreview,
      deposited: false,
      reason: 'distill_error',
      error: err.message,
    })
  }
}

function handleBrainApi(req, res, url) {
  if (url.pathname === '/health' || url.pathname === '/brain/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        deposit_mode: DEPOSIT_MODE,
        auto_index: AUTO_INDEX,
        distill_model: DISTILL_MODEL,
        profile_inject: INJECT_PROFILE,
        recall_enabled: RECALL_ENABLED,
        recall_min_score: RECALL_MIN_SCORE,
      }),
    )
    return true
  }

  if (url.pathname === '/brain/pending' && req.method === 'GET') {
    const files = fs.existsSync(PENDING_DIR)
      ? fs.readdirSync(PENDING_DIR).filter((f) => f.endsWith('.md'))
      : []
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ pending: files }))
    return true
  }

  if (url.pathname === '/brain/cockpit' && req.method === 'GET') {
    const force = url.searchParams.get('force') === '1'
    const asHtml = url.searchParams.get('html') === '1'
    fetchCockpitData(deployRoot, { force })
      .then((data) => {
        if (asHtml) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
          res.end(renderCockpitHtml(data))
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(data))
      })
      .catch((err) => {
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      })
    return true
  }

  if (url.pathname === '/brain/import' && req.method === 'POST') {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        const result = await importBrainContent({
          deployRoot,
          type: body.type || 'chat',
          title: body.title || '浏览器导入',
          content: body.content || '',
          url: body.url || '',
          deposit: body.deposit !== false,
          source: body.source || 'chrome-extension',
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (err) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: err.message }))
      }
    })
    return true
  }

  return false
}

function proxy(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

  if (handleBrainApi(req, res, url)) return

  const capturePath = shouldCapture(url.pathname, req.method)

  const reqChunks = []
  req.on('data', (c) => reqChunks.push(c))
  req.on('end', async () => {
    let bodyStr = Buffer.concat(reqChunks).toString('utf8')
    if (capturePath) {
      bodyStr = await enrichRequestWithRecall(bodyStr, {
        khojUrl: KHOJ_URL,
        enabled: RECALL_ENABLED,
        minScore: RECALL_MIN_SCORE,
        limit: RECALL_LIMIT,
      })
      if (profilePrompt) {
        bodyStr = injectProfileIntoRequest(bodyStr, profilePrompt)
      }
      if (bodyStr.includes('[second-brain-recall]')) {
        console.log('[recall] injected knowledge context for chat request')
      }
    }
    const requestBody = Buffer.from(bodyStr, 'utf8')

    const hopByHop = new Set([
      'connection',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailers',
      'transfer-encoding',
      'upgrade',
      'host',
      'content-length',
    ])
    const headers = { host: UPSTREAM_HOST }
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase()
      if (!value || hopByHop.has(lower) || lower === 'accept-encoding') continue
      headers[key] = value
    }
    if (requestBody.length) headers['content-length'] = String(requestBody.length)

    const upstream = https.request(
      {
        host: UPSTREAM_HOST,
        port: UPSTREAM_PORT,
        method: req.method,
        path: url.pathname + url.search,
        headers,
      },
      (upRes) => {
        const resChunks = []
        const passthroughHeaders = { ...upRes.headers }
        res.writeHead(upRes.statusCode || 502, passthroughHeaders)

        upRes.on('data', (chunk) => {
          resChunks.push(chunk)
          res.write(chunk)
        })
        upRes.on('end', () => {
          res.end()
          if (!capturePath) return
          const responseBody = Buffer.concat(resChunks).toString('utf8')
          processDeposit({
            urlPath: url.pathname,
            requestBody: requestBody.toString('utf8'),
            responseBody,
            statusCode: upRes.statusCode || 0,
            contentType: upRes.headers['content-type'] || '',
          }).catch((err) => console.error('[deposit] error:', err.message))
        })
      },
    )

    upstream.on('error', (err) => {
      console.error('[proxy] upstream error:', err.message)
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Bridge upstream error' } }))
      }
    })

    if (requestBody.length) upstream.write(requestBody)
    upstream.end()
  })
}

const server = http.createServer(proxy)
server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`Cherry-Khoj bridge listening on http://${LISTEN_HOST}:${LISTEN_PORT}`)
  console.log(`Upstream: https://${UPSTREAM_HOST}`)
  console.log(`Khoj: ${KHOJ_URL}`)
  console.log(
    `Deposit: ${DEPOSIT_MODE} | index: ${AUTO_INDEX} | distill: ${DISTILL_MODEL} | recall: ${RECALL_ENABLED}`,
  )
  console.log(`Cards: ${CARDS_DIR}`)
  console.log(`Pending: ${PENDING_DIR}`)
})
