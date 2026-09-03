# Songloft Player Lynx — Apple HIG 风格 UI 重构总计划

> 状态：待审核
> 日期：2026-09-02
> 依据：[DESIGN.md](../../../DESIGN.md)（Apple HIG 摘要）、[AGENTS.md](../../../AGENTS.md)（项目约束）
> 范围：纯前端（Lynx CSS/TSX），不改原生模块层

---

## 背景与目标

Songloft Player Lynx 从 Flutter 版整体重写，当前已实现完整的音乐播放功能，具备 Muse 设计语言（CSS Custom Properties 驱动）和 Liquid Glass 伪玻璃表面。但整体视觉与交互尚未系统性地对齐 Apple Human Interface Guidelines。

**目标**：按照 DESIGN.md 中整理的 Apple HIG，对全部 UI 进行系统性重构，使应用在视觉层级、组件规范、动效、无障碍等维度达到「感觉像原生」的水准。

**核心原则**（DESIGN.md §1）：

- **目的**：每个元素都要挣得自己的位置
- **熟悉感**：借用人们已知的 Apple 平台经验
- **简洁**：重要的东西触手可及，其余退居其后
- **匠心**：流畅动画、精确间距、考究的圆角与阴影

**技术约束**（AGENTS.md §4）：

- Lynx 无 DOM、无 `backdrop-filter`、无 CSS `@media`
- 元素用 `<view>/<text>/<image>`，SVG 不在 CSS 级联内
- 响应式靠 `useBreakpoint`（JS 测量），不靠媒体查询
- 玻璃效果靠半透底色 + `inset box-shadow` 伪造

---

## 现状盘点

### 设计令牌（tokens.css）

| 类别 | 当前值 | HIG 对标 |
|---|---|---|
| 字号 | 7 档：10/12/14/16/20/28/36 px | iOS 文本样式体系（见 §4.7） |
| 间距 | 6 档：4/8/12/16/24/32 px | 新增缺失档位（见 1.2） |
| 圆角 | 5 档：8/12/20/28/999 px | iOS 连续圆角（squircle 近似） |
| 阴影 | 3 档 + 玻璃 inset | 层级化阴影 |
| 颜色 | 双主题（light/dark）+ 主题包覆盖 | 语义色 + 动态适配 |
| 玻璃 | 7 个 token（fill/fill-strong/border/highlight/glow/glow-faint/sheen） | 标准材质四档 |

### 组件清单（15 个共享组件 + 70 个功能组件）

共享：Icon / AppSwitch / AppCheckbox / ConfirmDialog / PromptDialog / PopoverSurface / PopoverMenu / PopoverPanel / MenuItem / GlobalMenu / MediaListItem / SongRowOverlays / ToastHost / VerticalSlider / SplashScreen

### 页面清单（34 个页面，8 个功能模块）

auth(1) / home(1) / library(6) / library-ops(2) / playlist(3) / player(4) / settings(12) / jsplugin(5)

### 动效现状

仅 3 个 `@keyframes`（toast 滑入、播放器入场、均衡器跳动）+ 1 个 `transition`（对话框退出淡出）。无系统性动效体系。

### 导航现状

窄屏：底部悬浮玻璃胶囊（iOS-26 风格）；宽屏：256px 侧栏（iPadOS 分组）。断点 600/900/1920。

---

## 分阶段计划（11 个阶段）

每个阶段独立可验收，按依赖顺序排列。标注 `★` 的阶段包含闸门测试。

---

### 阶段 1：设计令牌对齐（Design Tokens）★

**目标**：将 tokens.css 的排版、间距、圆角、阴影令牌与 HIG iOS 规格对齐，为后续所有阶段打基础。

**改动范围**：`src/shared/theme/tokens.css`

#### 1.1 排版令牌

对齐 HIG §4.7 iOS 内建文本样式（以 iOS 默认 17pt 为基准，Lynx 中 1pt ≈ 1px）：

| 新令牌 | 值 | 对应 HIG 样式 | 用途 |
|---|---|---|---|
| `--font-caption2` | 11px | Caption 2 | 极小标注（版权、版本号） |
| `--font-caption1` | 12px | Caption 1 | 时间戳、徽章、辅助标注 |
| `--font-footnote` | 13px | Footnote | 副标题、次要信息 |
| `--font-subhead` | 15px | Subheadline | 列表副文本 |
| `--font-callout` | 16px | Callout | 次级正文 |
| `--font-body` | 17px | Body | 正文、列表主文本 |
| `--font-headline` | 17px bold | Headline | 强调标题 |
| `--font-title3` | 20px | Title 3 | 区块标题 |
| `--font-title2` | 22px | Title 2 | 页面副标题 |
| `--font-title1` | 28px | Title 1 | 页面大标题 |
| `--font-largeTitle` | 34px | Large Title | 首页/播放器主标题 |

