function extractClaudeChat() {
  const selectors = [
    '[data-testid="user-message"]',
    '[data-testid="assistant-message"]',
    '.font-claude-message',
    '[class*="Message"]',
  ]
  for (const sel of selectors) {
    const nodes = document.querySelectorAll(sel)
    if (nodes.length >= 2) {
      return [...nodes]
        .map((el, i) => {
          const isUser =
            el.matches('[data-testid="user-message"]') ||
            el.closest('[data-testid="user-message"]') ||
            /user/i.test(el.getAttribute('data-testid') || '') ||
            i % 2 === 0
          const text = (el.innerText || '').trim()
          if (!text) return null
          return `## ${isUser ? '用户' : '助手'}\n${text}`
        })
        .filter(Boolean)
        .join('\n\n')
    }
  }
  const main = document.querySelector('main')
  return main ? `## 用户\n页面对话\n\n## 助手\n${main.innerText.trim().slice(0, 80000)}` : ''
}

window.__brainExtractChat = extractClaudeChat
