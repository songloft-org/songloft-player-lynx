import { useCallback, useState } from '@lynx-js/react'
import { isWebPlatform } from '../../../native/web-platform.js'

/**
 * Phase 0 验证页面：通过 <frame> 加载子 bundle。
 * Web 上 <frame> 映射为嵌套 <lynx-view>。
 */
export function DemoFramePage() {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 子 bundle 的 URL — 开发时从 dev server 的根路径 serve
  const bundleName = isWebPlatform() ? 'demo-plugin.web.bundle' : 'demo-plugin.lynx.bundle'
  const bundleUrl = `/${bundleName}`

  const globalProps = {
    frameId: 'demo-frame-001',
    theme: 'light',
    hostVersion: '1.0.0',
  }

  const onLoad = useCallback((e: any) => {
    console.log('[DemoFrame] Child bundle loaded:', e?.detail)
    setLoaded(true)
  }, [])

  return (
    <view style={{ flex: 1, flexDirection: 'column' }}>
      {/* Header */}
      <view style={{ padding: '16px', backgroundColor: '#f3f4f6' }}>
        <text style={{ fontSize: '16px', fontWeight: 'bold' }}>
          Phase 0: Frame Demo
        </text>
        <text style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
          Status: {loaded ? '✓ Loaded' : '⏳ Loading...'}
          {error ? ` | Error: ${error}` : ''}
        </text>
        <text style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          Platform: {isWebPlatform() ? 'Web (nested lynx-view)' : 'Native (frame)'}
        </text>
        <text style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
          Bundle: {bundleUrl}
        </text>
      </view>

      {/* Frame container */}
      <view style={{ flex: 1 }}>
        <frame
          src={bundleUrl}
          global-props={globalProps}
          bindload={onLoad}
          style={{ width: '100%', height: '100%' }}
        />
      </view>
    </view>
  )
}
