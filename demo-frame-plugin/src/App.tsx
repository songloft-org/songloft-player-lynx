import { useCallback, useEffect, useState } from '@lynx-js/react'

/**
 * Demo child plugin — loaded inside a <frame> by the parent app.
 * Verifies:
 * 1. Bundle loads and renders
 * 2. global-props from parent are received
 * 3. (Future) NativeModule bridge communication
 */
export function App() {
  const [frameId, setFrameId] = useState<string>('(unknown)')
  const [theme, setTheme] = useState<string>('(unknown)')
  const [message, setMessage] = useState<string>('')
  const [callCount, setCallCount] = useState(0)

  useEffect(() => {
    // Read global-props passed by the parent <frame> element
    const gp = (globalThis as any).__globalProps
    if (gp) {
      setFrameId(gp.frameId ?? '(not set)')
      setTheme(gp.theme ?? '(not set)')
    }
  }, [])

  const handleTap = useCallback(() => {
    setCallCount((c) => c + 1)
    setMessage(`Button tapped ${callCount + 1} times`)
    // In Phase 2+, this would call NativeModules.SongloftPluginBridge.hostCall(...)
  }, [callCount])

  return (
    <view style={{ padding: '20px', backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff' }}>
      <text style={{ fontSize: '18px', fontWeight: 'bold', color: theme === 'dark' ? '#fff' : '#000' }}>
        Demo Frame Plugin
      </text>
      <text style={{ fontSize: '14px', marginTop: '12px', color: '#888' }}>
        frameId: {frameId}
      </text>
      <text style={{ fontSize: '14px', marginTop: '4px', color: '#888' }}>
        theme: {theme}
      </text>
      <text style={{ fontSize: '14px', marginTop: '4px', color: '#888' }}>
        status: Bundle loaded successfully ✓
      </text>
      <view
        bindtap={handleTap}
        style={{
          marginTop: '20px',
          padding: '12px 24px',
          backgroundColor: '#4f46e5',
          borderRadius: '8px',
          alignItems: 'center',
        }}
      >
        <text style={{ color: '#fff', fontSize: '14px' }}>Test Host Call</text>
      </view>
      {message ? (
        <text style={{ fontSize: '14px', marginTop: '12px', color: '#4f46e5' }}>
          {message}
        </text>
      ) : null}
    </view>
  )
}
