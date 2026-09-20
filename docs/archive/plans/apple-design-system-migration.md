# Apple 设计系统迁移方案（第二代）

> **Superseded（2026-09-20）：本方案已由 DESIGN.md 现行 Liquid Glass / `--material-*` 体系取代，仅作历史参考。**
>
> **已归档（2026-09-15）**：P0–P13 均已落地（Muse 别名层已从仓库消失），下面的「状态：待审核 / 未做任何代码改动」早已失效。**残留未做、也没有搬进 bugs.md 的**：MediaListItem 分隔线、视觉复核那一轮的「真值机」验证、以及 Android / HarmonyOS 两端缺口 —— 若要继续，从本文对应小节读起。
> 前置文档：[`apple-hig-redesign.md`](apple-hig-redesign.md)（第一代，11 阶段，已完成但只落到令牌重命名层）。

## 1. 为什么需要第二代方案

第一代计划 `apple-hig-redesign.md` 的 11 个阶段在 `progress.md` 里全部标记完成，但核实后结论是：

- **阶段 1–4 真的落地了**：HIG 字号阶梯（caption2→largeTitle）、字重令牌、间距补档、`--tap-target: 44px`、动效令牌、`buttons.css` 6 个 HIG 按钮类、AppSwitch 51×31/25px。
- **阶段 5–10 只落地了「批量迁移 57 个功能 CSS 文件的字号/字重令牌」**，即 `--font-md`→`--font-callout` 这类重命名。计划里写明的**结构与尺寸规格一条都没做**。

抽样核实（不是推测）：

| 计划要求 | 实际现状 | 位置 |
|---|---|---|
| SongRow 行高 64px | 无显式高度，实测 12+48+12+1 = **73px** | `features/library/widgets/SongRow.css:29,53` |
| SongRow 分隔线内缩至封面右缘 | `border-bottom: 1px solid var(--line)`，**全宽通铺** | `SongRow.css:53` |
| SongRow 标题 `--font-body`(17) | `--font-callout`(16) | `SongRow.css:78` |
| 设置行图标 28×28 彩色圆形 | 只有 `width: 28px`，无高度、无彩色 | `features/settings/widgets/Settings.css:83` |
| 设置分组标题 `--font-footnote` | `--font-sm`(14) + `--weight-bold` | `Settings.css:39-40` |
| HomePage 问候语 `--font-largeTitle`(34) | `--font-title1`(28) | `features/home/pages/HomePage.css:18` |
| LoginPage logo 80×80 | 72×72 硬编码 | `features/auth/pages/LoginPage.css:21-22` |

**更重要的是**：用户明确指出 Muse 令牌体系本身就是旧设计，要完整替换为 Apple 设计。第一代计划是「在 Muse 令牌内做 HIG 化」，因此即使把阶段 5–10 补完，颜色语义仍然是自研的。第二代方案的核心因此是**令牌体系替换**，逐屏结构改造是它的下游。

## 2. 已决策事项与代价登记

四项决策已由用户确认。其中两项与我的建议相反，**代价在此如实登记，不做美化**。

### 2.1 强调色 = systemBlue ✅ 与建议一致

**`#0088FF`（浅）/ `#0091FF`（暗）** —— 这是 Apple 2025-06「unified」更新后的官方值，已用 curl 从 HIG 色板核实。本方案初稿写的 `#007AFF`/`#0A84FF` 是旧值（见文末「官方色值核对」）。开关开启态另用 systemGreen `#34C759` / `#30D158`（这两个官方值与旧值相同）。

**实测代价**（本地计算，非引用）：

| 配对 | 比值 | AA 4.5 | AA 3.0 |
|---|---|---|---|
| `#0088FF` 文字 on `#FFFFFF` | **3.52** | ✗ | ✓ |
| `#0088FF` 文字 on `#F2F2F7` | **3.15** | ✗ | ✓ |
| 白字 on `#0088FF`（填充按钮） | **3.52** | ✗ | ✓ |
| `#0091FF` 文字 on `#000000` | 6.49 | ✓ | ✓ |
| `#0091FF` 文字 on `#1C1C1E` | 5.26 | ✓ | ✓ |
| `#34C759` 开关轨道 vs `#FFFFFF` | **2.22** | — | ✗ |

即：**Apple 自己的 systemBlue 在浅色主题下作正文/按钮字色不过 WCAG AA**，systemGreen 的开关轨道边界也不过 1.4.11 的 3:1。这不是本仓库引入的缺陷，是 Apple 调色板的既有属性。

缓解措施（写进 P0，不是「以后再说」）：
- 新增 `.theme-root.increase-contrast` 变体，对应 Apple 的 **Increase Contrast** 无障碍开关，accent 换成官方 accessible blue `#1E6EF4`。**注意这只是部分缓解**：它在白底 4.57 ✓，但在分组灰底 `#F2F2F7` 上只有 **4.10 ✗**（详见文末）。
- 填充式破坏性按钮不用 systemRed 原值（白字 on `#FF383C` = **3.57**），改用官方 accessible red `#E9152D`（白字 = **4.56 ✓**）。systemRed 原值仍用于文字与图标。
- 开关的状态**不只由颜色承载**——滑块位置本身即状态，满足 WCAG 1.4.1「不以颜色为唯一手段」。轨道 2.22 的事实照实记录，不假装它过关。

### 2.2 令牌重命名为 Apple 语义名 ✅ 与建议一致

理由不只是「名副其实」：Muse 的 `--canvas`/`--paper` 二元结构**在结构上无法表达** Apple 的双背景组——

- 普通背景组：`systemBackground` / `secondary` / `tertiary`
- 分组背景组：`systemGroupedBackground` / `secondary` / `tertiary`

且两组在明暗间互换角色（浅色下分组页背景是灰、卡片是白；暗色下分组页背景是纯黑、卡片是 `#1C1C1E`）。只有两个令牌名装不下六个语义位，设置类页面必然出现语义打架。

### 2.3 照搬 Apple 原值、改写闸门 ⚠️ 与建议相反

**这是一次真实的无障碍退步。** 具体数字：

| Apple 原值 | 合成后比值 | 现有闸门要求 | 结果 |
|---|---|---|---|
| 浅 `secondaryLabel` `rgba(60,60,67,.60)` on `#FFF` | **3.44** | `--content-2` ≥ 4.5（明暗均要求） | ✗ 红 |
| 浅 `secondaryLabel` on `#F2F2F7` | **3.30** | 同上 | ✗ 红 |
| 浅 `tertiaryLabel` `rgba(60,60,67,.30)` on `#FFF` | **1.73** | `--content-muted` ≥ 3（浅色豁免） | ✗ 红 |
| 浅 `quaternaryLabel` `rgba(60,60,67,.18)` on `#FFF` | **1.37** | — | ✗ |
| 暗 `secondaryLabel` `rgba(235,235,245,.60)` on `#1C1C1E` | 5.95 | ≥ 4.5 | ✓ |
| 暗 `tertiaryLabel` on `#1C1C1E` | **2.48** | ≥ 4.5 | ✗ 红 |
| 暗 `quaternaryLabel` on `#1C1C1E` | **1.58** | ≥ 4.5 | ✗ |

对照现状（Muse 值优于 Apple 值）：

| 现状令牌 | 比值 |
|---|---|
| `--content-2` `#67676f` on `#FFF` | **5.61** |
| `--content-muted` `#7b7b88` on `#FFF` | 4.17 |
| `--content-2` `#a1a1a8` on `#0f0f11` | 7.46 |
| `--content-muted` `#8b8b98` on `#0f0f11` | 5.69 |

**结论**：二级文字从 5.61 降到 3.44，是 −2.17 的真实退步。若改为「Apple 色相 + 调深 alpha」，浅色 `#3C3C43` 只需 alpha **0.70**（而非 0.60）即可回到 4.5，视觉差异极小。用户已确认选择照搬原值，本方案照此执行，并在 §5 给出闸门改写的具体形态；该退步会写进 `progress.md` 的已知债务。

**衍生的硬约束**：`--content-muted` 有 **138 处**使用，其中绝大多数是真正必要的二级文字（副标题、计数、提示）。若整体映射到 `tertiaryLabel`（1.73），是灾难性的。因此 P0 必须做**逐处判定**，把 138 处拆成「多数 → `--secondary-label`」与「少数真占位符/装饰 → `--tertiary-label`」，这不是一次重命名。

### 2.4 主题包保留全量覆盖能力 ⚠️ 与建议相反

`PACK_OVERRIDABLE_BASELINE` 现有 18 个可覆盖令牌/主题（primary 家族、canvas/paper/paper-clear、7 个 glass、radius-lg/md/nav）。保留全量覆盖意味着：

**「任何主题下都是 Apple 版式与对比度」在架构上无法保证。** 第三方包可以把背景改成任意色，从而使 §2.3 里那些本已勉强的比值进一步崩塌，而闸门只能校验 tokens.css 的内置值与内置包，管不了未来下发的包。

本方案能做到的上限，也是会做的：
- 闸门覆盖内置 3 个包（`songloft.liquid-glass` / `neon-night` / `sakura`）的实际取值。
- `PACK_OVERRIDABLE_BASELINE` 迁移到新令牌名，并保持与 tokens.css 的同步校验（现有闸门机制不降级）。
- 对可覆盖清单**不做扩大**——尤其不把新增的 6 个背景语义位、4 级 label、4 级 fill、separator 全部开放，否则包能直接改掉文字色。清单维持「颜色种子 + 材质 + 圆角」的现有边界。

## 3. 目标令牌体系

现状：`.theme-root` 58 个标量令牌，`.theme-light`/`.theme-dark` 各 35 个颜色令牌。字号阶梯、间距、圆角、字重、动效已是 HIG 形态，**本方案不动它们**（`--font-sm` 除外，见 §3.6）。要替换的是 35 个颜色令牌。

### 3.1 文字（Label）

| 新令牌 | Apple 名 | 浅色 | 暗色 | 替代 |
|---|---|---|---|---|
| `--label` | label | `#000000` | `#FFFFFF` | `--content` (133) |
| `--secondary-label` | secondaryLabel | `rgba(60,60,67,0.60)` | `rgba(235,235,245,0.60)` | `--content-2` (53) + `--content-muted` 的多数 |
| `--tertiary-label` | tertiaryLabel | `rgba(60,60,67,0.30)` | `rgba(235,235,245,0.30)` | `--content-muted` 的少数 |
| `--quaternary-label` | quaternaryLabel | `rgba(60,60,67,0.18)` | `rgba(235,235,245,0.16)` | 新增（禁用态） |
| `--placeholder-text` | placeholderText | `rgba(60,60,67,0.30)` | `rgba(235,235,245,0.30)` | 输入框 `-x-placeholder-color` |

注意 `--content` 现值是 `#111111`/`#f5f5f7`，Apple 是纯 `#000`/`#FFF`。这会让正文对比度**上升**（21.00 / 21.00），是本次替换里唯一变好的一项。

### 3.2 背景（两组，明暗互换角色）

| 新令牌 | Apple 名 | 浅色 | 暗色 |
|---|---|---|---|
| `--system-background` | systemBackground | `#FFFFFF` | `#000000` |
| `--secondary-system-background` | secondarySystemBackground | `#F2F2F7` | `#1C1C1E` |
| `--tertiary-system-background` | tertiarySystemBackground | `#FFFFFF` | `#2C2C2E` |
| `--system-grouped-background` | systemGroupedBackground | `#F2F2F7` | `#000000` |
| `--secondary-system-grouped-background` | secondarySystemGroupedBackground | `#FFFFFF` | `#1C1C1E` |
| `--tertiary-system-grouped-background` | tertiarySystemGroupedBackground | `#F2F2F7` | `#2C2C2E` |

替代 `--canvas` (19) / `--paper` (34)。**关键语义**：
- 普通页（Home、播放器、列表页）→ 页面 `--system-background`，卡片 `--secondary-system-background`。浅色下仍是「白页 + 灰卡」，与现状同向。
- 分组页（设置及其子页）→ 页面 `--system-grouped-background`（浅色 `#F2F2F7` 灰），卡片 `--secondary-system-grouped-background`（浅色 `#FFFFFF` 白）。**这是相对现状的反转**，也是本次视觉变化最明显的地方。

### 3.3 填充（Fill，中性灰通道）

Apple fill 用于「内容之上的小形状」：搜索框底、滑轨、分段控件、内嵌信息块。

| 新令牌 | Apple 名 | 浅色 | 暗色 | 可见性(over 页底) |
|---|---|---|---|---|
| `--system-fill` | systemFill | `rgba(120,120,128,0.20)` | `rgba(120,120,128,0.36)` | 1.27 / 1.49 |
| `--secondary-system-fill` | secondarySystemFill | `rgba(120,120,128,0.16)` | `rgba(120,120,128,0.32)` | 1.21 / 1.40 |
| `--tertiary-system-fill` | tertiarySystemFill | `rgba(118,118,128,0.12)` | `rgba(118,118,128,0.24)` | 1.15 / 1.24 |
| `--quaternary-system-fill` | quaternarySystemFill | `rgba(116,116,128,0.08)` | `rgba(118,118,128,0.18)` | 1.10 / 1.15 |

替代 `--neutral-faint` (74) + `--fill-faint` (7)。四级全部 ≥ 现有状态高亮可见性下限 **1.08**，因此 `contrast.test.ts` 的 wash 可见性闸门不需要放宽——这是本次替换里少见的好消息。

文字读在 fill 上的实测：`--label` on 浅色 systemFill = **16.53**；`--secondary-label` on 浅色 systemFill = **3.13**（不过 4.5，与 §2.3 同源）。

### 3.4 分隔线

| 新令牌 | Apple 名 | 浅色 | 暗色 |
|---|---|---|---|
| `--separator` | separator | `rgba(60,60,67,0.29)` | `rgba(84,84,88,0.65)` |
| `--opaque-separator` | opaqueSeparator | `#C6C6C8` | `#38383A` |

替代 `--line` (80) / `--rule` (17)。分隔线不承载文字，无 AA 要求（实测 1.70 / 1.66，仅供记录）。

### 3.5 强调色、语义色与灰阶

| 新令牌 | 浅色 | 暗色 | 替代 |
|---|---|---|---|
| `--accent` | `#0088FF` | `#0091FF` | `--primary` (87) / `--accent` (27) |
| `--accent-content` | `#FFFFFF` | `#FFFFFF` | `--primary-content` (42) |
| ~~`--accent-2`~~ | — | — | 不引入（见 P0 实施记录） |
| `--tint-fill` | `rgba(0,136,255,0.10)` | `rgba(0,145,255,0.18)` | `--primary-faint` (11) |
| `--system-red` | `#FF383C` | `#FF4245` | `--danger` (50) |
| `--system-red-strong` | `#E9152D` | `#E9152D` | `--danger-2`（填充按钮） |
| `--system-red-strong-content` | `#FFFFFF` | `#FFFFFF` | 新增 |
| `--system-green` | `#34C759` | `#30D158` | 新增（开关开启态） |
| `--system-gray` … `--system-gray6` | `#8E8E93`…`#F2F2F7` | `#8E8E93`…`#1C1C1E` | 新增 |

`--tint-fill` **不是 Apple 语义色**——Apple 的做法是 `tintColor.opacity(0.15)`，没有对应命名令牌。它作为 Songloft 扩展保留，因为主题包需要一个可重指向的强调色 wash 通道。tokens.css 里会显式注明这一点，避免被误认为 Apple 原生语义。实测可见性：浅 1.22 / 暗 1.24，均过 1.08 下限。

### 3.6 `--font-sm`（14px，167 处）的处置

这是最大的一笔字号债务。14px 在 Apple 文本样式阶梯上**没有对应项**（相邻是 footnote 13、subheadline 15），第一代计划正因如此拒绝为它做别名。按语义角色分流：

| 角色 | 目标 | 依据 |
|---|---|---|
| 主标题下的次级元数据（歌手/专辑/计数/时长） | `--font-footnote`(13) | Apple Music 曲目行副标题 |
| 表单标签、独立次级正文、错误提示 | `--font-subhead`(15) | Apple 表单标签 |
| 分组标题 | `--font-footnote`(13) | Apple 分组表头 |
| 工具栏/按钮文字 | `--font-subhead`(15) | Apple 工具栏 |

迁移完成后 `--font-sm`/`--font-md`/`--font-lg`/`--font-xl`/`--font-2xl`/`--font-xs`/`--font-2xs` 七个 legacy 令牌可从 tokens.css 删除，并由闸门禁止复现。`tokens-hig.test.ts` 里那条「legacy 令牌保持原值」的测试随之改为「legacy 令牌已不存在」。

### 3.7 材质（Glass → Apple Material 词汇）

现有 glass 体系是自研的 faux Liquid Glass：`--glass-fill`(0.85) / `--glass-fill-strong`(0.72) + ramp + sheen + rim，另有真实模糊 `<blur-view>`（`BackdropBlur.tsx`，Web/iOS/Android 可用）。

