# 实施计划：均衡器 + Sortable + 多服务器

## Context

PROGRESS.md 审计后确认三个未实现特性：EQ UI/DSP（接口已定义但无 UI 和原生实现）、lynx-ui-sortable（包已存在但未采用）、多服务器管理（仅支持单服务器切换）。用户要求全部实现。

## 交付顺序

**Phase A → B → C**，独立特性优先、风险由低到高：

| Phase | 特性 | 风险 | 估计新文件 |
|-------|------|------|-----------|
| A | 均衡器 UI + DSP | 低（纯新增） | ~6 TS + 2 native |
| B | 多服务器管理 | 中（改 auth/config） | ~5 TS |
| C | lynx-ui-sortable | 低（替换 UI） | 0 新，改 3 widget |

---

## Phase A: 均衡器 (EQ)

### A1 — Domain: `src/features/settings/domain/eq-presets.ts`
- `EQ_PRESETS`: Record<PresetName, number[10]>（flat/rock/pop/jazz/classical/bassBoost/vocal）
- `clampGain(db)`: 限制 [-12, +12]
- 纯函数，无副作用

### A2 — Store: `src/features/settings/store/eq-store.ts`
- State: `{ enabled, bands: number[10], activePreset }`
- Actions: `toggle()`, `selectPreset(name)`, `adjustBand(index, db)`, `reset()`, `hydrate()`
- 持久化: `SongloftStorage.prefs` keys `eq_enabled`/`eq_bands`/`eq_preset`
- 每次变更同步调 `getAudio().setEqualizerEnabled/setEqualizerBand`

### A3 — Page: `src/features/settings/pages/EqualizerPage.tsx` + `.css`
- AppSwitch 开关
- 预设 chips 行
- 10 个纵向 SliderRoot (lynx-ui-slider)，范围 -12~+12 dB
- 底部频率标签 (31, 62, ..., 16k)

### A4 — Route + 入口
- `src/router.tsx`: 新增 `/settings/eq`
- `src/features/settings/pages/SettingsPage.tsx`: 新增 "均衡器" SettingsRow

### A5 — Android 原生
- `SongloftAudioEngine.kt`: 绑定 `android.media.audiofx.Equalizer` 到 audioSessionId
- `SongloftAudioModule.kt`: 转发 `setEqualizerEnabled`/`setEqualizerBand`

### A6 — iOS 原生（可后置）
- 需要 `AVAudioEngine` + `AVAudioUnitEQ` 管线重构
- 初期可保留 no-op stub，后续批次补齐

### A7 — Tests
- `eq-presets.test.ts`: 预设完整性、clampGain 边界
- `eq-store.test.ts`: toggle/selectPreset/adjustBand/hydrate
- `equalizer-page.test.tsx`: 渲染 10 slider + toggle + chips

---

## Phase B: 多服务器管理

### B1 — Model: `src/models/server-profile.ts`
- Zod schema: `{ id, name, url, insecureTls, lastUsed? }`

### B2 — Store: `src/features/settings/store/server-store.ts`
- State: `{ profiles[], activeProfileId }`
- Actions: `hydrate()`, `addProfile()`, `editProfile()`, `removeProfile()`, `switchTo(id)`
- Token 隔离: 每个 profile 的 token 存 `token_access_${id}` / `token_refresh_${id}`
- 迁移: 首次 hydrate 若无 `server_profiles` key，从 legacy `PREF_SERVER_URL` + 已有 token 自动生成初始 profile

### B3 — Pages
- `ServerListPage.tsx`: 服务器列表 + active 指示器 + 切换/删除
- `ServerEditPage.tsx`: 添加/编辑表单（name + url + insecureTls）

### B4 — Route + 集成
- `src/router.tsx`: `/settings/servers`, `/settings/servers/add`, `/settings/servers/edit/$id`
- `SettingsPage.tsx`: "服务器" row → 导航到列表页
- `auth-store.ts`: 登录成功后关联 token 到 active profile

### B5 — Tests
- `server-store.test.ts`: CRUD + switchTo + token isolation + legacy migration
- `server-list-page.test.tsx`: 渲染 + 切换交互

---

## Phase C: lynx-ui-sortable 替换

### C1 — 添加依赖
- `package.json`: `"@lynx-js/lynx-ui-sortable": "^3.135.4"`
- `pnpm install`

### C2 — 替换三处排序 UI
| 文件 | 改动 |
|------|------|
| `src/features/playlist/widgets/PlaylistsView.tsx` | 删 sortMode + chevron → SortableRoot + drag handle |
| `src/features/playlist/pages/PlaylistDetailPage.tsx` | 同上 |
| `src/features/player/widgets/PlaylistDrawer.tsx` | 删 chevron → SortableRoot |

每处：
- 用 `SortableRoot` 包裹列表，`data` 传 key+item
- `onSortEnd` 调用已有 mutation/store action（逻辑不变）
- 添加 grip 图标作为 drag handle（`SortableItemArea`）
- 移除 sortMode 状态和 moveItem 本地函数

### C3 — CSS
- 添加 drag-active 高亮、drop indicator 样式
- 移除旧 sort-mode 相关 CSS 类

### C4 — Test mock + 更新
- `_render-mocks.tsx`: 新增 `mockLynxUiSortable()`
- 更新 3 个测试文件：移除 chevron 断言，mock sortable

---

## 验证

每个 Phase 完成后：
```bash
pnpm exec tsc -b        # 类型检查
pnpm run build           # 构建
pnpm test                # 全量测试
```

Phase A 额外：Android 真机验证 EQ 音效生效。

## 风险与降级

| 风险 | 降级 |
|------|------|
| iOS EQ 需 AVAudioEngine 重构 | 先出 no-op stub，后续批次补 |
| sortable 手势 API 不兼容当前 Lynx 版本 | 保留 chevron 作为 fallback |
| 多服务器 token 迁移破坏已有登录 | 自动从 legacy key 生成初始 profile |
