#!/usr/bin/env node
/**
 * Configure Cherry Studio with multiple CoolAPIHub providers (one API key per Sub2API group).
 */
import { ClassicLevel } from 'classic-level'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')

const PERSIST_KEY_SUFFIX = 'persist:cherry-studio'
const LIVE_LDB = path.join(os.homedir(), 'AppData', 'Roaming', 'CherryStudio', 'Local Storage', 'leveldb')
const BACKUP_DIR = path.join(deployRoot, 'tmp', 'cherry-leveldb-backup')
const PROVIDERS_CONFIG = path.join(deployRoot, 'brain', 'cherry-providers.json')

function inferEndpointType(modelId) {
  const id = modelId.toLowerCase()
  if (id.includes('claude') || id.includes('minimax') || id.includes('abab')) return 'anthropic'
  if (id.includes('gemini')) return 'gemini'
  return 'openai'
}

function inferGroup(modelId) {
  const id = modelId.toLowerCase()
  if (id.includes('opus')) return 'Claude Opus'
  if (id.includes('sonnet')) return 'Claude Sonnet'
  if (id.includes('haiku')) return 'Claude Haiku'
  if (id.includes('claude')) return 'Claude'
  if (id.includes('gpt') || id.includes('o1') || id.includes('o3') || id.includes('codex')) return 'GPT'
  if (id.includes('deepseek')) return 'DeepSeek'
  if (id.includes('moonshot') || id.includes('kimi')) return 'Kimi'
  if (id.includes('gemini')) return 'Gemini'
  if (id.includes('minimax') || id.includes('abab')) return 'MiniMax'
  return 'Sub2API'
}

function toCherryModel(remote, providerId) {
  const id = remote.id
  return {
    id,
    provider: providerId,
    name: remote.display_name || remote.name || id,
    group: inferGroup(id),
    owned_by: remote.owned_by || inferEndpointType(id),
    endpoint_type: remote.supported_endpoint_types?.[0] || inferEndpointType(id),
    supported_text_delta: true,
  }
}

function pickDefaultModel(allModels) {
  const prefer = [
    'claude-sonnet-4-6',
    'claude-sonnet-4-5-20250929',
    'deepseek-chat',
    'gpt-4o',
    'moonshot-v1-8k',
    'gemini-2.0-flash',
  ]
  for (const id of prefer) {
    const hit = allModels.find((m) => m.id === id)
    if (hit) return hit
  }
  return allModels[0]
}

