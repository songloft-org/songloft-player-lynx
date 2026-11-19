/** Dedicated CEF cookie access also works when the last plugin was closed. */
export function DesktopCookieHost() {
  return (
    <webview
      id="desktop-cookie-host"
      src="about:blank"
      use-osr={true}
      style={{
        position: 'absolute',
        left: -10000,
        top: -10000,
        width: 1,
        height: 1,
      }}
    />
  )
}
