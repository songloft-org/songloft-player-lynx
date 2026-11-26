module SongloftPods
  def songloft_pods(devtools:)
    # ---- Lynx SDK ----------------------------------------------------------
    # Keep the engine, base, service API and elements on the same release.
    # PrimJS uses the exact version required by Lynx/Framework.
    lynx_version = '4.2.0'
    pod 'Lynx', lynx_version, :subspecs => [
      'Framework',
    ]

    pod 'LynxBase', lynx_version, :subspecs => ['Framework']
    pod 'LynxServiceAPI', lynx_version

    pod 'PrimJS', '4.2.1', :subspecs => ['quickjs', 'napi']

    # ---- Host services -----------------------------------------------------
    # Host services the Android host also registers in SongloftApplication:
    #   Image → `<image>` cover art (backed by SDWebImage on iOS / Fresco on Android)
    #   Log   → engine logging
    # `Devtool` enables the Lynx Inspector Protocol (WebSocket) for e2e behavior
    # testing via the `e2e/` driver. Release installs omit it and its transitive
    # dependencies entirely; CocoaPods cannot split subspecs by configuration.
    #
    # `Http` is DELIBERATELY ABSENT (batch 45). The host HTTP service backs the BARE
    # global `fetch` the network layer relies on (AGENTS.md §3) and without one every
    # request dies — but ours is supplied by `SongloftLynx/SongloftHttpService.swift`
    # and registered explicitly in `AppDelegate`. The SDK's version routes through
    # `URLSession.shared`, which cannot take a delegate, so it can never accept a
    # self-signed certificate; that is why "allow insecure TLS" was a no-op on iOS.
    # Keeping this subspec would leave two implementations competing for the same
    # protocol binding with no documented winner.
    pod 'LynxService', lynx_version, :subspecs => [
      'Image',
      'Log',
    ] + (devtools ? ['Devtool'] : [])

    # LynxService/Image dependencies (versions pinned by the podspec itself).
    pod 'SDWebImage', '5.15.5'
    pod 'SDWebImageWebPCoder', '0.11.0'

    # ---- XElement family ---------------------------------------------------
    # The umbrella pod's default subspecs cover every element this app renders:
    #   SVG      → every icon in the app (`<svg content=…>`)
    #   Input    → login / server settings / exclude-dir dialogs
    #   Overlay  → lynx-ui Sheet
    #   Refresh  → home pull-to-refresh
    #   WebView  → plugin pages
    #   ViewPager / ScrollCoordinator / BlurView / Markdown come along for free.
    # `XElement/Behavior` (also a default subspec) is what registers the element
    # behaviors with the engine — the iOS equivalent of the Android host's
    # `addBehaviors(XElementBehaviors().create())`, only it self-registers.
    pod 'XElement', lynx_version
  end
end