**发现一个命名陷阱**：`--glass-fill-strong` 的 alpha（0.72）比 `--glass-fill`（0.85）**更低**，即"strong"指的是玻璃感更强、更透，而非填充更强。这个反直觉命名在重命名时一并修正：

| 新令牌 | 现令牌 | alpha | 用途 |
|---|---|---|---|
| `--material-thick` | `--glass-fill` | 0.85 | 导航胶囊、mini player（bar 材质） |
| `--material-regular` | `--glass-fill-strong` | 0.72 | 底部抽屉、对话框、气泡菜单 |

ramp / sheen / rim / highlight / border / glow 六组保留现有推导值不动——它们的 alpha 是 `contrast.test.ts` 从 AA 约束反推出来的（注释里记录了 0.05+0.06 合成后失败、0.03+0.04 才过的过程），重新推导没有收益且风险高。仅重命名前缀 `--glass-*` → `--material-*`。

`blur-effect: 'glass' | 'glass-container'`（iOS 26 原生 Liquid Glass）**继续不启用**，理由与 `BackdropBlur.tsx` 现有注释一致：本仓库无法验证 iOS 端表现，且在 0.72–0.85 的填充下只会露出 15–28%。列为需要真机的后续项，不进本方案。

## 4. 迁移策略：别名桥接，让「逐屏推进」真的可行

用户要求「可以逐步逐个界面分开来做」。若直接一次重命名 80 个 CSS 文件里的 67 个自定义属性，就变成一个不可拆的巨型提交，与要求相反。

因此采用**两步走**：

**第一步（P0）**：tokens.css 里新增全部 Apple 语义令牌作为**唯一真值来源**，旧 Muse 名保留为**薄别名**指向新名：

```css
.theme-root.theme-light {
  /* Apple 语义色：真值 */
  --label: #000000;
  --secondary-label: rgba(60, 60, 67, 0.60);
  --system-grouped-background: #f2f2f7;
  --secondary-system-grouped-background: #ffffff;
  /* … */

  /* Muse 兼容别名：随各屏迁移逐步删除，P10 清零 */
  --content: var(--label);
  --content-2: var(--secondary-label);
  --canvas: var(--system-background);
  --paper: var(--secondary-system-background);
  /* … */
}
```

这样 P0 单独可交付：**零 CSS 文件改动、零结构改动，只有颜色取值变化**。视觉上立刻是 Apple 配色，回滚只需还原一个文件。

**可行性已确认，不是假设**：`contrast.test.ts` 里已有结论——「嵌套在自定义属性里的 `var()` 确实会在消费元素上按主题解析（已通过 lynx-css 管线在 headless Chrome 验证）」，且 `--shadow-focus: 0 0 0 3px var(--primary-faint)` 与 `--glass-ramp` 等三个复合层本就是这个形态在生产中运行。

**第二步（P1–P9）**：每屏一批，把该屏 CSS 里的旧名换成新名 + 做结构改造。**P10** 删除别名层并加闸门禁止旧名复现。

### 4.1 `--primary` 的 87 处必须逐处三分类（最高风险项）

`--primary` 现值是**墨色**（`#111111` 浅 / `#ffffff` 暗），改成 systemBlue 后，**每一处用它做填充的表面都会变蓝**。这不是重命名问题，是语义问题。已定位的用法分三类：

**A 类 — 应该变蓝**（accent 语义，直接迁 `--accent`）：
- `.btn--prominent` 背景（`shared/ui/buttons.css:18`）
- `.mini-player__play` 背景（`features/player/widgets/MiniPlayer.css:173`）
- `.mini-player__progress-fill` / `.player-progress__indicator`（进度条已播部分）
- `.app-checkbox--on` 背景与边框（`shared/ui/AppCheckbox.css:23-24`）
- `.confirm-dialog__btn--submit` 背景（`ConfirmDialog.css:213`）
- `.library-editor__group-label` 文字色（`LibraryViewEditor.css:80`）
- `.popover-menu__item-label--selected`、`.btn--tinted`、`.btn--ghost` 文字色

**B 类 — 应该变绿**（开关开启态，Apple 用 systemGreen 而非 accent）：
- `.app-switch__track.ui-checked` 背景（`shared/ui/AppSwitch.css:36`）→ `--system-green`

**C 类 — 不能变蓝**（需要新的中性令牌）：
- `.toast` 背景（`shared/ui/ToastHost.css:37`）。现在是墨色胶囊 + 白字，语义上是「中性通知」。变蓝会读成「信息提示/可点击」。Apple 没有 toast 组件，故新增 Songloft 扩展 `--toast-fill`（浅 `#1C1C1E` / 暗 `#F2F2F7`，即反相灰），文字用 `--toast-content`。**AGENTS.md 记载 toast 刻意不玻璃化**，此处沿用该决定。
- `.home-stats` 填充（`--primary-2`，`HomePage.css`）。整条统计带填成 systemBlue 会过于抢眼且与 Apple「统计卡用 secondary 背景」的做法冲突。改为 `--secondary-system-background` + `--label` 文字，`--accent-2` 因此可能不再需要，待 P4 确认后决定删除。

`--accent`（27 处）全部属 A 类，直接迁移；`--primary-content`（42 处）统一为 `#FFFFFF`——浅色本来就是白，暗色从 `#0f0f11` 变白，这是暗色主题下的正确变化（白字在蓝底上）。

**这份三分类必须在 P0 落地，否则 P0 交付的就是一个满屏蓝色的错误状态。**

## 5. 闸门改造方案

`contrast.test.ts`（28KB）是本仓库质量最高的闸门之一：它从 tokens.css 实际取值反推 AA 最小 alpha，做玻璃层合成、播放器蒙版最坏封面、状态 wash 可见性，还包含**故意保持红的反貌真性检查**（`--paper` 作 wash 必须 < 1.08；`--content-muted` 在 wash 上必须 < 4.5）。改写它必须保住这些性质，不能降级成断言常量。

### 5.1 现有策略（读代码得出，不是猜测）

不是「全部文字 4.5」，已经是分级的：

| 主题 | 令牌 | 下限 |
|---|---|---|
| 暗 | content / content-2 / content-muted / accent / danger | 4.5（7 个表面全覆盖） |
| 浅 | content / content-2 / accent | 4.5 |
| 浅 | content-muted / danger | **3.0**（`floorFor()` 明确豁免，注释记为已知缺口） |

### 5.2 改写后的策略

Apple 的四级 label 不是「同一种文字的深浅」，而是**重要性分级**，Apple 自己规定三级/四级只用于非必要内容。闸门因此从「数值下限」拆成**两个互补的闸门**：

**闸门 A — 数值下限，按 Apple 分级重设**

| 令牌 | 下限 | 依据 |
|---|---|---|
| `--label` | 4.5 | 正文必须过 AA（实测 21.00） |
| `--secondary-label` | **3.0** | 浅色实测 3.30–3.44，暗色 5.27–6.36。**这是本次唯一放宽的一档**，也是 §2.3 登记的退步 |
| `--tertiary-label` / `--quaternary-label` | **不设下限** | 数值上无法过 3.0（1.37–2.48）。改由闸门 B 约束用法 |
| `--accent` 作文字 | **3.0** | 浅色实测 3.60–4.02 |
| `--system-red` 作文字 | **3.0** | 浅色实测 3.18–3.55 |
| `--system-red-strong` + 白字 | 4.5 | 实测 5.38，填充破坏性按钮 |
| `--accent-content` on `--accent` | **3.0** | 白字 on `#007AFF` = 4.02 |
| `--accent-contrast` + 白字 | 4.5 | 实测 7.56，Increase Contrast 档必须真的过 AA |

**闸门 B — 用法白名单扫描（新增，替代被撤掉的数值约束）**

对全部 80 个 CSS 文件做静态扫描，断言 `--tertiary-label` / `--quaternary-label` **只出现在**允许的角色里：占位符文字、禁用态（`--disabled`/`opacity` 同规则）、纯装饰字形、分隔性符号。任何承载信息的选择器用了三/四级 label 即为失败。

这与现有闸门里那条「no stylesheet puts `--content-muted` text on a wash」的网状扫描同构——现成的实现形状可以直接沿用（`walk()` + 规则级正则 + 带 lookbehind 的 `color:` 探针 + 反貌真性自检）。**必须同时补一条反貌真性测试**：给一个违规样例，确认扫描能判红；否则这个闸门是安慰剂。

**必须保留不动的部分**：玻璃层合成推导、播放器蒙版最坏封面（黑/白极值）、wash 可见性下限 1.08 及其两条缺陷形状检查。§3.3 已核实 Apple 四级 fill 全部 ≥ 1.08，因此这部分不需要放宽。

### 5.3 其他受影响的闸门

| 闸门 | 改动 |
|---|---|
| `tokens-hig.test.ts` (129 行) | 新增 Apple 语义色值断言（明暗两套、逐令牌）；「legacy `--font-*` 保持原值」改为 P10 后的「已不存在」 |
| `tokens-defined.test.ts` (70 行) | 无策略改动，但会顺手暴露 `--on-primary`（1 处引用，tokens.css 里**不存在**该令牌，真值是 `--primary-content`）——这是现存 bug，P0 一并修 |
| `theme-pack-mapping.test.ts` (305 行) | `PACK_OVERRIDABLE_BASELINE` 18×2 项迁移到新名；`themePackToStyleVars()` 的 seedColor 重指向目标改为 `--accent` 家族 |
| `glass-surface.test.ts` | 不透明/半透明分类是从 tokens.css 取值推导的，`--glass-*` → `--material-*` 重命名后需同步 |
| `a11y-tap-target.test.ts` (11.8KB) | 不受颜色影响；但 P1–P9 改行高时会被它约束，属正向 |
| `material-tokens.test.ts` / `material-model.test.ts` | glass→material 重命名的直接相关方 |

## 6. 分阶段实施计划

每个阶段独立可交付、独立可回滚、独立过三条验收命令。**P0 不可再拆**（令牌与闸门必须同批，否则闸门红）；P1–P9 顺序可调。

### P0 — 基础层：令牌体系替换（不可拆）

| # | 任务 | 产出 |
|---|---|---|
| P0.1 | tokens.css 新增全部 Apple 语义令牌（§3.1–3.5），Muse 名降为别名（§4） | `tokens.css` |
| P0.2 | `--primary` 87 处 + `--accent` 27 处三分类落地（§4.1），新增 `--toast-fill`/`--toast-content` | 约 10 个 CSS 文件的定点改动 |
| P0.3 | `contrast.test.ts` 改写为闸门 A + 闸门 B（§5.2），含反貌真性自检 | 测试 |
| P0.4 | `tokens-hig.test.ts` 新增 Apple 色值断言 | 测试 |
| P0.5 | `theme-pack-mapping.ts` 的 `PACK_OVERRIDABLE_BASELINE` 与 `themePackToStyleVars()` 迁移 | 主题包映射 |
| P0.6 | 新增 `.theme-root.increase-contrast` 变体（`--accent-contrast`），沿用 `reduce-motion` 的既有挂载模式 | `tokens.css` + `ThemeProvider` |
| P0.7 | 修 `--on-primary` 悬空引用（§5.3） | 1 处 |
| P0.8 | glass→material 重命名（§3.7），修正 `strong` 反直觉命名 | tokens.css + 14 处消费方 |

**P0 交付后的可见效果**：全 App 变为 Apple 配色（蓝色强调、纯黑/纯白文字、Apple 灰阶背景），结构与尺寸完全不变。

**P0 的验证盲区（如实登记）**：Apple 语义色的精确十六进制值来自我的知识，**本次未能通过工具核对**——`developer.apple.com` 的 WebFetch 被网络策略拦截，WebSearch 返回提供方错误。§3 表格里的值需要在 P0 实施时对照 Apple 官方「UI Element Colors」文档逐项 pin 一遍。这是残余风险，不是已验证事实。

### P1 — 设置类页面（分组背景反转，视觉收益最大）

现状与目标：

| 项 | 现状 | 目标 | 位置 |
|---|---|---|---|
| 页面背景 | `--canvas` `#fff` | `--system-grouped-background` `#F2F2F7`/`#000` | `ShellLayout.css:6` 需按路由分流 |
| 卡片背景 | `--paper` `#fafafa` | `--secondary-system-grouped-background` `#FFF`/`#1C1C1E` | `Settings.css:53` |
| 卡片边框 | `1px solid var(--line)` | **删除**（Apple 分组卡靠背景反差，不描边） | `Settings.css:54` |
| 卡片圆角 | `--radius-lg` 20px | 新增 `--radius-grouped: 10px` | `Settings.css:51` |
| 行高 | 无显式高度，padding 16 上下 → 单行 ~48px | `min-height: var(--tap-target)` 44px + padding `--space-3`(12) 上下 → 单行 44px | `Settings.css:62` |
| 行图标 | 仅 `width: 28px`，无高度、单色 | 29×29px 彩色圆角方块 + `--radius-xs`(6px) + 白色字形 | `Settings.css:83` |
| 分组标题 | `--font-sm`(14) `--weight-bold` `--content-2` | `--font-footnote`(13) `--weight-regular` `--secondary-label` | `Settings.css:39-40` |
| 行标题 | `--font-callout`(16) | `--font-body`(17) | `Settings.css:97` |
| 行副标题 | `--font-sm`(14) | `--font-footnote`(13) | `Settings.css:105` |
| 行尾文字 | `--font-sm`(14) `--content-2` | `--font-subhead`(15) `--secondary-label` | `Settings.css:118` |
| 分隔线 | `border-top` **全宽通铺** | 内缩到文字起点（有图标 57px / 无图标 16px） | `Settings.css:68` |
| 页面标题 | `--font-title1`(28) | `--font-largeTitle`(34) `--weight-bold` | `SettingsPage.css:20` |

**分组标题不做大写**。Apple 经典分组表头是大写，但：`text-transform: uppercase` 在 Lynx **不支持**，`progress.md` 记载批19b 已因构建告警删除过该声明（`jsplugin/pages/TabConfigPage.css`），现存的只是一条解释性注释。靠 i18n 文案预大写对中文无意义。故采用句首大写 13px regular，这也是现代 iOS 多处的实际形态。

**分隔线内缩是组件改动不只是 CSS**：`border-top` 挂在行元素上必然全宽。需改为独立的 1px 分隔视图 + `margin-left`，即 `Settings.tsx` 的结构调整。

**受影响的其他设置子页**：`CacheManagePage`、`ProxySettingsPage`、`LicensesPage`、`ThemePacksSection`、`ThemeCatalogPage`、`SizeLimitSlider`、`UpgradeSection`（各含 1–8 处 `--font-sm`），以及 `LicensesPage.css:23` 用 `--neutral-faint` 当分隔线色（应为 `--separator`）。

### P2 — SongRow 与列表分隔线（影响面最广的组件）

`SongRow` 被 library / playlist-detail / play-history 三处共用，是全 App 出现次数最多的行。

| 项 | 现状 | 目标 | 位置 |
|---|---|---|---|
| 行高 | 12+48+12+1 = **73px** | padding `--space-2`(8) 上下 → **64px**（Apple Music 曲目行形态） | `SongRow.css:29` |
| 封面 | 48×48，`--radius-sm`(8px) | 48×48 保留，圆角改 `--radius-xs`(6px) | `SongRow.css:57-59` |
| 标题 | `--font-callout`(16) | `--font-body`(17) `--weight-regular` | `SongRow.css:78` |
| 副标题 | `--font-sm`(14) `--content-muted` | `--font-footnote`(13) `--secondary-label` | `SongRow.css:116-117` |
| 时长 | `--font-sm`(14) | `--font-footnote`(13) `--secondary-label` | `SongRow.css:126` |
| 分隔线 | 全宽通铺 | **内缩至封面右缘 76px**（16 padding + 48 封面 + 12 间距） | `SongRow.css:53` |
| `margin-top: 2px` 硬编码 | 2px | `var(--space-half)` | `SongRow.css:118` |

**64px 校验**：17px×1.3 ≈ 22 + 2 间距 + 13px×1.3 ≈ 17，合计 41px < 48px 封面高，文字块不会撑破行高。

**与 `contrast.test.ts` 的耦合**：该闸门断言 `.song-row--selected` 必须把副标题/时长从 `--content-muted` 抬到 `--content-2`（`SongRow.css` 的 step-up 规则）。副标题基线本来就要迁到 `--secondary-label`，抬升目标随之变成……**没有更高一级可抬**（`--secondary-label` 已是二级）。因此这条 step-up 规则在新体系下应改为：选中行副标题抬到 `--label`。闸门 B 的白名单与这条 step-up 断言需同批更新。

**同批处理** `MediaListItem`（`shared/ui/MediaListItem.css`）：`--font-sm`→`--font-footnote`、`--font-xs`→`--font-caption1`、封面圆角、且它**完全没有分隔线**（消费页各自加），需统一。

### P3 — 导航（tab bar / rail）

