# Liquid Glass 主题（Lynx）— 修订版

> **已归档（2026-09-15）**：本文的方案（7 个 `--glass-*` token + 映射 + 伪玻璃）已交付，且其后被玻璃材质优化六批大幅扩展（13 个玻璃 token、`BackdropBlur.tsx`、iOS 原生 Liquid Glass 材质）—— **本文只记录了起点，不是现状**。现状见 [`../../project/progress.md`](../../project/progress.md) 与 [`../../../DESIGN.md`](../../../DESIGN.md)。

> ## 修订（2026-09-03，玻璃材质优化批A）
>
> **本文第 1 节「Lynx 无 `backdrop-filter`，做不出真折射玻璃」这句只对了一半。** CSS 属性层面确实没有；但 `<blur-view>` 是一等**元素**（`@lynx-js/types` 的 `BlurViewProps`，`IntrinsicElements` 已注册），Web/iOS/Android 三平台的实现都已逐一查证（Harmony 存疑），Web 侧已在 Docker Chrome 实测到真 `backdrop-filter: blur(20px)`——但**Web 需要宿主页给标签做别名**才接得上（`blur-view` 不在 web-core 的标签映射表里，实现却注册在 `x-blur-view` 名下；批A 首次交付时漏了这步，Web 上整批静默无效）。证据表与那次教训见 `docs/architecture/lynx-constraints.md` §四。
>
> 这**不推翻本文的伪玻璃方案**：玻璃面板 alpha 0.72–0.85，真模糊只能透出 15–28%，看不出来。真正值得模糊的是 `--backdrop` 弹层 scrim（dark 0.55 / light 0.35，透出 45–65%），批A 因此先做了 10 个 scrim 挂载点（`src/shared/ui/BackdropBlur.tsx`）。四档材质本身仍是伪玻璃。
>
> **批A-fix2 补正了这一段的两处**：(a) 那 10 个挂载点**并不覆盖全部 scrim**——有 6 个弹窗手写自己的 `DialogBackdrop` 只复用 `ConfirmDialog` 的样式表，批A 漏了，现已补齐（连带把闸门清单从「按 CSS 规则」改成「按用法」建，见 `progress.md`）。(b) 「面板透出 15–28% 看不出来」这个判断对**有 scrim 的**模态成立，对**没有 scrim 的** popover 不成立——0.72 直接压在清晰页面上，28% 是全应用最糟的表面。这类表面改走**面板模式**（模糊层作为面板首个子节点 + `z-index: -1`），另外两处同理：底部导航胶囊、mini-player 胶囊。**批A-fix3 又补了第四处**：`.global-menu__panel`（歌曲行 `⋯` 菜单）是全应用最后一个仍是不透明 `--paper` 的浮层，批C 和 fix2 都没带上它。
>
> 也**不给任何 alpha 松绑**：blur 是线性滤波，均匀背景是它的不动点，而所有对比度闸门的最坏情况都是从均匀极值推出来的——模糊换不到 alpha 余量，只抹掉 WCAG 不建模的高频细节。批A 因此没动一个令牌。
>
> 另注：`blur-effect` / `glass-style` / `glass-tint-color` / `ios-user-interface-style` **仅 @iOS**，`blur-sampling` 仅 @Android，只有 `blur-radius` 是三平台的。iOS 26 的 `'glass'`/`'glass-container'` 材质刻意没用——它会替换掉本文这套材质，且发生在本仓库唯一无法验证的平台上。

