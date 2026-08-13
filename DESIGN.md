# Songloft Player — Muse 设计语言

> 本文件记录应用当前采用的 **Muse** 设计规范。Muse 是围绕「单色强调 + 极致留白 + 线性图标」构建的套壳式设计语言，脱胎于对 LUNA 紫色体系的全面重构（2025-08）。

---

## 设计哲学

- **单通道强调**：整个应用只有一个强调通道——`--primary`（墨黑 `#111` / 纯白 `#fff`）。最抢眼的元素就是黑色实心按钮。没有第二个强调色，没有彩色渐变。
- **纸层感**：界面由 `--canvas`（纯白/纯深色）和 `--paper`（微微离纸面）两层构成，靠 `--line` hairline 分隔。
- **内容优先**：所有装饰都让位于内容。阴影只用于浮层（mini-player、全屏封面、弹出菜单）。图标全部线性（stroke-width 1.6），不喧宾夺主。
- **无障碍**：所有文字色对背景的对比度 ≥ 4.5:1（WCAG AA，`contrast.test.ts` 持续验证）。

---

## 色彩系统

核心定义在 `src/shared/theme/tokens.css`，通过 CSS 变量注入。所有页面必须通过 token 引用颜色，**禁止**在 `tokens.css` 之外出现硬编码 hex/rgba。

### 基础色表

| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--canvas` | `#ffffff` | `#0f0f11` | 最底层背景 |
| `--paper` | `#fafafa` | `#17171b` | 浮于 canvas 上的卡片/面板 |
| `--paper-clear` | `rgba(255,255,255,.9)` | `rgba(23,23,27,.9)` | 毛玻璃效果（no backdrop-filter） |
| `--neutral-faint` | `#f4f4f5` | `#1f1f25` | 极弱填充（输入框底、标签底） |
| `--line` | `#ececee` | `#26262c` | 分隔线，细如无物 |
| `--rule` | `#dcdce0` | `#38383f` | 更强的分隔线（如 Settings 列表项间） |
| `--content` | `#111111` | `#f5f5f7` | 主文字色 |
| `--content-2` | `#6b6b74` | `#a1a1a8` | 二级文字 |
| `--content-muted` | `#7b7b88` | `#8b8b98` | 最弱文字（AA 加深后的值） |
| `--primary` | `#111111` | `#ffffff` | 强调色/主色（墨黑/纯白） |
| `--primary-2` | `#111111` | `#ffffff` | 主色变体（与 primary 同值，Muse 单色） |
| `--primary-content` | `#ffffff` | `#0f0f11` | 主色上的文字（MDC 按钮文本） |
| `--accent` | `#111111` | `#ffffff` | 链接/强调文字（与 primary 同值） |
| `--danger` | `#d64545` | `#ff6b6b` | 危险色（仅文字，不做彩色背景块） |
| `--danger-2` | `#cf444f` | _deprecated_ | 仅用于历史兼容 |

### 暗色安全说明

`tokens.css` 中暗色 `content-muted` 和 `danger` 的值并非 Muse 1:1 映射（Muse 原值 `#6c6c74`/`#d64545` 在暗色上不满足 WCAG AA 4.5:1），已按 AA 阈值加深/提亮：

- `--content-muted` 暗色：`#8b8b98`（Muse 原 `#6c6c74`，AA 失败）
- `--danger` 暗色：`#ff6b6b`（Muse 原 `#d64545`，AA 失败）

详见 `contrast.test.ts` 中的注释。

---

## 圆角体系

| Token | 值 | 用途 |
|---|---|---|
| `--radius-sm` | 8px | 按钮、输入框、小卡片 |
| `--radius-md` | 12px | 普通卡片（playlist cover） |
| `--radius-lg` | 20px | 面板、大卡片、mini-player |
| `--radius-xl` | 28px | 全屏播放器封面、台账 |
| `--radius-pill` | 999px | 药丸标签、chip、搜索条 |

---

