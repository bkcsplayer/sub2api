/**
 * Sub2API admin cockpit — accounts + usage as % grouped by provider company.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_PATH = path.join(__dirname, '..', 'brain', 'data', 'cockpit-cache.json')

const PLATFORM_LABELS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google',
  antigravity: 'Google',
  bedrock: 'AWS',
}

const ANTIGRAVITY_MODEL_GROUPS = [
  { prefix: 'claude-', label: 'Claude 模型' },
  { prefix: 'gemini-', label: 'Gemini 模型' },
  { prefix: 'gpt-', label: 'GPT 模型' },
  { prefix: 'chat_', label: 'Chat 配额' },
]

export function loadEnv(deployRoot) {
  const env = {}
  const p = path.join(deployRoot, '.env')
  if (!fs.existsSync(p)) return env
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

export function adminApiBase(env) {
  const remote = env.SUB2API_REMOTE_URL || 'https://api.coolapihub.khtain.com/v1/'
  const u = new URL(remote)
  return `${u.protocol}//${u.host}/api/v1`
}

function unwrap(json) {
  if (json && typeof json === 'object' && 'code' in json && json.code === 0 && 'data' in json) {
    return json.data
  }
  return json
}

function pct(used, limit) {
  if (used == null || limit == null || limit <= 0) return null
  return Math.min(999, Math.round((Number(used) / Number(limit)) * 100))
}

function remainPct(usedPct) {
  if (usedPct == null) return null
  return Math.max(0, 100 - usedPct)
}

function quotaRow(label, usedPct, extra = {}) {
  if (usedPct == null && extra.kind !== 'balance') return null
  const level =
    extra.level ||
    (usedPct == null ? 'ok' : usedPct >= 90 ? 'critical' : usedPct >= 70 ? 'warn' : 'ok')
  return {
    kind: 'window',
    label,
    used_pct: usedPct,
    remain_pct: usedPct != null ? remainPct(usedPct) : null,
    level,
    ...extra,
  }
}

export function detectProvider(acc) {
  const name = (acc.name || '').trim().toLowerCase()
  const platform = acc.platform || 'unknown'

  if (platform === 'anthropic') {
    const sub = name.includes('minimax') ? 'MiniMax（Anthropic 协议）' : 'Claude'
    return { company: name.includes('minimax') ? 'MiniMax' : 'Anthropic', product: sub }
  }
  if (platform === 'gemini') {
    const creds = acc.credentials || {}
    const oauth = creds.oauth_type || ''
    if (oauth === 'google_one' || name.includes('google one')) {
      return { company: 'Google', product: 'Gemini · Google One' }
    }
    return { company: 'Google', product: 'Gemini' }
  }
  if (platform === 'antigravity') {
    return { company: 'Google', product: 'Antigravity（AI Studio）' }
  }
  if (platform === 'openai') {
    if (name.includes('deepseek')) return { company: 'DeepSeek', product: 'API（OpenAI 兼容）' }
    if (name.includes('kimi') || name.includes('moonshot')) {
      return { company: 'Moonshot AI', product: 'Kimi API' }
    }
    if (name.includes('minimax')) return { company: 'MiniMax', product: 'API' }
    if (acc.type === 'oauth') return { company: 'OpenAI', product: 'ChatGPT / Codex OAuth' }
    return { company: 'OpenAI 兼容 API', product: acc.name?.trim() || 'API Key' }
  }
  return { company: PLATFORM_LABELS[platform] || platform, product: `${acc.type || ''}` }
}

function pushWindowQuota(rows, label, prog, model) {
  if (!prog || prog.utilization == null) return
  const usedPct = Math.round(prog.utilization)
  const extra = {
    resets_at: prog.resets_at,
    remaining_seconds: prog.remaining_seconds,
    stats: prog.window_stats || null,
    model,
  }
  if (prog.limit_requests != null) {
    extra.used = prog.used_requests ?? prog.window_stats?.requests
    extra.limit = prog.limit_requests
    extra.unit = 'requests'
    extra.detail = `${extra.used ?? 0} / ${prog.limit_requests} 次`
  }
  rows.push(quotaRow(label, usedPct, extra))
}

function pushAntigravityQuotas(rows, usage) {
  const quota = usage?.antigravity_quota
  if (!quota) return
  const details = usage.antigravity_quota_details || {}

  for (const { prefix, label: groupLabel } of ANTIGRAVITY_MODEL_GROUPS) {
    const models = Object.entries(quota).filter(([k]) => k.startsWith(prefix))
    if (!models.length) continue
    for (const [model, q] of models) {
      if (q?.utilization == null) continue
      const display = details[model]?.display_name || model
      pushWindowQuota(rows, groupLabel, { ...q, resets_at: q.reset_time }, display)
    }
  }

  const other = Object.entries(quota).filter(([k]) => !ANTIGRAVITY_MODEL_GROUPS.some((g) => k.startsWith(g.prefix)))
  for (const [model, q] of other) {
    if (q?.utilization == null) continue
    pushWindowQuota(rows, '其他模型', { ...q, resets_at: q.reset_time }, model)
  }
}

export function buildQuotas(account, usage, today) {
  const rows = []
  const extra = account.extra || {}
  const notes = []

  if (account.quota_limit != null && account.quota_limit > 0) {
    rows.push(
      quotaRow('总额度 ($)', pct(account.quota_used, account.quota_limit), {
        used: account.quota_used ?? 0,
        limit: account.quota_limit,
        unit: 'USD',
        detail: `$${account.quota_used ?? 0} / $${account.quota_limit}`,
      }),
    )
  }
  if (account.quota_daily_limit != null && account.quota_daily_limit > 0) {
    rows.push(
      quotaRow('日额度 ($)', pct(account.quota_daily_used, account.quota_daily_limit), {
        used: account.quota_daily_used ?? 0,
        limit: account.quota_daily_limit,
        unit: 'USD',
        resets_at: account.quota_daily_reset_at,
        detail: `$${account.quota_daily_used ?? 0} / $${account.quota_daily_limit}`,
      }),
    )
  }
  if (account.quota_weekly_limit != null && account.quota_weekly_limit > 0) {
    rows.push(
      quotaRow('周额度 ($)', pct(account.quota_weekly_used, account.quota_weekly_limit), {
        used: account.quota_weekly_used ?? 0,
        limit: account.quota_weekly_limit,
        unit: 'USD',
        resets_at: account.quota_weekly_reset_at,
        detail: `$${account.quota_weekly_used ?? 0} / $${account.quota_weekly_limit}`,
      }),
    )
  }

  if (usage && !usage.error) {
    pushWindowQuota(rows, '5 小时窗口', usage.five_hour)
    pushWindowQuota(rows, '7 天窗口', usage.seven_day)
    pushWindowQuota(rows, '7 天 Sonnet', usage.seven_day_sonnet)
    pushWindowQuota(rows, 'Gemini 日共享', usage.gemini_shared_daily)
    pushWindowQuota(rows, 'Gemini 分钟共享', usage.gemini_shared_minute)
    pushWindowQuota(rows, 'Gemini Pro 日', usage.gemini_pro_daily)
    pushWindowQuota(rows, 'Gemini Pro 分钟', usage.gemini_pro_minute)
    pushWindowQuota(rows, 'Gemini Flash 日', usage.gemini_flash_daily)
    pushWindowQuota(rows, 'Gemini Flash 分钟', usage.gemini_flash_minute)
    pushAntigravityQuotas(rows, usage)

    if (usage.ai_credits?.length) {
      for (const c of usage.ai_credits) {
        if (c.amount == null) continue
        rows.push({
          kind: 'balance',
          label: `账户余额 · ${c.credit_type || 'credits'}`,
          balance: c.amount,
          unit: 'USD',
          minimum_balance: c.minimum_balance,
          detail: c.minimum_balance != null ? `最低 ${c.minimum_balance}` : '',
          level:
            c.minimum_balance != null && c.amount <= c.minimum_balance
              ? 'critical'
              : c.minimum_balance != null && c.amount <= c.minimum_balance * 2
                ? 'warn'
                : 'ok',
        })
      }
    }

    if (usage.error_code || usage.error) {
      notes.push(`上游用量: ${usage.error || usage.error_code}`)
    }
  }

  const codex5 = extra.codex_5h_used_percent ?? extra.codex_primary_used_percent
  const codex7 = extra.codex_7d_used_percent ?? extra.codex_secondary_used_percent
  if (codex5 != null) rows.push(quotaRow('Codex 5h', Math.round(codex5)))
  if (codex7 != null) rows.push(quotaRow('Codex 7d', Math.round(codex7)))

  if (account.window_cost_limit != null && account.window_cost_limit > 0) {
    rows.push(
      quotaRow('5h 窗口费用', pct(account.current_window_cost, account.window_cost_limit), {
        detail: `$${account.current_window_cost ?? 0} / $${account.window_cost_limit}`,
      }),
    )
  }

  if (today && (today.requests > 0 || today.tokens > 0)) {
    notes.push(`本站今日调度: ${today.requests} 次 · ${today.tokens} tokens · $${today.cost.toFixed(4)}`)
  }

  if (account.type === 'apikey' && !rows.length && today) {
    notes.push('未配置 Sub2API 日/周额度上限；以下为今日经本站转发的 API 用量（非上游控制台余额）')
    rows.push({
      kind: 'balance',
      label: '今日 API 调用量',
      balance: today.requests,
      unit: '次',
      detail: `${today.tokens.toLocaleString()} tokens · $${today.cost.toFixed(4)}`,
      level: 'ok',
      note: '费用为 Sub2API 计费统计',
    })
  }

  return { quotas: rows.filter(Boolean), notes }
}

export function metricsFromAccount(account, usage) {
  return buildQuotas(account, usage?.error ? null : usage, null).quotas.map((q) => ({
    label: q.label,
    used_pct: q.used_pct,
    remain_pct: q.remain_pct,
    level: q.level,
    balance: q.balance,
    detail: q.detail,
  }))
}

export function accountStatus(account) {
  if (account.rate_limited_at) return 'rate_limited'
  if (account.status === 'error') return 'error'
  if (account.status === 'inactive') return 'inactive'
  if (!account.schedulable) return 'unschedulable'
  if (account.session_window_status === 'rejected') return 'window_rejected'
  if (account.session_window_status === 'allowed_warning') return 'window_warn'
  return 'active'
}

async function adminFetch(base, token, pathname, opts = {}) {
  const res = await fetch(`${base}${pathname}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    signal: opts.signal || AbortSignal.timeout(60000),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON ${res.status}: ${text.slice(0, 120)}`)
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || text.slice(0, 120)
    throw new Error(`HTTP ${res.status}: ${msg}`)
  }
  return unwrap(json)
}

export async function loginAdmin(env) {
  const base = adminApiBase(env)
  const email = env.SUB2API_COCKPIT_EMAIL || env.SUB2API_ADMIN_EMAIL || env.ADMIN_EMAIL
  const password = env.SUB2API_COCKPIT_PASSWORD || env.SUB2API_ADMIN_PASSWORD || env.ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('Set SUB2API_COCKPIT_EMAIL and SUB2API_COCKPIT_PASSWORD in deploy/.env')
  }
  const data = await adminFetch(base, '', '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (data?.requires_2fa) throw new Error('Admin account requires 2FA')
  if (!data?.access_token) throw new Error('Login failed: no access_token')
  return { token: data.access_token, base }
}

async function listAllAccounts(base, token) {
  const items = []
  let page = 1
  const pageSize = 100
  while (true) {
    const data = await adminFetch(
      base,
      token,
      `/admin/accounts?page=${page}&page_size=${pageSize}&sort_by=id&sort_order=asc`,
    )
    const batch = data?.items || []
    items.push(...batch)
    const total = data?.total ?? items.length
    if (items.length >= total || batch.length < pageSize) break
    page++
    if (page > 20) break
  }
  return items
}

async function fetchTodayStatsBatch(base, token, accountIds) {
  if (!accountIds.length) return {}
  try {
    const data = await adminFetch(base, token, '/admin/accounts/today-stats/batch', {
      method: 'POST',
      body: JSON.stringify({ account_ids: accountIds }),
    })
    return data?.stats || {}
  } catch {
    return {}
  }
}

async function fetchAccountUsage(base, token, acc) {
  const paths = [
    `/admin/accounts/${acc.id}/usage?source=active&force=true`,
    `/admin/accounts/${acc.id}/usage?source=passive`,
  ]
  let lastErr = null
  for (const p of paths) {
    try {
      const usage = await adminFetch(base, token, p)
      if (usage) return { usage, error: null }
    } catch (err) {
      lastErr = err.message
    }
  }
  return { usage: null, error: lastErr }
}

async function mapPool(items, fn, concurrency = 3) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return out
}

function tierFromUsage(usage, account) {
  if (usage?.subscription_tier) return usage.subscription_tier
  const extra = account.extra || {}
  const tier = extra.load_code_assist?.paidTier?.id || extra.load_code_assist?.currentTier?.id
  return tier || account.credentials?.tier_id || null
}

export async function fetchCockpitData(deployRoot, { force = false } = {}) {
  const env = loadEnv(deployRoot)
  const cacheTtlSec = Number(env.COCKPIT_CACHE_TTL_SEC || 300)
  const cacheTtlMs = cacheTtlSec * 1000

  if (!force && fs.existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
      if (Date.now() - cached.fetched_at < cacheTtlMs) return cached
    } catch {
      // ignore
    }
  }

  const { token, base } = await loginAdmin(env)
  const accounts = await listAllAccounts(base, token)
  const todayMap = await fetchTodayStatsBatch(
    base,
    token,
    accounts.map((a) => a.id),
  )

  const enriched = await mapPool(accounts, async (acc) => {
    const { usage, error: usageError } =
      acc.status !== 'inactive' ? await fetchAccountUsage(base, token, acc) : { usage: null, error: null }

    const todayRaw = todayMap[String(acc.id)] || todayMap[acc.id]
    const today = todayRaw
      ? {
          requests: todayRaw.requests ?? 0,
          tokens: todayRaw.tokens ?? 0,
          cost: todayRaw.cost ?? 0,
          user_cost: todayRaw.user_cost ?? 0,
        }
      : null

    const { company, product } = detectProvider(acc)
    const { quotas, notes } = buildQuotas(acc, usage, today)
    const maxPct = quotas.reduce((m, q) => Math.max(m, q.used_pct ?? 0), 0)

    return {
      id: acc.id,
      name: acc.name?.trim() || `Account ${acc.id}`,
      platform: acc.platform,
      type: acc.type,
      company,
      product,
      status: accountStatus(acc),
      schedulable: acc.schedulable,
      rate_limited_at: acc.rate_limited_at,
      rate_limit_reset_at: acc.rate_limit_reset_at,
      last_used_at: acc.last_used_at,
      groups: (acc.groups || []).map((g) => g.name),
      tier: tierFromUsage(usage, acc),
      today,
      quotas,
      notes,
      metrics: quotas,
      max_used_pct: maxPct,
      usage_error: usageError,
      usage_updated_at: usage?.updated_at || null,
    }
  })

  enriched.sort((a, b) => b.max_used_pct - a.max_used_pct)

  const byCompany = {}
  for (const a of enriched) {
    if (!byCompany[a.company]) {
      byCompany[a.company] = { accounts: [], summary: { count: 0, max_pct: 0, critical: 0, warn: 0 } }
    }
    const g = byCompany[a.company]
    g.accounts.push(a)
    g.summary.count++
    g.summary.max_pct = Math.max(g.summary.max_pct, a.max_used_pct)
    if (a.max_used_pct >= 90) g.summary.critical++
    else if (a.max_used_pct >= 70) g.summary.warn++
  }

  const byPlatform = {}
  for (const a of enriched) {
    byPlatform[a.platform] = byPlatform[a.platform] || { count: 0, critical: 0, warn: 0 }
    byPlatform[a.platform].count++
    if (a.max_used_pct >= 90) byPlatform[a.platform].critical++
    else if (a.max_used_pct >= 70) byPlatform[a.platform].warn++
  }

  const payload = {
    fetched_at: Date.now(),
    fetched_iso: new Date().toISOString(),
    cache_ttl_sec: cacheTtlSec,
    admin_base: base,
    summary: {
      total: enriched.length,
      rate_limited: enriched.filter((a) => a.status === 'rate_limited').length,
      error: enriched.filter((a) => a.status === 'error').length,
      critical: enriched.filter((a) => a.max_used_pct >= 90).length,
      warn: enriched.filter((a) => a.max_used_pct >= 70 && a.max_used_pct < 90).length,
      by_platform: byPlatform,
    },
    by_company: byCompany,
    accounts: enriched,
  }

  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}