**先说一个反直觉的结论**：现有的悬浮胶囊导航（64px、`--radius-pill`、玻璃填充）**不需要改成 iOS 传统的 49pt 全宽栏**。iOS 26 的 Liquid Glass 导航本身就是悬浮的胶囊形玻璃 tab bar，现状与之同向。AGENTS.md 也已把 `--radius-nav` 与胶囊形状列为冻结项。

因此 P3 只改度量与配色：

| 项 | 现状 | 目标 | 位置 |
|---|---|---|---|
| 激活态文字色 | `--accent`（墨色） | `--accent`（systemBlue，随 P0 自动生效） | `ShellLayout.css:220` |
| 激活态 pill 底 | `--glass-glow-faint` | `--tint-fill` | `ShellLayout.css:175` |
| 未激活文字色 | `--content-muted` | `--secondary-label`（**不是** tertiary，tab 标签是必要信息） | `ShellLayout.css:231` |
| 底栏标签字号 | `--font-2xs`(10px) | 保留 10px，字重补 `--weight-medium` | `ShellLayout.css:208` |
| pill 高度 | `52px` 硬编码 | 令牌化 | `ShellLayout.css:190` |
| 底栏高度 | `64px` 硬编码，而 `--mobile-nav-height: 60px` 存在却**未被消费** | 二者归一，删除死令牌或让底栏消费它 | `ShellLayout.css:110` vs `tokens.css` |
| 侧栏背景 | `--paper` | `--secondary-system-background` | `ShellLayout.css:65` |
| 侧栏分组头 | `--font-footnote`(13) `--content-muted` | `--font-footnote` + `--secondary-label` | `ShellLayout.css:223-224` |
| brand 图标圆角 | `8px` 硬编码 | `--radius-sm` | `ShellLayout.css:79` |
| plugin 图标 | `24px` 硬编码 | 令牌化 | `ShellLayout.css:250-251` |

**约束遵守**：AGENTS.md 规定「rail 选中态只能改颜色不能改尺寸」、「底栏标签必须 `--font-2xs` + nowrap 且在 360dp 下容纳 4 个中文字」。本阶段不触碰这两条。`--nav-inset` 的 80/148 两档不动。

### P4 — 首页

| 项 | 现状 | 目标 | 位置 |
|---|---|---|---|
| 问候语 | `--font-title1`(28) `--weight-bold` | `--font-largeTitle`(34) `--weight-bold` | `HomePage.css:18-19` |
| 区块标题 | `--font-title3`(20) `--weight-bold` | `--font-title2`(22) `--weight-bold` | `HomePage.css:80-81` |
| 区块动作文字 | `--font-sm`(14) `--accent` | `--font-subhead`(15) `--accent` | `HomePage.css:112-113` |
| 统计卡 | `--paper` + `1px solid --line` + `--radius-lg`(20) | `--secondary-system-background`，**删边框**，`--radius-grouped`(10) | `HomePage.css:233-236` |
| 统计卡填充色 | `--primary-2`（将变蓝，属 §4.1 C 类） | `--secondary-system-background` + `--label` 文字 | `HomePage.css` |
| 统计主数值 | `--font-title1`(28) | `--font-title1`(28) 保留 | `HomePage.css:248` |
| 统计标签 | `--font-sm`(14) | `--font-footnote`(13) `--secondary-label` | `HomePage.css:255` |
| 卡片宽/封面 | `120px` ×4 处硬编码 | 令牌化 | `HomePage.css:153-154,165-166` |
| 横滚区高度 | `168px` 硬编码 | 令牌化（与 `CARD_CHROME_PX` 的 168 **同值但无关**，注释需说明避免误改） | `HomePage.css:126` |
| 刷新头高度 | `60px` 硬编码 | 令牌化 | `HomePage.css:51` |
| 重试按钮底 | `--neutral-faint` | `--tertiary-system-fill` | `HomePage.css:211` |

**注意**：首页是**普通页**不是分组页，所以页面用 `--system-background`（浅色白），卡片用 `--secondary-system-background`（浅色 `#F2F2F7` 灰）。P1 的「反转」只适用于设置类分组页，此处保持白页灰卡，与现状同向。

**Web 分支约束**：`HomePage.tsx` 的 Web 分支刻意不渲染 `<refresh>`（改渲染 `home__scroll-host`），因为该标签在 Web 落为未知元素、其头部文案会当正文渲染。本阶段不得改动这个分流。

### P5 — 歌单列表与详情

| 项 | 现状 | 目标 | 位置 |
|---|---|---|---|
| 详情页封面 | 96×96，`--radius-md`(12) | **160×160**，`--radius-sm`(8) | `PlaylistDetailPage.css:91-93` |
| 详情页 meta 高度 | `96px`（跟封面锁死） | 随封面改 160px | `PlaylistDetailPage.css:119` |
| 歌单名 | `--font-title3`(20) `--weight-bold` | `--font-title2`(22) `--weight-bold` | `PlaylistDetailPage.css:126-127` |
| 描述 | `--font-sm`(14)，`max-height: 32px` | `--font-footnote`(13)，两行夹取随字号重算 | `PlaylistDetailPage.css:136,149` |
| 计数 | `--font-sm`(14) | `--font-footnote`(13) `--secondary-label` | `PlaylistDetailPage.css:156` |
| 卡片名 | `--font-sm`(14) | `--font-subhead`(15) | `PlaylistsView.css:167` |
| 卡片封面 | 104×104，`--radius-md`(12) | 104 保留，圆角 `--radius-sm`(8) | `PlaylistsView.css:139-141` |
| 搜索框 | 40px 高，`--neutral-faint` | `--control-height-sm`(36px)，`--tertiary-system-fill`，`--radius-sm` | `PlaylistsView.css:267`, `PlaylistDetailPage.css:289` |
| 排序行分隔线 | 全宽通铺 | 内缩 16px | `PlaylistsView.css:331`, `PlaylistDetailPage.css:316` |
| 圆形小按钮 | `28px` + 44px `__*-hit` 包裹 | 保留该模式（已符合 44px 规范） | `PlaylistsView.css:103-109,208-214` |
| eq 动画几何 | 16/3/4/8/6/10/12px 硬编码 | **保留硬编码**（动画几何非设计令牌，令牌化无收益） | `PlaylistsView.css:50-129` |

`--font-sm` 在本组共 16 处（6 个文件），按 §3.6 分流。

**同批** `AddToPlaylistSheet`（面板高 62%）、`PlaylistDescPanel`、`PlaylistFormFields`、`CreatePlaylistPage`、`EditPlaylistPage`（封面 96→与详情页一致性待定）。

### P6 — 播放器（全屏 + mini）

| 项 | 现状 | 目标 | 位置 |
|---|---|---|---|
| 全屏封面圆角 | `--radius-xl`(28) | `--radius-md`(12) | `FullPlayerPage.css:174,212` |
| 曲名 | `--font-title1`(28) `--weight-bold` | `--font-title2`(22) `--weight-bold` | `FullPlayerPage.css:273-274` |
| 歌手 | `--font-callout`(16) `--content-2` | `--font-title2`(22) `--weight-regular` `--accent`（Apple Music 形态） | `FullPlayerPage.css:280` |
| 专辑（顶栏） | `--font-sm`(14) | `--font-footnote`(13) `--secondary-label` | `FullPlayerPage.css:124` |
| eyebrow | `--font-caption1`(12) `--weight-bold` | `--font-caption1` + `--weight-semibold` | `FullPlayerPage.css:116-117` |
| 播放/暂停主按钮 | 仅字形 `--font-title1`(28) | 按钮 48×48 + 字形随之 | `PlayControls.css:53` |
| 模式标签 | `10px` / `2px` 硬编码 | `--font-2xs` 迁 `--font-caption2`(11) / `--space-half` | `PlayControls.css:67-68` |
| 视频徽标 | `8px`/`14px`/`12px` 硬编码 ×5 | 令牌化 | `FullPlayerPage.css:230-246` |
| 进度轨 | 4px，`--rule` | 4px 保留，色改 `--tertiary-system-fill` | `ProgressBar.css:43-45` |
| 进度滑块 | 14px 圆，`--primary-content` | 保留几何，色改 `#FFFFFF` + `--shadow-sm` | `ProgressBar.css:67-70` |
| mini 标题 | `--font-sm`(14) `--weight-semibold` | `--font-subhead`(15) `--weight-regular` | `MiniPlayer.css:132-133` |
| mini 副标题 | `--font-caption1`(12) `+ margin-top 2px` | 保留 12px，`--space-half`，色 `--secondary-label` | `MiniPlayer.css:141-142` |
| mini 封面 | 36×36，`--radius-sm`(8) | 保留 36，圆角 `--radius-xs`(6) | `MiniPlayer.css:105-108` |
| mini 进度轨 | `--fill-faint` | `--quaternary-system-fill` | `MiniPlayer.css:78` |

**mini player 的胶囊玻璃形态保留**——与 iOS 26 悬浮 mini player 同向，且 `bottom: calc(80px + safe-area)` / `z-index: 91` 属 AGENTS.md 的层级阶梯，不得改。

**播放器蒙版不得动**：`--player-scrim-from/to` 的 0.94（浅）/ 0.85（暗）是 `contrast.test.ts` 从「任意封面最坏情况（纯黑/纯白）」反推的，注释记录了 0.90 只到 4.23、0.92 到 4.43、0.93 才是第一个可行值的推导过程。P0 换了文字色之后**这条推导需要重跑**：`--label` 变纯黑/纯白会让约束变松，但 `--secondary-label` 的 alpha 合成会让它变紧。**P0 必须重新推导这两个 alpha，不能沿用。**

`EqualizerPage.css` 属 P9（整文件零令牌）。

### P7 — 登录 / 注册

| 项 | 现状 | 目标 | 位置 |
|---|---|---|---|
| logo | 72×72，圆角 16px（硬编码） | **80×80，圆角 18px**（与 `SplashScreen.css:11-13` 的 80/18 对齐） | `LoginPage.css:21-23` |
| 卡片 | `--paper` + `1px solid --line` + `--radius-lg`(20) | `--secondary-system-background`，**删边框**，`--radius-grouped`(10) | `LoginPage.css:15-17` |
| 卡片宽 | `max-width: 400px` 硬编码 | 令牌化 | `LoginPage.css:13` |
| 输入框 | `44px` 硬编码，底 `--neutral-faint` | `var(--control-height)`，底 `--tertiary-system-fill` | `LoginPage.css:56,59` |
| 主按钮 | `48px` 硬编码，底 `--primary` | `var(--control-height)`(44)，改用 `.btn.btn--prominent` | `LoginPage.css:121,124` |
| 标签 | `--font-sm`(14) | `--font-footnote`(13) `--secondary-label` | `LoginPage.css:51` |
| 开关标题 | `--font-sm`(14) | `--font-subhead`(15) | `LoginPage.css:85` |
| 错误 | `--font-sm`(14) | `--font-footnote`(13) `--system-red` | `LoginPage.css:95` |
| 按钮文字 | `--font-callout`(16) `--weight-bold` | `--font-body`(17) `--weight-semibold`（随 `.btn` 基类） | `LoginPage.css:130-131` |

标题 `--font-title1`(28) `--weight-bold` **保留不动**，已符合 Apple 引导页形态。

### P8 — 对话框 / 抽屉 / 气泡菜单 / Toast

**这一阶段风险最高，因为它触碰有文档记载的魔数。**

`shared/ui/dialog-viewport.ts` 定义了一组必须互相同步的常量：

| 常量 | 值 | 含义 |
|---|---|---|
| `SONG_DIALOG_WIDTH_PX` | 440 | 两个歌曲对话框固定宽 |
| `CARD_MARGIN_PX` | 32 | 对话框外边距（= `--space-6`） |
| `ACTION_ROW_PX` | 44 | 动作行高，**必须等于** `.confirm-dialog__btn` 的 `var(--tap-target)` |
| `CARD_CHROME_ABOVE_ACTIONS_PX` | 124 | 动作行以上的固定装饰高度 |
| `CARD_CHROME_PX` | 124 + 44 = 168 | 总固定装饰高 |

同步点：`ConfirmDialog.css:181`、`tokens.css` 的 `--tap-target`、`SongInfoDialog.css:30`、`SongEditDialog.css:39`、`SongInfoDialog.tsx:155`、`SongEditDialog.tsx:263`、`dialog-viewport.ts:132`。`confirm-dialog-overlay.test.ts` 断言全部同步。

**决策**：Apple 的原生 alert 形态（270pt 宽、14pt 圆角、全宽堆叠按钮 + 发丝分隔线、纯文字蓝色按钮）与现有「并排描边按钮」几何完全不同，改造会连带重算 124 与 168。因此拆成两步：

- **P8a（低风险）**：只改配色与字号，几何完全不动。抽屉把手统一为 36×5/2.5px（`MoreTabsSheet.css:60-62` 已是该值，`SheetShell.css:73-74`、`AddToPlaylistSheet.css:56-57` 的 40×4 改过来）；`--glass-fill-strong`→`--material-regular`；`.confirm-dialog__btn--cancel` 的 `--rule`→`--opaque-separator`；`.confirm-dialog__btn--confirm/--submit` 改用 `--system-red-strong`/`--accent`。
- **P8b（高风险，可选，建议单独排期）**：改为 Apple alert 几何（270px 宽、`--radius-alert: 14px`、堆叠按钮）。必须与 `dialog-viewport.ts` 的三个常量、四个 CSS 同步点、`confirm-dialog-overlay.test.ts` 同批改动。**若时间/风险预算不足，P8b 可以不做——P8a 已经把配色对齐 Apple，几何差异是可接受的存量。**

Toast 按 §4.1 C 类改 `--toast-fill`；`ToastHost.css:22` 的 `bottom: calc(safe-area + 150px)` 与 `--nav-inset` 的 148 档接近但独立，需注释说明。抽屉圆角 `--radius-xl`(28) → 新增 `--radius-sheet: 10px`，**标记为需真机视觉复核**（28→10 是明显变化，我无法从本仓库验证 iOS 抽屉圆角的准确值）。

### P9 — 硬编码 px 清零

三个文件**完全没有使用设计令牌**，是最大的一致性漏洞：

| 文件 | 规模 | 说明 |
|---|---|---|
| `features/player/pages/EqualizerPage.css` | 约 24 处硬编码 | 间距/圆角/字号全为字面量，仅顶栏标题用了 `--font-title3` |
| `features/settings/pages/ServerEditPage.css` | 约 13 处 | 零令牌 |
| `features/settings/pages/ServerListPage.css` | 约 12 处 | 零令牌 |

另有零散硬编码：`margin-top: 2px` ×5 处（`SongRow`/`MiniPlayer`/`SheetShell`/`Settings`/`ThemePacksSection` 等）→ `--space-half`；`CacheManagePage.css:93,142` 的 44/48px → `--control-height`；`ProxySettingsPage.css:100` 的 `border-radius: 8px` → `--radius-sm`。

**刻意保留硬编码的**：动画几何（`PlaylistsView.css` eq bars、`SizeLimitSlider` 的 4px 刻度点、`UpgradeSection`/`CacheManagePage` 的 6px 进度条）——这些是绘图参数不是设计令牌，令牌化只会增加间接层。

### P10 — 删除 Muse 别名层

删除 tokens.css 里全部 Muse 兼容别名与 7 个 legacy `--font-*`，新增闸门断言：任何 CSS 文件出现旧名即失败。`tokens-hig.test.ts` 的「legacy 令牌保持原值」测试改为「legacy 令牌不存在」。

**P10 是硬校验点**：只有 P1–P9 全部完成、旧名消费量归零，P10 才能过。它同时是「迁移是否真的完成」的唯一可信证据——不靠人工确认。

## 7. 风险、兼容性与回滚

| 项 | 评估 |
|---|---|
| **无障碍退步** | 已在 §2.3 量化登记：二级文字 5.61 → 3.44。`--accent` 作文字 4.02、`--system-red` 3.55、开关轨道 2.22 均不过 AA。缓解手段是 `.theme-root.increase-contrast`（accent 7.56）。这是用户已知情的决策，会写入 `progress.md` 已知债务。 |
| **主题包兼容** | 保留全量覆盖 ⇒ 无法保证第三方包下的 Apple 合规性（§2.4）。**待验证**：`clients/themes/index.json` 的 3 个包（sha256 锁定 bundle）是否在包体内直接引用令牌名。若是，重命名会破包，需在 P0 加兼容映射；若包只提供 `seedColor` + 少量语义字段，则重命名是内部改动、包不受影响。**这一项必须在 P0 动工前先查明**。 |
| **播放器蒙版 alpha 失效** | §P6 已述：0.94/0.85 是从旧文字色反推的，P0 换色后必须重跑推导，不能沿用。 |
| **对话框魔数** | §P8 已述，故拆 P8a/P8b。 |
| **Lynx 静默丢弃未知属性** | `tokens-hig.test.ts` 的注释记录了这个坑：令牌名写错时 Lynx 静默丢声明、元素继承、无告警。因此每个新令牌都必须进闸门断言，否则拼写错误不可见。 |
| **构建告警当错误看** | `progress.md` 记载构建告警自批19b 起归零。本方案不得引入新的 `Unsupported property … was removed` 告警——尤其 `text-transform`（§P1 已避开）。 |
| **回滚** | P0 回滚 = 还原 `tokens.css` + `theme-pack-mapping.ts` + 4 个测试文件。P1–P9 每阶段回滚 = 还原该屏 CSS/TSX。别名桥接的设计意图正是让每阶段回滚互不牵连。 |
| **性能** | 别名层引入一层 `var()` 间接。`--glass-ramp`/`--shadow-focus` 已在生产用同样形态，无实测退化记录。P10 后间接层消失。 |
| **未验证项** | Apple 语义色精确值未经工具核对（`developer.apple.com` 被网络策略拦截，WebSearch 报提供方错误）。iOS 抽屉/alert 的准确圆角、iOS 26 tab bar 度量同样无法从本仓库验证。全部标记为「实施时需 pin / 需真机复核」。 |

