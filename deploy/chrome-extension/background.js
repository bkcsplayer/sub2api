const DEFAULT_BRIDGE = 'http://127.0.0.1:5892'

async function bridgeUrl() {
  const { bridgeUrl: u } = await chrome.storage.sync.get({ bridgeUrl: DEFAULT_BRIDGE })
  return (u || DEFAULT_BRIDGE).replace(/\/$/, '')
}

async function postImport(payload) {
  const base = await bridgeUrl()
  const res = await fetch(`${base}/brain/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'brain-clip-selection',
    title: '沉淀选中文本到第二大脑',
    contexts: ['selection'],
  })
  chrome.contextMenus.create({
    id: 'brain-clip-page',
    title: '沉淀本页到第二大脑',
    contexts: ['page'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'brain-clip-selection' && info.selectionText) {
      await postImport({
        type: 'page',
        title: tab?.title || '网页摘录',
        url: tab?.url || '',
        content: info.selectionText,
        deposit: true,
        source: 'chrome-selection',
      })
      chrome.action.setBadgeText({ text: '✓' })
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000)
      return
    }
    if (info.menuItemId === 'brain-clip-page' && tab?.id) {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const article = document.querySelector('article')
          const main = document.querySelector('main')
          const root = article || main || document.body
          return (root.innerText || '').trim().slice(0, 120000)
        },
      })
      await postImport({
        type: 'page',
        title: tab.title || '网页摘录',
        url: tab.url || '',
        content: result || '',
        deposit: true,
        source: 'chrome-page',
      })
      chrome.action.setBadgeText({ text: '✓' })
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000)
    }
  } catch (err) {
    console.error('[brain-clip]', err)
    chrome.action.setBadgeText({ text: '!' })
    chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'BRAIN_IMPORT') {
    postImport(msg.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }
  if (msg?.type === 'BRAIN_HEALTH') {
    bridgeUrl()
      .then((base) => fetch(`${base}/brain/health`).then((r) => r.json()))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }))
    return true
  }
})
