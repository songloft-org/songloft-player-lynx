# A02 结果 — 播放器状态与原生音频生命周期

## 结论

播放器共享状态、队列切换、远程命令回流和 Android/iOS 的共享播放器生命周期整体有明确 owner；确认两个 HarmonyOS 音频桥接缺陷。

## 已确认问题

- [AUD-001](../Findings.md#aud-001-p1-harmonyos-音量被重复除以-100)：store 已把 0–100 转为 0–1，Harmony module 再除一次。
- [AUD-002](../Findings.md#aud-002-p2-harmonyos-缺少通知歌词方法)：被选中的原生音频模块缺少实际调用的方法。

## 实际覆盖与反证

- 贯通 UI/store → `SongloftAudio` facade → native module → engine/global event → store。
- Android/iOS 的 `setVolume` 直接消费 0–1，证明重复换算不是共享契约。
- Harmony AVSession 的远程 play/pause/next/previous 会回发 JS；module 中队列相关 no-op 未被误判为普通页面切歌失效。
- 当前 Android 两个既有修改按忽略行尾空白比较无语义差异，审计未触碰。

## 证据缺口

没有 HarmonyOS 真机音量和系统通知行为录制；两项结论由可达调用链、单位契约和实现差异确认。