## 8. 验收

每阶段三条，缺一不可（依 `AGENTS.md` §5）：

```
pnpm run build      # 必须同时输出 File (lynx) 与 File (web)；告警当错误看
pnpm exec tsc -b    # 注意：--noEmit 是空跑，不能用
pnpm test           # 约 2208 用例 / 199 文件
```

「构建绿 ≠ 可发布」。P1–P9 每阶段还需在窄屏与宽屏两种布局下、明暗两主题下各看一遍，并至少覆盖 1 个内置主题包。

## 9. 需要用户裁决的待决项

以下不阻塞 P0，但在到达对应阶段前需要拍板：

1. **P8b 是否做**（Apple alert 几何）。不做的代价是对话框按钮排布仍非 Apple 形态；做的代价是触碰 124/168 魔数与 `confirm-dialog-overlay.test.ts`。**建议：先不做**，P8a 已对齐配色。
2. **抽屉圆角 28 → 10** 是否接受（视觉变化明显，且我无法验证 iOS 准确值）。**建议：先改到 `--radius-lg`(20) 作为中间值**，等真机确认后再决定是否继续降到 10。
3. **全屏播放器歌手行改 22px + accent 蓝**（Apple Music 形态）是否接受——这是 P6 里视觉变化最大的一条。
4. **`--accent-2` 是否保留**。P4 若把统计带改成 secondary 背景，它可能失去唯一消费方，届时应删除而非留成死令牌。
5. **阶段顺序**。当前排序按「视觉收益 ÷ 风险」：P1 设置（收益最大）→ P2 列表行（影响面最广）→ P3 导航 → P4 首页 → P5 歌单 → P6 播放器 → P7 登录 → P8a 浮层 → P9 硬编码 → P10 收口。可按需调整，P0 必须最先、P10 必须最后。

---

# P0 实施记录

验收：`pnpm test` 199 文件 / 2187 用例全绿；`pnpm exec tsc -b` 通过；`pnpm run build` 同时输出 `File (lynx)` 与 `File (web)`。

改动 9 个文件（+1469 / −766）：`tokens.css`、`theme-pack-mapping.ts`、`AppSwitch.css`、`ToastHost.css`，以及 `contrast.test.ts`、`tokens-hig.test.ts`、`theme-pack-mapping.test.ts`、`theme-provider.test.tsx`、`glass-surface.test.ts`。

## 与方案的偏差（据实登记）

### 撤销的任务

**P0.7「修 `--on-primary` 悬空引用」——撤销，不是活 bug。** 它在批51 已修；现在只存在于 `tokens-defined.test.ts` 的文档注释与一条回归守卫（`expect(tokens).not.toMatch(/--on-primary:/)`）。方案里这一条源自我误读审计输出（审计的 grep 把测试文件里的反例算成了消费方）。

**P0.8「glass→material 重命名」——移出 P0，单独排期。** 两个理由：
1. 方案 §3.7 提的 `--material-thick`/`--material-regular` **与既有命名轴撞名**——仓库已有 `MaterialVariant`（`ultra-thin`/`thin`/`regular`/`thick`，用户可选的玻璃厚度，见 `material-tokens.ts`）。正确的名字应是 `--material-bar`（导航/mini player）与 `--material-panel`（抽屉/对话框/气泡）。
2. 它是纯重命名，涉及 14 处消费方 + `material-tokens.ts` + 3 个闸门，零视觉变化。混进颜色替换批会让 diff 难审、难二分定位。

### 方案中的两处事实错误

**`--primary-2` 在 CSS 里零消费。** 方案 §4.1 把「首页统计带用 `--primary-2` 填充」列为 C 类，实际 `.home-stats` 用的是 `--paper`，而 `--primary-2` 没有任何消费方且与 `--primary` 同值。处置：**删除**，不做别名，也不引入方案里那个我编造的 `--accent-2`（非 Apple 值）。`PACK_OVERRIDABLE_BASELINE` 同步移除。

**C 类的真实构成比方案预计的少一项、多一项。** 少的是上面的统计带；多的是下面这条。

### 新发现：AppSwitch 滑块会变成绿轨上的纯黑块

`AppSwitch.css` 的滑块原本是 `var(--canvas)`，注释写明理由是「白在浅色、近黑在暗色，这样在灰轨和 accent 轨上都能读」——那是因为 Muse 暗色 accent 是**白色**。改 Apple 后暗色 accent 变 systemGreen、`--canvas` 变纯黑，就成了绿轨上一个纯黑滑块。Apple 的滑块两个主题都是白色，已改为硬编码 `#ffffff`。

同文件另一处：关闭态轨道 `var(--rule)` → `--opaque-separator` 后是 `#c6c6c8`，比 Apple 的 `#e9e9ea` 明显偏重，改用 `--system-gray5`（浅色 `#e5e5ea`）。

这是「`--primary` 原本是墨色通道」连带出的破坏形状，方案的三分类框架抓对了类别、漏了这个实例。

## 两处真实的闸门减弱，已修复而非仅重命名

### `glass-surface.test.ts` 会在整个迁移期失明

`opaqueTokens()` 按 hex/rgba 字面量分类不透明度。别名 `--canvas: var(--system-background)` 两者都不匹配 → 每个别名都被归为「非不透明」→ `opaqueFill()` 认不出 `background-color: var(--canvas)`。而迁移期**绝大多数 CSS 仍在用别名**，等于这个闸门在最需要它的整段时间里完全不起作用。

修复：解析一层别名间接。并且必须区分「有任何字面量声明」与「有不透明字面量声明」——因为 `.increase-contrast` 里有 `--separator: var(--opaque-separator)`，那是另一语境下的覆盖而非基值，天真的别名解析会把半透明的 separator 提升成不透明（实测已复现，会误判红）。

红检：让 `.song-row` painted `var(--canvas)`（历史 bug 的别名形式），两条断言正确变红。

**同时如实登记一处能力缩小**：`--neutral-faint`/`--line` 迁到 Apple 后是**半透明**的（`--tertiary-system-fill`/`--separator`），所以「不透明令牌覆盖材质」这个失败模式对它们不再存在，已从 `SURFACE_CHANNEL` 的不透明检查中豁免。separator 仍留在清单里，因为「用线色当填充」是语义错误，与覆盖无关。

### `contrast.test.ts` 的反貌真性断言停止成立

原有一条故意保持红的检查：`--paper` 铺在 `--canvas` 上必须 < 1.08（锁住当年「选中高亮 painted --paper 结果完全看不见」的缺陷形状，实测 1.04）。Apple 的 `#F2F2F7` on `#FFFFFF` 是 **1.116**，暗色 **1.234**——**该缺陷形状在 Apple 值下不再复现**，那条断言必然失败，而且它该失败。

替换为推导式形状：对每个 wash 求出清过 1.08 的最小 alpha，断言已发值 ≥ 它、**且再低一档必须失败**。按构造非貌真。（先试过「alpha 减半必须跌破」，但暗色 tertiary-fill 减半是 1.090 仍在 1.08 之上，那条断言会是假的，遂弃用。）

**另一条断言变成了空操作**：`--content-2` 与 `--content-muted` 现在都别名到 `--secondary-label`，所以 `.song-row--selected` 那条「把副标题从 muted 抬到 content-2」的 step-up 规则已无实际效果。照留就是在断言一个 no-op。改为钉住「两个别名当前解析到同一令牌」这个事实，等 P2 迁移 SongRow 时它会失败——那正是决定这条规则该保留还是随别名一起删除的时刻。

## 新发现的对比度失败：systemRed 不能配重填充

浅色 `--system-red` 在 `--system-fill`（α 0.20）上 **2.79**、在 `--secondary-system-fill`（α 0.16）上 **2.93**，均低于 3.0。我在写方案时的推导只验了 tertiary/quaternary 两档填充，漏了这两档更重的。暗色不受影响（4.13 / 4.41——半透明灰铺在黑上是提亮，对红色是有利方向）。

两个令牌目前零消费方，但把这两个表面从扫描里删掉换绿是留洞。处置：登记为 `FORBIDDEN` 配对，并附两条强制义务——(1) 每条配对**必须确实失败**，否则说明豁免已过期该删除；(2) 全量 CSS 扫描禁止该配对出现（含 `--danger` 别名形式）。

## 推导出的取值

| 项 | 取值 | 推导 |
|---|---|---|
| 浅色 `--tint-fill` | `rgba(0,122,255,0.10)` | 可行窗口 **α ∈ [0.07, 0.12]**：上界受「systemRed 在 wash 上 ≥3.0」约束，下界受「wash 可见性 ≥1.08」约束。取中段，得可见性 1.138 / systemRed 3.12 |
| 暗色 `--tint-fill` | `rgba(10,132,255,0.18)` | 可见性 1.170（页）/ 1.224（玻璃） |
| 播放器蒙版（浅） | 保持 0.94 / 0.99 | 新下界 **0.930**（原 0.91），绑定于 systemRed 在**黑**封面。**余量从 3 点收窄到 1 点**（3.10 vs 3.0） |
| 播放器蒙版（暗） | 保持 0.85 / 0.92 | 新下界 **0.765**（原 0.83），绑定于 accent 在**白**封面。蒙版底色随 `--system-background` 从 `#0f0f11` 变为纯黑 |
| 玻璃 ramp / sheen | 全部保持原值 | 原推导绑定于「三级墨色 ≥4.5」；新体系下最紧的是 accent 对 3.0 下限（4.42），余量反而变大。已重新推导确认，不重开 |
| `increase-contrast` 浅色 | secondary-label 0.73 / tertiary 0.57 | 分别为过 4.5 / 3.0 在白与 `#f2f2f7` 两个底上的最小 alpha |
| `increase-contrast` 暗色 | 只抬 tertiary 到 0.38 | 暗色 secondary-label 在 0.60 已是 5.27–6.36，不需要动。**且 accent 换 `#409cff` 后白字只有 2.83，`--accent-content` 必须同时翻黑**（7.42） |

## 主题包映射

- 包体**零令牌名**（3 个 sha256 锁定 bundle 全部 grep 确认），只有语义字段。重命名是内部改动，包不受影响。风险已排除。
- 包的两个颜色现在驱动**两组背景**。只映射普通组会让设置类页面在包主题下仍是 Apple 原生灰、与全 App 割裂。这不是扩大覆盖能力——同样两个颜色原本就通过 `--canvas`/`--paper` 到达这些表面。
- 包的 wash alpha 从 0.1/0.14 改为 **0.10/0.18**，与基线一致。此前包比基线高两点，意味着包的 wash 一直比闸门验证过的那个更重。
- `readableTextColorOn()` 返回 `#000000` 而非 `#111111`（Apple 的 `label` 是纯黑）。
- **残余风险照登**：包的 seed 若比 systemBlue 更深，会收紧「systemRed 在 wash 上」的上界，从而**逸出基线验证过的包线**。闸门只覆盖 tokens.css 与内置包，这是 §2.4 那个决策的直接后果。

## 官方色值核对（已完成，并推翻了一批值）

WebFetch 被拦截，改用 `curl` 直取 HIG 的 DocC JSON（`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/color.json`）。

关键发现：**色值以色板 PNG 的形式发布，而每张图的 `alt` 属性就是字面 RGB 三元组**（如 `"alt": "R-30,G-110,B-244"`）。据此抽出 **72 个官方色板值**。同时页面的修订记录里有一条决定性的：**「June 9, 2025 — Updated system color values」**——Apple 改过系统色值，我凭知识写的是**旧值**。

| 令牌 | 我原先写的 | 官方值 | |
|---|---|---|---|
| 浅色 `--accent` | `#007aff` | **`#0088ff`** | 错 |
| 暗色 `--accent` | `#0a84ff` | **`#0091ff`** | 错 |
| 浅色 `--system-red` | `#ff3b30` | **`#ff383c`** | 错 |
| 暗色 `--system-red` | `#ff453a` | **`#ff4245`** | 错 |
| IC 浅色 accent | `#0040dd`（我自己算的） | **`#1e6ef4`** | 错 |
| IC 暗色 accent | `#409cff`（我自己算的） | **`#5cb8ff`** | 错 |
| `--system-red-strong` | `#d70015`（我自己算的） | **`#e9152d`** | 错 |
| `--system-green` 明/暗 | `#34c759` / `#30d158` | 同 | 对 |
| `--system-gray`…`gray6` 明/暗 | 全部 | 全部相同 | 对 |

全部已改为官方值，并补上了官方 **accessible 灰阶**（IC 用，浅色起点更深 `#6c6c70`、暗色起点更浅 `#aeaeb2`）。

**核对边界要说清**：Apple **只**发布 12 个色调色与 6 级灰阶（含 accessible 变体）的数值。label / 背景 / 填充 / separator 四组**没有**官方数值——`DESIGN.md` §3.3 记录了原因（「文档中的颜色值仅供设计参考」）。这几组只能间接佐证：背景层级与已核实的灰阶重合（浅色 `secondarySystemBackground` = `systemGray6` = `#f2f2f7`，暗色 = `#1c1c1e`，暗色 tertiary = `systemGray5` = `#2c2c2e`），这已是它们能达到的最高验证程度。

**一条不可避免的规范偏离**：`DESIGN.md` §3.3 明确「不要在代码中硬编码系统颜色值」，应通过 API 取色。Lynx 没有这样的 API，CSS 自定义属性是唯一通道，硬编码是被迫的。后果就是上面那次静默过期——已在 tokens.css 写明，需在每个大版本 OS 发布后复核。

## 官方值代入后引出的三项修正

**1. 官方蓝更亮，`--accent` 也在重填充上失败。** `#0088ff` 比 `#007aff` 亮，导致浅色 accent 在 `--system-fill` 上跌到 **2.77**、`--secondary-system-fill` 上 **2.91**。与 systemRed 合并为一条规则登记：**最重的两档 Apple 填充是给形状用的，不是给彩色文字当底的**（`--label` 16.5–19.1、`--secondary-label` 3.13–3.31 均不受影响，两档较轻的填充也都过关；暗色全程不受影响）。`FORBIDDEN` 扩到 4 条，CSS 扫描从「仅红色」放宽为「任何彩色文字」。

**2. `--system-red-strong` 从「我造的需求」变成「必须的修正」。** 先查证仓库规则「danger 仅文字、不做彩色背景块」——发现**已被 6 处违反**，其中 4 处是真的白字压红底按钮（另 2 处是进度条填充与状态圆点，无文字，属 UI 图形，正确）。实测：

| | 白字比值 |
|---|---|
| 浅色 既存 `#d64545` | 4.38 |
| 浅色 若用官方 systemRed `#ff383c` | **3.57（比既存更差）** |
| 浅色 用官方 accessible `#e9152d` | **4.56 ✓ AA** |
| 暗色 既存站点 4/6 白字压 `#ff6b6b` | **2.78 ✗（既存的真实失败）** |
| 暗色 用 `#e9152d` | **4.56 ✓ AA** |

即：不做这件事我就是在让浅色从 4.38 退到 3.57。已把那 4 处迁到 `--system-red-strong` + 新增的 `--system-red-strong-content`，两个主题都过 AA。`--system-red-strong` 两主题同值是刻意的——Apple 的暗色 accessible red `#ff6165` **更亮**（它是给暗底当文字用的），白字压上去只有 2.94。

**3. Increase Contrast 是部分缓解，不是完备的。** 官方 accessible 浅色蓝 `#1e6ef4` 在白底 4.57 ✓，但在分组灰底 `#f2f2f7` 上只有 **4.10 ✗**。即使开了这个设置，分组页上的 accent 文字仍不过 AA。label 层级则确实过（浅色 secondary 白底 4.88 / 灰底 4.59）。已在 tokens.css 写明，不美化。

另外修正了两处我先前写反的注释：浅色玻璃角与浅色蒙版的最紧配对都是 **`--accent`**（3.23 / 3.08），不是 systemRed。浅色蒙版余量因此比我上一版记录的更薄——accent 在 3.08 对 3.0 下限，不足十分之一点。

