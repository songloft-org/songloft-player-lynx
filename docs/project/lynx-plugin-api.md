# Lynx 插件业务请求验证

2026-11-15：在 `025ed82319233c8b64e734cb4c6cdbca84da9833` 加本批工作树上，为原生/Web frame 增加 `plugin.apiRequest`。宿主绑定 entryPath，复用认证 HTTP 客户端，仅允许插件自身 `/api` 下 GET/POST；SDK 不读取 Token。

`npm run build`、`npm run build:web`、`tsc -b` 通过。全量 Vitest 首轮 3812 通过、1 项发布检查失败（dist 为 TestBridge 产物）；生产重建后，发布检查和插件请求/宿主测试共 12 项通过。Android API 34 的既有 Debug 壳替换本批 JS bundle 后，真实打开 bili 原生 frame、滚动设置、保存“中”音质，后端读取 medium；浏览器 frame 与独立 HTML 回退均实际保存设置。证据 `/tmp/songloft-bili-verification/`，完整边界见 bili 仓库 `VERIFICATION.md`。

Not run：本批完整 `assembleDebug`（Gradle 下载过慢）、Flutter 真机、iOS/HarmonyOS、真实 B 站账号收藏夹/下载。Lynx HTML 回退不发送 COEP；隔离宿主跨源嵌入该 HTML 仍不支持。无原生模块签名变更。未提交、推送或发布。
