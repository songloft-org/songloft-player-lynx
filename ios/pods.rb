module SongloftPods
  def songloft_pods(devtools:)
    # ---- Lynx SDK ----------------------------------------------------------
    # Coordinates copied from the official `integrating-lynx-demo-projects`
    # ios/HelloLynxSwift Podfile (which pins 3.8.0); versions bumped to the 4.0.x
    # line so the iOS host matches the Android host's `org.lynxsdk.lynx:*:4.0.0`
    # (batch 24).
    #
    # WHY 4.0.1 AND NOT EXACTLY 4.0.0 (cross-platform version skew — read this
    # first when iOS and Android behave differently):
    #   1. iOS resolves Lynx / LynxService / XElement in LOCKSTEP (each XElement
    #      and LynxService subspec depends on `Lynx = <same version>`), so the
    #      whole family has to move together — you cannot mix 4.0.0 and 4.0.1.
    #   2. The 4.0.0 podspec could not be used on this machine at all: the
    #      CocoaPods trunk CDN cache holds a TRUNCATED `Lynx/4.0.0/
    #      Lynx.podspec.json` (21 kB against ~235 kB), and CocoaPods dies with
    #      `JSON::ParserError` before it can resolve anything.
    # 4.0.1 is the nearest usable release and is the same major/minor as Android's
    # 4.0.0, i.e. the same engine line and bundle-format compatibility.
    pod 'Lynx', '4.0.1', :subspecs => [
      'Framework',
    ]

    # `Lynx/Framework` depends on `LynxBase/Framework` and `LynxServiceAPI`
    # **without any version constraint**, so an unpinned resolve cheerfully pairs
    # Lynx 4.0.1 with a 4.2.0-nightly LynxBase (newest wins). Pin both to Lynx's
    # own release — nightlies of the base layer under a stable engine is exactly
    # the kind of mismatch that produces unreproducible device-only breakage.
    pod 'LynxBase', '4.0.1', :subspecs => ['Framework']
    pod 'LynxServiceAPI', '4.0.1'

    # JS engine. Lynx 4.0.1's `Framework` subspec pins `PrimJS/quickjs = 4.0.0`,
    # so PrimJS stays on 4.0.0 (mirrors Android's `org.lynxsdk.lynx:primjs:4.0.0`).
    pod 'PrimJS', '4.0.0', :subspecs => ['quickjs', 'napi']

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
    pod 'LynxService', '4.0.1', :subspecs => [
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
    pod 'XElement', '4.0.1'
  end
end