## 未验证事项

- label / 背景 / 填充 / separator 四组无官方数值可核（见上），只能间接佐证。
- 明暗两主题 × 窄宽两布局 × 至少 1 个内置包的真机/模拟器观感未看。
- 构建告警现状：4 组 `-webkit-box-orient`/`-webkit-line-clamp` 告警**为既存**，来自 `PlaylistDetailPage.css`、`SongInfoDialog.css`、`PluginManagerPage.css`、`LyricAdjustPage.css`——均不在本批改动内，且各文件内都有注释说明该属性是刻意使用、会被剥离。`progress.md` 中「构建警告自批19b 起归零」一句已过期，它指的是另一类告警（`placeholder-color`/`text-transform`/`object-fit`）。

---

# P1a 实施记录（设置类页面：分组反转 + 行几何 + 排版）

验收：`pnpm test` 200 文件 / 2193 用例全绿；`pnpm exec tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## P1 被拆成 P1a / P1b

方案 P1 把「29×29 彩色圆角行图标」和背景反转放在同一批。实施时发现两件事使它必须拆开：

1. **调用点是 64 个**（`<SettingsRow>` 48 + `<SwitchRow>` 16，分布在 15 个文件），每处都要判定一个语义色。
2. **图标色不能用 CSS 令牌。** `Icon.tsx` 用 `<svg content>` 标记，注释明确写了它「sits outside the cascade」、读不到 CSS 自定义属性，所以颜色必须在渲染时以 hex 解析（现有 `ICON_COLORS` 就是为此而存在的 Proxy）。彩色图标因此是 TS 侧的色板工作，不是 CSS 改动。

故 **P1b 单独排期**：新增图标 tint 色板 + 64 处赋色。

## 分隔线内缩：为什么行结构要改

Apple 的分组分隔线内缩到**文字起点**——有图标时越过图标，无图标时停在行自身的内缩处。行元素上的 `border-top` 做不到这件事，因为 border 永远是它自己盒子的整宽。

所以行改成 `[icon][content]`，border 挂在 `__content` 上，它的左边缘恰好就是文字起点。**不需要任何 per-row 修饰类，也不需要插入分隔视图**，内缩由结构自然得出。垂直 padding 一并从行移到 `__content`（border 必须落在行边界而不是 padding 内部），行只保留水平内缩——这也正是 `--active` 能画满整行高亮的原因。

### 组合选择器的实测

`.settings-row + .settings-row .settings-row__content` 这个形状在本仓库**零先例**：相邻兄弟与后代选择器各自都在用，组合起来没有。`lynx-check-css-support` skill 只覆盖 CSS **属性**，对选择器无话可说。

改用实测：**移除该规则重新构建，`dist/main.lynx.bundle` 里 `settings-row__content` 从 2 次降到 1 次**——说明编译器确实把它作为独立规则发出，没有丢弃。

**这只证明编码，不证明原生匹配。** 运行时行为仍需真机确认；若 Android/iOS 上分隔线实际不出现，退路是让 `SettingsSection` 插入显式分隔视图，那不需要组合选择器。

## 背景反转为何是 opt-in

16 个渲染 `<SubPageShell>` 的页面里只有 **9 个**含 `SettingsSection` 卡片，另 7 个（Licenses / Theme catalog / Server edit / Duplicate check / Tab config / Plugin manager / Plugin registry）完全没有卡片。在它们上面铺灰底会让内容直接压在分组背景上、没有任何东西被抬起——那不是分组模式，普通页应当留在 `--system-background`。

所以 `SubPageShell` 新增 `grouped` prop（默认 false），设在那 9 个页面上；`SettingsPage` 自有 `.settings` 容器，自己设。

顺带推翻了 `SubPageShell.css` 头注释里的一条既有决定——它把「刻意不设 background-color，因为 .shell 已经是 --canvas」列为「曾经踩过的坑」之一。分组列表需要一个**与 shell 不同**的页面色（卡片正是靠这个反差定义的），所以这条对分组页不再成立。注释已连同新理由一起更新，原结论对 7 个普通页仍然有效。

## 具体改动

| 项 | 现状 → 目标 |
|---|---|
| 页面背景 | `--canvas` → `--system-grouped-background`（9 个子页 + 主页） |
| 卡片背景 | `--paper` → `--secondary-system-grouped-background` |
| 卡片边框 | `1px solid --line` → **删除**（叠在页/卡反差上读作双描边） |
| 卡片圆角 | `--radius-lg` 20px → `--radius-grouped` 10px |
| 行高 | padding 16 四边（单行 ~48px）→ `min-height: var(--tap-target)` + `padding: var(--space-2) 0`（单行 44px，带副标题 57px） |
| 行图标槽 | 仅 `width: 28px` → 29×29 + `--radius-xs`（**着色留给 P1b**） |
| 分隔线 | 行上 `border-top` 全宽通铺 → `__content` 上，自动内缩至文字起点 |
| 选中态 | `--neutral-faint` 中性填充 → `--tint-fill` accent wash（选中本就是强调色语义） |
| 分组标题 | `--font-sm`(14) bold `--content-2` → `--font-footnote`(13) regular `--secondary-label` |
| 行标题 | `--font-callout`(16) → `--font-body`(17) |
| 行副标题 | `--font-sm`(14) → `--font-footnote`(13) |
| 行尾文字 | `--font-sm`(14) → `--font-subhead`(15) |
| 分组头对齐 | `padding: 0 var(--space-1)`(4px) → `0 var(--space-4)`(16px)，与行文字列对齐 |
| 页面标题 | `--font-title1`(28) → `--font-largeTitle`(34) |

**分组标题不做大写**：Apple 经典分组表头是大写，但 Lynx 无 `text-transform`（批19b 因构建告警删过该声明），靠 i18n 文案预大写对中文无意义。13pt 句首大写也是现代 iOS 多处的实际形态。

设置树的令牌迁移已**全量完成**：`--font-sm` 归零（20 处按语义分流到 footnote/subhead/body），颜色 76 处迁到 Apple 名，旧名零残留。另修两处语义错误：`LicensesPage` 用填充令牌 `--neutral-faint` 当分隔线色 → `--separator`；`UpgradeSection` 的 changelog 内嵌块与进度槽用 `--paper`（不透明表面）→ 改用半透明 fill（`--tertiary-system-fill` / `--quaternary-system-fill`），这样在页面、分组卡、玻璃面板上都成立。

## 闸门

新增 `features/settings/__tests__/grouped-list.test.ts`，钉住本批三条**结构性**主张（它们失效时都是静默的）：

- 每个渲染 `.settings-row` 的组件都必须渲染 `__content`——缺了的行自己看起来没问题，却会打断它所在卡片的整串发丝线，而这只在混排卡片里可见，没有单元测试会渲染那种组合
- 分隔线必须挂在 `__content` 上，且裸的相邻兄弟规则不得带 border（拒绝「简化回去」这个最可能的回归）
- 卡片不得有 border；有卡片的子页必须 `grouped`、无卡片的必须没有（双向相等，两类页面都必须存在，否则相等是平凡满足）

变异测试 3/3 全咬。另修 `input-css.test.ts`：它钉住「所有文本框填 `--neutral-faint`」，现在接受 Apple 名与别名两者，并新增一条反貌真性——别名必须仍然解析到 `--tertiary-system-fill`，否则两个不同的填充色都能过关（该条已单独红检）。

---

# P1b 实施记录（设置行图标：彩色色调方块 + 白色字形）

验收：`pnpm test` 200 文件 / 2193 用例全绿；`pnpm exec tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## 为什么字形恒为白色、不需要 TS 色板

P1a 拆分时定的方向是「新增图标 tint 色板」——以为字形颜色也要随色调变，要做 TS 侧的 `ICON_COLORS` 扩展。实施时推翻了它：Apple 的设置行图标是**饱和色调方块 + 白色字形**，字形恒为白，只有方块底色按行变化。方块在 `<view>` 上、走 CSS 级联，所以底色用 `background-color: var(--system-<tint>)` 即可；只有字形（`<svg content>`，级联之外）需要 hex，而它**永远是 `#ffffff`**——不需要读主题、不需要 Proxy、不需要 IC 翻转。

这把 P1b 从「TS 色板 + 64 处赋色」简化成了「6 个 CSS token + 10 个修饰类 + 38 处 `tint=` prop」。字形 `#ffffff` 一行硬编码，没有主题分支。

## 装饰性豁免：为什么色调方块不受 3:1 闸门

Apple 自己的设置图标在浅色下 Green/Orange/Teal 配白字都过不了 WCAG 1.4.11 图形对象 3:1（实测 2.22 / 2.31 / 2.16），暗色 IC 下更是全部色调白字都失败（1.65–2.21）。但 Apple 照发不误——因为**行图标是装饰性的**：每行都有文字标题承载含义，图标本身不传递任何独有信息。1.4.11 对「装饰性图形对象」有明确豁免，所以色调方块/字形对比度不在 `contrast.test.ts` 的闸门里，IC 模式也不重新调这些方块（与 `--system-green` 一致：IC 只提升文字层 label/accent/red，不动装饰方块）。

这条豁免在 `tokens.css` 的色调块注释和 `Settings.css` 的修饰类注释里都写明了，避免日后有人误以为「漏了对比度检查」而补一个会红的断言。

## 色调来源：哪几个值是核验过的，哪几个不是

- `--accent`(systemBlue)、`--system-red`、`--system-green` + 6 级灰阶：在 P0 已对 Apple 官方色板（图片 alt 文本 = RGB 三元组）curl 核验，含 2025-06-09 更新（blue #007aff→#0088ff，red #ff3b30→#ff383c）。
- 本批新增的 6 个色调（orange/yellow/pink/purple/indigo/teal）：**未对 iOS-26 色板重新核验**——HIG 颜色文章的 DocC 数据在写入时取不到（`/tutorials/data/...` 全返回 SPA 壳）。取的是 iOS-13 起稳定的规范值（orange #ff9500/#ff9f0a、teal #30b0c7/#40c8e0 等，community catalog 与 `UIColor` 文档一致）。Apple 的 2025-06-09 发布说明**未**把这几个列为变更项。它们带「下次 OS 发布重核」旗标，与灰阶同等待遇；且只用于装饰性方块，即使有小漂移也无易读性后果。

`tokens-hig.test.ts` 的 PROVENANCE 段已据实改写：把原来笼统的「12 个色调已核验」拆成「blue/red/green 已核验 / 其余 6 个为稳定规范值待 iOS-26 重核」。

## 红色专用于破坏性（danger）

`danger` 行（登出 / 清缓存 / 清无效曲）自动得 `--red` 方块——方块用 `--system-red-strong`（填充优化红，白字过 AA 4.56），不是 `--system-red`（文字优化红）。标题文字仍走 `--system-red`（`.settings-row__title--danger`）。这是 `tokens.css` 既有的「文字红 / 填充红」分裂在行图标上的延续，一处都不矛盾。`danger` 蕴含 `tint: 'red'`，调用点不必另传。

## 色调分配（按功能语义）

| 行 | 图标 | 色调 | 理由 |
|---|---|---|---|
| 外观 | palette | indigo | Apple Appearance 类=靛/紫 |
| 播放 | music | pink | 音乐类=粉（systemRed 留给破坏性，故音乐不用红） |
| 库操作 | search | blue | 搜索=蓝 |
| 插件 | menu | purple | 扩展 |
| 标签页配置 | menu | teal | 区别于插件 |
| 缓存/存储 | settings | green | 存储/清理 |
| 服务器 | link | blue | 网络/连接 |
| 网络代理 | link | indigo | 区别于服务器（同卡不相邻冲突） |
| 数据 | folder | blue | 文件传输 |
| 后台保活 | settings | orange | 系统电源 |
| 诊断 | settings | orange | 诊断=橙（经典 Apple） |
| 关于 | info | gray | 信息/版本 |
| 登出 | logout | red(danger) | 破坏性 |
| 自动恢复 | music | pink | 播放组 |
| 音量标准化 | volume | teal | 音频电平 |
| 歌词组 | music | pink/indigo/orange | 组内粉为主，锁=橙（限制） |
| 导出 | link | blue | 网络/连接 |
| 导入 | folder-open | green | 写入/成功 |
| 缓存统计 | music/menu/settings | blue/gray/gray | 只读统计 |
| 清缓存 ×2 | logout | red(danger) | 破坏性 |
| 导出日志 | menu | orange | 诊断 |
| 服务器条目 | link | blue | 网络 |
| 版本/服务器/Songloft/许可 | info/link/music/info | gray/blue/pink/gray | 信息+品牌 |
| 重复检测 | fingerprint | indigo | 检索/身份 |
| 清无效曲 | stop | red(danger) | 破坏性 |

规则：systemRed 仅破坏性；音乐类=pink；网络/搜索/连接=blue；诊断/电源=orange；存储=green；外观=indigo；插件=purple；信息/版本=gray。同卡内避免相邻同色（服务器=blue 与代理=indigo 之间隔开；缓存统计三行 blue/gray/gray 只读不构成语义重复）。

## 闸门

`tokens-hig.test.ts` 的 `APPLE_COLORS` 表补入 6 个色调（浅/暗各 6 条），「每个 Apple 语义色都以 Apple 值声明」这一条现在也覆盖它们——写错色值或拼错 token 名会立即红。`contrast.test.ts` 不动：色调方块是装饰性背景（无 `color:` 声明），`extractTextColor` 的 `(?<![-\w])color:` lookbehind 不会把 `background-color:` 当文字色，FORBIDDEN 扫描天然跳过。`grouped-list.test.ts` 的结构性断言不受影响（修饰类挂在 `__icon` 上，不碰 `__content`/border/卡片结构）。

编码实测：构建后 `dist/main.lynx.bundle` 里 10 个 `settings-row__icon--<tint>` 各出现 1 次（作为独立规则发出，未被编译器丢弃），6 个新 token 各出现 4 次。这只证明编码，运行时白字落位仍需真机确认。

---

# P2 实施记录（SongRow + 列表行）

验收：`pnpm test` 200 文件 / 2197 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## 分隔线内缩：复用 P1a 的 `__content` 模式

方案 P2 说「分隔线内缩至封面右缘 76px」。行元素上的 `border-bottom` 必然全宽，做不到内缩——和 P1a 设置行分隔线是同一个问题。故复用同一解法：行改成 `[cover][content]`，border 挂在 `__content` 上。`__content` 的左缘恰在 76px（16 padding + 48 封面 + 12 gap），行用 `align-items: stretch` 把 `__content` 拉到全行高，其底边 = 行底边，于是 border 落在行底、从 76px 起跑到右边距。封面靠 `align-self: center` 在 stretch 下保持居中（有确定 cross-size 的项不被拉伸，但会顶对齐，故需显式居中）。

这是 P1a 模式的第二次应用。和 P1a 一样：内缩由结构自然得出，不需要独立分隔视图、不需要 absolute 定位（absolute 会落到 padding-box，与 16px padding 的算式纠缠），不需要 per-row 修饰类。`SongRow.tsx` 加一个 `<view className='song-row__content'>` 包住封面以右的所有子元素；`SongListRow` 传入的 `trailing`（`.song-row__actions`）也落在 `__content` 内，分隔线自然跑到操作区之下。

## 64px 行高与排版

- 行 padding `--space-3`(12) → `--space-2`(8)，8+48+8 = 64（Apple Music 曲目行）。分隔线移到 `__content` 后不再给行高加 1px。
- 标题 `--font-callout`(16) → `--font-body`(17) `--weight-regular`，色 `--content`→`--label`。
- 副标题/时长 `--font-sm`(14) → `--font-footnote`(13)，色 `--content-muted`→`--secondary-label`。
- `margin-top: 2px` → `var(--space-half)`(2px)——值未变，但去掉硬编码像素。
- 封面圆角 `--radius-sm`(8) → `--radius-xs`(6)。
- 封面空态底色 `--neutral-faint` → `--tertiary-system-fill`。

## 选中行 step-up：从「无效」变「真实抬升」

P0 时 `--content-muted` 与 `--content-2` 都别名到 `--secondary-label`，所以 P1a 留下的 step-up 规则（选中行副标题 `--content-muted`→`--content-2`）是**无效**的——抬升前后是同一个 token。`contrast.test.ts` 的旧测试就钉着「这两别名必须相等，所以 step-up 是 no-op」。

P2 把副标题基线迁到 `--secondary-label` 后，二级与主级 `--label` 之间**没有中间级**，所以选中行 step-up 改为抬到 `--label`（全 AA）。这是**真实抬升**（只可能提高对比度，永不降低），也符合 iOS「强调用户正在操作的行」的模式（wash 仍是首要选中信号）。`contrast.test.ts` 那条「step-up 是 no-op」的测试改写为：断言 SongRow 选中行 step-up 落在 `--label`、基线是 `--secondary-label`。`SheetShell.css` 的同名 step-up 仍走旧别名（仍无效），留给它自己的阶段，不动。

