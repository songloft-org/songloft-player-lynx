# 工作交接（2026-08-14）

> 本文件是**给接手 AI 的交接说明**。读完这一篇就能继续干活；细节在链接里。
> 一句话现状：**批41（三条 P0）+ 批42（一眼可见缺陷 13 条中的 12 条）已完成并提交，工作树干净、闸门全绿（900 vitest）**。剩 P1-12 一条小修、三条 P0、批43 结构性重构、批44 功能缺口。

---

## 1. 现在在哪、做到哪了

### 已提交（本地 `main`，**均未推送**，领先 `origin/main` 7 个 commit）

| commit | 内容 |
|---|---|
| `fbe5662` | 批42 第五波 P1-6：元数据「再次刷新」不轮询 |
| `5bd94e7` | 批42 第四波：DLNA 页进去即崩 / 能力探测器接线 |
| `e50dab4` | 批42 第三波：切服务器带旧 token / HTTP 无超时 |
| `9889b22` | 批42 第二波：播放位置不落盘 / 冷启动播放键无效 / LiveActivity 泄漏 |
| `a7114c1` | 批42 第一波：裸 i18n key / 收藏分页死循环 / 升级轮询失控 / 队列重排钉错 |
| `983a97d` | 批41：三条 P0 阻断（原生 bundle 不重建 / iOS 工程损坏 / web 产物黑屏） |
| `93de19e` | docs：审计教训固化 + 修复计划 + docs 目录整理 |

> ⚠️ 是否 `git push` 由用户决定，**不要自行推送**。此前两个 Web 修复 commit（`d4c4310`/`69593d0`）也曾在「未推送」状态停留多轮。

### 工作树状态

干净。最后一道闸门：`build` 双产物零告警 / `tsc -b` / **900 vitest（97 文件）** 全绿。

---

## 2. 三条必须内化的铁律（本项目反复踩的坑）

完整论述在 [`../../AGENTS.md`](../../AGENTS.md) §4「平台判断」「Web 平台」、§5「原生模块调用约定」、§6「测试与闸门原则」。这里是要点：

1. **DOM 探测不是平台判断。** web-core 把背景线程跑在真 Worker 里，那里没有 `document`/`localStorage`/`HTMLAudioElement`，所以 `typeof <DOM 全局>` 在 **Web 平台上回答「不是 Web」**。判平台一律用 `isWebPlatform()`（读 `SystemInfo.platform`，两 realm 都有）。已踩三次：下拉刷新文案 / 刷新掉登录 / Web 没声音。

2. **原生模块禁止强转成 Promise。** Lynx 原生方法是 callback 式，promisify 必须在 TS 适配层做（参考 `core/storage/native-storage.ts`）。`nm.X as SomePromiseInterface` 会让 `.then()` 落在 `undefined` 上——DLNA 页就是这么崩的。

3. **闸门要验语义，不验子串；mock 要保留真实前置条件；断言先反向验证会红。** pbxproj 闸门用 `.toContain` 被畸形行骗过；`mock-audio` 的 `play()` 不需先 `load()`，掩盖了冷启动播放键无效。本项目习惯：**每条修复都配一个「摘掉修复即变红」的回归测试**。

---

## 3. 剩余工作（按优先级）

权威清单在 [`../plans/2026-08-14-audit-fix-plan.md`](../plans/2026-08-14-audit-fix-plan.md)，`bug.md` 是缺陷视角的同一份。下面是接手后实际要做的顺序：

### 立刻可做（小修）
- **P1-12 多选状态跨搜索/筛选残留**（批42 唯一漏网）：`src/features/library/pages/LibraryPage.tsx:104` 的 `selected` 与 `filters`/`debouncedSearch` 无联动。加一个 `useEffect` 在筛选变化时清空（或求交集）。配回归测试。

### 批43 · 结构性（各自独立成批）
- **P0-2 Web 没有声音**（最大的活）：`web-audio.ts` 是 dead code，worker realm 探测恒 false 落到 mock。改判断救不回来（`new Audio()` 等是主线程 API），正解是经 web-core `nativeModulesMap` 在主线程注册宿主 `SongloftAudio`，复用已测的 native 分支。它同时解锁 Web 的 `openURL`/文件选择。
- **P0-4 embedded 无宿主页**：`copy-bundle-web.mjs` 的 `if (!isEmbedded)` 守着唯一 index.html 拷贝。动之前先跟后端仓库确认 `songloft-player-build/web-embedded` 仍是 `make build` 读取的路径。
- **P0-5 后端地址硬编码 localhost**：worker realm 的 `location.origin` 可用但无人读，用它自动判 embedded/同源。
- **P2-1 TokenStore/Interceptor 收口单例**：现在 6 份，收口后 `invalidateTokenCaches()` 的实例登记表可删。
- **P2-3 原生模块补齐**：悬浮歌词（Android 未注册）、Live Activity（iOS 不是 Lynx 模块）、契约闸门扩到批35+ 模块。**先扩闸门再修**，否则修完无人守。

### 批44 · 功能缺口
见计划文档「批44+」表（播放历史上报 / 播放全部 / 正在播放高亮 / 坏歌跳下一首 / 隐藏歌单找回 / 删歌入口 / library-browse / 偏好上云 等）。

---

## 4. 常用命令与验证

```bash
pnpm run build        # 必须同时列出 File (lynx) 与 File (web) 两个产物
pnpm exec tsc -b      # 类型检查（必须 -b，--noEmit 是空跑）
pnpm test             # vitest
pnpm run ios:build    # 改 ios/ 后验工程真能编译（不止 xcodebuild -list）
pnpm run build:web    # 改 web/ 后验产物，且要真的用浏览器打开
```

**「build 绿」不等于「能出包 / 能跑」**——批41 三条 P0 全是「闸门全绿而产物是坏的」。改 `ios/`/`web/` 务必跑对应那条。

---

## 5. 文档地图

| 文件 | 用途 |
|---|---|
| [`../../AGENTS.md`](../../AGENTS.md) | 开发规范 + 铁律（接手先读 §4–§6） |
| [`../plans/2026-08-14-audit-fix-plan.md`](../plans/2026-08-14-audit-fix-plan.md) | **主计划**：三类根因 + 批41–44 排期 + 明确不做清单 |
| [`PROGRESS.md`](PROGRESS.md) | 分批进展（批41/42 小结在文件顶部） |
| [`bug.md`](bug.md) | 缺陷清单（已修/待修勾选） |
| [`../plans/archive/web-support.md`](../plans/archive/web-support.md) | Web 支持原始计划 + 7 处被否证的假设（三次 realm 事故的源头） |
