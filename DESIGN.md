# Songloft Player — Muse 设计语言

> 本文件记录应用当前采用的 **Muse** 设计规范。Muse 是围绕「单色强调 + 极致留白 + 线性图标」构建的套壳式设计语言，脱胎于对 LUNA 紫色体系的全面重构（2026-08，commit `65aacf5`）。
>
> 落地位置**三层**：
> 1. `src/shared/theme/tokens.css` —— token 定义
> 2. `ThemeProvider` —— `theme-root theme-dark` / `theme-light` 两套色值
> 3. `src/shared/theme/theme-pack-mapping.ts` —— **主题包在运行时以内联 custom properties 覆盖 11 个 token**（`PACK_OVERRIDABLE_BASELINE`：`--primary` `--primary-2` `--accent` `--primary-content` `--primary-faint` `--canvas` `--paper` `--paper-clear` `--radius-lg` `--radius-md` `--radius-nav`）。映射规则：seedColor → primary 家族、surfaceColor → paper + paper-clear(0.9 alpha)、cardRadius → radius-lg、controlRadius → radius-md。有闸门解析 `tokens.css` 反查这张表。
>
> **所以 token 值不是编译期常量** —— 上表列的是基线值，装了主题包的用户看到的可能不同。不在那 11 个里的 token 则任何主题包都改不了。
>
> ⚠️ **源码注释里仍有 17 个文件写着「LUNA tokens only」**，那是重构前的旧称，指的就是本文档的 Muse token 体系——术语待统一，不影响行为。

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
| `--primary-faint` | `rgba(17,17,17,.08)` | `rgba(255,255,255,.12)` | 导航选中胶囊的淡色底（装饰性，不承载文字）；主题包由 seedColor 派生 light 10% / dark 14% |
| `--danger` | `#d64545` | `#ff6b6b` | 危险色（仅文字，不做彩色背景块） |
| `--danger-2` | `#cf444f` | `#cf444f` | 两主题同值。**无业务消费者**，仅 `contrast.test.ts` 守着按钮态的历史契约（白字在它上面 ≥4.5） |
| `--danger-content` | `#ffffff` | `#ffffff` | danger 填充上的文字 |
| `--backdrop` | `rgba(0,0,0,.35)` | `rgba(0,0,0,.55)` | 弹出层遮罩 |
| `--backdrop-heavy` | `rgba(0,0,0,.5)` | `rgba(0,0,0,.78)` | 模态遮罩 |
| `--player-scrim-from` | `rgba(255,255,255,.94)` | `rgba(15,15,17,.94)` | 全屏播放器封面遮罩（起） |
| `--player-scrim-to` | `rgba(255,255,255,.99)` | `rgba(15,15,17,.99)` | 同上（止） |

> ⚠️ **`--player-scrim-*` 的 alpha 是算出来的，不是调出来的** —— 0.93 是第一个让全部前景 token 在「最差封面」上都过 AA 的值，`player-backdrop-css.test.ts` 与 `contrast.test.ts` 双向锁死。**下调会红两个测试**，别当装饰参数改。

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
| `--radius-lg` | 20px | 面板、大卡片、对话框卡片 |
| `--radius-xl` | 28px | 全屏播放器封面、台账 |
| `--radius-pill` | 999px | 药丸标签、搜索条、**mini-player 与底部导航胶囊**、视图切换条 |
| `--radius-nav` | 12px | ⚠️ **已冻结**：批58 起导航形状恒为 `--radius-pill`，本 token 无 CSS 消费者，仅为主题包 `navigationRadius` 的 schema 兼容保留 |

---

## 阴影

**分主题两套值**（深色用纯黑高 alpha，浅色用 `#111` 低 alpha）：

| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(17,17,17,.04)` | `0 1px 2px rgba(0,0,0,.4)` | 滑块 thumb、小型浮层 |
| `--shadow-md` | `0 4px 20px rgba(17,17,17,.08)` | `0 4px 20px rgba(0,0,0,.5)` | mini-player、导航胶囊、弹出层 |
| `--shadow-lg` | `0 12px 40px rgba(17,17,17,.14)` | `0 12px 40px rgba(0,0,0,.6)` | 全屏封面、大模态 |

**原则**：不装饰性使用阴影，只让浮层脱离纸面时使用。

---

## 图标

- **风格**：全线性，stroke-width 1.6（transport glyph 如播放/暂停为实心，§4.5 允许）。
- **颜色**：`<svg content>` 在 Lynx 中**不在 CSS 级联内**，所以图标色必须硬编码 hex —— 色板 `PALETTES` 与取值代理 `ICON_COLORS` 都在 **`src/shared/ui/Icon.tsx`**（glyph 数据与 `buildSvg` 在 `icons.ts`）。
- `ICON_COLORS` 是一个 Proxy，自动根据当前 `.theme-dark` 返回对应色板。
- 六个键：`content`（默认，也可显式传）、`primary`、`primaryContent`、`content2`、`contentMuted`、`danger`（警示图标必须用它）。
- **导航选中态的 glyph 色走第二条通道** —— `activeAccentIconColor()`（同在 `Icon.tsx`）：运行时读主题包的 `seedColor`，无包时回落 `PALETTES[theme].primary`。**不能写 `ICON_COLORS.primaryContent`**，也不能指望内联 CSS 变量——那对 `<svg content>` 不可见。

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
| `--font-2xs` | 10px | 底部导航标签（对标 iOS tab 栏 10pt；也是 4 字中文名在固定宽胶囊内的拟合需要） |
| `--font-xs` | 12px | 辅助信息 |
| `--font-sm` | 14px | 副标题、标签、宽屏 rail 标签 |
| `--font-md` | 16px | 正文、行 |
| `--font-lg` | 20px | 卡片标题、节标题 |
| `--font-xl` | 28px | 页面标题、统计数值 |
| `--font-2xl` | 36px | 最大号数值 |

---

## 间距

| Token | 值 | 备注 |
|---|---|---|
| `--space-1` | 4px | |
| `--space-2` | 8px | |
| `--space-3` | 12px | |
| `--space-4` | 16px | |
| `--space-5` | 24px | |
| `--space-6` | 32px | |
| `--nav-inset` | 80px / 148px | **底部导航避让**，两档：无歌 80、有 mini-player 148。由 shell 根的 `shell--with-mini` 类切换（定义在 `ShellLayout.css`）。**新增可滚动页面必须消费它**，否则列表尾部永久被胶囊挡住 |
| `--mobile-nav-height` | 60px | ⚠️ **legacy**：批58 改悬浮胶囊后全库零消费者，避让改由 `--nav-inset` 承担 |

---

## 组件模式

### Card（纸卡）
- `--paper` 底色 + `--line` hairline 描边 + `--radius-lg` 圆角。
- 无阴影（非浮层）。
- 示例：播放列表详情统计面板、设置页分类卡片。

### Tab（标签页）
- 下划线风格（非药丸填充）。
- 选中态：`--primary` 下划线（2px）+ `--content` 文字 + `font-weight: 600`；未选中 `--content-muted`。
- 示例：新建歌单页（本地/远程）、添加歌曲页、库运维排除页。
- ⚠️ **Library 页已不是 Tab** —— 批51 重构后是 16 个 view 分三组，见下方 View Switcher。

### View Switcher（药丸横条，Library 页）
- 窄屏横向可滚 pill 条，组间 hairline 分隔；宽屏为左侧 rail。
- 选中态：`--primary` **描边** + `--primary` 文字 + `font-weight: 600`（**不填充**）。
- 横向内容行须 `width: max-content`，否则视觉上不滚动；用 `scroll-orientation='horizontal'`（`scroll-x` 已弃用）。

### 导航栏（底部 Tab / 宽屏侧栏，批58 起 iOS-26 风格）
- **胶囊 = 导航**：窄屏底栏是一个 fixed 悬浮长条胶囊（左右留边不贴屏、`--paper-clear` 玻璃感 + `--line` hairline + `--shadow-md`），页面内容从胶囊下方穿过；mini-player 是同语言的上层悬浮胶囊（两者间 8px 间隙）。
- **选中态**：固定尺寸横向胶囊（宽 = tab 槽、高 52px，所有 tab 同规格、不随文字长度变化）+ `--primary-faint` 淡色底，图标与文字同着 tint 色（主题包 seedColor）。未选中项无形状，直接坐在胶囊玻璃面上。
- **标签**：底栏用 `--font-2xs`（10px）单行；4 字中文名必须完整显示（水平 padding ≤8px），省略号仅兑底极端长名。宽屏 rail 用 `--font-sm` 横排。
- **宽屏侧栏**：iPadOS 式分组（主导航 →「插件」组头 → 插件 tabs → 设置），行内胶囊选中态与窄屏同语言。
- 阴影规则例外：导航胶囊与 mini-player 是常驻浮层，与弹出层同享阴影资格。


### Chip（筛选标签）
- Ghost 风格：透明 + `--rule` 描边 + `--radius-sm`。
- 选中态：`--primary` **描边** + `--primary` 文字，底色保持透明（**不填充**）。
- 示例：Library 分面筛选（`.library__chip`）。
- ⚠️ 原先列的两个示例都没了：Library 排序改成了弹出菜单（`LibraryToolbar`），歌单详情排序条随 JSX 一起删除。

### 弹出层（PopoverMenu / PopoverPanel，批53 起自研）
- `--paper` 面 + `--radius-md` + `--shadow-md`；两者共享同一套 surface 与定位逻辑。
- 定位由 `src/shared/ui/anchored-overlay.ts` 计算（`boundingClientRect` invoke 测量），**只用边缘定位**（每轴一个偏移 + max-width/height 上限）。
- 遮罩四个偏移必须写全（`top/left/right/bottom: 0`），不能只给宽高——fixed 元素偏移为 auto 时落在静态位置，会漏出「两个弹出层同时打开」。
- ⚠️ **不要装回 `@lynx-js/lynx-ui-popover`**：它的坐标是相对触发器的，而施加方式是 `position: absolute`（包含块为最近定位祖先），实测 6 处错位、最差的一个 `x = -122` 整块在屏外。理由详见 `AGENTS.md` §4「锚定弹出层」。

### 状态控件：三种角色，各一种控件（铁律）

同一件事只有一种画法。这三者曾被混用——设置页里布尔值有时是开关、有时是尾部对勾，
而「勾」又分带框与不带框，带框的还有六种互不相同的画法（18/20/22/24px、方形/圆形、
1px/2px/无描边，其中四处用文本字符 `✓` 而不是图标集）。

| 角色 | 控件 | 实现 |
|---|---|---|
| **开/关一件事** | Switch | `SwitchRow`（设置行）/ `AppSwitch`（裸控件） |
| **一组里选一个** | 尾部对勾（无框） | `SettingsRow` 的 `trailingIcon='check'` + `selected` |
| **列表里勾选若干** | Checkbox（方形带框） | `AppCheckbox` |

判定：**能同时选中多个 → Checkbox；互斥 → 对勾；只有开和关 → Switch。**
圆形永远不用于多选（圆形读作单选）。

### Switch（开关）
- `--line` 底色 track + `--primary` 选中 track + `--canvas` 圆形 thumb + `--shadow-sm`。
- 通过 `.ui-checked` class 切换状态。

### Checkbox（复选框）
- 20×20 + `--radius-sm` + 1px `--content-muted` 描边，未选中时透明底。
- 选中：`--primary` 填充 + `--primary-content` 对勾（图标集的 `check`，14px）。
- **纯展示**：不带 `bindtap`，点击由外层行/命中区负责，否则触摸目标会缩到 20px。

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
- ❌ `appearance: none` 滑块 → 用 Lynx 的 SliderRoot

### ⚠️ 平台分叉：viewport 单位与百分比都不能单用

这一条**曾被写成「❌ viewport 单位 → 用百分比」，两半都不对**：

- **原生 fixed 弹层下，百分比 max-height 不可靠** —— 按 containing block 解析，原生引擎的结果不可预期。remote 歌的长表单曾因此把卡片顶出屏幕、标题行被裁（批60b）。
- **Web 侧 vh/vw 正常工作**，所以对话框尺寸是**刻意的双轨**：CSS 里给 `calc(100vw - 64px)` / `max-height: 85vh`（Web 半边），原生走 `src/shared/ui/dialog-viewport.ts` 从 `SystemInfo` 量出的**内联 px**。**两边必须同步**，`confirm-dialog-overlay.test.ts` 断言这件事。
- **全屏遮罩例外**：用四边 offset 而不是 `100vw/100vh`（见 `PopoverMenu.css` 的注释）。

✅ 可用：CSS 变量、flex（含 `gap`）、`border-radius`、`box-shadow`、`@keyframes`、`transform`、`position: fixed`、`env(safe-area-inset-*)`、`calc()`、`overflow: hidden`/`scroll`、`white-space`/`text-overflow`。