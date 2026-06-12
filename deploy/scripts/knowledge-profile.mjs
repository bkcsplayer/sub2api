import fs from 'node:fs'
import path from 'node:path'

const PROFILE_MARKER = '[second-brain-profile]'

export { PROFILE_MARKER }

export function loadUserProfile(deployRoot) {
  const profilePath = path.join(deployRoot, 'brain', 'profile', 'user-profile.yaml')
  if (!fs.existsSync(profilePath)) return null
  return fs.readFileSync(profilePath, 'utf8')
}

/** Build a compact system prompt from user-profile.yaml (no YAML parser dep). */
export function buildProfileSystemPrompt(yamlText) {
  if (!yamlText) return ''

  const lines = yamlText.split('\n')
  const pick = (key) => {
    const re = new RegExp(`^\\s*${key}:\\s*(.+)$`)
    for (const line of lines) {
      const m = line.match(re)
      if (m) return m[1].trim()
    }
    return ''
  }

  const role = pick('role')
  const lang = pick('language')
  const frontend = pick('frontend')
  const backend = pick('backend')
  const aiInfra = pick('ai_infra')
  const codeStyle = pick('code_style')
  const answerStyle = pick('answer_style')

  const parts = [
    '以下为用户长期背景（自动注入，无需重复询问）：',
    role && `- 角色：${role}`,
    lang && `- 语言：${lang}`,
    (frontend || backend) && `- 技术栈：${[frontend, backend].filter(Boolean).join(' / ')}`,
    aiInfra && `- 工具链：${aiInfra}`,
    codeStyle && `- 代码偏好：${codeStyle}`,
    answerStyle && `- 回答风格：${answerStyle}`,
    PROFILE_MARKER,
  ].filter(Boolean)

  return parts.join('\n')
}

export function injectProfileIntoRequest(requestBody, profilePrompt) {
  if (!profilePrompt) return requestBody

  let req
  try {
    req = JSON.parse(requestBody)
  } catch {
    return requestBody
  }

  if (!Array.isArray(req.messages)) return requestBody

  const already = req.messages.some((m) => {
    const c = typeof m.content === 'string' ? m.content : ''
    return c.includes(PROFILE_MARKER)
  })
  if (already) return requestBody

  req.messages = [{ role: 'system', content: profilePrompt }, ...req.messages]
  return JSON.stringify(req)
}
