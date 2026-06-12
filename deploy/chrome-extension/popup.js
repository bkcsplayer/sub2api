const statusEl = document.getElementById('status')
const bridgeStatus = document.getElementById('bridge-status')
const bridgeInput = document.getElementById('bridge')

function setStatus(text, ok) {
  statusEl.textContent = text
  statusEl.className = ok ? 'ok' : 'err'
}

async function saveBridge() {
  await chrome.storage.sync.set({ bridgeUrl: bridgeInput.value.trim() })
}

chrome.storage.sync.get({ bridgeUrl: 'http://127.0.0.1:5892' }, (data) => {
  bridgeInput.value = data.bridgeUrl
})

bridgeInput.addEventListener('change', saveBridge)

chrome.runtime.sendMessage({ type: 'BRAIN_HEALTH' }, (res) => {
  if (res?.ok) {
    bridgeStatus.textContent = `桥接正常 · 沉淀 ${res.data.deposit_mode || 'trigger'}`
    bridgeStatus.className = 'ok'
  } else {
    bridgeStatus.textContent = `桥接未连接：${res?.error || '未知'}`
    bridgeStatus.className = 'err'
  }
})

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

function chatScriptsForUrl(url = '') {
  if (/chatgpt\.com|chat\.openai\.com/i.test(url)) {
    return ['content/utils-shadow.js', 'content/chat-openai.js']
  }
  if (/claude\.ai/i.test(url)) {
    return ['content/utils-shadow.js', 'content/chat-claude.js']
  }
  if (/gemini\.google\.com/i.test(url)) {
    return ['content/utils-shadow.js', 'content/chat-gemini.js']
  }
  return null
}

async function extractChatFromTab(tab) {
  const files = chatScriptsForUrl(tab.url)
  if (!files) {
    return { ok: false, error: '当前页面不是 ChatGPT / Claude / Gemini，无法提取对话' }
  }

  // Always inject fresh — works even if tab was open before extension reload
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files,
  })

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (typeof window.__brainExtractChat === 'function' ? window.__brainExtractChat() : ''),
  })

  const text = (result || '').trim()
  if (!text) {
    return { ok: false, error: '未能从页面读到对话内容，请刷新 Gemini 页面后重试' }
  }
  return { ok: true, text }
}

document.getElementById('btn-chat').addEventListener('click', async () => {
  setStatus('提取对话中…', true)
  await saveBridge()
  const tab = await activeTab()
  try {
    const extracted = await extractChatFromTab(tab)
    if (!extracted.ok) {
      setStatus(extracted.error, false)
      return
    }
    chrome.runtime.sendMessage(
      {
        type: 'BRAIN_IMPORT',
        payload: {
          type: 'chat',
          title: tab.title || 'AI 对话',
          url: tab.url,
          content: extracted.text,
          deposit: true,
          source: 'chrome-chat',
        },
      },
      (res) => {
        if (res?.ok) {
          const d = res.data
          if (d.reason === 'not_worth_saving') {
            setStatus('AI 判断内容不值得沉淀（已保存原始备份）', false)
            return
          }
          setStatus(
            d.indexed ? `已入库：${d.title}` : d.pending ? `待审核：${d.title}` : d.deposited === false ? `已备份：${d.raw}` : `已保存：${d.raw}`,
            true,
          )
        } else setStatus(res?.error || '导入失败', false)
      },
    )
  } catch (e) {
    setStatus(e.message, false)
  }
})

document.getElementById('btn-page').addEventListener('click', async () => {
  setStatus('提取页面中…', true)
  await saveBridge()
  const tab = await activeTab()
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/utils-shadow.js'],
    })
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const U = window.__brainUtils
        const article = document.querySelector('article')
        const main = document.querySelector('main')
        const root = article || main || document.body
        const text = U ? U.brainText(root) : (root.innerText || '')
        return text.trim().slice(0, 120000)
      },
    })
    chrome.runtime.sendMessage(
      {
        type: 'BRAIN_IMPORT',
        payload: {
          type: 'page',
          title: tab.title || '网页',
          url: tab.url,
          content: result || '',
          deposit: true,
          source: 'chrome-page',
        },
      },
      (res) => {
        if (res?.ok) {
          const d = res.data
          if (d.reason === 'not_worth_saving') {
            setStatus('AI 判断内容不值得沉淀（已保存原始备份）', false)
            return
          }
          setStatus(d.indexed ? `已入库：${d.title}` : d.pending ? `待审核：${d.title}` : `已备份：${d.raw}`, true)
        } else setStatus(res?.error || '导入失败', false)
      },
    )
  } catch (e) {
    setStatus(e.message, false)
  }
})