保留旧令牌名，**值不变**，不做别名映射（旧值 10/14/28/36px 在新体系中无精确对应，强行别名会导致字号漂移）。新旧令牌并存，旧消费点不强制迁移：

| 旧令牌（保留原值） | 新令牌（HIG 对齐） | 关系 |
|---|---|---|
| `--font-2xs: 10px` | — | 保留（底栏标签专用，见阶段 3） |
| `--font-xs: 12px` | `--font-caption1: 12px` | 值相同，新代码用新名 |
| `--font-sm: 14px` | — | 保留（14px 在 iOS 体系无对应，介于 Footnote 13 和 Subheadline 15 之间） |
| `--font-md: 16px` | `--font-callout: 16px` | 值相同 |
| `--font-lg: 20px` | `--font-title3: 20px` | 值相同 |
| `--font-xl: 28px` | `--font-title1: 28px` | 值相同 |
| `--font-2xl: 36px` | — | 保留（36px 无对应，Large Title 为 34px） |

新增字重令牌：`--weight-regular: 400`、`--weight-medium: 500`、`--weight-semibold: 600`、`--weight-bold: 700`。

#### 1.2 间距令牌

**铁律：现有 6 档的值和名字一律不动**（`--space-1`~`--space-6` = 4/8/12/16/24/32px 被大量 CSS 消费，改值即破坏）。只**新增**缺失档位：

| 令牌 | 值 | 状态 |
|---|---|---|
| `--space-1` ~ `--space-6` | 4/8/12/16/24/32px | **保持不变** |
| `--space-half` | 2px | 新增（极微间距） |
| `--space-7` | 20px | 新增（介于 16 和 24 之间） |
| `--space-8` | 28px | 新增（介于 24 和 32 之间） |
| `--space-9` | 40px | 新增（大区块间距） |
| `--space-10` | 48px | 新增（页面级间距） |

> 注：Lynx CSS 不支持小数 custom property 名，2px 档命名为 `--space-half`。新增档位供新代码使用，旧代码不强制迁移。

#### 1.3 圆角令牌

保持现有 5 档不变（已与 iOS 连续圆角视觉近似），新增：

- `--radius-xs: 6px`（小按钮、小徽章）
- `--radius-continuous-*` 不做——Lynx 无 `border-radius` 连续圆角支持，`--radius-*` 即可

#### 1.4 阴影令牌

保持 3 档外阴影 + 玻璃 inset 不变。新增：

- `--shadow-none: none`（语义化零阴影）
- `--shadow-focus: 0 0 0 3px var(--primary-faint)`（焦点环，无障碍用）

#### 1.5 控件尺寸令牌

对齐 HIG §12.2（iOS 默认 44×44，最小 28×28）：

- `--tap-target: 44px`（最小可点击区域）
- `--tap-target-min: 28px`（紧凑场景最小）
- `--control-height: 44px`（标准控件高度）
- `--control-height-sm: 36px`（紧凑控件）

#### 闸门测试

- `tokens-hig.test.ts`：验证新令牌存在、值正确、旧别名映射正确

---

### 阶段 2：标准材质系统（Standard Materials）★

**目标**：实现四种标准材质变体（ultra-thin / thin / regular / thick），用户可在外观设置中选择，默认 regular。

> 详细实施方案已独立编写，见 [standard-materials.md](./standard-materials.md)。此处为摘要。

**核心设计**：

- 材质只改 4 个玻璃质感 token 的**值**（`--glass-fill`、`--glass-fill-strong`、`--glass-border`、`--glass-highlight`），token **名**不变
- 13 个消费 glass token 的 CSS 文件零改动
- `PACK_OVERRIDABLE_BASELINE` 保持 regular 值（闸门锚点）

**新建文件**：

| 文件 | 职责 |
|---|---|
| `src/shared/theme/material-model.ts` | 偏好模块（与 theme-model.ts 同构） |
| `src/shared/theme/material-tokens.ts` | 4 变体 × 2 主题 × 4 token 纯数据表 |
| 对应测试 ×2 | 模型 + 令牌对账 |

**修改文件**：

| 文件 | 改动 |
|---|---|
| `theme-pack-mapping.ts` | `themePackToStyleVars()` 末尾注入材质 token |
| `ThemeProvider.tsx` | 订阅材质变化 → re-render |
| `AppearancePage.tsx` | 新增「材质」选择 section |
| `resources.ts` | +9 个 i18n 键（en/zh） |
| `index.tsx` | 启动时 `applySavedMaterial()` |
| `contrast.test.ts` | 低透明度材质对比度验证 |

**四种材质 Token 值**（light / dark alpha）：

