import { WebSocket } from 'ws'
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 15000)

const list = await (await fetch('http://localhost:9666/json/list')).json()
const page = list.find(t => t.type === 'page')
if (!page) { console.error('No page'); process.exit(1) }
console.log('Page:', page.title, page.url)

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.on('open', r); ws.on('error', j) })
console.log('CDP OK')

let id = 0
const pending = new Map()
ws.on('message', raw => {
  const m = JSON.parse(raw.toString())
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
})
const send = (m, p={}) => new Promise(r => { const i=++id; pending.set(i, r); ws.send(JSON.stringify({id:i, method:m, params:p})) })
const ev = async (e) => (await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.result?.value

await send('Runtime.enable')
console.log('Enabled')

// 页面已加载 5 秒了（docker run 后 sleep 5），内置的 setTimeout 5s 应该已跑完
const testResult = await ev('JSON.stringify(window.__TEST_RESULT || null)')
console.log('\n__TEST_RESULT:', testResult)

// 直接查 lynx-view shadow root
const directCheck = await ev(`JSON.stringify({
  childEl: !!document.getElementById('child'),
  hasSR: !!document.getElementById('child')?.shadowRoot,
  srChildren: document.getElementById('child')?.shadowRoot?.children?.length ?? -1,
  text: (document.getElementById('child')?.shadowRoot?.textContent || '').trim().substring(0, 300),
  statusDiv: document.getElementById('status')?.textContent || ''
})`)
console.log('Direct check:', directCheck)

const info = JSON.parse(directCheck || '{}')
console.log('\n=== Phase 0 验证结果 ===')
console.log('Status bar:', info.statusDiv)
if (info.hasSR && info.text?.includes('Demo Frame Plugin')) {
  console.log('🎉 SUCCESS: <lynx-view> 成功渲染了远程子 bundle！')
} else if (info.hasSR) {
  console.log('△ Shadow root 存在, children=' + info.srChildren + ', text="' + info.text?.substring(0,100) + '"')
} else {
  console.log('✗ lynx-view 未创建 shadow root (可能 web-core 未加载或 WASM 不支持)')
}

// 截图
const ss = await send('Page.captureScreenshot', {format:'png'})
if (ss.result?.data) {
  const fs = await import('node:fs')
  fs.writeFileSync('scripts/frame-demo-screenshot.png', Buffer.from(ss.result.data, 'base64'))
  console.log('Screenshot: scripts/frame-demo-screenshot.png')
}

ws.close()
process.exit(0)
