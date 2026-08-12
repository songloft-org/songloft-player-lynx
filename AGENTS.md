# AGENTS.md — Songloft Player (Lynx)

Songloft Player 的 Lynx 客户端，从 Flutter 版整体重写。

## 1. 项目结构

```
src/                    Lynx 客户端源码（所有业务代码）
  core/                 网络(api-client/auth-interceptor)、存储、配置
  features/             按功能模块划分
    auth/               登录、JWT 鉴权、token 管理
    home/               首页（问候、统计、歌单/电台区块）
    library/            曲库（歌曲列表、分类、搜索、排序）
    library-ops/        音乐库管理（扫描、元数据、重复检测）
    player/             播放器（全屏/mini、队列、歌词、睡眠、速度、持久化）
    playlist/           歌单（CRUD、排序、拖拽）
    settings/           设置（服务器、外观、语言、缓存、代理、EQ、数据）
    jsplugin/           JS 插件（管理器、商店、WebView、Tab 配置）
  i18n/                 国际化（en/zh，i18next）
  models/               zod 数据模型（Song/Playlist/Category 等）
  native/               原生模块 TS 层（audio-facade/storage/platform）
  shared/               共享组件（theme/layouts/ui）
  shims/                环境兼容 polyfill
android/                Android 宿主 + 原生模块（Kotlin）
ios/                    iOS 宿主 + 原生模块（Swift）
docs/                   项目文档
patches/                依赖补丁（必须提交）
songloft-player/        Flutter 版只读参考（.gitignore 排除，禁止修改）
```

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 构建/框架 | Rspeedy + ReactLynx + TypeScript |
| 状态 | Zustand（客户端态）· TanStack Query（服务端态） |
| 路由 | TanStack Router（memory history，code-based） |
| UI | lynx-ui 按组件包导入 + LUNA tokens + @lynx-js/motion |
| 数据模型 | zod（snake→camelCase transform，`.catch()` 容错 null） |
| i18n | i18next + react-i18next |
| 测试 | Vitest + @testing-library |
| 包管理 | pnpm |

## 3. 开发约定

### 后端

- 默认 `http://localhost:58091`，账号 `admin/admin`，接口 `/api/v1`
- standalone 模式显示地址配置 UI；embedded 模式隐藏

### 验收命令

```bash
pnpm run build          # rspeedy 构建（含类型检查）
pnpm exec tsc -b        # 独立类型检查（必须 -b，--noEmit 无效）
pnpm test               # vitest
```

### 真机调试（Android）

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
pnpm run android:install
adb reverse tcp:58091 tcp:58091
adb logcat -s lynx:V LynxUISVG:E AndroidRuntime:E
```

### Git

- 分支：`main`，远程：`origin`（`git@github.com:songloft-org/songloft-player-lynx.git`）
- Conventional Commits：`type(scope): 简体中文描述`
- 禁止 `Co-Authored-By`；issue 引用用 `songloft-org/songloft#NNN`
- `patches/` / `pnpm-lock.yaml` 必须提交；`node_modules/` / `dist/` / `songloft-player/` 禁止提交

### 工作流

- 按 `docs/plan.md` 顺序分批实现，一批一个聚焦范围
- 每批验收后更新 `docs/PROGRESS.md`
- 每批验收后暂停等确认，再进下一批

## 4. Lynx 关键约束

### 无 DOM

Lynx 无 `window`/`document`/`self`，双线程（主线程/BTS），元素用 `<view>/<text>/<image>`。

- 第三方库引入前检查是否访问 `self`/`window`/`document`/`navigator`——真机崩溃但本地测试可能不报错
- 正确做法：patch 掉该访问或 `typeof` 守卫，不要注入 `globalThis.self = globalThis`（BTS 无效）
- Lynx 宿主全局（如 `fetch`）是裸全局而非 `globalThis.X`，用 `typeof fetch !== 'undefined'` 读取
- 缺失全局（如 `AbortController`）用 `globalThis.X = …` polyfill，注入点在 `lynx.config.ts` banner
- `dist/main.lynx.bundle` 含未压缩调试段，grep 产物时排除注释/字符串误匹配

### lynx-ui

- **按组件包导入**（`@lynx-js/lynx-ui-button`），禁用桶入口 `@lynx-js/lynx-ui`
- compound 组件（Switch 等）不带样式，`ui-checked`/`ui-active` 须使用方样式表提供——统一用 `src/shared/ui/AppSwitch.tsx`
- 测试 mock 原生组件时必须保留「状态→className」映射

### 事件与布局

- `<refresh>` 会吞掉内部横向手势——手指在横向区时需置 `enable-refresh=false`
- 横向 `scroll-view` 内容行须 `width: max-content`，否则视觉不滚动
- 带连字符的 JSX 属性无类型检查（`scroll-x` 等拼错不报错），须配产物 grep 测试

### 系统跟随（深浅色/语言）

- Lynx 无 `prefers-color-scheme`/`matchMedia`/locale API
- 宿主两条通道：`LynxLoadMeta.setGlobalProps` 送初值（首帧正确），`sendGlobalEvent` 送变更
- `android:configChanges` 须含 `uiMode|locale|layoutDirection`，否则切换时 Activity 重建
- `'system'` 选择须存解析后的派生值到 state，否则同值写入被 React 跳过

### 其他

- `<svg src={url}>` 远程加载在本宿主不可用（无 `GenericResourceFetcher`），须取文本后用 `<svg content>`
- Vitest 文件正文禁止字面量 `@vitest-environment`
- `tsc -b` 写 `.tsbuildinfo`（已 gitignore），改动未检测时用 `--force`

## 5. 原生模块概览

### Android（Kotlin）

| 模块 | 文件 | 职责 |
|------|------|------|
| SongloftAudioModule | `audio/` | ExoPlayer + MediaSession + 前台服务 + EQ |
| SongloftStorageModule | `storage/` | SharedPreferences（prefs）+ Keystore（secure） |
| SongloftPlatformModule | `platform/` | 文件选择、URL 打开 |
| SystemAppearance | `system/` | 深浅色/语言注入 + 变更事件 |

### iOS（Swift）

| 模块 | 文件 | 职责 |
|------|------|------|
| SongloftAudioModule | `SongloftAudioModule.swift` + `SongloftAudioEngine.swift` | AVPlayer + MediaSession + EQ DSP |
| AudioEqualizer | `AudioEqualizer.swift` | MTAudioProcessingTap + NBandEQ |
| SongloftStorageModule | `SongloftStorageModule.swift` | UserDefaults + Keychain |
| SongloftPlatformModule | `SongloftPlatformModule.swift` | 文件选择、URL 打开 |
| SystemAppearance | `SystemAppearance.swift` | 深浅色/语言注入 |

## 6. 可用 Skills

- `lynx-api-docs` — Lynx 元素/CSS/布局文档，写页面前必查
- `lynx-ui` — lynx-ui 组件选型与 API
- `lynx-check-css-support` — 按后端/版本核实 CSS 属性支持
