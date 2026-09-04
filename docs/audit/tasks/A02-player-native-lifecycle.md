# 审计任务 A02 — 播放器状态与原生音频生命周期

## 快照与状态

`20260901-main-982291d` · `main@982291d` · Context `9cd06e…a37eae` · 待开始。

## 范围与问题

- 范围：player store/derive/persistence/queue/cache、`src/native/audio-*`，以及宿主音频、媒体会话、视频输出的关键生命周期。
- 问题：播放指令、事件回传、队列切歌、恢复、后台服务和视频 attach/detach 是否保持单一 owner 与一致状态。
- 排除：播放器页面布局由 A04；全量原生方法矩阵由 A05。

## 分区依据与入口

Context 明示 feature store → native facade → NativeModules，并把音量换算、callback Promise 化和后台/视频生命周期列为高风险边界。

入口：`src/features/player/store/player-store.ts`、`src/native/audio-facade.ts`、`android/.../SongloftAudioEngine.kt`、`ios/.../SongloftAudioEngine.swift`、`harmony/.../SongloftAudioEngine.ets`。

## 边界与证据策略

追踪 UI/store → facade → host engine → global event → store 的闭环，重点检查当前 Android 既有修改、监听器清理、并发命令、恢复与 service ownership；对照测试和平台替代实现。与 A05 复核方法/事件对称性，与 A06 复核失败测试是否代表真实回归。