## MediaListItem：令牌迁移（分隔线统一推迟）

同批迁移 `MediaListItem.css` 的令牌到 Apple 名：封面圆角 `--radius-xs`、底色 `--tertiary-system-fill`、文字 `--label`/`--secondary-label`、徽标 `--tint-fill`+`--secondary-label`。**一处偏离方案**：方案机械地写「`--font-sm`→`--font-footnote`」，但 MediaListItem 的 `__name` 是**主文本**（歌单/艺人/专辑名），footnote(13) 不是 Apple 推荐的主行字号；改用 `--font-body`(17)，与 SongRow 标题一致，注释里写明了偏离理由。

`PlaylistsView.css` 的 `.playlist-card__chip` 用的是和 `__badge` 同一个「accent wash 上的小字」模式，一并迁到 `--tint-fill`+`--secondary-label`，避免留下方案注释现在指向不明的旧别名。

**分隔线统一推迟**：方案说 MediaListItem「完全没有分隔线（消费页各自加），需统一」。但 MediaListItem 被 6 个消费页用（PlaylistsView / AddToPlaylistSheet / TagGridView / FacetGridView / FolderGridView / FolderContentPage），各页分隔策略不一（有的靠 `list-main-axis-gap`，有的没有），统一需要单独过这 6 个消费页决定内缩策略，未在本批做。记于此，留给后续小批。

## 闸门

- `song-row-css.test.ts` 新增两条：「分隔线在 `__content` 上、不在 `.song-row` 上（拒绝把 border 搬回全宽）」+「行 64px / stretch / 封面 align-self center / 圆角 xs」；再加一条结构断言「SongRow.tsx 必须渲染 `__content` 且封面是其兄弟而非子元素」——缺了 `__content` 的行单看无碍，却会静默丢掉整串发丝线，而没有任何列表测试渲染那种混排卡片。
- `contrast.test.ts`：旧「step-up 是 no-op」测试改写为「选中行 step-up 抬到 `--label`、基线 `--secondary-label`」。
- `tokens-hig.test.ts` / `glass-surface.test.ts` 不动：SongRow 无玻璃、无新 token。

编码实测：`dist/main.lynx.bundle` 里 `song-row__content` 出现 2 次（CSS 规则 + TSX 类名），分隔线落在 `__content` 的 `border-bottom` 上。运行时分隔线内缩落位仍需真机确认。

---

# P3 实施记录（导航：度量令牌化 + 配色迁移）

验收：`pnpm test` 201 文件 / 2201 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## 不改形状，只改度量与配色

方案 P3 的反直觉结论：现有的悬浮胶囊导航（`--radius-pill`、玻璃填充）**不需要**改成 iOS 传统的 49pt 全宽栏。iOS 26 的 Liquid Glass 导航本身就是悬浮胶囊玻璃 tab bar，现状与之同向。AGENTS.md 也把 `--radius-nav` 与胶囊形状列为冻结项。故 P3 只改度量与配色，不碰形状、`--nav-inset`(80/148) 两档、z-index(90/91/100/200-201)、rail 选中态「只改色不改尺寸」。

## 度量令牌化 + 删死令牌

`--mobile-nav-height: 60px` 声明了却**零消费**，且值还是错的（实栏 64）。按方案「删除死令牌或让底栏消费它」二选一，选了删除 + 新增命名令牌：删 `--mobile-nav-height`，新增 `--bottombar-height`(64)、`--nav-pill-height`(52)、`--nav-icon-size`(24)。底栏高度、选中 pill 高度、插件图标尺寸全部从硬编码改为消费令牌。`--radius-nav` 冻结，不动。

## 配色迁移

- 选中 pill 底 `--glass-glow-faint`（装饰性星光蓝）→ `--tint-fill`（强调色 wash）。语义纠正：选中的 tab 是「选中」，和选中行同语义，该用强调色 wash，不是装饰性 glow。激活字形/标签读 `--accent`，在 `--tint-fill` 上过 3:1（浅 3.12 / 暗 4.39，见 tokens.css 的 wash 推导）。
- 未激活 tab 标签 `--content-muted` → `--secondary-label`。tab 标签是必要导航信息，不是装饰，用二级（过 3:1）而非三级。底栏标签字号保留 `--font-2xs`(10)，补 `--weight-medium`——全 App 最小字 + 在玻璃上，加粗换可读性（Apple tab bar 同此）。rail 标签仍 `--font-subhead` regular。
- rail 背景 `--paper` → `--secondary-system-background`；右边框 `--line` → `--separator`；rail 分组头 `--content-muted` → `--secondary-label`；brand 图标圆角 `8px` → `--radius-sm`。

字形色在 TS 侧由 `ICON_COLORS.contentMuted`（别名 `--secondary-label`）注入，未激活字形**本就**是二级——P0 别名层让 TS 侧无需改动即与新语义对齐。

## 闸门

- `glass-surface.test.ts` 的「选中 pill 用 glow」断言**反转**为「用 `--tint-fill`、不用 glow」——这是 P3 的语义反转，旧测试钉的是被推翻的旧决定。
- 新增 `shell-nav-css.test.ts` 4 条：度量三件套消费令牌（bar/pill/plugin-icon）；`--mobile-nav-height` 不得再出现（删死令牌的回归门）；未激活标签是 `--secondary-label` + 底栏标签 medium；rail 表面与分组头迁到 Apple 名。
- `contrast.test.ts` 不动：`--tint-fill` 不在 FORBIDDEN 的重填充扫描名单（那是 `--system-fill`/`--secondary-system-fill`），`--accent` 在 `--tint-fill` 上的配对不在禁止之列。

编码实测：`dist/main.lynx.bundle` 里 `--bottombar-height`/`--nav-pill-height` 各 3 次、`--nav-icon-size` 5 次，`mobile-nav-height` 0 次（死令牌已净除）。运行时 pill wash 落位仍需真机确认。

---

# P4 实施记录（首页：排版 + 统计卡 + 度量令牌化）

验收：`pnpm test` 202 文件 / 2204 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## 普通页，不反转

首页是**普通页**不是分组页：页面 `--system-background`（浅色白），卡片 `--secondary-system-background`（浅色 `#F2F2F7` 灰）。P1 的「反转」只适用于设置类分组页，此处保持白页灰卡，与现状同向。`.shell` 根已是 `--canvas`(=`--system-background`)，故 `.home` 无需自设底色。

## 排版层级上移

- 问候语 `--font-title1`(28) → `--font-largeTitle`(34)。
- 区块标题 `--font-title3`(20) → `--font-title2`(22)。
- 区块动作文字 `--font-sm`(14) → `--font-subhead`(15)。
- 统计主数值 `--font-title1`(28) **保留**——问候语长大了，统计数值没长，页面视觉权重仍由问候语领头，数值读作数字而非标题。
- 统计标签（headline-label / headline-duration）`--font-sm`(14) → `--font-footnote`(13)——它们是次级信息。

## 统计卡：去边框、分组圆角

`.home-stats`：`--paper` + `1px solid --line` + `--radius-lg`(20) → `--secondary-system-background`、**删边框**、`--radius-grouped`(10)。与设置卡同理由：卡靠与页面的反差定义，边框读作双描边。注释里旧文「paper card / hairline edge / --primary / Muse §3.1」一并改为 Apple 名与 DESIGN.md §3.1。统计卡文字 `--content`→`--label`。

方案表里「统计卡填充色 --primary-2 → ...」的 `--primary-2` 是**陈旧引用**——P0 已因「零消费」删除该令牌，HomePage 实际用的是 `--paper`。本批按 `--paper`→`--secondary-system-background` 迁移，与表意图一致。

## 度量令牌化（页内声明，不进全局 tokens.css）

`120px`/`168px`/`60px` 三处硬编码令牌化。**不进 tokens.css**——遵循 `--nav-inset` 的先例（页内几何在页 CSS 声明，非设计系统级常量）：在 `.home` 根声明 `--home-card-size`(120)、`--home-strip-height`(168)、`--home-refresh-header-height`(60)，后代继承消费。`--home-strip-height` 注释特别说明它与 `HomeSection.tsx` 的 `CARD_CHROME_PX`(168) **同值但无关**（一个是 CSS 条带高度，一个是 TS 度量的卡片 chrome 预算），改一个别指望另一个跟。

重试按钮底 `--neutral-faint` → `--tertiary-system-fill`。

## 颜色别名批量迁移

本页所有 `var(--content)`/`--content-2`/`--content-muted`/`--paper`/`--line`/`--neutral-faint`/`--primary`/`--primary-content`/`--danger` 别名一次性 sed 迁到 Apple 名（`--label`/`--secondary-label`/`--secondary-system-background`/`--separator`/`--tertiary-system-fill`/`--accent`/`--accent-content`/`--system-red`）。用 `var(--name)` 精确匹配避免误伤 `--primary` vs `--primary-content`。迁移后零旧别名残留。

## Web 分支约束

`HomePage.tsx` 的 Web 分支刻意不渲染 `<refresh>`（改渲染 `home__scroll-host`），因为该标签在 Web 落为未知元素、头部文案当正文渲染。本批**未触碰**该分流（纯 CSS 改动，`.home__refresh, .home__scroll-host` 共享规则照旧）。

## 闸门

- `home-section-scroll.test.ts`：原本钉「scroll height = `\d`」「cover = `120px`」硬编码值，P4 令牌化后改为断言消费 `--home-strip-height`/`--home-card-size`（同意图：固定高度、120 方封面，只是走了令牌）。
- 新增 `home-css.test.ts` 3 条：Apple 排版层级（largeTitle/title2/subhead + 保留 title1 数值 + footnote 标签）；统计卡去边框 + 分组圆角 + 灰卡面；重试按钮 Apple 填充。
- `contrast.test.ts` 不动：本页无新增文字-填充禁忌配对，统计卡灰底 + `--label` 文字远过 4.5。

编码实测：`dist/main.lynx.bundle` 里 `--home-card-size` 9 次、`--home-strip-height` 3 次、`--home-refresh-header-height` 3 次，均编码发出。

---

# P5 实施记录（歌单列表与详情）

验收：`pnpm test` 203 文件 / 2208 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## 详情页：封面 96→160

`.playlist-detail__cover` 96×96 → 160×160，圆角 `--radius-md`(12) → `--radius-sm`(8)；`.playlist-detail__meta` 高 96→160（跟封面锁死，让两行夹取的描述不会把计数挤出屏）。歌单名 `--font-title3`(20) → `--font-title2`(22)。描述 `--font-sm`(14) → `--font-footnote`(13)，计数同。

**描述两行夹取**：`max-height: 32px` **未变**——夹取盒高由 `line-height`(`--font-callout`=16) 决定，不由 font-size 决定，2×16=32 仍夹两行 13px 文本。方案说「随字号重算」，实测重算结果与原值相同（行高没变），故只改字号、保留 32，注释改写说明这一点。

## 搜索框：Apple 填充、无描边、control-height-sm

`.playlist-detail__search-input` 与 `.playlists__search-input`：高度 40px(后者)/无显式(前者) → `--control-height-sm`(36)；填充 `--neutral-faint` → `--tertiary-system-fill`；`--radius-sm` 保留；**删 hairline**（填充即字段，描边读作双轮廓，与 `.library__search-input` 一致）；字号 `--font-sm` → `--font-body`(17)（Apple 文本框字号）。placeholder `--secondary-label`。

## 卡片与排序行

卡片名 `--font-sm`(14) → `--font-subhead`(15)；卡片封面 104 保留，圆角 `--radius-md` → `--radius-sm`。

**排序行分隔线**：方案写「全宽通铺 → 内缩 16px」，实测**已是 16 内缩**——分隔线挂在 `.playlist-detail__sort-row` / `.playlists__sort-row` 上，二者父级 `__sort-list` 有 `padding: 0 var(--space-4)`(16)，故 border 本就内缩 16 两侧，非全宽。方案的「全宽」描述与代码不符；本批只把色 `--line` → `--separator`，几何不动（对称 16 内缩对排序表是合理的 Apple 形态）。

## 圆形小按钮与 eq 动画几何

按方案**保留**：圆形小按钮 28px + 44px `__*-hit` 包裹（已符合 44px 触达规范）；eq 动画的 16/3/4/8/6/10/12px 硬编码**保留**（动画几何非设计令牌，令牌化无收益）。

## 颜色别名批量迁移 + font-sm 按 §3.6 分流

整个 `features/playlist/` 目录 9 个 CSS 文件一次性 sed 迁移颜色别名（`--content`/`--content-2`/`--content-muted`/`--paper`/`--line`/`--neutral-faint`/`--primary`/`--primary-content`/`--primary-faint`/`--danger` → Apple 名），`var(--name)` 精确匹配。`--primary-faint` 单独迁到 `--tint-fill`（选中行 wash）。

`--font-sm` 共 22 处按角色分流：次要/状态/计数/页脚/空态/加载 → `--font-footnote`(13)；按钮/标签文字 → `--font-subhead`(15)；表单输入/描述正文 → `--font-body`(17)。用 selector-range sed（`/sel {/,/}/` 范围内替换）保证同文件内多角色不串。迁移后 `--font-sm` 在整个 playlist 目录归零。

## 闸门

新增 `playlist-css.test.ts` 4 条：详情封面 160×160+radius-sm、meta 160、name title2、desc/count footnote；两处搜索框 control-height-sm+填充+无描边；卡片名 subhead、卡片封面 104+radius-sm；整个 playlist 目录不得残留 Muse 颜色别名（新文件滑入未迁移即红）。`input-css.test.ts` 不动（已接受 `--tertiary-system-fill`）。

编码实测：`dist/main.lynx.bundle` 双端产物齐备，playlist 目录 CSS 全部 Apple 名。运行时封面 160 落位仍需真机确认。

---

# P6 实施记录（播放器：全屏 + mini）

验收：`pnpm test` 204 文件 / 2214 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## 不动的：蒙版、胶囊玻璃、z-index、内联按钮尺寸

按方案**未触碰**：`--player-scrim-from/to`(0.94 浅 / 0.85 暗)——P0 已重新推导（任意封面最坏情况反推），`contrast.test.ts` 从实际值反推下限、改了就红；mini 胶囊玻璃形态（`--glass-fill`+sheen+ramp+rim）、`bottom: calc(80px + safe-area)`、`z-index: 91`——AGENTS 层级阶梯；`EqualizerPage.css`——P9（整文件零令牌）。

**主播放按钮**：方案写「按钮 48×48 + 字形随之」，实测与代码不符——按钮尺寸由 `player-layout.ts` 按 breakpoint **内联**给（mobile 76 / tablet·desktop 52 / tv 64），字形已 `playBtn * 0.6` 随之（Flutter 的比例推导），「字形随之」已满足，「48×48」不适用于此响应式系统。故只迁字形色 `--primary-content`→`--accent-content`，尺寸仍交内联系统。诚实记录此偏差。

## 全屏播放器

- 封面圆角 `--radius-xl`(28) → `--radius-md`(12)（`.full-player__cover` + `__cover-img`）。
- 曲名 `--font-title1`(28) → `--font-title2`(22) bold。
- 歌手 `--font-callout`(16) `--content-2` → `--font-title2`(22) `--weight-regular` **`--accent`**：Apple Music 形态——歌手是可点链接（跳艺人页），不是暗淡次级文字，故用强调色 + 与曲名同字号、降字重。
- 专辑（顶栏）`--font-sm`(14) → `--font-footnote`(13) `--secondary-label`；eyebrow 字重 `--weight-bold` → `--weight-semibold`。
- 视频徽标/注释的 `8px`/`14px`/`12px` 硬编码令牌化：`8px`→`--space-2`、`14px`→`--font-sm`、`12px`→`--font-caption1`。
- 空态副标题 `--font-sm`→`--font-footnote`，按钮文字 `--font-sm`→`--font-subhead`（按角色）。

## 进度条

- 轨 `--rule` → `--tertiary-system-fill`（4px 高保留）。注意：颜色别名 sed 把 `--rule`→`--opaque-separator`，但方案要 `--tertiary-system-fill`（轨是 on-material 填充，不是不透明分隔线），手动覆盖。
- 滑块 14px 圆保留，色 `--primary-content` → `#FFFFFF`：滑块骑在强调色指示条上，白读作旋钮；强调色旋钮会溶进它骑的指示条。保留 `--shadow-sm`。
- 指示条 `--primary`→`--accent`（sed）。

## mini player

- 标题 `--font-sm`(14) `--weight-semibold` → `--font-subhead`(15) `--weight-regular`。
- 副标题保留 `--font-caption1`(12)，`margin-top 2px`→`--space-half`，色 `--secondary-label`。
- 封面 36 保留，圆角 `--radius-sm`(8) → `--radius-xs`(6)。
- 进度轨 `--fill-faint` → `--quaternary-system-fill`（更暗的 on-material 填充，与全屏轨分层一致）。

