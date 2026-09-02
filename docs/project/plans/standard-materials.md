# 计划：标准材质（Standard Materials）系统

> 状态：待实施
> 日期：2026-09-02

## 背景

当前 Liquid Glass 实现只有两档透明度（`--glass-fill` 0.85 alpha 和 `--glass-fill-strong` 0.72 alpha），视觉效果不够好。Apple HIG 定义了四种标准材质（ultra-thin / thin / regular / thick），不同透明度对应不同场景。本次实施：

1. 新增四种标准材质变体的完整 token 集
2. 新增 `material-model.ts` 偏好模块（与 `theme-model.ts` 同构）
3. 在 `ThemeProvider` 中根据当前材质选择注入对应 token
4. 在外观设置页新增「材质」选择 section
5. 更新 i18n、闸门测试
6. 默认 regular 材质（与当前值完全一致，零视觉变化）

## 四种材质的 Token 值设计

根据 Apple HIG 对标准材质的定义（从最透到最不透）。每格两个值：light / dark。

| 材质 | 场景 | `--glass-fill` | `--glass-fill-strong` | `--glass-border` | `--glass-highlight` |
|---|---|---|---|---|---|
| ultra-thin | 高度透明，底层内容优先 | 0.55 / 0.50 | 0.45 / 0.40 | 0.55 / 0.20 | 0.28 / 0.10 |
| thin | 稍不透明，部分遮挡 | 0.70 / 0.65 | 0.58 / 0.55 | 0.50 / 0.18 | 0.25 / 0.09 |
| regular | 默认平衡（= 当前值） | 0.85 / 0.85 | 0.72 / 0.72 | 0.45 / 0.16 | 0.22 / 0.08 |
| thick | 最不透明，最佳文字对比 | 0.92 / 0.92 | 0.85 / 0.82 | 0.40 / 0.14 | 0.18 / 0.06 |

> `--glass-fill` 用于直接浮在内容上方的表面（导航胶囊、mini 播放器）。
> `--glass-fill-strong` 用于有遮罩（scrim）的表面（弹出菜单、对话框、底部面板）。
> `regular` 的值必须与 `tokens.css` / `PACK_OVERRIDABLE_BASELINE` 中的当前值**逐字一致**。

## 实施步骤

### 步骤 1：新建 `src/shared/theme/material-model.ts`

与 `theme-model.ts` 完全同构的偏好模块：

- `MaterialVariant` 类型: `'ultra-thin' | 'thin' | 'regular' | 'thick'`
- `MATERIAL_VARIANT_OPTIONS` 常量数组
- `PREF_MATERIAL` = `'glass_material'`
- `coerceMaterialVariant(raw)` — 非法值回退 `'regular'`
- `getMaterialVariant()` / `subscribeMaterialVariant()` / `changeMaterialVariant()` — module-scoped state + listener Set + `SongloftStorage.prefs` 持久化
- `readSavedMaterial()` / `applySavedMaterial()` — 启动时读取

复用模式：完全照搬 `theme-model.ts` 的 `current` + `listeners` + `setLive` + `tryReadPref` + `subscribe` 结构。

### 步骤 2：新建 `src/shared/theme/material-tokens.ts`

纯数据模块，导出材质变体 → light/dark → 四个 glass texture token 的映射表。

```ts
import type { MaterialVariant } from './material-model.js'

interface GlassTextureTokens {
  '--glass-fill': string
  '--glass-fill-strong': string
  '--glass-border': string
  '--glass-highlight': string
}

export const MATERIAL_TOKENS: Record<
  MaterialVariant,
  Record<'light' | 'dark', GlassTextureTokens>
> = { /* 上表数据 */ }
```

### 步骤 3：修改 `src/shared/theme/theme-pack-mapping.ts`

在 `themePackToStyleVars()` 末尾注入材质 token：