| 材质 | `--glass-fill` | `--glass-fill-strong` | `--glass-border` | `--glass-highlight` |
|---|---|---|---|---|
| ultra-thin | 0.55 / 0.50 | 0.45 / 0.40 | 0.55 / 0.20 | 0.28 / 0.10 |
| thin | 0.70 / 0.65 | 0.58 / 0.55 | 0.50 / 0.18 | 0.25 / 0.09 |
| regular | 0.85 / 0.85 | 0.72 / 0.72 | 0.45 / 0.16 | 0.22 / 0.08 |
| thick | 0.92 / 0.92 | 0.85 / 0.82 | 0.40 / 0.14 | 0.18 / 0.06 |

---

### 阶段 3：导航系统（Navigation）

**目标**：对齐 HIG §11.3 标签栏/侧边栏规范，提升导航的视觉层级和交互反馈。

**改动范围**：`src/shared/layouts/ShellLayout.*`、`src/shared/nav/`

#### 3.1 底部标签栏（窄屏）

- **标签文字**：保持 `--font-2xs`（10px）。AGENTS.md 铁律：「4 字中文名必须在 360dp 最窄主流屏完整显示」，改为 11px 有溢出风险，不改
- **图标尺寸**：24px（SF Symbols 标准），选中态使用填充样式
- **选中态**：保持 `--glass-glow-faint` 背景 + tint 图标（已符合 Liquid Glass 规范）
- **徽章**：红色椭圆 + 白色数字（`--danger` 背景），仅用于关键信息（HIG：不要滥用）
- **安全区**：`env(safe-area-inset-bottom)` 已处理，保持
- **More 标签**：超过 5 个标签时折叠进 More sheet（已实现），sheet 面板使用 `--glass-fill-strong`
- **MoreTabsSheet.css**：纳入本阶段改动范围（消费 `--glass-fill-strong`，需随材质系统联动）

#### 3.2 侧栏（宽屏）

- **分组样式**：保持 iPadOS 分组（主导航 → 插件组 → 设置），组头使用 `--font-footnote` + `--content-muted`
- **行高**：统一 44px（`--tap-target`）
- **选中态**：与窄屏同款 `--glass-glow-faint` tint 语言
- **侧栏宽度**：256px 保持（iPadOS 标准 320pt 在 Lynx 中偏宽）

#### 3.3 返回导航

- 返回箭头使用 `chevron-left` 图标 + 页面标题（HIG 导航栏模式）
- `SubPageShell` 标题栏高度 44px，标题 `--font-headline`

#### 3.4 滚动边缘效果

- 内容滚动到导航区域下方时，通过渐变提供视觉过渡（模拟 scroll edge effect）
- 实现方式：底部固定渐变遮罩层（`linear-gradient`）
- **Lynx 无 `pointer-events` CSS 属性**：遮罩层不能用 CSS 穿透。改用以下方案之一：
  - 方案 A（推荐）：渐变遮罩放在滚动容器**内部**尾部（作为最后一个子元素），随内容滚动，不拦截触摸
  - 方案 B：遮罩层用 `event-through={true}` 属性（Lynx 事件穿透机制）
- 实施前用 `lynx-check-css-support` skill 确认 `linear-gradient` 在目标 Lynx 版本可用

---

### 阶段 4：共享 UI 组件（Shared Components）★

**目标**：对齐 HIG §11 组件规范，建立统一的组件视觉语言。

#### 4.1 按钮体系

当前按钮样式散落在各 CSS 中，提取为共享类。**新建 `src/shared/ui/buttons.css`**，定义统一按钮类（不新建组件，保持 CSS 类方案）：

| 样式 | CSS 类 | HIG 对标 | 规格 |
|---|---|---|---|
| Prominent | `.btn--prominent` | Prominent button | `--primary` 背景，`--primary-content` 文字，`--radius-md`，高度 44px |
| Filled | `.btn--filled` | Filled button | `--neutral-faint` 背景，`--content` 文字 |
| Tinted | `.btn--tinted` | Tinted button | `--primary-faint` 背景，`--primary` 文字 |
| Ghost | `.btn--ghost` | Borderless button | 透明背景，`--primary` 文字 |
| Destructive | `.btn--destructive` | Destructive role | `--danger` 文字/边框，或 `--danger` 背景 |
| Disabled | `.btn--disabled` | — | `opacity: 0.4`，不响应点击 |

按压状态：所有按钮 `:active`（Lynx 用 `ui-active` 类）加 `opacity: 0.7` + `transform: scale(0.97)`。

**需要迁移到新按钮类的消费点**（逐个替换，不能遗漏）：

