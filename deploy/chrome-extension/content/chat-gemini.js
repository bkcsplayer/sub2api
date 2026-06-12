function extractGeminiChat() {
  const U = window.__brainUtils
  const turns = []
  const seen = new Set()

  function push(role, text) {
    const t = (text || '').trim()
    if (t.length < 2) return
    const key = `${role}:${t.slice(0, 120)}`
    if (seen.has(key)) return
    seen.add(key)
    turns.push({ role, text: t })
  }

  // Gemini App custom elements (2024+), including inside shadow DOM
  const userEls = U ? U.brainQueryAll('user-query') : [...document.querySelectorAll('user-query')]
  const modelEls = U ? U.brainQueryAll('model-response') : [...document.querySelectorAll('model-response')]

  if (userEls.length || modelEls.length) {
    const tagged = [
      ...userEls.map((el) => ({ role: 'user', el })),
      ...modelEls.map((el) => ({ role: 'assistant', el })),
    ]
    tagged.sort((a, b) => {
      const pos = (node) => {
        const r = node.getBoundingClientRect?.()
        return r ? r.top + r.left * 0.001 : 0
      }
      return pos(a.el) - pos(b.el)
    })
    for (const { role, el } of tagged) {
      push(role, U ? U.brainText(el) : el.innerText)
    }
  }

  // Alternate selectors
  if (!turns.length && U) {
    for (const el of U.brainQueryAll(
      '[data-message-author-role], message-content, .query-content, .model-response-text, .response-content',
    )) {
      const roleAttr = el.getAttribute?.('data-message-author-role')
      const role =
        roleAttr === 'user' || el.classList?.contains('query-content')
          ? 'user'
          : roleAttr === 'model' || el.classList?.contains('model-response-text')
            ? 'assistant'
            : null
      if (role) push(role, U.brainText(el))
    }
  }

  // Conversation container: pair blocks by DOM order
  if (!turns.length) {
    const container =
      document.querySelector('infinite-scroller') ||
      document.querySelector('[class*="conversation"]') ||
      document.querySelector('main')
    if (container) {
      const blocks = container.querySelectorAll(
        'user-query, model-response, [class*="query"], [class*="response"]',
      )
      blocks.forEach((el, i) => {
        const tag = (el.tagName || '').toLowerCase()
        const role =
          tag === 'user-query' || /query/i.test(el.className)
            ? 'user'
            : tag === 'model-response' || /response/i.test(el.className)
              ? 'assistant'
              : i % 2 === 0
                ? 'user'
                : 'assistant'
        push(role, U ? U.brainText(el) : el.innerText)
      })
    }
  }

  if (turns.length) {
    return turns
      .map((t) => `## ${t.role === 'user' ? '用户' : '助手'}\n${t.text}`)
      .join('\n\n')
  }

  // Last resort: main pane text (still useful for沉淀)
  const main = document.querySelector('main') || document.body
  const raw = (U ? U.brainText(main) : main.innerText || '').slice(0, 80000)
  if (raw.length > 80) {
    return `## 用户\nGemini 对话（整页提取）\n\n## 助手\n${raw}`
  }
  return ''
}

window.__brainExtractChat = extractGeminiChat
