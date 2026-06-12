import { ClassicLevel } from 'classic-level'
import path from 'node:path'
import os from 'node:os'

const ldb = process.argv[2] || path.join(os.homedir(), 'AppData', 'Roaming', 'CherryStudio', 'Local Storage', 'leveldb')
const db = new ClassicLevel(ldb, { createIfMissing: false, keyEncoding: 'buffer', valueEncoding: 'buffer' })
await db.open()

const entries = []
for await (const [key, value] of db.iterator()) {
  const keyStr = key.toString('utf8')
  if (keyStr.includes('persist:cherry-studio')) {
    entries.push({ key: keyStr, keyHex: key.toString('hex').slice(0, 80), valueLen: value.length })
    const payload = value.byteLength % 2 === 1 ? value.subarray(1) : value
    const text = payload.toString('utf16le')
    const jsonStart = text.indexOf('{')
    if (jsonStart >= 0) {
      const slice = text.slice(jsonStart)
      let depth = 0
      let end = 0
      for (let i = 0; i < slice.length; i++) {
        if (slice[i] === '{') depth++
        else if (slice[i] === '}') {
          depth--
          if (depth === 0) {
            end = i + 1
            break
          }
        }
      }
      const outer = JSON.parse(slice.slice(0, end))
      console.log('TOP_KEYS', Object.keys(outer))
      if (outer.llm) {
        const llm = JSON.parse(outer.llm)
        console.log('LLM providers count', llm.providers?.length)
        const targets = ['new-api', 'anthropic', 'openai', 'coolapihub']
        for (const p of llm.providers || []) {
          if (targets.some((t) => p.id?.includes(t) || p.name?.includes('Cool'))) {
            console.log('PROVIDER', JSON.stringify({
              id: p.id,
              name: p.name,
              type: p.type,
              enabled: p.enabled,
              apiHost: p.apiHost,
              anthropicApiHost: p.anthropicApiHost,
              modelCount: p.models?.length,
              hasKey: !!p.apiKey,
            }))
          }
        }
      }
    }
  }
}
console.log('MATCHES', entries.length)
await db.close()