| 文件 | 当前实现 | 迁移目标 |
|---|---|---|
| `ConfirmDialog.css` | `.confirm-dialog__btn--submit/--confirm/--cancel` | `.btn--prominent` / `.btn--destructive` / `.btn--ghost` |
| `PromptDialog.css` | 复用 ConfirmDialog 按钮 | 同上 |
| `FullPlayerPage.css` | `.full-player__empty-btn` | `.btn--prominent` |
| `LoginPage` 相关 CSS | 登录按钮 | `.btn--prominent` |
| `PlaylistToolbar` 相关 CSS | 播放全部/删除按钮 | `.btn--prominent` / `.btn--destructive` |
| `PlaylistDetailPage` 操作栏 | 播放/随机/排序 | 对应按钮类 |

> 迁移原则：旧类名保留为空壳（`@import` 或组合新类），避免一次性改 TSX。TSX 侧可分批切换到新类名。

#### 4.2 对话框（ConfirmDialog / PromptDialog）

- 卡片宽度：保持 360px / 440px
- 按钮布局：Cancel 在左（前缘），确认在右（尾缘）（HIG §11.4 警告规范）
- 破坏性按钮不用 prominent 角色（HIG：绝不把 primary 分配给 destructive）
- 标题 `--font-headline`，正文 `--font-subhead` + `--content-2`
- 入场动画：`scale(0.95) → 1` + `opacity 0 → 1`，200ms ease-out
- 出场动画：保持现有 `opacity 0.16s ease`（承载 `transitionend` 卸载）
- 按钮高度：**44px（`--tap-target`）**。本条 2026-09-03 由用户决定推翻——原文写「保持 36px 不变（不改为 44px），36px 已满足触控目标（按钮宽度足够）」，与 §11.2「所有可交互元素 ≥ 44×44px」且检查点明列「弹窗按钮」自相矛盾；HIG 的 44pt 是**两个方向**的最小值，宽度够不能替高度背书。**同步项已做**：AGENTS.md 的警告仍然成立且必须遵守——`dialogBodyMaxHeight` 由 `0.85H − CARD_CHROME_PX` 派生，`CARD_CHROME_PX` **包含按钮高度**，改了不同步就触发「卡片钳制与 body 钳制不自洽」（卡片照样钳在 0.85H，`chrome + body` 超出，差值从**底部**溢出，把操作行裁掉）。`dialog-viewport.ts` 里的常量已从写死的 `160` 拆成 `CARD_CHROME_ABOVE_ACTIONS_PX（124，实测部分）+ ACTION_ROW_PX（44，即按钮高度）= 168`，并在 `confirm-dialog-overlay.test.ts` 新增闸门把 `ACTION_ROW_PX` 拴到 `.confirm-dialog__btn` 的 CSS 高度上（token 经 tokens.css 解析，不写死 44），所以下一次改这个高度会**直接挂测试**而不是静默漂移——此前全套 2177 测试对这个耦合完全无感

#### 4.3 弹出菜单（PopoverMenu / GlobalMenu）

- 菜单项高度：44px（HIG 最小触控目标）
- 菜单项间距：`--space-1` 垂直内边距
- 分组分隔线：`--line` 1px + `--space-2` 上下间距
- 破坏性项：`--danger` 文字，放在菜单末尾
- 圆角：`--radius-md`（已符合）
- 入场动画：`opacity 0 → 1` + `translateY(-4px) → 0`，150ms

#### 4.4 底部面板（Bottom Sheets）

- 顶部 grabber：36×5px 圆角条，`--content-muted` 30% alpha，居中，上方 `--space-2`
- 面板圆角：`--radius-xl`（已符合）
- 面板标题：`--font-headline`，居中
- 入场动画：`translateY(100%) → 0`，300ms cubic-bezier(0.32, 0.72, 0, 1)（iOS sheet 弹簧曲线近似）

#### 4.5 开关（AppSwitch）

- 尺寸：51×31px（iOS UISwitch 标准），当前 44×26 → 调整
- 轨道颜色：开 `--primary`，关 `--rule`。**不用绿色**——HIG 允许强调色替代默认绿，且本项目 `--primary` 在浅色下是墨黑、深色下是白色，与整体单色设计语言一致
- 拇指：`--canvas` 色（跟随主题），`--shadow-sm`
- 动画：`transition: background-color 0.2s, transform 0.2s`
- 影响范围：所有 `SwitchRow`（设置页）自动跟随，无需逐个改

#### 4.6 Toast

- 保持 `--primary` 实心（不玻璃化，已正确）
- 位置：保持现有 `bottom: calc(env(safe-area-inset-bottom) + 150px)`。**不使用 `var(--nav-inset)`**——ToastHost 挂在 root route 的 ThemeProvider 内、ShellLayout **外部**，`--nav-inset` 在该作用域未定义，`calc()` 会解析失败。150px 已覆盖导航栏（64px）+ mini-player（48px）+ 间距，保持不变
- 入场：保持现有 `toast-enter`（300ms slide-up）
- 自动消失：3s（认知无障碍：不要过短）

#### 4.7 进度指示器

