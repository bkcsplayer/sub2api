import { ClassicLevel } from 'classic-level'

const ldb = process.argv[2]
const db = new ClassicLevel(ldb, { keyEncoding: 'buffer', valueEncoding: 'buffer' })
await db.open()

for await (const [key, value] of db.iterator()) {
  const keyStr = key.toString('utf8')
  if (!keyStr.includes('persist')) continue
  console.log('KEY repr:', JSON.stringify(keyStr))
  console.log('KEY hex head:', key.toString('hex').slice(0, 120))
  console.log('VALUE len:', value.length)
  console.log('VALUE hex head:', value.toString('hex').slice(0, 200))
  const utf16 = value.toString('utf16le')
  const utf8 = value.toString('utf8')
  console.log('UTF16 sample:', JSON.stringify(utf16.slice(0, 120)))
  console.log('UTF8 sample:', JSON.stringify(utf8.slice(0, 120)))
  for (const [label, text] of [['utf16', utf16], ['utf8', utf8]]) {
    const i = text.indexOf('{')
    if (i < 0) continue
    console.log(label, 'brace at', i, 'char codes around:', [...text.slice(i, i + 20)].map((c) => c.charCodeAt(0)))
  }
}
await db.close()
