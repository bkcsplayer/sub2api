/** Detect when a Cherry conversation should be distilled into the knowledge base. */

export const TRIGGER_TAGS = ['#沉淀', '#save', '#记住', '#第二大脑', '#brain']

export const TRIGGER_PHRASES = [
  /沉淀一下/,
  /记下来/,
  /记住这个/,
  /保存到知识库/,
  /写进知识库/,
  /搞定了/,
  /解决了/,
  /问题已解决/,
  /可以沉淀/,
]

const CASUAL_ONLY =
  /^(hi|hello|hey|你好|在吗|测试|test|ok|好的|谢谢|感谢|嗯|哦)[\s!?.。！？]*$/i

const EXPLICIT_SKIP = [/^unique-test-/i, /^khoj sync test/i, /^stream sync test/i]

/**
 * @param {'off'|'metadata'|'trigger'|'always'} mode
 */
export function shouldDeposit(userText, mode = 'trigger') {
  if (mode === 'off') return { deposit: false, reason: 'mode_off' }
  if (mode === 'always') return { deposit: true, reason: 'mode_always', explicit: false }
  if (mode === 'metadata') return { deposit: false, reason: 'metadata_only' }

  const text = (userText || '').trim()
  if (!text) return { deposit: false, reason: 'empty' }

  if (TRIGGER_TAGS.some((tag) => text.includes(tag))) {
    return { deposit: true, reason: 'tag', explicit: true }
  }

  if (TRIGGER_PHRASES.some((re) => re.test(text))) {
    return { deposit: true, reason: 'phrase', explicit: true }
  }

  if (CASUAL_ONLY.test(text)) return { deposit: false, reason: 'casual' }
  if (EXPLICIT_SKIP.some((re) => re.test(text))) return { deposit: false, reason: 'test_skip' }

  return { deposit: false, reason: 'no_trigger' }
}

export function stripTriggerMarkers(text) {
  let out = text
  for (const tag of TRIGGER_TAGS) {
    out = out.split(tag).join('')
  }
  return out.replace(/\s{2,}/g, ' ').trim()
}

export function auditPreview(text, max = 120) {
  const oneLine = (text || '').replace(/\s+/g, ' ').trim()
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`
}