- 确定型：`--primary` 填充 + `--neutral-faint` 轨道，`--radius-pill`，高度 4px
- 不确定型：保持现有 `libops-indeterminate` shuttle 动画
- 对齐 HIG §11.6：尽可能用确定型

#### 闸门测试

- `shared-components.test.ts`：验证按钮类存在、开关尺寸、菜单项高度 ≥ 44px

---

### 阶段 5：播放器（Player）

**目标**：全屏播放器是音乐应用的灵魂，对齐 HIG「Playing audio」模式 + Liquid Glass 规范。

**改动范围**：`src/features/player/`

#### 5.1 全屏播放器（FullPlayerPage）

- **封面**：`--radius-xl`（28px），`--shadow-lg`，宽度 = 屏幕宽 - 48px
- **歌曲标题**：`--font-title2`（22px）+ `--weight-semibold`
- **艺术家**：`--font-body`（17px）+ `--content-2`
- **进度条**：轨道 4px `--neutral-faint`，已播放 `--content`（非 primary——播放器上下文内容优先），拇指 12px 圆形（按住时 16px）
- **播放控制**：
  - 播放/暂停：48px 图标按钮（比周围大，视觉焦点）
  - 上一首/下一首：36px
  - 随机/循环：28px，`--content-muted`，激活时 `--primary`
  - 间距：控制按钮间 `--space-6`（24px）
- **背景**：保持现有 `PlayerBackdrop`（blur(40px) + scale(1.2) + scrim），效果已接近 iOS 播放器。**不改模糊实现**（已经 spike 验证，AGENTS.md 记录在案）
- **入场动画**：保持现有 `fullPlayerEnter`（240ms slide-up）
- **歌词视图**：当前歌词 `--font-title3` + `--weight-semibold` + `--content`，其余行 `--font-body` + `--content-muted`，行间距 `--space-4`

#### 5.2 Mini Player

- 保持玻璃胶囊（已符合 Liquid Glass 规范）
- 封面 40×40 `--radius-sm`
- 标题 `--font-subhead`，艺术家 `--font-caption1` + `--content-muted`
- 播放按钮 32px
- 进度条：底部 2px 细线，`--primary`

#### 5.3 播放列表面板（PlaylistDrawer / PlayHistoryPanel）

- 面板使用 `--glass-fill-strong`（已符合）
- 行高 56px（封面 40×40 + 文字）
- 当前播放行：标题 `--accent` + 均衡器动画图标
- 拖拽排序手柄：`--content-muted`

#### 5.4 均衡器（EqualizerPage）

- 频段滑块使用 `VerticalSlider`
- 预设选择：分段控制样式（`--radius-md` 胶囊内等宽选项）

#### 5.5 睡眠定时器（SleepTimerSheet）

- 选项列表：标准行高 44px
- 自定义输入：数字键盘样式

---

### 阶段 6：曲库（Library）

**目标**：曲库是内容浏览的核心，对齐 HIG 列表/表格 + 搜索规范。

**改动范围**：`src/features/library/` 下需要改动的文件（不是全部）：

- **改**：`SongRow.css`、`FacetCard.css`、`TagCard.css`、`FolderCard.css`、`LibraryToolbar.css`、`LibraryViewSwitcher.css`、`LibraryViewRail.css`、`LibraryStateMessage.css`、`LibraryShell.css`
- **不改**：`VirtualList.tsx`（纯逻辑）、`FlatSongsView.tsx`（纯组合）、`LibraryViewEditor.tsx`（功能优先）、三个弹窗（`SongInfoDialog` / `SongEditDialog` / `ManageTagsSheet`——复用阶段 4 对话框/面板规范，不单独改）
- **不改**：`song-row-overlays.ts`、`song-menu-items.ts`（纯逻辑，菜单项构建有闸门测试锁定）

#### 6.1 歌曲行（SongRow）

- 行高：64px（封面 48×48 + 双行文字 + 操作区）
- 封面：`--radius-sm`（8px），占位符 `--neutral-faint` + `music` 图标
- 标题：`--font-body`（17px）
- 副标题：`--font-subhead`（15px）+ `--content-muted`
- 时长：`--font-caption1` + `--content-muted`
- 分隔线：`--line`，左侧缩进到封面右缘（`--space-4` + 48px + `--space-3`）
- 当前播放：标题 `--accent`
- 按压反馈：行背景 `--neutral-faint`（`ui-active`）

#### 6.2 分类卡片（FacetCard / TagCard / FolderCard）

- 封面圆角：`--radius-md`（12px）
- 名称：`--font-subhead` + 单行省略
- 计数：`--font-caption1` + `--content-muted`
- 网格间距：`--space-3`（12px）
- 卡片按压：`opacity: 0.8` + `scale(0.98)`

#### 6.3 工具栏（LibraryToolbar）