> ## 修订（2026-09-03，玻璃材质优化批C）
>
> 第 1 节的 7 token 表里两行的值已变，另加了 6 个 token：
>
> - `--glass-highlight` → light `0.60` / dark `0.30`（见 `standard-materials.md` 的同日修订，四档材质整列上调）。
> - `--glass-sheen` → light `0.10` / dark `0.04`（**下调**）。原值 0.18/0.10 是按「没有消费者」定的——
>   本计划第 3 节写的 sheen 渐变最终只落地了 `--glass-highlight` 那条 `inset`，彩色分量一直悬空。
>   批C 给它接上真实消费者 `--glass-sheen-layer` 后，它开始躺在文字底下，alpha 就成了对比度预算的一部分。
> - 新增 `--glass-rim-side` / `--glass-ramp-top` / `--glass-ramp-bottom`（按主题分叉，非包驱动），
>   以及 `.theme-root` 里三个组合层 `--glass-rim-sides` / `--glass-ramp` / `--glass-sheen-layer`。
>
> 第 3 节「上下双色近似渐变描边」的近似不再需要：`background-image` 可以叠多层逗号分隔的
> `linear-gradient`（与 `background-color` 共存），`box-shadow` 也接受 5 层含左右 `inset`——
> 都在本批用无头 Chrome 走通 lynx-css 管线实测过（零 CSS 告警），所以边缘现在是真的四边分色
> （亮顶 / 中侧 / 暗底）＋ 一条真的垂直明暗坡。

> ## 修订（2026-09-01，需求对齐后）
>
> 原方案「`--glass-glow` 复用 seedColor」导致装包后玻璃色 = 按钮色（同色），「双通道」名不副实。用户决策改为**玻璃色独立字段**，并要求 **Flutter 端也做液态玻璃**（另起计划）。修订要点：
>
> - **后端 schema 加独立 `glassColor`**（per-brightness，`ThemePackColors.GlassColor`，可选、`#RRGGBB` 校验）。seedColor 仍驱动按钮 `--primary` 家族；glassColor 独立驱动 `--glass-glow`/`--glass-glow-faint`/`--glass-sheen`。现有包无 glassColor 仍校验通过。
> - **Lynx 映射改读 `glassColor`**：`themePackToStyleVars()` 仅在 `colors.glassColor` 有效时派生三 token；**不再从 seedColor 派生**。无 glassColor 时回落基线星蓝（`PACK_OVERRIDABLE_BASELINE` 的 `--glass-glow` 等，即 tokens.css 默认）→ 真·双通道（玻璃恒独立于按钮）。
> - **songloft-themes 新增配套包 `liquid-glass`**，带 `glassColor` 字段；更新 `index.json`（sha256）+ README。
> - **Flutter 液态玻璃**：本次不做实现，另起计划（参考 Beans-Music 的 iOS 26 `.glassEffect` / SwiftUI）。本次 Lynx 工作不迁移到 Flutter——玻璃渲染各客户端各自实现，跨端共享的只有 `.songloft-theme` JSON 包。
> - 闸门与文档随映射重做同步更新（sakura 无 glassColor → 玻璃回落星蓝，断言相应改）。
>
> 仓库映射：后端 `songloft-org/songloft`（`/home/ejoydev/work/mimusic`，Go）· Lynx 客户端 `songloft-org/songloft-player-lynx`（`.../songloft-player-lynx`）· 主题包 `songloft-org/songloft-themes`（`/home/ejoydev/work/songloft-themes`）。

## Context

给 Songloft Player (Lynx) 加 Liquid Glass 主题，参考 `Beans-Music/`（iOS 26 原生 `.glassEffect`）。

> **参考仓库**：Beans-Music — https://github.com/XIaodou0416/Beans-Music （纯 SwiftUI，MIT）。本仓库内本地只读副本：`Beans-Music/`（未纳入 git，`?? Beans-Music/`）。关键源码：`Beans/Theme.swift`（主题/配色）、`Beans/Components.swift`（`BeansGlass`/`GlassCard`/`GlassBackdrop`）、`Beans/RootView.swift`（液态玻璃 TabBar）、`Beans/MiniPlayerView.swift`（三层玻璃胶囊）、`Beans/CoverBlurBackground.swift`（预模糊封面背景）。Beans 玻璃 100% 建立在实时背景采样上，而 Lynx **无 `backdrop-filter`**，做不出真折射玻璃。但 `filter: blur()`（已在 `<image>` 上用）与 `linear-gradient`（已在 view 上用）可用，故做一套**诚实伪造玻璃**。