```ts
import { getMaterialVariant } from './material-model.js'
import { MATERIAL_TOKENS } from './material-tokens.js'

// --- 在 themePackToStyleVars 函数 return vars 之前 ---
const material = getMaterialVariant()
const mt = MATERIAL_TOKENS[material][resolved]
vars['--glass-fill'] = mt['--glass-fill']
vars['--glass-fill-strong'] = mt['--glass-fill-strong']
vars['--glass-border'] = mt['--glass-border']
vars['--glass-highlight'] = mt['--glass-highlight']
```

这样材质选择覆盖了 PACK_OVERRIDABLE_BASELINE 和 pack 的值（pack 目前不覆盖 glass texture——它们是 baseline-only，但如果将来打开这个口子，材质仍优先）。

`PACK_OVERRIDABLE_BASELINE` 不变——它始终是 regular 的值，是对账闸门的锚点。

> **测试隔离注意**：`themePackToStyleVars()` 现在读取模块级 `getMaterialVariant()`。任何直接调用该函数的测试（如 `theme-pack-mapping.test.ts`）都依赖材质模块的当前值。材质模块初始值为 `'regular'`（= baseline），所以现有断言不受影响。但若某测试先 `changeMaterialVariant('thin')` 再调 `themePackToStyleVars`，断言会拿到 thin 的玻璃值——此类测试必须在 `afterEach` 里把材质重置回 `'regular'`，避免污染其他用例。

### 步骤 4：修改 `src/shared/theme/ThemeProvider.tsx`

- 导入 `getMaterialVariant` / `subscribeMaterialVariant`
- 新增一个 `useState` + `useEffect` 订阅材质变化（trigger re-render）

```tsx
const [, setMaterial] = useState(() => getMaterialVariant())
useEffect(
  () => subscribeMaterialVariant(() => setMaterial(getMaterialVariant())),
  [],
)
```

`themePackToStyleVars` 内部通过 `getMaterialVariant()` 读取当前材质（每次 render 都调），所以 re-render 就足够让新材质 token 生效。不需要把 material 作为参数传入。

### 步骤 5：修改 `src/features/settings/pages/AppearancePage.tsx`

在 Theme section 和 ThemePacksSection 之间新增材质选择 section，与 theme/language 选择器完全同构：

```tsx
<SettingsSection title={t('settings.materialSection')} icon="grid">
  {MATERIAL_VARIANT_OPTIONS.map((option) => (
    <SettingsRow
      key={option}
      title={t(materialLabelKey(option))}
      subtitle={t(materialDescKey(option))}
      selected={option === material}
      trailingIcon={option === material ? 'check' : undefined}
      onTap={() => selectMaterial(option)}
      testId={`material-${option}`}
    />
  ))}
</SettingsSection>
```

state 管理用 `useState` + `useEffect`（读已保存值） + `changeMaterialVariant()`，与 theme/language 完全同型。

> **图标**：`layers` 不在图标注册表（62 个）中。**直接使用已有的 `grid` 图标**（已确认存在），避免新增图标的额外工作量。

### 步骤 6：修改 `src/i18n/resources.ts`

en 和 zh 各新增 **9** 个键：

| 键 | en | zh |
|---|---|---|
| `settings.materialSection` | Material | 材质 |
| `settings.materialUltraThin` | Ultra Thin | 超薄 |
| `settings.materialThin` | Thin | 薄 |
| `settings.materialRegular` | Regular | 常规 |
| `settings.materialThick` | Thick | 厚 |
| `settings.materialUltraThinDesc` | Most transparent, content shows through | 最透明，底层内容透出最多 |
| `settings.materialThinDesc` | Slightly translucent | 略半透明 |
| `settings.materialRegularDesc` | Balanced opacity (default) | 平衡透明度（默认） |
| `settings.materialThickDesc` | Most opaque, best text contrast | 最不透明，文字对比度最高 |

同时更新 `settings.categoryAppearanceSubtitle`：
- en: `'Theme, material, theme packs & language'`
- zh: `'主题、材质、主题包与语言'`

### 步骤 7：修改 `src/index.tsx`