- 搜索入口：`--neutral-faint` 背景 + `--radius-md`，占位文字 `--content-muted`
- 排序/视图切换：图标按钮 36px
- 对齐 HIG §11.3 搜索栏：输入时即时搜索（已实现）

#### 6.4 视图切换（LibraryViewSwitcher）

- 分段控制样式：`--neutral-faint` 轨道，选中段 `--paper` + `--shadow-sm`
- 选项文字：`--font-footnote` + `--weight-medium`

#### 6.5 宽屏视图导轨（LibraryViewRail）

- 行高 44px，图标 + 标签
- 选中态：`--glass-glow-faint` 背景

#### 6.6 空状态（LibraryStateMessage）

- 图标 48px + `--content-muted`
- 标题 `--font-body` + `--content-2`
- 描述 `--font-subhead` + `--content-muted`

---

### 阶段 7：歌单（Playlist）

**目标**：歌单管理流程对齐 HIG 表单 + 列表规范。

**改动范围**：`src/features/playlist/`

#### 7.1 歌单卡片（PlaylistCard）

- 封面：104×104 `--radius-md`
- 名称：`--font-subhead`，两行省略
- 计数：`--font-caption1` + `--content-muted`
- 播放中：封面边框 2px `--primary` + 均衡器动画（已实现）
- 播放覆盖按钮：28px 圆形 `--primary`（已实现）

#### 7.2 歌单详情（PlaylistDetailPage）

- 头部：封面 160×160 `--radius-lg` + 名称 `--font-title2` + 描述 `--font-subhead` + `--content-2`
- 操作栏：播放全部（prominent）、随机、排序——使用阶段 4 按钮体系
- 歌曲列表：复用阶段 6 SongRow 规范

#### 7.3 创建/编辑歌单（CreatePlaylistPage / EditPlaylistPage）

- 表单字段：`--neutral-faint` 背景，`--radius-md`，高度 44px
- 标签：`--font-footnote` + `--content-muted`
- 验证错误：`--danger` 文字 `--font-caption1`

#### 7.4 添加到歌单面板（AddToPlaylistSheet）

- 歌单行：封面 40×40 + 名称 + 歌曲数
- 新建歌单行：`--primary` 图标 + 文字

---

### 阶段 8：设置（Settings）

**目标**：对齐 HIG「Settings」模式 + iOS 分组列表规范。

**改动范围**：`src/features/settings/`

#### 8.1 设置主页（SettingsPage）

- 分组卡片：`--paper` 背景，`--radius-lg`，组间距 `--space-5`
- 行高：44px（`--tap-target`）
- 行图标：24px，圆形彩色背景 28×28（iOS Settings 风格）
- 行标签：`--font-body`
- 行值：`--font-body` + `--content-muted`，右对齐
- 分组标题：`--font-footnote` + `--content-muted`，大写字母间距
- 组内分隔线：`--line`，左缩进到图标右缘

#### 8.2 子页面（SubPageShell）

- 标题栏：44px 高，返回箭头 + 标题 `--font-headline`
- 内容区：与主页同型分组卡片

#### 8.3 外观页（AppearancePage）

- 主题选择：radio 行 + 勾选图标（已实现）
- 材质选择：同型（阶段 2 新增）
- 主题包：卡片预览 + 激活/删除
- 语言选择：同型

#### 8.4 其他设置页

- PlaybackPage / DataPage / CacheManagePage / ProxySettingsPage：标准分组列表
- AboutPage：信息列表 + 版本号
- ServerListPage / ServerEditPage：服务器卡片 + 表单

---

### 阶段 9：首页与其他页面（Home & Misc）

**目标**：首页问候 + 统计 + 快捷区块，登录页，插件页。

#### 9.1 首页（HomePage）

- 问候语：`--font-largeTitle`（34px）+ `--weight-bold`
- 统计条：`--font-caption1` 数值 + `--content-muted` 标签
- 区块标题：`--font-title3`（20px）+ `--weight-semibold`
- 区块内容：横向滚动 `scroll-view`，卡片间距 `--space-3`
- 底部 inset：`var(--nav-inset)`（已实现）

#### 9.2 登录页（LoginPage）

- Logo：80×80 `--radius-lg`
- 输入框：`--neutral-faint` 背景，`--radius-md`，高度 44px
- 登录按钮：`.btn--prominent`，全宽减边距
- 错误提示：`--danger` + `--font-caption1`

#### 9.3 插件页（jsplugin）

- 插件网格：卡片 80×80 图标 + 名称
- 插件 WebView：保持 `<frame>` 嵌入

#### 9.4 音乐库管理（library-ops）

- 扫描/元数据/去重：标准分组卡片
- 进度条：阶段 4 确定型/不确定型规范
- 目录树：缩进列表，`--font-subhead`

---

### 阶段 10：动效体系（Motion）★

