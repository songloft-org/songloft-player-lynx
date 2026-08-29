import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const webCorePkg = resolve(root, 'node_modules/@lynx-js/web-core')
const webCore = resolve(realpathSync(webCorePkg), 'dist/client_prod/static')

const MIME = {'.js':'application/javascript; charset=utf-8','.css':'text/css','.html':'text/html; charset=utf-8','.wasm':'application/wasm','.bundle':'application/octet-stream','.mjs':'application/javascript; charset=utf-8'}

const TEST_HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<link href="/web-core/static/css/client.css" rel="stylesheet">
<style>body{margin:0;font-family:sans-serif;background:#eee}
#status{padding:8px 12px;background:#333;color:#fff;font-size:13px;position:fixed;top:0;width:100%;z-index:99}
lynx-view{display:block;border:2px solid blue;margin:40px 10px 10px}
</style>
</head><body>
<div id="status">Loading...</div>
<lynx-view id="child" style="width:400px;height:400px" url="/demo-plugin.web.bundle"></lynx-view>
<script type="module" src="/web-core/static/js/client.js"></script>
<script type="module">
setTimeout(() => {
  const el = document.getElementById('child')
  const s = document.getElementById('status')
  const sr = el?.shadowRoot
  if (sr && sr.textContent.trim().length > 0) {
    s.textContent = '✓ SUCCESS: ' + sr.textContent.trim().substring(0, 100)
    s.style.background = '#16a34a'
  } else if (sr) {
    s.textContent = '△ Shadow root exists, children=' + sr.children.length + ', text=""'
    s.style.background = '#ca8a04'
  } else {
    s.textContent = '✗ No shadow root on lynx-view'
    s.style.background = '#dc2626'
  }
  // Expose for CDP
  window.__TEST_RESULT = { hasSR: !!sr, text: sr?.textContent?.trim()?.substring(0,200) || '', kids: sr?.children?.length ?? 0 }
}, 5000)
</script>
</body></html>`

createServer((req, res) => {
  let url = req.url.split('?')[0]
  let filePath, content

  if (url === '/') {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'})
    res.end(TEST_HTML)
    return
  }
  if (url === '/demo-plugin.web.bundle') filePath = resolve(root, 'demo-frame-plugin/dist/web/main.web.bundle')
  else if (url.startsWith('/web-core/static/')) filePath = resolve(webCore, url.slice('/web-core/static/'.length))

  if (!filePath || !existsSync(filePath)) { res.writeHead(404).end('not found: ' + url); return }
  content = readFileSync(filePath)
  res.writeHead(200, {'Content-Type': MIME[extname(filePath)] || 'application/octet-stream'})
  res.end(content)
}).listen(3002, () => console.log('Test server: http://localhost:3002/'))
