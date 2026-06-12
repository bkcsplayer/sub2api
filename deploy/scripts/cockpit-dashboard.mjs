/** HTML renderer for quota cockpit (used by generate-brain-dashboard + quota-cockpit). */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function fmtReset(iso, remainingSeconds) {
  if (!iso && remainingSeconds == null) return ''
  if (remainingSeconds != null && remainingSeconds > 0) {
    const h = Math.floor(remainingSeconds / 3600)
    const m = Math.floor((remainingSeconds % 3600) / 60)
    if (h > 0) return `${h}h${m}m 后重置`
    return `${m}m 后重置`
  }
  if (iso) {
    try {
      return new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }
  return ''
}

function barRow(q) {
  if (q.kind === 'balance') {
    const amt = q.balance ?? 0
    const unit = q.unit || 'USD'
    const lvl = q.level || 'ok'
    return `<tr class="metric ${lvl}">
      <td>${esc(q.label)}</td>
      <td colspan="2"><span class="balance">${amt} ${unit}</span>${q.detail ? ` <span class="muted">(${esc(q.detail)})</span>` : ''}</td>
      <td class="muted">${esc(q.note || '')}</td>
    </tr>`
  }
  const pct = q.used_pct ?? 0
  const lvl = q.level || (pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok')
  const used = q.used != null && q.limit != null ? `${q.used} / ${q.limit} ${q.unit || ''}`.trim() : q.detail || ''
  const stats = q.stats
    ? `今日窗: ${q.stats.requests ?? 0} req · ${q.stats.tokens ?? 0} tok · $${(q.stats.cost ?? 0).toFixed(4)}`
    : ''
  return `<tr class="metric ${lvl}">
    <td>${esc(q.label)}${q.model ? `<br/><span class="muted model">${esc(q.model)}</span>` : ''}</td>
    <td class="pct">${pct}%</td>
    <td><div class="track"><div class="bar ${lvl}" style="width:${Math.min(100, pct)}%"></div></div>
      <span class="muted remain">剩余 ${q.remain_pct ?? 100 - pct}%</span></td>
    <td class="muted">${esc(used)}${stats ? `<br/>${esc(stats)}` : ''}${q.resets_at || q.remaining_seconds != null ? `<br/>${esc(fmtReset(q.resets_at, q.remaining_seconds))}` : ''}</td>
  </tr>`
}

function accountCard(acc) {
  const statusCls = acc.status === 'active' ? 'ok' : acc.status === 'rate_limited' ? 'critical' : 'warn'
  const today = acc.today
  const todayLine = today
    ? `今日 API 用量: <strong>${today.requests}</strong> 次 · <strong>${today.tokens.toLocaleString()}</strong> tokens · 费用 <strong>$${today.cost.toFixed(4)}</strong>`
    : ''

  const quotaRows = (acc.quotas || []).map(barRow).join('') || '<tr><td colspan="4" class="muted">暂无窗口额度数据</td></tr>'

  const notes = (acc.notes || []).map((n) => `<li class="muted">${esc(n)}</li>`).join('')
  const err = acc.usage_error ? `<p class="bad">用量查询: ${esc(acc.usage_error)}</p>` : ''

  return `<article class="acc-card ${statusCls}">
    <header>
      <div>
        <h3>${esc(acc.name)}</h3>
        <p class="muted">${esc(acc.product)} · ${esc(acc.type)} · ID ${acc.id}
          ${acc.groups?.length ? ` · ${acc.groups.map(esc).join(', ')}` : ''}</p>
      </div>
      <span class="tag ${statusCls}">${esc(acc.status)}</span>
    </header>
    ${acc.tier ? `<p class="tier">套餐/层级: <strong>${esc(acc.tier)}</strong></p>` : ''}
    ${todayLine ? `<p class="today">${todayLine}</p>` : ''}
    ${err}
    <table class="quota-table">
      <thead><tr><th>额度项</th><th>已用</th><th>进度</th><th>详情 / 重置</th></tr></thead>
      <tbody>${quotaRows}</tbody>
    </table>
    ${notes ? `<ul class="notes">${notes}</ul>` : ''}
    ${acc.usage_updated_at ? `<p class="muted tiny">用量更新: ${esc(new Date(acc.usage_updated_at).toLocaleString('zh-CN'))}</p>` : ''}
  </article>`
}

export function renderCockpitHtml(cockpit, { title = '账号配额驾驶舱', embed = false } = {}) {
  if (!cockpit?.accounts?.length) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><title>${esc(title)}</title></head>
<body><p>暂无数据。请配置 SUB2API_COCKPIT_EMAIL/PASSWORD 后刷新。</p></body></html>`
  }

  const byCompany = cockpit.by_company || {}
  const companySections = Object.entries(byCompany)
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
    .map(([company, data]) => {
      const accounts = (data.accounts || []).map(accountCard).join('')
      const summary = data.summary || {}
      return `<section class="company">
        <h2>${esc(company)} <span class="muted">(${summary.count ?? 0} 个账号 · 最高用量 ${summary.max_pct ?? 0}%)</span></h2>
        <div class="acc-grid">${accounts}</div>
      </section>`
    })
    .join('')

  const s = cockpit.summary || {}
  const styles = `
  :root{--bg:#0a0c10;--card:#141820;--border:#2a3140;--text:#e8eaed;--muted:#9aa3b2;--ok:#34d399;--warn:#fbbf24;--bad:#f87171;--accent:#60a5fa}
  *{box-sizing:border-box} body{font-family:system-ui,sans-serif;margin:0;background:var(--bg);color:var(--text);line-height:1.45}
  .wrap{max-width:1100px;margin:0 auto;padding:1.25rem}
  h1{font-size:1.35rem;margin:0 0 .25rem} h2{font-size:1.05rem;margin:1.5rem 0 .75rem;border-bottom:1px solid var(--border);padding-bottom:.35rem}
  h3{font-size:.95rem;margin:0}
  .muted{color:var(--muted)} .bad{color:var(--bad)} .tiny{font-size:.75rem}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.65rem;margin:1rem 0}
  .summary .box{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:.75rem}
  .summary strong{font-size:1.2rem;display:block}
  button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:.45rem .9rem;cursor:pointer;margin-right:.5rem}
  .company{margin-top:1rem}
  .acc-grid{display:flex;flex-direction:column;gap:.85rem}
  .acc-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1rem}
  .acc-card header{display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start}
  .tag{font-size:.72rem;padding:.15rem .45rem;border-radius:6px;background:#252b36}
  .tag.ok{color:var(--ok)} .tag.critical{color:var(--bad)} .tag.warn{color:var(--warn)}
  .tier,.today{font-size:.85rem;margin:.5rem 0}
  .quota-table{width:100%;border-collapse:collapse;font-size:.82rem;margin-top:.5rem}
  .quota-table th,.quota-table td{border-top:1px solid var(--border);padding:.45rem .35rem;vertical-align:top;text-align:left}
  .quota-table th{color:var(--muted);font-weight:500}
  .track{height:8px;background:#252b36;border-radius:4px;overflow:hidden;max-width:220px}
  .bar{height:100%} .bar.ok{background:var(--ok)} .bar.warn{background:var(--warn)} .bar.critical{background:var(--bad)}
  .pct{font-weight:600;white-space:nowrap} .remain{font-size:.72rem}
  .balance{color:var(--accent);font-weight:600}
  .model{font-size:.72rem}
  .notes{margin:.35rem 0 0 1rem;font-size:.78rem}
  a{color:var(--accent)}
  `

  const toolbar = embed
    ? ''
    : `<p class="muted">更新于 ${esc(cockpit.fetched_iso || '—')} · 缓存 ${cockpit.cache_ttl_sec || 300}s
      <button onclick="refresh(true)">强制刷新</button>
      <button onclick="location.reload()">重载页面</button>
      <a href="dashboard.html">← 第二大脑总览</a></p>
    <script>
    async function refresh(force){
      const u='http://127.0.0.1:5892/brain/cockpit'+(force?'?force=1':'');
      document.body.style.opacity='0.6';
      await fetch(u).catch(()=>{});
      location.reload();
    }
    setInterval(()=>location.reload(),${(cockpit.cache_ttl_sec || 300) * 1000});
    </script>`

  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<style>${styles}</style></head><body>
<div class="wrap">
<h1>📊 ${esc(title)}</h1>
${toolbar}
<div class="summary">
  <div class="box"><span class="muted">账号总数</span><strong>${s.total ?? 0}</strong></div>
  <div class="box"><span class="muted">限流中</span><strong class="bad">${s.rate_limited ?? 0}</strong></div>
  <div class="box"><span class="muted">≥90% 告警</span><strong class="bad">${s.critical ?? 0}</strong></div>
  <div class="box"><span class="muted">≥70% 注意</span><strong class="warn">${s.warn ?? 0}</strong></div>
  <div class="box"><span class="muted">错误账号</span><strong>${s.error ?? 0}</strong></div>
</div>
${companySections}
<p class="muted tiny" style="margin-top:2rem">
  OAuth 账号（Claude/OpenAI/Gemini）显示上游官方窗口额度百分比；API Key 账号显示 Sub2API 今日调用量与已配置的日/周/总额度。
  上游 API 余额（DeepSeek/Kimi 控制台余额）需服务商支持查询，当前仅展示本站统计的费用与次数。
</p>
</div></body></html>`
}