**目标**：建立统一的动效令牌和过渡模式，对齐 HIG「Motion」章节。

**改动范围**：`src/shared/theme/tokens.css` + 各组件 CSS

#### 10.1 动效令牌

```css
/* 时长 */
--duration-fast: 150ms;      /* 微交互：按压、选中 */
--duration-normal: 250ms;    /* 标准过渡：面板、菜单 */
--duration-slow: 350ms;      /* 大过渡：页面切换、全屏播放器 */

/* 缓动 */
--ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);    /* 通用 */
--ease-in: cubic-bezier(0.42, 0, 1, 1);               /* 退场 */
--ease-out: cubic-bezier(0, 0, 0.58, 1);              /* 入场 */
--ease-spring: cubic-bezier(0.32, 0.72, 0, 1);        /* 弹性（sheet） */
```

#### 10.2 标准过渡模式

| 模式 | 用途 | 实现 |
|---|---|---|
| Fade | 对话框出场、背景遮罩 | `opacity 0→1` |
| Slide-up | 底部面板、全屏播放器 | `translateY(100%)→0` |
| Scale-fade | 弹出菜单、对话框入场 | `scale(0.95)+opacity→1` |
| Press | 按钮/行按压 | `scale(0.97)+opacity(0.7)` |

#### 10.3 Reduce Motion 支持

- **本阶段只做 CSS 侧准备**：定义 `.theme-root.reduce-motion` 类，将 `--duration-*` 归零
- 实现：`.theme-root.reduce-motion { --duration-fast: 0ms; --duration-normal: 0ms; --duration-slow: 0ms; }`
- **激活通道不在本阶段实现**：需要宿主（Android/iOS/HarmonyOS）通过 `SystemAppearance` 模块新增 `reduceMotion` 字段 + `sendGlobalEvent` 推送，属于原生侧改动，单独开任务。本阶段确保 CSS 侧就绪，原生侧接通后零改动生效

#### 闸门测试

- `motion-tokens.test.ts`：验证动效令牌存在、reduce-motion 类有效

---

### 阶段 11：无障碍（Accessibility）★

**目标**：对齐 HIG §8 无障碍规范 + WCAG AA 对比度标准。

**改动范围**：全局

#### 11.1 颜色对比度

- 正文（≤17px）：≥ 4.5:1（WCAG AA）
- 大字（≥18px 或 bold）：≥ 3:1
- 扩展 `contrast.test.ts`：覆盖所有语义色对（content/canvas、content-2/paper、primary/primary-content、danger/paper 等）

#### 11.2 触控目标

- 所有可交互元素 ≥ 44×44px（`--tap-target`）
- 间距：带边框元素周围 ≥ 12px，无边框 ≥ 24px
- 检查点：歌曲行操作按钮、导航标签、弹窗按钮、滑块拇指
- **44px 约束的是「触控目标」，不是「画出来的图形」**（HIG "Touch targets" 原文如此）。2026-09-03 落地时 31 个欠 44px 的可点类分成两类：29 个直接放大到 `--tap-target`（透明图标按钮长大不改变任何像素）；5 个画在封面/胶囊上的实心圆片**保持原尺寸**，改用 `__*-hit` 包裹层把命中盒撑到 44px（沿用目录树 `libops-tree__check-hit` 既有做法）——歌单卡封面只有 104px 宽，两个 44px 圆片会盖掉它 85% 的宽度
- **滑块拇指是登记在案的豁免**：`player-volume__thumb`（14px）与 `eq-page__band-thumb`（16px）不带任何手势处理器，手势属于 132px 的滑轨本身；理由写在 `a11y-tap-target.test.ts` 的 `NOT_A_TAP_TARGET` 里，且豁免只对「经 `*ClassName` 传入」的类有效，带 `bindtap`/`catchtap` 的类**不可**豁免

#### 11.3 焦点可见性

- 键盘导航焦点：`--shadow-focus` 焦点环
- 不依赖颜色传达状态：开关的开/关除颜色外有位置差异（已符合），选中态有图标（已符合）

#### 11.4 文字缩放

- **实现机制**：在 `.theme-root` 上新增 `--font-scale` 令牌（默认 `1`），所有字号令牌改为 `calc(基准值 * var(--font-scale))`。放大 200% 时设 `--font-scale: 2`
- **缩放入口**：外观设置页新增「文字大小」滑块（复用 `VerticalSlider` 的水平变体或新建水平滑块），持久化到 `SongloftStorage.prefs`，ThemeProvider 注入 `--font-scale`
- 布局适配：避免固定高度截断文字——行高使用 `min-height` 而非 `height`；多行文本允许自动换行
- 检查点：设置行、歌曲行、导航标签、播放器标题
- **Lynx 无系统字号 API**：不依赖宿主动态字号，由应用内设置驱动

#### 11.5 动效无障碍

