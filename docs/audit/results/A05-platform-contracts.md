# A05 结果 — 四端原生模块与宿主契约

## 结论

Android、iOS 与 Web 的抽查契约大体闭合；HarmonyOS 存在多处“模块已注册、能力已暴露，但方法缺失或为占位实现”的残留问题。

## 已确认问题

- [AUD-001](../Findings.md#aud-001-p1-harmonyos-音量被重复除以-100)
- [AUD-002](../Findings.md#aud-002-p2-harmonyos-缺少通知歌词方法)
- [AUD-005](../Findings.md#aud-005-p2-harmonyos-剪贴板是空实现但界面提示复制成功)
- [AUD-006](../Findings.md#aud-006-p1-harmonyos-视频能力被错误暴露)
- [AUD-007](../Findings.md#aud-007-p1-harmonyos-dlna-发现结果不会进入设备列表)
- [AUD-008](../Findings.md#aud-008-p2-harmonyos-dlna-把设备-id-当作-soap-control-url)

## 实际覆盖与反证

- 从 TS interface/facade 反查 Android、iOS、HarmonyOS、Web 的注册、方法、callback 与事件名。
- 单独运行 `native-module-contract.test.ts`，185/185 通过；该结果同时证明现有门禁没有覆盖这些 Harmony 行为差异。
- Android/iOS DLNA 都持久化设备并把 id 映射到解析后的 control URL，排除 TS 参数本来就是 URL 的解释。
- canonical 平台文档明确把 Harmony video/DLNA/clipboard 标为支持，排除“公开声明为不支持”的降级语义。

## 证据缺口

HarmonyOS 无 hvigor/设备环境，未验证系统 API 兼容性；结论限于当前可达代码必然产生的结果。