## 颜色别名批量迁移（整个 player 目录）

4 个目标文件 + 9 个其他 player widget/page（DlnaPage / LyricAdjustPage / LyricsView / PageDots / PlayerToolBar / PlayHistoryPanel / SheetShell / SleepTimerSheet / VolumeControl）一次性 sed 迁颜色别名。**跳过** PlayerBackdrop（蒙版，0 别名，本就只用 scrim/玻璃令牌）与 EqualizerPage（P9）。迁移后整个 player 目录仅 EqualizerPage 残留别名（P9 处理）。SheetShell 的 step-up 规则随之变真无效（`--content-muted`/`--content-2` 都别名 `--secondary-label`），与 `contrast.test.ts` 注释的「SheetShell step-up 留给后续阶段」一致——不另动。

## 闸门

新增 `player-css.test.ts` 6 条：全屏封面 radius-md、曲名 title2、歌手 title2+regular+accent、专辑 footnote、eyebrow semibold；视频徽标/注释不得残留硬编码 8/14/12px；mode-label caption2+space-half；进度轨 tertiary-system-fill + 滑块 #ffffff + 指示条 accent；mini 标题 subhead+regular + 副标题 space-half + 封面 radius-xs + 轨 quaternary-system-fill；4 文件不得残留 Muse 颜色别名。`contrast.test.ts` 不动（蒙版未碰）。

编码实测：`dist/main.lynx.bundle` 双端产物齐备，player 目录（除 Equalizer/Backdrop）零旧别名。运行时封面圆角/歌手 accent 落位仍需真机确认。

---

# P7 实施记录（登录 / 注册）

验收：`pnpm test` 205 文件 / 2219 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## logo 与 SplashScreen 对齐

`.login__logo` 72×72 / radius 16 → **80×80 / radius 18**，与 `SplashScreen.css` 的 80/18 对齐——品牌标在启动页和登录页同形。18px 是介于 `--radius-lg`(20) 与 `--radius-md`(12) 之间的一次性品牌圆角，仅这两处用，未令牌化（注明未来可提为 `--brand-logo-radius`）。

## 卡片：去边框、分组圆角

`.login__card` `--paper` + `1px solid --line` + `--radius-lg`(20) → `--secondary-system-background`、**删边框**、`--radius-grouped`(10)。与首页/设置卡同理由：卡靠与页面反差定义（登录页 `--system-background`，卡 `--secondary-system-background`，白页灰卡），边框读作双描边。`max-width: 400px` 硬编码 → 令牌 `--login-card-width`(400)，页内声明（遵 `--nav-inset`/`--home-card-size` 先例）。

## 输入框：Apple 控件高、填充、无描边

`.login__input` 44px → `--control-height`(44)；`--neutral-faint` → `--tertiary-system-fill`；**删 hairline**（填充即字段，与 P5 搜索框一致）；字号 `--font-callout`(16) → `--font-body`(17)（Apple 文本框字号，与搜索框一致）。

## 排版按角色分流

标签 `--font-sm`(14) → `--font-footnote`(13) `--secondary-label`；开关标题 `--font-sm` → `--font-subhead`(15)；错误 `--font-sm` → `--font-footnote`(13) `--system-red`；按钮文字 `--font-callout`(16) bold → `--font-body`(17) `--weight-semibold`。标题 `--font-title1`(28) bold **保留不动**（已符合 Apple 引导页形态）。

## 主按钮：保留 .login__button，不切 .btn（方案偏差）

方案说「改用 `.btn.btn--prominent`」。但 `buttons.css` 的 `.btn` 当前**零消费**（注释自述「Consumed by new code」），且 Lynx 中 `<view>` 上设的 `color` 能否被内层 `<text>` 继承未经真机验证——做首个消费点有「按钮文字错色/不可见」的设备风险。故**保留** `.login__button` + `__button-text`，直接套方案目标值（`--control-height`(44) / `--font-body` / `--weight-semibold` / `--accent` / `--accent-content`），结果与 `.btn` 基类一致。同批把 `buttons.css` 的颜色别名迁到 Apple 名（为未来首个真机验证过的 `.btn` 消费点做准备）。诚实记录此偏差——等 `.btn` 有真机验证的消费点再统一。

## 颜色别名迁移

`buttons.css` + `LoginPage.css` 一次性 sed 迁颜色别名（`--primary`→`--accent` 等），`var(--name)` 精确匹配。两文件零旧别名残留。

## 闸门

新增 `login-css.test.ts` 5 条：logo 80/18（对齐 SplashScreen）；卡片 max-width 令牌 + 分组圆角 + 无 border + 灰卡面；输入框 control-height + 填充 + 无 border + body 字号；排版按角色（label footnote / toggle-title subhead / error footnote+system-red / title 保留 title1 / 按钮 control-height+body+semibold）；零 Muse 别名残留。`input-css.test.ts` 不动（已接受 `--tertiary-system-fill`）。

编码实测：`dist/main.lynx.bundle` 双端产物齐备，LoginPage.css 零旧别名。

---

# P8 实施记录（对话框 / 抽屉 / 气泡菜单 / Toast + 全仓别名扫荡）

验收：`pnpm test` 206 文件 / 2223 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## P8a（低风险）：配色 + 字号，几何不动；P8b 推迟

按方案拆分，**只做 P8a**（配色/字号/把手几何，不碰对话框魔数 124/168/440）。**P8b**（Apple alert 几何：270px 宽、堆叠按钮、`--radius-alert`）推迟——它要重算 124 与 168、动 `dialog-viewport.ts` 三个常量 + 四个 CSS 同步点 + `confirm-dialog-overlay.test.ts`，风险高，且 P8a 已把配色对齐 Apple，几何差异是可接受存量。魔数同步由 `confirm-dialog-overlay.test.ts` 继续钉住（未动）。

## 抽屉把手统一

三处把手统一为 36×5 / radius 2.5px：`MoreTabsSheet.css` 本就是该值；`SheetShell.css` `.drawer__handle` 40×4/radius-pill → 36×5/2.5；`AddToPlaylistSheet.css` `.atp__handle` 40×4/2 → 36×5/2.5。

## 抽屉圆角：新增 --radius-sheet: 10px

新增 `--radius-sheet: 10px`（tokens.css），把所有底部 sheet/抽屉顶角从 `--radius-xl`(28) 改到 `--radius-sheet`(10)：SheetShell、PlaylistDescPanel、SongCoverPicker、AddToPlaylistSheet、ManageTagsSheet、PlayHistoryPanel、MoreTabsSheet、GlobalMenu。**标记需真机视觉复核**——28→10 是明显变化，本仓库无法验证 iOS 抽屉圆角准确值。`--radius-xl: 28px` 声明保留（`tokens-hig.test.ts` 钉住、未来可复用），只是零消费。

## 确认按钮配色（sed 自然结果）

`--cancel` 边框 `--rule`→`--opaque-separator`；`--confirm`（破坏性描边红）`--danger`→`--system-red`（文字优化红——confirm 是描边文字按钮，P8a 不动几何，故用 `--system-red` 而非 `--system-red-strong`；后者是**填充**破坏性控件的白字底红，confirm 保持「红字不红块」与 DESIGN.md 既有 rationale 一致，也合 Apple alert「红字非红块」）；`--submit`（肯定填充）`--primary`→`--accent`、`--primary-content`→`--accent-content`。这些都是 sed 的自然结果（值保持，仅换名），不改几何。

**方案偏差记录**：方案写 confirm 用 `--system-red-strong`，但 confirm 是描边**文字**按钮（P8a 不动几何），`--system-red`（文字优化红）才语义正确；`--system-red-strong` 留给填充破坏性控件（白字底红，如选择工具栏的删除按钮）。若 P8b 改成填充按钮再换 `--system-red-strong`。

## 跳过：--glass-fill-strong → --material-regular

方案 P8a 列了这条，但 glass→material 重命名在 P0 已决定**推迟到单独阶段**（`--material-regular`/`--material-thick` 与既有 `MaterialVariant` 厚度轴撞名，见 tokens.css 注释）。`--material-regular` 当前不存在，故跳过此子项，glass 令牌保留原名。

## Toast 底部 150px 注释

`ToastHost.css` 的 `bottom: calc(safe-area + 150px)` 加注释说明它与 `--nav-inset` 的 148 档**同值但独立推导**（toast 避让底部 chrome，nav inset 预留滚动尾，两个预算不联动）。

## 全仓颜色别名扫荡（本批主体）

P1–P7 各迁了各自 feature，但 library / library-ops / jsplugin / routes / 共享 dialog-sheet-menu 仍有别名。本批对**全部 78 个 CSS 文件**（排除 `EqualizerPage`=P9、`PlayerBackdrop`=蒙版）一次性 sed 迁移颜色别名（`--content*`/`--paper`/`--line`/`--neutral-faint`/`--primary*`/`--danger`/`--rule`/`--fill-faint` → Apple 名），`var(--name)` 精确匹配。迁移后**全仓仅 `EqualizerPage` 与 `PlayerBackdrop` 残留别名**（前者 P9 整文件、后者蒙版保护）。

**`--rule`→`--opaque-separator` 的副作用修复**：sed 值保持，但 `--rule` 曾被当**填充**用于滑轨/进度轨/分页点（应是 on-material 填充，不是分隔线）。手动把这些改回 `--tertiary-system-fill`（与 P6 的 ProgressBar 轨同 precedent）：`SizeLimitSlider` 轨、`VolumeControl` 轨、`LyricAdjustPage` 轨、`LibraryOpsPage` 进度轨、`PageDots` 点。分隔线（`library-rail__divider`、`library-switcher__divider`）与抽屉把手保留 `--opaque-separator`（结构条，语义正确）。

## 闸门

新增 `sheet-dialog-css.test.ts` 4 条：三处把手 36×5/2.5；无 sheet 残用 `--radius-xl`；滑轨/进度轨/分页点用 `--tertiary-system-fill`（非 `--opaque-separator`）；**全仓除 EqualizerPage/PlayerBackdrop 外零 Muse 颜色别名**（新文件滑入未迁移即红）。`confirm-dialog-overlay.test.ts` 的按钮断言更新 `--primary`→`--accent`/`--accent-content`（钉旧别名的那条）；`app-switch-css.test.ts` 的 checkbox 断言同批更新。`input-css.test.ts` 不动。

编码实测：`dist/main.lynx.bundle` 双端产物齐备，全仓（除 Equalizer/Backdrop）零旧别名。

---

# P9 实施记录（硬编码 px 清零）

验收：`pnpm test` 207 文件 / 2228 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备。告警仍为既存那 4 组。

## 三个零令牌文件迁令牌

**EqualizerPage.css**（约 24 处硬编码）：chrome（间距/圆角/字号/颜色）全部令牌化——toggle-row `12px 16px`→`--space-3 --space-4`、radius `12px`→`--radius-md`、toggle-label `16px`→`--font-body`、chip `16px` radius→`--radius-pill`、chip-text `13px`→`--font-footnote`、band-gain `11px`→`--font-caption2`、band-freq `10px`→`--font-2xs`、reset `14px`→`--font-subhead` 等。颜色别名（15 处，P8 推迟）一并迁到 Apple 名。**band 图形几何刻意保留硬编码**：track 6px、thumb 16×16/8px、indicator 3px、bands 高 200px、band 内 6px gap、gain min-width 28px——这些是 EQ 图的绘图参数（与 PlaylistsView 的 eq bars、SizeLimitSlider 刻度点、进度条同归类），令牌化只增间接层。

**ServerEditPage.css / ServerListPage.css**（约 13/12 处）：间距/圆角/字号令牌化（card radius `12px`→`--radius-md`、label `14px`→`--font-footnote`、input/save `15px`→`--font-subhead`、empty `16px`→`--font-body`/`14px`→`--font-footnote`、各种 16/12/8/4px→`--space-*`、48px empty padding→`--space-10`）。颜色别名 P8 已迁。

## 散落硬编码清零

`margin-top: 2px` 全仓 sed → `var(--space-half)`（实际比方案「×5」多，共 8 处：ThemePacksSection/ThemeCatalogPage/DuplicateCheckPage×3/RegistryManageDialog/PluginRegistryPage×2/SheetShell/DlnaPage）。`gap: 2px`/`padding: 2px` 中属 eq/绘图几何的（`.playlist-card__eq-bars`）保留，其余未在方案明确列出、多为结构边框（`border: 2px`）或绘图，本批不动。

CacheManagePage 输入 `44px`/保存 `48px` → `var(--control-height)`（48→44，方案明确）；ProxySettingsPage 保存按钮 `border-radius: 8px` → `var(--radius-sm)`。

## 闸门

新增 `src/__tests__/px-cleanup.test.ts` 5 条：三文件 chrome 令牌化（抽查 toggle-row/card/label/empty）；EqualizerPage band 绘图几何**保留**硬编码（thumb 16px/track 6px/bands 200px，防误令牌化）；三文件零 Muse 颜色别名（含 `--canvas`）；**全仓无 `margin-top: 2px`**（margin-top 是布局间距、非绘图，2px 必是漏迁）；CacheManage 控件高 + ProxySettings radius 令牌化。

编码实测：`dist/main.lynx.bundle` 双端产物齐备。EqualizerPage 现在用 Apple 令牌（不再「仅顶栏标题」）。

---

# P10 实施记录（删除 Muse 颜色别名层）

验收：`pnpm test` 208 文件 / 2229 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备，**bundle 内 `var(--<alias>)` 零消费**。告警仍为既存那 4 组。

## 颜色别名层删除（完成）

先补扫漏网的 `--canvas`（15 处，P8 扫荡未含 `--canvas`）→ `--system-background`。确认 `--paper-clear`/`--danger-content`/`--danger-2` 零消费后，从 tokens.css 的 `.theme-dark` 与 `.theme-light` 块删除全部 16 个 Muse 颜色别名声明（`--canvas`/`--paper`/`--paper-clear`/`--content`/`--content-2`/`--content-muted`/`--primary`/`--primary-content`/`--primary-faint`/`--danger`/`--danger-content`/`--danger-2`/`--neutral-faint`/`--line`/`--rule`/`--fill-faint`）。基础主题块现在全是字面量（hex/rgba），无 `var()` 间接。

`theme-pack-mapping.ts`：`--paper-clear` 从 `PACK_OVERRIDABLE_BASELINE`（浅/暗）与运行时生成移除（0 消费，pack 也不再发出）。`hexToRgba` 保留（仍被 `--tint-fill`/`--glass-glow-faint`/`--glass-sheen` 用）。tokens.css 头注释的「alias bridge」段改写为「deleted in P10」。

## 闸门（硬校验点）

- `tokens-hig.test.ts`：原 `MUSE_ALIASES`（断言别名列存在且解析正确）**改写**为 `DELETED_MUSE_ALIASES`——断言 16 个旧名在任一主题块都**不**再声明，且基础主题块**无任何 `var()` 间接**（catch 新造别名，哪怕它指向正确 token）。
- 新增 `alias-elimination.test.ts`：**任何 CSS 文件不得 `var(--<deleted-alias>)`**（Lynx 静默丢未知引用，故这层必须显式钉）；另钉 `--primary-2`（P0 删除、从未别名）不得重现。这是 P10 的硬校验点——只有 P1–P9 把消费量归零，它才过；它过 = 迁移真的完成。
- 连带更新一批钉旧别名的既有测试：`contrast.test.ts`（移除 `--paper-clear` surface、`CHROMATIC` 去 `--primary`/`--danger`、surface 下限 13→12）、`glass-surface.test.ts`（`SURFACE_CHANNEL`/`TRANSLUCENT`/opaque-list/translucent-list 去别名、不透明下限 8→7）、`input-css.test.ts`（`FIELD_FILLS` 去别名、删「同色」反真测试）、`theme-pack-mapping.test.ts`（sakura/dark 测试去 `--paper-clear` 期望）、`tokens-defined.test.ts`（`--primary-content`→`--accent-content`）。

## legacy --font-* 暂不删（推迟）

方案 P10 说「删 7 个 legacy `--font-*`」，但实测 `--font-sm` 仍有 **104 处消费**（library / library-ops / jsplugin / routes 等屏从未被分到 P1–P9 任一阶段，它们的 `--font-sm` 未按 §3.6 分流），`--font-xs`(1)/`--font-md`(4)/`--font-lg`(3)/`--font-2xl`(1) 亦然。P10 的硬前提是「旧名消费量归零」——legacy 字体未归零，故**不能删**。`--font-2xs`(5 消费) 按 AGENTS 冻结保留。

故 P10 删了**颜色别名**（完成、零消费），**legacy 字体保留声明**（仍 load-bearing）。legacy 字体的退休需要一个独立的「font-role 扫荡」（把 104 处 `--font-sm` 按角色迁 footnote/subhead/body），记于此作为后续工作。`tokens-hig.test.ts` 的「legacy --font-* 保持原值」测试**不动**（这些令牌仍在、仍需钉值）。