用户决定：**默认常开**（无开关，升级现有浮动表面）+ **全部浮动表面**（nav 胶囊/mini-player/popover/dialog/sheet；**toast 不玻璃化**，保留实心 `--primary` 主操作语义）+ **配彩色 seedColor**（玻璃装饰彩色，按钮保持 `--primary` 墨黑/包色——双通道，符合 Muse 单色按钮语言）。

复审发现的漏洞与对策（已纳入）：
1. `box-shadow: inset`/多重 shadow/`filter:blur` 作用于 view/`radial-gradient` 均**全库零使用、未验证** → 实现首步先 spike（Step 0），主方案用 `inset`，失败退回已验证的 overlay 子 view。
2. nav 胶囊/mini-player alpha 过低（0.72）在无 backdrop 模糊下可读性倒退 → 提到 **0.85**。
3. 全局 z-89 色斑层会盖在插件 iframe(z-50) 与所有内容上染色 → **取消全局色斑层**，彩色改由每表面 sheen 渐变承载。
4. toast 玻璃化削弱主操作语义 → **不玻璃化**。

---

## Step 0（闸控 spike，实现首步）

在一个 throwaway 表面（临时挂在 ShellLayout）上验证：
- `box-shadow: inset 0 1px 0 <color>` 是否渲染顶边高光；
- `box-shadow: var(--shadow-md), inset 0 1px 0 <color>` 多值是否同时生效；
- （可选）`filter: blur()` 作用于带色 view。

跑 `pnpm run build:web` + 浏览器 devtools 看；有 native 环境再截图。**inset 可用 → 走 A 方案（纯 CSS，无 TSX 结构改动）；不可用 → 走 B 方案（overlay 子 view，已验证原语）。** spike 产物在正式实现时删除。

---

## 1. 新增 token — `src/shared/theme/tokens.css`

在 `.theme-root.theme-dark`/`.theme-light` 各加 7 个（颜色按主题分叉）：

| Token | light | dark | 用途 | 包驱动？ |
|---|---|---|---|---|
| `--glass-fill` | `rgba(255,255,255,0.85)` | `rgba(23,23,27,0.85)` | nav 胶囊/mini-player（浮在内容上，alpha 高保可读） | 否（固定质感） |
| `--glass-fill-strong` | `rgba(255,255,255,0.72)` | `rgba(23,23,27,0.72)` | popover/dialog/sheet（盖在 scrim 上，可更透） | 否 |
| `--glass-border` | `rgba(255,255,255,0.45)` | `rgba(255,255,255,0.16)` | 玻璃描边 | 否 |
| `--glass-highlight` | `rgba(255,255,255,0.22)` | `rgba(255,255,255,0.08)` | sheen 的白色分量 | 否 |
| `--glass-glow` | `#3BAEEF` | `#5BC0F5` | 玻璃个性色（星蓝），sheen 着色 | **是**（seedColor） |
| `--glass-glow-faint` | `rgba(59,174,239,0.10)` | `rgba(91,192,245,0.14)` | 选中胶囊淡底 | **是**（seedColor, 0.10/0.14） |
| `--glass-sheen` | `rgba(59,174,239,0.18)` | `rgba(91,192,245,0.10)` | sheen 渐变的彩色分量 | **是**（seedColor, 0.18/0.10） |

> `--canvas` 必须在块中早于 `--glass-*` 声明（contrast.test.ts 解析 glass-fill 时叠 canvas，需 `out['canvas']` 已就绪——canvas 已在块首，满足）。

## 2. 主题包映射扩展 — `src/shared/theme/theme-pack-mapping.ts`

