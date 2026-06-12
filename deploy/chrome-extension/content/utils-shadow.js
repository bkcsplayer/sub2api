/** Walk document + open shadow roots. */
function brainWalkRoots(root, visit) {
  if (!root) return
  visit(root)
  const nodes = root.querySelectorAll ? root.querySelectorAll('*') : []
  for (const node of nodes) {
    if (node.shadowRoot) brainWalkRoots(node.shadowRoot, visit)
  }
}

function brainQueryAll(selector) {
  const out = []
  brainWalkRoots(document, (root) => {
    if (!root.querySelectorAll) return
    for (const el of root.querySelectorAll(selector)) out.push(el)
  })
  return out
}

function brainText(el) {
  if (!el) return ''
  return (el.innerText || el.textContent || '').replace(/\s+\n/g, '\n').trim()
}

window.__brainUtils = { brainWalkRoots, brainQueryAll, brainText }