## 诚实状态

颜色别名层已彻底移除（tokens.css 不声明、CSS 不消费、bundle 不含、pack 不发）。legacy `--font-*` 是唯一残留的 Muse 遗产——它们是字号令牌不是颜色别名，且仍被 113 处消费，删除会破。等 font-role 扫荡把它们迁到 Apple `--font-footnote/subhead/body` 后，再删 legacy 声明 + 钉「不得重现」。

---

# Docker Chrome 真机验证记录（2026-09-04）

用 `browserless/chrome`（HeadlessChrome/121，host 网络，CDP 3002/3100）经 `@lynx-js/web-core` 加载 **真实 web bundle**（`dist/web/main.web.bundle`，`web/serve.mjs` 起在 3010），CDP `Target.createTarget`+`attachToTarget` 开页，`Runtime.evaluate` 读 `getComputedStyle`。**非 Vitest 模拟——是 Chrome 实际渲染的解析值。**

## 1. 令牌解析（浅色，app 实加载）— 全部解析正确，无静默丢弃

| 令牌 | 实测值 | 期 |
|---|---|---|
| `--system-orange` | `#ff9500` | P1b 浅 |
| `--system-teal` | `#30b0c7` | P1b 浅 |
| `--system-pink` | `#ff2d55` | P1b 浅 |
| `--system-purple` | `#af52de` | P1b 浅 |
| `--system-indigo` | `#5856d6` | P1b 浅 |
| `--system-yellow` | `#ffcc00` | P1b 浅 |
| `--radius-sheet` | `10px` | P8a |
| `--bottombar-height` | `64px` | P3 |
| `--nav-pill-height` | `52px` | P3 |
| `--nav-icon-size` | `24px` | P3 |
| `--control-height` | `44px` | — |
| `--accent` | `#0088ff` | iOS-26 蓝 |
| `--tint-fill` | `rgba(0,136,255,.1)` | 浅 |
| `--label` / `--secondary-label` | `#000` / `rgba(60,60,67,.6)` | 浅 |

**P10 删除的别名在运行时解析为空**（`--canvas`/`--content`/`--primary` getComputedStyle 全 `""`）——别名桥在 Chrome 实渲染层面也确实没了，非仅测试层面。

## 2. 暗色令牌（class flip theme-dark）— 6 色调 + label 正确翻暗

`--system-orange`→`#ff9f0a`、`--system-teal`→`#40c8e0`、`--system-pink`→`#ff375f`、`--system-purple`→`#bf5af2`、`--system-indigo`→`#5e5ce6`、`--system-yellow`→`#ffd60a`、`--label`→`#fff`、`--secondary-label`→`rgba(235,235,245,.6)`。**6 个新色调在暗色也解析正确**——P1b 的核心风险（新令牌被 Lynx 静默丢）在真机证实安全。

`--accent`/`--system-background` 在 class flip 后仍显浅色值，**不是迁移 bug**：`ThemeProvider` 把基线包的这几个令牌作为 **inline style** 写在 `.theme-root` 上（实测 `style="--accent:#0088ff;--system-background:#ffffff;--secondary-system-background:#f2f2f7;--glass-*:…"`），inline 优先级高于 class。切 app 主题（设置开关）会重写 inline 为暗基线（`--accent:#0091ff`/`--system-background:#000`）；这些暗值由 `tokens-hig.test.ts` 钉住。6 色调**不**在 inline 基线集里（固定系统色、非包驱动），故 class flip 即正确翻暗——正好证明它们没被丢。

## 3. IC 模式（class flip increase-contrast）— override 生效

浅色 IC：`--secondary-label` alpha `.6`→`.73`（`.increase-contrast` 块 override 生效）✓。

## 4. 登录页（P7）computed style — 全部正确

| 元素 | 实测 | 期望 |
|---|---|---|
| `.login__card` | bg `rgb(242,242,247)`（= #f2f2f7）、radius `10px`、border `0`、width `400px` | secondary-system-background + radius-grouped + 无边框 + login-card-width |
| `.login__logo` | radius `18px`、width `80px` | 80/18（对齐 SplashScreen）|
| `.login__input` | bg `rgba(118,118,128,.12)`、height `44px`、border `0`、font `17px`、radius `8px` | tertiary-system-fill + control-height + 无边框 + body + radius-sm |
| `.login__button` | bg `rgb(0,136,255)`、height `44px`、radius `999px` | accent + control-height + pill |
| `.login__button-text` | color `#fff`、font `17px`、weight `600` | accent-content + body + semibold |

截图：浅色登录页已存 `/tmp/lynx-login-light.png`（390×844 @2x，86KB）。

## 5. 未在真机覆盖的（诚实）

设置行色调方块（P1b）、SongRow 内缩分隔线（P2）、播放器歌手 accent（P6）在登录页之后，需后端/鉴权才能到达。它们共享**已验证的令牌系统**（6 色调 + accent + 半透明填充在 Chrome 实解析正确），其 CSS 规则由各阶段 CSS-scan 闸门钉、且编码进 bundle。要进一步真机覆盖这些屏，需起 songloft 后端 + 测试账号登录后导航——留作后续。

---

# Font-role 扫荡（删 legacy --font-*，只留 --font-2xs）

验收：`pnpm test` 208 文件 / 2230 用例全绿；`tsc -b` 通过；`pnpm run build` 双端产物齐备，bundle 内 legacy 字体消费归零。

## 迁移

113 处 legacy `--font-*` 消费按角色迁到 Apple HIG 文本样式（§3.6）：

- `--font-xs`(12) → `--font-caption1`(12)：1 处（nav-item__label 基础/rail）。
- `--font-md`(16) → `--font-callout`(16)：4 处（routes/pages.css 的 page__subtitle/pill__text/luna-button__text/btn--danger__text）——值同、仅换名。
- `--font-lg`(20，作 line-height) → `--font-title3`(20)：3 处（more-tabs__title/__item-label、confirm-dialog__message 的 line-height）——值同。
- `--font-2xl`(36) → `--font-largeTitle`(34)：1 处（page__title，36→34 微缩）。
- `--font-sm`(14) → 按角色 104 处：
  - **subhead(15)**：按钮/动作标签（save/retry/cancel/btn/action/install/reinstall/update/overwrite/page/clean-all/recheck/delete/chips-clear/play-all/nudge/reset/tab/add/create-btn/save-btn-text、switch-title 等末段）。
  - **body(17)**：文本输入（*__input）+ 主标题/名（*__title/__name/__card-title/__song-title/__section-title/__row-title/__row-name/__device-name/__now-song/__line-text 等）。
  - **footnote(13)**：其余（state/hint/error/footer/label/value/count/meta/intro/empty/phase/speed/translation/toast/chip-text/video-badge-text 等）。
  - 1 处误判修正：`home__empty-subtitle` 末段「subtitle」被 `/title$/` 命中成 body，实为副标题 → 改 footnote。

`--font-2xs`(10) 按 AGENTS 冻结**保留**（底栏 tab 标签 + 4 字 CJK 插件名 capsule）。

实现：Node 脚本按「最近选择器 + 末段 `__` 角色启发式」分类，逐行替换并打印每条改动供审阅；`var(--name)` 精确匹配不误伤 `--font-2xs`/`--font-caption1` 等。

## 删声明 + 闸门

tokens.css 删 `--font-xs/sm/md/lg/xl/2xl` 声明（保留 `--font-2xs`，注释改写说明它是唯一保留的 legacy 字号）。

闸门：
- `tokens-hig.test.ts`：原「legacy --font-* 保持原值」改为「`--font-2xs` 保留冻结 + 其余 6 个不得再声明」。
- `alias-elimination.test.ts` 新增：**任何 CSS 不得 `var(--<deleted-font>)`**（`--font-xs/sm/md/lg/xl/2xl`）——Lynx 静默丢未知引用，故必须显式钉。
- 连带修 `player-css.test.ts`：video-badge-text 断言 `--font-sm`→`--font-footnote`。

## 诚实状态（整体收尾）

颜色别名层 + legacy 字体（除 `--font-2xs`）已**全部从 tokens.css 删除、CSS 零消费、bundle 零引用**。Muse 遗产只剩 `--font-2xs`（AGENTS 冻结、有正当理由）。Apple 设计系统迁移主体完成。font-role 分类是按选择器角色**启发式**，107 处 `--font-sm` 的角色判断可能有少数边角误判（如某 `__name` 该 subhead 却 body），需真机视觉复核——但都是 ±2px 的小级差，不破功能。


---

# P11 — 实机前收尾五项 + Docker Chrome 截图审计（2026-09）

P10 之后、真机体验之前的一轮收尾。目标：把「编码绿」尽量推进到「可发布」，并用 Docker Chrome（browserless/chrome + @lynx-js/web-core 加载 dist/web/main.web.bundle）做真机级截图/计算样式核验。

## 五项收尾

1. **motion 裸值收敛**：UI 一次性过渡（AppSwitch/ConfirmDialog/ToastHost/FullPlayer）裸 ms/ease 全改 `var(--duration-*)`/`var(--ease-*)`，reduce-motion 类才真正管得到。两个装饰循环（eq-bounce 错峰 / indeterminate 线性）刻意保留 bespoke 并注释。新增 `motion-tokens-consumer.test.ts` 消费侧 gate（扫裸值、白名单仅两个循环文件）。
2. **DuplicateCheckPage 硬编码收尾**：最后 3 处裸 `font-size`（13→footnote、11→caption2）+ badge 4px/2px6px 收进 token，**全仓排版 100% token 化**；5 个全宽按钮补 `min-height: var(--tap-target)`。
3. **44pt 触控审计**：`scripts/tap-gap-diag.mjs` 列出 203 个无 height 的 tappable，分类后补 11 个孤立居中主操作按钮的 `min-height: var(--tap-target)`；列表行/卡片（内容撑高）、密集 chip/行内图标/返回键（Apple Music 式刻意紧凑）不强撑。
4. **6 tint iOS-26 复核**：联网确认现值即 Apple UIColor 运行时值、2025-06 修订只动 blue/red、iOS-26 未列这六者；Apple 不公布动态系统色精确 hex。provenance 注释改「已复核」，保留「下次 OS 发版复核」flag（runtime-only，Lynx 无 API）。
5. **ConfirmDialog alert 几何**：title/message 居中、两按钮等宽配对（flex:1+gap，双按钮 alert 平衡感）；保留玻璃 pill 按钮语言（与 PromptDialog/sheet/popover 一致、iOS-26 本即玻璃 pill），刻意不改经典全幅 hairline。

## 登录页白边修复

`.login` 原把 `.page` padding 清零 → 灰卡满宽贴边 + content 高垂直居中 → 上下各 ~102px 露白（漂浮灰板）。按用户选择改**全屏白底无卡**：`.login` 恢复水平 padding，`.login__card` 去灰底/圆角/自身 padding 只留宽度约束列，字段（自带 tertiary-fill）直接落 system-background 白页。CDP 核验 card bg 现 transparent。

## 宽屏侧栏 iPad 化（用户反馈「不像 iPad 风格」）

- 选中态全圆角 **pill(999)→圆角矩形 `--radius-grouped`(10px)**（iPadOS 侧栏是圆角矩形，pill 是 iOS tab-bar 语言）。
- 项间距 8px→4px（iPad 选中矩形近乎相接）。
- 选中填充按用户选「灰底圆角矩形+accent 文字」：淡 accent wash→`--system-gray5`（#e5e5ea 浅/#2c2c2e 深），图标+文字走 accent。注：accent 在 gray5 上对比 2.8，与 Apple Music iPad 侧栏（红字/同款灰，亦 ~2.8）一致，属 Apple 值原样落地的既有取舍。品牌块（Songloft）按用户要求保留。

## Docker Chrome 登录打通（可复现）

web-core 登录表单输入是零尺寸 `X-INPUT` 外壳，其 shadow root 内才有真 `<input>`。绕过法：`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inp,'admin')` + 派发原生 `InputEvent('input')`（Lynx onInput 监听原生 input 事件）→ 勾协议 → 登录成功。注意：token 存 **worker 域 IndexedDB**，主线程 IDB 注入到不了（`/tmp` 下 `scripts/cdp-*.mjs` 为可复用驱动）。

## 截图审计结论（计算样式核对）

本环境无视觉判读能力，审计=DOM/计算样式对 HIG 数值。实测：
- **Home（窄）**：greeting largeTitle 34/700、分区标题 title2、tab 标签 10、统计卡灰底圆角10/16 边距、文本色 label/secondaryLabel、页底 system-background —— **数值合规**。
- **设置主页**：页底 #f2f2f7（grouped）、白卡圆角10/16 inset、行高 44、行标题 17/body、副标题 13/footnote、图标 12-tint tile 29×29 圆角6、大标题 34/700 —— **合规**。
- **设置子页（外观）**：同一白卡/圆角10/16 inset 分组范式 + 返回键 —— **合规**。
- **宽屏侧栏**：改后圆角矩形灰底选中 —— **已修**。

截图存档：`/tmp/{home-narrow,home-wide,home-wide-v2,settings-main,sub-settings-appearance}.png`。

## 需真机视觉复核（剩余）

- 各屏「观感」级 Apple 符合度（数值已过，但像素级观感需人眼）。
- font-role 启发式的 ±2px 边角、6 tint 下次 OS 发版复值、装饰循环 reduce-motion 隐藏（host 通道未接）。


## P12 — 用户截图反馈二轮:设置圆角 + 外观页全面 iOS 化（2026-09）

用户真机截图反馈两处不合规,均对照 iOS 26 修复:

1. **设置分组卡圆角**:用户指出不够 iOS。iOS 26 Liquid Glass 圆角统一 24pt(iPhone),分组卡较 iOS 13–17 的 ~10pt 明显更圆。`--radius-grouped` 10→16(朝 iOS-26 步进,不取玻璃胶囊满 24;精确 pt 仅真机可证)。侧栏选中态(~40px 高矩形)从 `--radius-grouped` 解耦为 `--radius-md`(12),避免跟随卡圆角上探回胶囊感。影响:设置卡、Home 统计卡、侧栏选中态。

2. **外观页全面 iOS 化**(用户选"全面"):原 4 组清一色勾选文字行并非 iOS 范式,改为各自的 iOS 官方控件——
   - **主题** → `ThemeAppearancePicker` 预览块(系统=半浅半深/浅色/深色 3 张迷你预览卡,选中 accent 描边+勾),仿「显示与亮度」。预览色为 Apple 明暗字面值硬编码(预览须固定呈现目标外观,不能用活动 token)。
   - **材质** → `SegmentedControl` 分段控件(4 段,选中浅色胶囊浮起+阴影),下方显示所选描述。分段项 `min-height: var(--tap-target)`(HIG §12.2,a11y gate 强制 44)。
   - **字号** → `FontScaleSlider` A—A 滑块(复用 `lynx-ui-slider`,4 档刻度,左小A右大A),仿「文字大小」。
   - **语言** → 保留勾选列表(本就是 iOS 范式)。
   i18n 复用既有 key;外观页测试改断言新控件(勾选 icon 从 4→1);a11y gate 复绿。


## P13 — iOS 勾选列表选中态 + Icon accent 迁移遗漏修正（2026-09）

用户真机发现:勾选列表选中项带背景色块,而 iOS 选中项**只有对勾**。
- `SettingsRow`:`selected` 且 `trailingIcon='check'`(选项勾选)不再加 `--active` 背景;导航选中(设置主列表,`chevron`)保留高亮——iOS master-detail 选中行本就有背景。对勾色从灰(`contentMuted`)改 accent(`activeAccentIconColor()` 注入,`<svg content>` 在 CSS 级联外)。
- **迁移遗漏修正**:`Icon.tsx` 的 `PALETTES.primary` 在 P0–P10 未被更新,仍是 Muse 墨色(#111/#fff,引用的 `--primary` 已于 P10 删除),导致 `activeAccentIconColor()` 回退墨色——激活导航图标是墨色而 label 是蓝色(本就不一致),~30 处用 `ICON_COLORS.primary` 的强调/选中图标(对勾/加号/收藏/刷新/选中态)全是墨色而非 accent。改 `primary`→Apple systemBlue(浅 #0088ff/深 #0091ff)、`primaryContent`→双白(对齐 `--accent-content`)。
- **次要遗留同轮一并校完**(用户要求改完整):`content`→`--label`(浅#000/深#fff)、`content2`→`--system-gray` #8e8e93、`contentMuted`→`--system-gray2`(浅#aeaeb2/深#636366)、`danger`→`--system-red`(浅#ff383c/深#ff4245)。至此 Icon.tsx 六色全部对齐 Apple,文件内无 Muse 残留。对比:次级#8e8e93≈3.3(图形3.0底线达标);弱化灰为 tertiary 级非承重,与 tertiary-label 同级豁免。
- CDP 真机核验:语言选中行背景透明、对勾 #0088ff、宽屏设置导航行高亮保留。全量 2231 测试通过。
