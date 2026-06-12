#!/usr/bin/env node
/** Generate Second Brain dashboard with live Sub2API quota cockpit. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderCockpitHtml } from './cockpit-dashboard.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')
const BRAIN = path.join(deployRoot, 'brain')
const OUT = path.join(BRAIN, 'dashboard.html')
const CACHE = path.join(BRAIN, 'data', 'cockpit-cache.json')

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function countLines(file) {
  if (!fs.existsSync(file)) return 0
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length
}

function walkMd(dir) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    if (fs.statSync(abs).isDirectory()) out.push(...walkMd(abs))
    else if (name.endsWith('.md')) out.push(abs)
  }
  return out
}

function recentCards(limit = 8) {
  return walkMd(path.join(BRAIN, 'imports', 'cherry', 'cards'))
    .map((abs) => ({ abs, mtime: fs.statSync(abs).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map(({ abs }) => {
      const text = fs.readFileSync(abs, 'utf8')
      return {
        title: text.match(/^#\s+(.+)$/m)?.[1] || path.basename(abs),
        file: path.relative(BRAIN, abs).replace(/\\/g, '/'),
        para: (text.match(/^para:\s*(.+)$/m)?.[1] || 'Resources').trim(),
      }
    })
}

function auditStats() {
  const file = path.join(BRAIN, 'data', 'cherry', 'audit.jsonl')
  if (!fs.existsSync(file)) return { total: 0, deposited: 0, skipped: 0 }
  let total = 0
  let deposited = 0
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const row = JSON.parse(line)
      total++
      if (row.deposited) deposited++
    } catch {
      // skip
    }
  }
  return { total, deposited, skipped: total - deposited }
}

function barClass(level) {
  if (level === 'critical') return 'bar critical'
  if (level === 'warn') return 'bar warn'
  return 'bar ok'
}

function renderCockpitStatic(cockpit) {
  if (!cockpit?.accounts?.length) {
    return '<p class="muted">暂无账号数据。在 deploy/.env 配置 SUB2API_COCKPIT_EMAIL / SUB2API_COCKPIT_PASSWORD 后刷新。</p>'
  }
  const s = cockpit.summary
  let html = `<p class="muted">缓存于 ${cockpit.fetched_iso || '—'} · 账号 ${s.total} · 限流 ${s.rate_limited} · ≥90% ${s.critical} · ≥70% ${s.warn}</p><div class="accounts">`
  for (const acc of cockpit.accounts.slice(0, 40)) {
    const top = acc.metrics?.[0]
    const pct = top?.used_pct ?? acc.max_used_pct ?? 0
    const level = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok'
    html += `<div class="acc ${acc.status}">
      <div class="acc-head"><strong>${acc.name}</strong> <span class="muted">${acc.company || acc.platform} · ${acc.product || acc.type}</span>
      <span class="tag ${level}">${acc.status} · ${pct}%</span></div>`
    if (acc.metrics?.length) {
      html += '<div class="metrics">'
      for (const m of acc.metrics.slice(0, 4)) {
        if (m.used_pct != null) {
          html += `<div class="metric"><span>${m.label}</span><div class="track"><div class="${barClass(m.level)}" style="width:${Math.min(100, m.used_pct)}%"></div></div><span>${m.used_pct}%</span></div>`
        } else if (m.balance != null) {
          html += `<div class="metric"><span>${m.label}</span><span class="balance">¥${m.balance}</span></div>`
        }
      }
      html += '</div>'
    } else {
      html += '<p class="muted">无配额指标</p>'
    }
    html += '</div>'
  }
  html += '</div>'
  return html
}

async function main() {
  const bridge = await fetchJson('http://127.0.0.1:5892/brain/health')
  let khojOk = false
  try {
    const r = await fetch('http://127.0.0.1:5871', { signal: AbortSignal.timeout(5000) })
    khojOk = r.ok
  } catch {
    khojOk = false
  }

  let cockpit = await fetchJson('http://127.0.0.1:5892/brain/cockpit')
  if (!cockpit && fs.existsSync(CACHE)) {
    try {
      cockpit = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
    } catch {
      cockpit = null
    }
  }

  const pending = fs.existsSync(path.join(BRAIN, 'data', 'cherry', 'pending'))
    ? fs.readdirSync(path.join(BRAIN, 'data', 'cherry', 'pending')).filter((f) => f.endsWith('.md'))
    : []
  const cardCount = walkMd(path.join(BRAIN, 'imports', 'cherry', 'cards')).length
  const stats = auditStats()
  const cards = recentCards()
  const cockpitHtml = renderCockpitStatic(cockpit)

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>第二大脑 · 控制台</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;background:#0f1115;color:#e6e6e6}
  h1{font-size:1.4rem} h2{font-size:1.1rem;margin-top:1.6rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}
  .card{background:#1a1d24;border:1px solid #2a2f3a;border-radius:10px;padding:1rem}
  .ok{color:#6ee7a0}.bad{color:#f87171}.muted{color:#9ca3af;font-size:.9rem}
  a{color:#93c5fd} ul{padding-left:1.2rem} li{margin:.4rem 0}
  code{background:#252830;padding:.1rem .35rem;border-radius:4px;font-size:.85rem}
  .accounts{display:flex;flex-direction:column;gap:.75rem}
  .acc{background:#1a1d24;border:1px solid #2a2f3a;border-radius:8px;padding:.75rem}
  .acc-head{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
  .tag{font-size:.75rem;padding:.1rem .45rem;border-radius:4px;background:#252830}
  .tag.critical{background:#7f1d1d;color:#fecaca}
  .tag.warn{background:#78350f;color:#fde68a}
  .tag.ok{background:#14532d;color:#bbf7d0}
  .metric{display:grid;grid-template-columns:7rem 1fr 3rem;gap:.5rem;align-items:center;font-size:.85rem;margin:.35rem 0}
  .track{height:8px;background:#252830;border-radius:4px;overflow:hidden}
  .bar{height:100%;border-radius:4px}
  .bar.ok{background:#22c55e}.bar.warn{background:#eab308}.bar.critical{background:#ef4444}
  .balance{color:#93c5fd}
  button{background:#3b82f6;color:#fff;border:0;padding:.45rem .9rem;border-radius:6px;cursor:pointer;margin-right:.5rem}
</style></head><body>
<h1>🧠 第二大脑 · 控制台</h1>
<p class="muted">生成于 ${new Date().toLocaleString('zh-CN')} · <button onclick="location.reload()">刷新</button><button onclick="refreshCockpit()">拉取最新配额</button></p>
<div class="grid">
  <div class="card"><strong>桥接 :5892</strong><br/><span class="${bridge ? 'ok' : 'bad'}">${bridge ? '运行中' : '未响应'}</span></div>
  <div class="card"><strong>Khoj :5871</strong><br/><span class="${khojOk ? 'ok' : 'bad'}">${khojOk ? '运行中' : '未响应'}</span></div>
  <div class="card"><strong>知识卡片</strong><br/>${cardCount} 张</div>
  <div class="card"><strong>待审核</strong><br/>${pending.length} 张</div>
  <div class="card"><strong>对话审计</strong><br/>${stats.total} 次 · 沉淀 ${stats.deposited}</div>
</div>
<h2>账号配额 · 按公司 / 模型</h2>
<p><a href="quota-cockpit.html" style="font-size:1.05rem"><strong>→ 打开详细配额驾驶舱</strong></a>（按 Anthropic / Google / OpenAI / DeepSeek 等分组，含 % 进度条与 API 今日用量）</p>
<div id="cockpit">${cockpitHtml}</div>
<h2>最近知识卡片</h2>
<ul>${cards.map((c) => `<li><strong>${c.title}</strong> <span class="muted">[${c.para}]</span></li>`).join('') || '<li class="muted">暂无</li>'}</ul>
<h2>快捷入口</h2>
<ul>
  <li><a href="http://localhost:5871">Khoj 搜索</a></li>
  <li><a href="https://coolapihub.khtain.com/admin/dashboard">Sub2API 管理后台</a></li>
</ul>
<h2>Chrome 扩展</h2>
<p class="muted">加载未打包扩展：<code>deploy/chrome-extension</code> → chrome://extensions → 开发者模式 → 加载已解压的扩展程序</p>
<script>
async function refreshCockpit(){
  const el=document.getElementById('cockpit');
  el.innerHTML='<p class="muted">拉取中…</p>';
  try{
    const r=await fetch('http://127.0.0.1:5892/brain/cockpit?force=1');
    const d=await r.json();
    if(d.error) throw new Error(d.error);
    location.reload();
  }catch(e){el.innerHTML='<p class="bad">'+e.message+'</p>';}
}
</script>
</body></html>`

  fs.writeFileSync(OUT, html, 'utf8')
  console.log(OUT)

  if (cockpit?.accounts?.length) {
    const quotaOut = path.join(BRAIN, 'quota-cockpit.html')
    fs.writeFileSync(quotaOut, renderCockpitHtml(cockpit), 'utf8')
    console.log(quotaOut)
  }
}

main()