async function fetchRemoteModels(apiBase, apiKey) {
  const res = await fetch(`${apiBase}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GET /v1/models failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const body = await res.json()
  return Array.isArray(body?.data) ? body.data : []
}

function loadEnv() {
  const envPath = path.join(deployRoot, '.env')
  const text = fs.readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

function loadProviderConfig(env) {
  const cfg = JSON.parse(fs.readFileSync(PROVIDERS_CONFIG, 'utf8'))
  const apiBase =
    env.CHERRY_BRIDGE_URL ||
    cfg.apiBase ||
    `http://127.0.0.1:${env.CHERRY_BRIDGE_PORT || 5892}`
  const providers = cfg.providers.map((p) => {
    const apiKey = env[p.envKey]
    if (!apiKey) throw new Error(`Missing ${p.envKey} in deploy/.env`)
    return { ...p, apiKey, apiBase }
  })
  return { apiBase, providers }
}

function extractJsonObject(text, startIdx = 0) {
  const start = text.indexOf('{', startIdx)
  if (start < 0) throw new Error('JSON object start not found')
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error('JSON object end not found')
}

function decodePersistValue(buf) {
  const payload = buf.byteLength % 2 === 1 ? buf.subarray(1) : buf
  const text = payload.toString('utf16le')
  const jsonText = extractJsonObject(text)
  return { headerByte: buf.byteLength % 2 === 1 ? buf[0] : null, jsonText, data: JSON.parse(jsonText) }
}

function encodePersistValue(jsonText, headerByte = 0) {
  const body = Buffer.from(jsonText, 'utf16le')
  if (headerByte === null) return body
  return Buffer.concat([Buffer.from([headerByte]), body])
}

function baseProviderTemplate(existing, spec) {
  const sample = existing || {}
  return {
    id: spec.id,
    name: spec.name,
    type: spec.type,
    apiKey: spec.apiKey,
    apiHost: spec.apiBase,
    anthropicApiHost: spec.type === 'anthropic' || spec.type === 'new-api' ? spec.apiBase : sample.anthropicApiHost,
    models: [],
    isSystem: spec.system ?? false,
    enabled: true,
    isNotSupportArrayContent: sample.isNotSupportArrayContent ?? false,
    isNotSupportDeveloperRole: sample.isNotSupportDeveloperRole ?? false,
    isNotSupportStreamOptions: sample.isNotSupportStreamOptions ?? false,
    ...(spec.type === 'gemini' ? { isVertex: sample.isVertex ?? false } : {}),
    ...(spec.type === 'openai' && !spec.system
      ? {
          apiOptions: sample.apiOptions ?? {
            isNotSupportArrayContent: false,
            isNotSupportDeveloperRole: true,
            isNotSupportStreamOptions: false,
            isSupportDeveloperRole: false,
          },
        }
      : {}),
  }
}

function upsertProvider(providers, spec, remoteModels) {
  const idx = providers.findIndex((p) => p.id === spec.id)
  const existing = idx >= 0 ? providers[idx] : null
  const cherryModels = remoteModels.map((m) => toCherryModel(m, spec.id))

  let anthropicModels = cherryModels
  if (spec.id === 'new-api' || spec.id === 'anthropic') {
    anthropicModels = cherryModels.filter((m) => inferEndpointType(m.id) === 'anthropic')
    if (!anthropicModels.length) anthropicModels = cherryModels
  }

  const next = {
    ...baseProviderTemplate(existing, spec),
    models: spec.id === 'anthropic' ? anthropicModels : cherryModels,
  }

  if (idx >= 0) providers[idx] = { ...existing, ...next }
  else providers.push(next)

  return cherryModels
}

function configureLlm(llm, providerResults) {
  const providers = [...(llm.providers || [])]
  const allModels = []

  for (const { spec, models } of providerResults) {
    const synced = upsertProvider(providers, spec, models)
    allModels.push(...synced.map((m) => ({ ...m, provider: spec.id })))
  }

  const defaultModel = { ...pickDefaultModel(allModels), provider: 'new-api' }
  if (!allModels.some((m) => m.id === defaultModel.id && m.provider === defaultModel.provider)) {
    defaultModel.provider = allModels[0]?.provider || 'new-api'
  }

  return {
    ...llm,
    providers,
    defaultModel,
    topicNamingModel: defaultModel,
    quickModel: defaultModel,
  }
}

async function readPersist(db) {
  for await (const [key, value] of db.iterator()) {
    const keyStr = key.toString('utf8')
    if (keyStr.endsWith(PERSIST_KEY_SUFFIX)) {
      const decoded = decodePersistValue(value)
      return { key, ...decoded }
    }
  }
  throw new Error(`${PERSIST_KEY_SUFFIX} not found in leveldb`)
}

async function writePersist(db, key, jsonText, headerByte = 0) {
  await db.put(key, encodePersistValue(jsonText, headerByte))
}

function backupLiveLdb() {
  fs.mkdirSync(path.dirname(BACKUP_DIR), { recursive: true })
  if (fs.existsSync(BACKUP_DIR)) fs.rmSync(BACKUP_DIR, { recursive: true, force: true })
  fs.cpSync(LIVE_LDB, BACKUP_DIR, { recursive: true })
  console.log('Backed up leveldb to', BACKUP_DIR)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const env = loadEnv()
  const { apiBase, providers } = loadProviderConfig(env)

  const providerResults = []
  for (const spec of providers) {
    const models = await fetchRemoteModels(apiBase, spec.apiKey)
    if (!models.length) {
      console.warn(`WARN: no models for ${spec.name} (${spec.id})`)
      continue
    }
    providerResults.push({ spec, models })
    console.log(`${spec.name}: ${models.length} models`)
  }

  if (!providerResults.length) throw new Error('No provider models synced')

  if (!dryRun) backupLiveLdb()

  const workLdb = dryRun
    ? path.join(deployRoot, 'tmp', 'cherry-leveldb-copy')
    : LIVE_LDB

  if (dryRun && !fs.existsSync(workLdb)) {
    fs.cpSync(LIVE_LDB, workLdb, { recursive: true })
    fs.rmSync(path.join(workLdb, 'LOCK'), { force: true })
  }

  const db = new ClassicLevel(workLdb, { keyEncoding: 'buffer', valueEncoding: 'buffer' })
  await db.open()

  const { key, data, headerByte } = await readPersist(db)
  if (!data.llm) throw new Error('persist state missing llm slice')

  const llm = JSON.parse(data.llm)
  const updatedLlm = configureLlm(llm, providerResults)
  data.llm = JSON.stringify(updatedLlm)

  const newJsonText = JSON.stringify(data)
  console.log('API host:', apiBase)
  console.log('Providers configured:', providerResults.map((p) => p.spec.id).join(', '))
  console.log('Default model:', updatedLlm.defaultModel.id, '@', updatedLlm.defaultModel.provider)

  if (!dryRun) {
    await writePersist(db, key, newJsonText, headerByte ?? 0)
    console.log('Wrote persist state. Restart Cherry Studio if it was open.')
  } else {
    console.log('Dry run only — no live database modified.')
  }

  await db.close()
}

main().catch((err) => {
  if (err?.cause?.code === 'LEVEL_LOCKED') {
    console.error('Cherry Studio leveldb is locked. Close Cherry Studio completely and retry.')
  } else {
    console.error(err)
  }
  process.exit(1)
})
