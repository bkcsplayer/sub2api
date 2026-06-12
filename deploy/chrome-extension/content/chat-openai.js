function extractOpenAIChat() {
  const nodes = document.querySelectorAll('[data-message-author-role]')
  if (nodes.length) {
    return [...nodes]
      .map((el) => {
        const role = el.getAttribute('data-message-author-role')
        const text = (el.innerText || '').trim()
        if (!text) return null
        const label = role === 'user' ? '用户' : '助手'
        return `## ${label}\n${text}`
      })
      .filter(Boolean)
      .join('\n\n')
  }
  const articles = document.querySelectorAll('article')
  if (articles.length) {
    return [...articles]
      .map((el, i) => `## ${i % 2 === 0 ? '用户' : '助手'}\n${(el.innerText || '').trim()}`)
      .filter((s) => s.length > 10)
      .join('\n\n')
  }
  return ''
}

window.__brainExtractChat = extractOpenAIChat