**后端 schema 不改**，复用 `seedColor`。`PACK_OVERRIDABLE_BASELINE.light/dark` 加全部 7 个 `--glass-*` 键（baseline 值=第 1 节）。`themePackToStyleVars()` 在 seedColor 有效分支加：
```
vars['--glass-glow'] = seedColor
vars['--glass-glow-faint'] = hexToRgba(seedColor, resolved==='light'?0.10:0.14)
vars['--glass-sheen'] = hexToRgba(seedColor, resolved==='light'?0.18:0.10)
```
其余 4 个玻璃质感 token 恒返回 baseline。键集恒定 + baseline-mirror 闸门自洽（`--glass-*` 始终发射 + 与 tokens.css 一致）。可选加 sakura `--glass-glow` 断言。

## 3. 玻璃表面模式

### A 方案（inset 可用，首选，纯 CSS）

```css
.surface {
  background-color: var(--glass-fill);            /* 或 --glass-fill-strong */
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-…);                  /* 各表面原值 */
  box-shadow: var(--shadow-md),
    inset 0 1px 0 var(--glass-highlight),
    inset 0 -1px 0 var(--line);
}
```
- 顶 `inset 0 1px 0 var(--glass-highlight)` = 镜面高光；底 `inset 0 -1px 0 var(--line)` = 暗边 → 上下双色近似渐变描边。
- **无 TSX 结构改动**，仅 CSS。

### B 方案（inset 不可用，退回，已验证原语）

每表面加一个绝对定位 sheen 子 view + 把内容提为 `position:relative`（CSS-only，layout-neutral，不包 wrapper）：

TSX：表面首个子加 `<view class="surface__sheen" />`。
CSS：
```css
.surface { position: relative; /* 已 fixed/absolute 则已是定位祖先 */ }
.surface__sheen {
  position: absolute; top:0; left:0; right:0; bottom:0;
  border-radius: inherit; pointer-events: none;
  background-image: linear-gradient(to bottom right,
    var(--glass-sheen), var(--glass-highlight) 50%, transparent);
}
/* 把表面现有可见子元素提为定位，使其在 sheen 之上（tree order: sheen 在前） */
.surface > .surface__content-children { position: relative; }
```
> 提升内容子为 `position: relative`（无 offset，layout-neutral）使它们进入 step-3 定位层，按 tree order 画在 sheen 之上；未提升的 in-flow 子会落在 sheen 之下。故每表面需把其可见子选择器加 `position: relative`。比 A 多一处 TSX + 一条 CSS，但全用已验证原语。

### 彩色个性

无论 A/B，sheen 渐变都用 `--glass-sheen`（彩色）+ `--glass-highlight`（白），赋予玻璃彩色个性（默认星蓝，装包随 seedColor）。**无全局色斑层。**

## 4. 表面改造清单

模式=第 3 节。`background-color` 由 `--paper-clear`/`--paper` 换 `--glass-fill`/`--glass-fill-strong`；border 换 `--glass-border`；box-shadow 加 sheen（A）或加 sheen 子 view（B）。

| 文件 | 选择器 | 备注 |
|---|---|---|
| `src/shared/layouts/ShellLayout.css` | `.shell__bottombar` | `--paper-clear`→`--glass-fill`；选中 `.nav-item--active .nav-item__pill` 的 `background-color` 由 `--primary-faint` 改 `--glass-glow-faint` |
| `src/features/player/widgets/MiniPlayer.css` | `.mini-player`（narrow+wide） | `--paper`/`--paper-clear`→`--glass-fill` |
| `src/shared/ui/PopoverMenu.css` | `.popover-menu`、`.popover-panel` | `--paper`→`--glass-fill-strong` |
| `src/shared/ui/ConfirmDialog.css` | `.confirm-dialog` | `--paper`→`--glass-fill-strong`；新增 `box-shadow: var(--shadow-lg)+sheen` |
| sheet/panel（逐文件）：`src/features/player/widgets/SheetShell.css`（`.drawer__panel`，共享壳，优先改 + grep 确认消费点）、`PlayHistoryPanel.css`、`AddToPlaylistSheet.css`、`PlaylistDescPanel.css`、`SongCoverPicker.css`、`SleepTimerSheet.css`、`src/shared/nav/MoreTabsSheet.css`、`src/features/library/widgets/ManageTagsSheet.css`、`SongInfoDialog.css`、`SongEditDialog.css`、`src/features/jsplugin/widgets/RegistryManageDialog.css`、`PluginUpdateDialog.css`、`PluginBatchUpdateDialog.css` | 各自 panel/dialog 表面 | `--paper`→`--glass-fill-strong`；模式一致 |

