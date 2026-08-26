# Settings Page: Flutter-Style Category Refactoring

## Context

Flutter 版使用 9 个分类（master-detail）组织设置，每个分类有图标+标题+副标题。Lynx 版目前是 11 个平铺 section，缺少分类层级。本次重构对齐 Flutter 的分类结构，同时保留 Lynx 现有的 scroll-list 交互模式。

## 9 分类映射

| # | 分类 | 副标题 | 合并的现有 section |
|---|------|--------|-------------------|
| 1 | **外观设置** Appearance | 主题、菜单和显示 | Appearance + Language |
| 2 | **播放设置** Playback | 音质 | Audio Quality + Playback + Lyrics |
| 3 | **音乐库管理** Library | 扫描、导入和转换 | Library |
| 4 | **扩展** Extensions | 插件管理 | Plugins + Tab Config（从 Advanced 拆出） |
| 5 | **缓存管理** Cache | 服务端和本地缓存 | Cache（从 Advanced 拆出） |
| 6 | **网络设置** Network | 代理配置 | Connection + Proxy（从 Advanced 拆出） |
| 7 | **数据管理** Data | 歌单导出与导入 | Data |
| 8 | **关于与更新** About & Updates | 版本和日志 | About + Diagnostics（合并） |
| 9 | **账户** Account | 服务器和登录 | Account |

## Files to Modify

### 1. `src/i18n/resources.ts`
Add 18 new keys (9 titles + 9 subtitles, en + zh)，对齐 Flutter ARB 原文。

### 2. `src/features/settings/widgets/SettingsSection.tsx`
- Add optional `subtitle?: string` prop
- Render subtitle below title in header when present

### 3. `src/features/settings/pages/SettingsPage.tsx`
- 重组 JSX：11 个独立 section → 9 个分类 section
- 每个分类 section 使用新的 `subtitle` prop
- 保留所有现有行、状态、处理逻辑不变
- 移除不再需要的 `SettingsSubPage` 子页面分发（细节见下方）

### 4. `src/features/settings/__tests__/settings-page.test.tsx`
- 更新 section header 断言为 9 个分类标题

## 保持不变

- 所有 `SettingsRow`、`SwitchRow` 组件
- 所有 state、useEffect、handler
- CSS
- 双栏布局（isDualColumn + SettingsDetailPane）
- `DataSection` 组件
- 原有的 `SettingsSubPage` 类型和 `SettingsDetailPane` 逻辑（分类只是重新组织行，子页面导航不变）

## Verification

1. `pnpm exec tsc -b` — type check
2. `pnpm test` — all tests pass
3. `pnpm run build` — both bundles
4. `pnpm run ios:run` — iOS build + install