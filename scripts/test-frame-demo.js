/**
 * Phase 0 验证脚本：通过 browserless Chrome 测试 <frame> 加载子 bundle。
 * 使用方式：curl -X POST http://localhost:3000/function -H 'Content-Type: application/javascript' --data-binary @scripts/test-frame-demo.js
 */
module.exports = async ({ page }) => {
  const APP_URL = 'http://localhost:3001/'

  // 1. 打开主应用
  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 })
  await page.waitForTimeout(3000) // 等待 lynx-view 初始化

  // 2. 截图看初始状态
  const screenshotInit = await page.screenshot({ encoding: 'base64', fullPage: true })

  // 3. 通过 JS 导航到 /demo-frame
  // 应用使用 memory history，无法直接 goto 子路径。
  // 但在 Web 上 lynx-view 的 worker 里运行路由代码。
  // 我们需要找到 lynx-view 然后用它的 sendGlobalEvent 来触发导航。
  // 
  // 更简单的方式：直接修改 URL hash 或使用一个辅助入口。
  // 实际上 memory history 完全在 worker 内部，外部无法直接控制。
  //
  // 最简单的验证方式：创建一个独立的 HTML 页面直接嵌入 <lynx-view> 加载子 bundle
  const testHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link href="/web-core/static/css/client.css" rel="stylesheet">
      <style>html,body{margin:0;height:100%;background:#f0f0f0}lynx-view{width:100vw;height:100vh;display:block}</style>
    </head>
    <body>
      <h3 style="position:fixed;top:0;left:0;z-index:9999;background:yellow;padding:4px 8px;font-size:12px">
        Frame Test: Loading child bundle...
      </h3>
      <lynx-view id="child" url="http://localhost:3001/demo-plugin.web.bundle" 
        style="width:100%;height:calc(100% - 30px);margin-top:30px;display:block"></lynx-view>
      <script type="module" src="/web-core/static/js/client.js"></script>
      <script>
        // 监控加载状态
        setTimeout(() => {
          const lv = document.getElementById('child');
          const banner = document.querySelector('h3');
          if (lv && lv.shadowRoot) {
            banner.textContent = 'Frame Test: lynx-view shadow root created ✓';
            banner.style.background = '#4ade80';
          } else {
            banner.textContent = 'Frame Test: No shadow root yet';
            banner.style.background = '#fbbf24';
          }
        }, 5000);
      </script>
    </body>
    </html>
  `

  // 直接在浏览器中加载内联 HTML 来测试 lynx-view 对子 bundle 的加载
  await page.setContent(testHtml, { waitUntil: 'networkidle0', timeout: 15000 })
  
  // 等待 web-core client.js 加载并定义 lynx-view
  await page.waitForTimeout(6000)

  // 检查 lynx-view 是否被定义为自定义元素
  const customElementDefined = await page.evaluate(() => {
    return customElements.get('lynx-view') !== undefined
  })

  // 检查 lynx-view 是否创建了 shadow root
  const hasShadowRoot = await page.evaluate(() => {
    const el = document.getElementById('child')
    return el ? !!el.shadowRoot : false
  })

  // 检查 shadow root 内是否有内容
  const shadowContent = await page.evaluate(() => {
    const el = document.getElementById('child')
    if (!el || !el.shadowRoot) return 'no shadow root'
    const children = el.shadowRoot.children.length
    const text = el.shadowRoot.textContent?.substring(0, 200) || ''
    return `children: ${children}, text preview: "${text.trim().substring(0, 100)}"`
  })

  // 最终截图
  const screenshotFinal = await page.screenshot({ encoding: 'base64', fullPage: true })

  return {
    data: {
      customElementDefined,
      hasShadowRoot,
      shadowContent,
      screenshotInit: screenshotInit.substring(0, 100) + '...(truncated)',
      screenshotFinal: screenshotFinal.substring(0, 100) + '...(truncated)',
    },
    type: 'application/json'
  }
}
