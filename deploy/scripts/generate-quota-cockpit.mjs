#!/usr/bin/env node
/** Generate detailed quota cockpit HTML (brain/quota-cockpit.html). */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchCockpitData, loadEnv } from './knowledge-cockpit.mjs'
import { renderCockpitHtml } from './cockpit-dashboard.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const deployRoot = path.resolve(__dirname, '..')
const OUT = path.join(deployRoot, 'brain', 'quota-cockpit.html')

async function main() {
  const force = process.argv.includes('--force')
  let cockpit
  try {
    cockpit = await fetchCockpitData(deployRoot, { force })
  } catch (err) {
    console.error('Cockpit fetch failed:', err.message)
    const cache = path.join(deployRoot, 'brain', 'data', 'cockpit-cache.json')
    if (fs.existsSync(cache)) cockpit = JSON.parse(fs.readFileSync(cache, 'utf8'))
    else throw err
  }
  const html = renderCockpitHtml(cockpit)
  fs.writeFileSync(OUT, html, 'utf8')
  console.log(OUT)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
