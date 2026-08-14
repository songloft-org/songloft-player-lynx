# 工作交接（2026-08-14）

> 本文件是**给接手 AI 的交接说明**。读完这一篇就能继续干活；细节在链接里。
> 一句话现状：**批41–44 全部完成，工作树干净、闸门全绿（932 vitest）**。审计计划已闭合。

---

## 1. 现在在哪、做到哪了

### 已提交（本地 `main`，**均未推送**）

| commit | 内容 |
|---|---|
| `aa43fd6` | 批44 #15：视频歌曲播放标识 |
| `3d35583` | 批44 #10：library-browse 视图配置（14 视图 + 设置页） |
| `0465ee4` | 批44 #13：插件源管理 + 撞名冲突警告 |
| `d1b59a1` | 批44 #12：启动自动探测服务器可达性 |
| `f329f1a` | 批44 #9/#11：投屏暂停本地 + 偏好上云 |
| `f79b6a8` | 批44 #8：从文件安装插件 |
| `594dc1c` | 批44 #6：删除歌曲入口 |
| `77f5dec` | 批44 #5：隐藏歌单显示切换 |
| `6e5e7b1` | 批44 #2/#7：播放全部 + 电台歌单创建 |
| `11e0caa` | 批44 #1/#3/#4/#14：播放历史上报/高亮/坏歌跳/正在播放入口 |
| `e95c97f` | 批43 P2-1：TokenStore/AuthInterceptor 收口单例 |
| `9f08038` | 批43 P2-3：原生模块补齐 + 契约闸门（+30 例） |
| `6ffe792` | 批43 P0-2/4/5：Web 音频/宿主页/后端地址 |
| `3e1c342` | 批42 P1-12：多选状态跨搜索/筛选残留 |
| `fbe5662` | 批42 第五波 P1-6：元数据「再次刷新」不轮询 |
| `5bd94e7` | 批42 第四波：DLNA 页进去即崩 / 能力探测器接线 |
| `e50dab4` | 批42 第三波：切服务器带旧 token / HTTP 无超时 |
| `9889b22` | 批42 第二波：播放位置不落盘 / 冷启动播放键无效 / LiveActivity 泄漏 |
| `a7114c1` | 批42 第一波：裸 i18n key / 收藏分页死循环 / 升级轮询失控 / 队列重排钉错 |
| `983a97d` | 批41：三条 P0 阻断（原生 bundle 不重建 / iOS 工程损坏 / web 产物黑屏） |
| `93de19e` | docs：审计教训固化 + 修复计划 + docs 目录整理 |

> ⚠️ 是否 `git push` 由用户决定，**不要自行推送**。

### 工作树状态

干净。最后一道闸门：`build` 双产物零告警 / `tsc -b` / **932 vitest（97 文件）** 全绿。

---

## 2. 三条必须内化的铁律（本项目反复踩的坑）

完整论述在 [`../../AGENTS.md`](../../AGENTS.md) §4「平台判断」「Web 平台」、§5「原生模块调用约定」、§6「测试与闸门原则」。这里是要点：

1. **DOM 探测不是平台判断。** web-core 把背景线程跑在真 Worker 里，那里没有 `document`/`localStorage`/`HTMLAudioElement`，所以 `typeof <DOM 全局>` 在 **Web 平台上回答「不是 Web」**。判平台一律用 `isWebPlatform()`（读 `SystemInfo.platform`，两 realm 都有）。已踩三次：下拉刷新文案 / 刷新掉登录 / Web 没声音。

2. **原生模块禁止强转成 Promise。** Lynx 原生方法是 callback 式，promisify 必须在 TS 适配层做（参考 `core/storage/native-storage.ts`）。`nm.X as SomePromiseInterface` 会让 `.then()` 落在 `undefined` 上——DLNA 页就是这么崩的。

3. **闸门要验语义，不验子串；mock 要保留真实前置条件；断言先反向验证会红。** pbxproj 闸门用 `.toContain` 被畸形行骗过；`mock-audio` 的 `play()` 不需先 `load()`，掩盖了冷启动播放键无效。本项目习惯：**每条修复都配一个「摘掉修复即变红」的回归测试**。

---

## 3. 剩余工作

**批41–44 全部完成。** 审计计划已闭合。后续功能开发从批45 开始。

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
| [`PROGRESS.md`](PROGRESS.md) | 分批进展（批41–44 小结在文件顶部） |
| [`bug.md`](bug.md) | 缺陷清单（已全部勾选） |
| [`../plans/archive/web-support.md`](../plans/archive/web-support.md) | Web 支持原始计划 + 7 处被否证的假设（三次 realm 事故的源头） |