> **toast 不改**（保留 `--primary` 实心）。宽屏侧栏 `.shell__rail` 不改（结构栏非浮层）。PromptDialog 表面复用 ConfirmDialog.css，无需单独改。

## 5. 闸门与测试

- **`tokens-defined.test.ts`**：新 token 声明+消费即过；确认每个 `var(--glass-*)` 有声明。
- **`contrast.test.ts`**：把 `--glass-fill`/`--glass-fill-strong` 加入 `surfaces` 数组；修 `parseTheme`：`if (key==='paper-clear' || key.startsWith('glass-fill'))` 叠 canvas（现对非 paper-clear rgba 叠黑底，对浅色玻璃算错）。加后验两 glass-fill 叠 canvas 后 content/content-2/content-muted 过 AA（0.85/0.72 白叠白 canvas 易过）。
- **`theme-pack-mapping.test.ts`**：第 2 节扩展后自洽，无需改断言。
- **CSS 结构闸门**（`popover-menu-css.test.ts`/`confirm-dialog-overlay.test.ts`/`bottom-sheet-height.test.ts` 等）：逐一过读确认改 background/border/shadow 不撞其 position/z-index/inset 断言。
- **新增** `src/shared/ui/__tests__/glass-surface.test.tsx`（B 方案时）：断言 sheen 子 view 存在、`pointer-events:none`、内容子 `position:relative`。A 方案则加 CSS 闸门断言 `.shell__bottombar` 含 `inset` box-shadow。

## 6. 文档

- **`DESIGN.md`**：新增「Liquid Glass 表面」小节——7 个 `--glass-*` token、A/B 模式、彩色 sheen 个性（`--glass-glow` 默认星蓝/装包随 seedColor）、与 Muse 单色按钮语言的关系（按钮 `--primary`，玻璃装饰 `--glass-glow` 双通道）、Lynx 无 backdrop-filter 的诚实限制、为何无全局色斑层（插件染色风险）。更新「弹出层」「导航栏」段落。
- **`AGENTS.md` §4**：更新「`--paper-clear` 模拟毛玻璃」→ 现浮动表面用 `--glass-fill`+sheen；补 `box-shadow: inset`/`filter:blur 作用于 view` 的 spike 核实结果。

## 7. 不在本期范围

- 全屏播放器 scrim（`--player-scrim-*`）不改（alpha 算出来的，降它红闸门）。
- 页面级 `--canvas` 不改透明。
- `--glass-glow` 不进后端 schema。
- 全局氛围色斑层（取消，改 sheen 承载彩色）。

## 8. 验证

1. Step 0 spike 结果决定 A/B。
2. `pnpm exec tsc -b`。
3. `pnpm test`（重点 contrast/tokens-defined/theme-pack-mapping/popover-menu-css/confirm-dialog-overlay/bottom-sheet-height）。
4. `pnpm run build`（须有 lynx+web 两产物）。
5. `pnpm run build:web` + 浏览器：sheen 可见、玻璃半透+描边、翻页文字可读。
6. 真机/模拟器深/浅色 × 有/无 sakura 包四态；装包验 `--glass-glow` 变粉。

## 关键文件

- token：`src/shared/theme/tokens.css`
- 映射：`src/shared/theme/theme-pack-mapping.ts`
- Provider：`src/shared/theme/ThemeProvider.tsx`（无需改）
- shell：`src/shared/layouts/ShellLayout.tsx`+`.css`
- 表面 CSS：见第 4 节
- 闸门：`src/shared/theme/__tests__/contrast.test.ts`、`tokens-defined.test.ts`、`theme-pack-mapping.test.ts`
- 文档：`DESIGN.md`、`AGENTS.md`