在异步启动链中、`await applySavedTheme()` **之后**、`readDefaultPlayMode()` **之前**调用 `applySavedMaterial()`：

```ts
// index.tsx 异步启动链（已有顺序）
initSystemAppearance()
await applySavedLanguage()
await applySavedTheme()
await applySavedMaterial()    // ← 新增，紧跟主题之后
const savedMode = await readDefaultPlayMode()
// ...
```

> 位置理由：材质 token 通过 `themePackToStyleVars()` 注入，该函数需要已解析的主题（light/dark）来选对应变体。放在 `applySavedTheme()` 之后保证首帧主题正确；放在主题包加载之前是因为材质是本地偏好，不依赖鉴权。

### 步骤 4 补充：ThemeProvider 样式计算注意事项

`ThemeProvider` 的 `style` 对象必须**每次 render 重新计算**（调用 `themePackToStyleVars()`），不能用 `useMemo` 缓存——否则材质变化触发的 re-render 会拿到旧的样式对象。当前实现若已用 `useMemo`，需确认依赖数组包含材质状态，或改为每次 render 直接调用。

### 步骤 8：更新测试

**新建 `src/shared/theme/__tests__/material-model.test.ts`**：
- `coerceMaterialVariant` 合法/非法值
- read/write 循环（注入 memory storage）
- 默认值 = `'regular'`

**新建 `src/shared/theme/__tests__/material-tokens.test.ts`**：
- `MATERIAL_TOKENS.regular.light` 的四个值 === `PACK_OVERRIDABLE_BASELINE.light` 中的对应值
- `MATERIAL_TOKENS.regular.dark` 同理
- 所有变体的 alpha 值递增验证（ultra-thin < thin < regular < thick）

**修改 `src/shared/theme/__tests__/contrast.test.ts`**：
- 新增：对 ultra-thin 和 thin 变体，验证 glass-fill 叠加到 canvas 后与 `--content` 的对比度 ≥ 3:1（大文字 AA 标准）

**`glass-surface.test.ts`** — 不改。验证的是 CSS 中的 token 引用名（`var(--glass-fill)` 等），名字不变。

**`theme-pack-mapping.test.ts`** — 材质模块 init 值为 `'regular'`，所以现有断言不受影响。

## 关键文件清单

| 操作 | 文件 |
|---|---|
| 新建 | `src/shared/theme/material-model.ts` |
| 新建 | `src/shared/theme/material-tokens.ts` |
| 新建 | `src/shared/theme/__tests__/material-model.test.ts` |
| 新建 | `src/shared/theme/__tests__/material-tokens.test.ts` |
| 修改 | `src/shared/theme/theme-pack-mapping.ts` |
| 修改 | `src/shared/theme/ThemeProvider.tsx` |
| 修改 | `src/features/settings/pages/AppearancePage.tsx` |
| 修改 | `src/i18n/resources.ts` |
| 修改 | `src/index.tsx` |
| 修改 | `src/shared/theme/__tests__/contrast.test.ts` |

## 不改的文件

- `tokens.css` — regular 值作为 CSS 首帧默认，运行时由 ThemeProvider inline style 覆盖
- 全部 13 个消费 glass token 的 CSS 文件 — token 名不变，值由上游决定
- `glass-surface.test.ts` — 验证 token 引用名，不受影响
- 原生模块层 — 纯 UI/CSS 变更

## 验证

```bash
pnpm run build          # 两个产物（lynx + web）
pnpm exec tsc -b        # 类型检查
pnpm test               # vitest（含新增的材质测试）
pnpm run build:web      # Web 产物
```

Docker Chrome 验收：
1. 打开外观设置 → 材质 section 显示四个选项，默认 regular 选中
2. 切换到 ultra-thin → 导航胶囊、mini 播放器、弹出菜单明显变透明
3. 切换到 thick → 上述表面几乎不透明
4. 切换回 regular → 恢复当前外观
5. 切换深浅色主题 → 材质选择保持不变
6. 退出应用重启 → 材质选择被持久化
