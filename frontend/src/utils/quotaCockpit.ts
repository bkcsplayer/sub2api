import type { Account } from '@/types'

export interface ProviderInfo {
  company: string
  product: string
}

export function detectProvider(account: Account): ProviderInfo {
  const name = (account.name || '').trim().toLowerCase()
  const platform = account.platform

  if (platform === 'anthropic') {
    if (name.includes('minimax')) {
      return { company: 'MiniMax', product: 'MiniMax（Anthropic 协议）' }
    }
    return { company: 'Anthropic', product: 'Claude' }
  }

  if (platform === 'gemini') {
    const creds = account.credentials as { oauth_type?: string } | undefined
    if (creds?.oauth_type === 'google_one' || name.includes('google one')) {
      return { company: 'Google', product: 'Gemini · Google One' }
    }
    return { company: 'Google', product: 'Gemini' }
  }

  if (platform === 'antigravity') {
    return { company: 'Google', product: 'Antigravity（AI Studio）' }
  }

  if (platform === 'openai') {
    if (name.includes('deepseek')) {
      return { company: 'DeepSeek', product: 'API（OpenAI 兼容）' }
    }
    if (name.includes('kimi') || name.includes('moonshot')) {
      return { company: 'Moonshot AI', product: 'Kimi API' }
    }
    if (name.includes('minimax')) {
      return { company: 'MiniMax', product: 'API' }
    }
    if (account.type === 'oauth') {
      return { company: 'OpenAI', product: 'ChatGPT / Codex OAuth' }
    }
    return { company: 'OpenAI 兼容 API', product: account.name?.trim() || 'API Key' }
  }

  return { company: platform, product: account.type }
}

export function groupAccountsByCompany(accounts: Account[]): Array<{
  company: string
  accounts: Account[]
  maxUtilization: number
}> {
  const map = new Map<string, Account[]>()
  for (const account of accounts) {
    const { company } = detectProvider(account)
    const list = map.get(company) || []
    list.push(account)
    map.set(company, list)
  }

  return [...map.entries()]
    .map(([company, items]) => ({
      company,
      accounts: items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
      maxUtilization: 0
    }))
    .sort((a, b) => a.company.localeCompare(b.company, 'zh-CN'))
}

export function accountMaxQuotaPercent(account: Account): number {
  const values: number[] = []
  const push = (used?: number | null, limit?: number | null) => {
    if (used != null && limit != null && limit > 0) {
      values.push(Math.min(999, Math.round((used / limit) * 100)))
    }
  }
  push(account.quota_used, account.quota_limit)
  push(account.quota_daily_used, account.quota_daily_limit)
  push(account.quota_weekly_used, account.quota_weekly_limit)
  const extra = account.extra as Record<string, number | undefined> | undefined
  if (extra?.codex_5h_used_percent != null) values.push(Math.round(extra.codex_5h_used_percent))
  if (extra?.codex_7d_used_percent != null) values.push(Math.round(extra.codex_7d_used_percent))
  return values.length ? Math.max(...values) : 0
}