- 阶段 10 的 reduce-motion 支持
- 避免闪烁：均衡器动画频率 < 3Hz（已符合）

#### 闸门测试

- `a11y-contrast.test.ts`：全语义色对对比度
- `a11y-tap-target.test.ts`：**按用法反推**可点类清单（扫描每个 JSX 开标签的 `bindtap`/`catchtap` 与全部 `*ClassName` 属性，190+ 个类），凡声明了显式高度的都必须 ≥ 44px。原先是 5 条**手写**模式 + docstring 自认「未列出的类不检查」——那正是它要抓的 bug 的形状，且确实漏了 31 个，其中两个 `⋯` 触发器只经 `triggerClassName` 到达，手写清单看不见

---

## 依赖关系

```
阶段 1（令牌）
  ├─→ 阶段 2（材质）─→ 阶段 3（导航）
  ├─→ 阶段 4（组件）─→ 阶段 5~9（各页面）
  └─→ 阶段 10（动效）─→ 阶段 11（无障碍）
```

- 阶段 1 是所有后续阶段的前置
- 阶段 2~4 可并行
- 阶段 5~9 依赖阶段 4（组件），互相独立可并行
- 阶段 10 可与 5~9 并行
- 阶段 11 最后（需要所有页面就位后全量检查）

## 不改的部分

- **原生模块层**（android/ / ios/ / harmony/）：纯前端重构
- **路由结构**：不增删路由
- **API 层**：不改接口
- **tokens.css 的颜色令牌**：语义色已完善，不重定义
- **玻璃表面公式**：13 个消费 `var(--glass-fill*)` 的 CSS 文件不改，`inset box-shadow` 模式不变
- **`--radius-nav`**：已冻结，不消费
- **PlayerBackdrop 模糊实现**：blur(40px) 已 spike 验证，不改
- **弹出层定位逻辑**：`anchored-overlay.ts` 的测量/定位算法不改（已实测校准）
- **返回导航逻辑**：`back-stack.ts` / `route-back.ts` 不改
- **VirtualList / 虚拟滚动**：不改
- **菜单项构建逻辑**：`song-menu-items.ts` 有闸门测试锁定，不改

## 功能保全保证（铁律）

本次重构**只改视觉表现层**（CSS 值、布局参数、动画、令牌），不改以下任何功能逻辑：

1. **状态管理**：所有 Zustand store、TanStack Query 缓存、模块级单例状态的读写逻辑不变
2. **事件处理**：所有 `bindtap` / `catchtap` / `bindlayoutchange` 等事件回调不变
3. **路由导航**：路由结构、返回导航、滚动记忆不变
4. **数据流**：API 调用、数据模型（zod）、i18n 键值逻辑不变（仅新增键，不删改现有键）
5. **原生通信**：原生模块调用、`sendGlobalEvent`、`NativeModules` 不变
6. **闸门测试**：现有闸门测试全部保持通过，新增闸门只加不减
7. **E2E 场景**：33 个 E2E scenario 的行为不变（视觉断言可能需要更新截图基线）

**验收标准**：每个阶段完成后，`pnpm test` 全绿 + 现有功能手动回归无退化。

## 验收流程

每个阶段完成后：

```bash
pnpm run build          # 两个产物（lynx + web）
pnpm exec tsc -b        # 类型检查
pnpm test               # vitest（含新增闸门）
pnpm run build:web      # Web 产物
```

Docker Chrome 视觉验收（按阶段检查清单）。

分批提交，每批 Conventional Commit：`style(theme): 阶段N — 描述`。

---

## 附录：文件影响估算

| 阶段 | 新建 | 修改 | 主要文件 |
|---|---|---|---|
| 1 | 1 测试 | 1 | tokens.css（仅新增，不改现有值） |
| 2 | 4 | 6 | material-model/tokens + ThemeProvider 链 |
| 3 | 0 | 4~6 | ShellLayout.*, MoreTabsSheet.*, destinations.ts |
| 4 | 2 测试 + buttons.css | 10~15 | shared/ui/*.css + 确认所有按钮迁移 |
| 5 | 0 | 14 | player/ 下 CSS（不含 PlayerBackdrop） |
| 6 | 0 | ~10 | library/ 下指定的 CSS（非全部） |
| 7 | 0 | 7 | playlist/ 下 CSS |
| 8 | 0 | 12 | settings/ 下 CSS + TSX |
| 9 | 0 | 8 | home/ + auth/ + jsplugin/ + library-ops/ |
| 10 | 1 测试 | 5~10 | tokens.css + 各组件 CSS |
| 11 | 2 测试 | 5~10 | 全局 CSS + contrast 测试 + font-scale 令牌 |

总计约 **新建 12 个文件，修改 90~100 个文件**（多数为 CSS 调整，纯视觉层改动）。