## 阴影

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-sm` | `0 1px 3px 0 rgba(0,0,0,.08)` | 滑块 thumb、小型浮层 |
| `--shadow-md` | `0 4px 12px 0 rgba(0,0,0,.12)` | mini-player、弹出菜单 |
| `--shadow-lg` | `0 8px 24px 0 rgba(0,0,0,.16)` | 全屏封面、大模态 |

**原则**：不装饰性使用阴影，只让浮层脱离纸面时使用。

---

## 图标

- **风格**：全线性，stroke-width 1.6（transport glyph 如播放/暂停为实心，§4.5 允许）。
- **颜色**：`<svg content>` 在 Lynx 中不在 CSS 级联中，图标色必须在 `icons.ts` 的 `PALETTES` 中硬编码 hex，通过 `ICON_COLORS` 获取。
- `ICON_COLORS` 是一个 Proxy，自动根据当前 `.theme-dark` 返回对应色板。
- 默认颜色为 `ICON_COLORS.content`，可选的显式色：`primary`、`primaryContent`、`content2`、`contentMuted`。

---

## 按钮类型

| 类型 | 样式 | 用途 |
|---|---|---|
| **Primary** | `--primary` 填充 + `--primary-content` 文字 + `--radius-pill` | 主操作（播放、添加、保存） |
| **Ghost** | 透明 + `--rule` 描边 + `--content` 文字 | 次要操作（取消、跳过） |
| **Danger** | 透明 + `--danger` 描边 + `--danger` 文字 | 破坏性操作（删除歌单） |
| **Text** | 纯文字 `--content-2` | 超轻操作（完成排序、隐藏） |

按下态：`opacity: 0.85`（无 `--primary-2` 变暗方案，Muse 单色）。

---

## 排版

| Token | 值 | 用途 |
|---|---|---|
| `--font-xs` | 11px | 辅助信息 |
| `--font-sm` | 13px | 副标题、标签 |
| `--font-md` | 15px | 正文、行 |
| `--font-lg` | 17px | 卡片标题、节标题 |
| `--font-xl` | 20px | 页面标题、统计数值 |

---

## 间距

| Token | 值 |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--mobile-nav-height` | 60px |

---

## 组件模式

### Card（纸卡）
- `--paper` 底色 + `--line` hairline 描边 + `--radius-lg` 圆角。
- 无阴影（非浮层）。
- 示例：播放列表详情统计面板、设置页分类卡片。

### Tab（标签页）
- 下划线风格（非药丸填充）。
- 选中态：`--primary` 下划线 + `--primary` 文字。
- 示例：Library 页（歌曲/艺术家/专辑/播放列表）。

### Chip（筛选标签）
- Ghost 风格：透明 + `--line` hairline 描边 + `--radius-pill`。
- 选中态：`--primary` 填充 + `--primary-content` 文字。
- 示例：Library 排序选项、歌单详情排序条。

### Switch（开关）
- `--line` 底色 track + `--primary` 选中 track + `--canvas` 圆形 thumb + `--shadow-sm`。
- 通过 `.ui-checked` class 切换状态。

### 列表行（SongRow）
- `--canvas` 底色 + `--line` 分隔线。
- 封面 48×48 + `--radius-sm`。
- 标题 `--content` + 副标题 `--content-muted` + 时长 `--content-muted`。

---

## Lynx 特有约束

当前应用运行在 ReactLynx 运行时，以下 CSS 功能**不可用**：

- ❌ CSS Grid → 用 flex + flex-wrap
- ❌ `backdrop-filter` → 用 `--paper-clear` 模拟
- ❌ `color-mix()` → 不会在 CSS 中使用
- ❌ `:hover` / `:focus-within` → Lynx 无悬停状态
- ❌ `text-transform` → 直接写目标大小写
- ❌ `viewport` 单位（`vw`/`vh`/`dvh`） → 用百分比
- ❌ `appearance: none` 滑块 → 用 Lynx 的 SliderRoot

✅ 可用：CSS 变量、flex（含 `gap`）、`border-radius`、`box-shadow`、`@keyframes`、`transform`、`position: fixed`、`env(safe-area-inset-*)`、`calc()`、`overflow: hidden`/`scroll`、`white-space`/`text-overflow`。

---

## 关于 design-example 目录

`design-example/` 是项目根下的一个独立参考子目录，包含一个 React DOM 实现的 Muse 音乐播放器，用于视觉对照。**不纳入主应用代码提交**（保持 `git` 未跟踪）。其 `.specs/DESIGN.md` 是 Muse 原始设计规格，本文件是主应用的实际实现记录。