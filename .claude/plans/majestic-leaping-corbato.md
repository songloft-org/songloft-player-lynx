# 底部导航插件 tab 图标改为插件自己的图标

## Context

当前底部导航栏（`ShellLayout`）中所有插件 tab 的图标都硬编码为 `name='settings'`（齿轮图标）。用户希望显示插件自己的图标（如插件包中声明的 `icon` 字段）。插件图标通常是 SVG 或 PNG 文件，存储在 `/api/v1/jsplugin/{entryPath}/static/{icon}`。

**为什么需要改**：作为插件系统，每个插件应该有自己的视觉标识，而不是共用一个泛型图标。

## 设计

### 数据流

插件图标信息需要从 `TabConfigPage` -> `PluginTabEntry` -> `ShellLayout` 传递：

1. `TabConfigPage` 在 `togglePlugin` 时，从 `JSPlugin` 对象中获取 `icon` 字段并存入 `PluginTabEntry`
2. `PluginTabEntry` 新增 `icon?: string` 字段
3. `SettingsApi.updateTabConfig` 上传时包含 `icon` 字段
4. `parseTabConfig` 解析 API 响应时提取 `icon` 字段
5. `ShellLayout` 渲染插件 tab 时，根据 `tab.icon` 来渲染插件图标

### 渲染方案

在 `ShellLayout` 中新增 `PluginTabIcon` 子组件，使用 `usePluginIconQuery` 获取 SVG markup：

- **SVG 图标**：fetch SVG 后用 `<svg content>` 渲染
- **Bitmap 图标（PNG/WEBP）**：用 `<image>` 渲染
- **无 icon 或加载中**：fallback 到 `settings` 图标

### 向后兼容

- `icon` 字段为可选（`icon?: string`），已有 tab 数据中没有 icon 时自动 fallback 到 `settings` 图标
- `parseTabConfig` 中 `icon` 缺失时设为 `undefined`

### 加载状态

- 图标加载中：显示 `settings` 占位图标（与当前行为一致）
- SVG 加载失败：显示 `settings` 占位图标
- 无 icon 字段：显示 `settings` 占位图标

## 变更详情

### 1. `PluginTabEntry` 接口（tab-config.ts）

添加 `icon?: string` 字段。`parseTabConfig` 中解析 `icon`。

### 2. `SettingsApi.updateTabConfig`（settings-api.ts）

发送 body 添加 `icon` 字段。

### 3. `TabConfigPage.togglePlugin`（TabConfigPage.tsx）

添加 tab 时附带 `icon: plugin.icon`。

### 4. `ShellLayout` 渲染（ShellLayout.tsx）

新增 `PluginTabIcon` 组件，使用 `usePluginIconQuery` 获取 SVG markup。根据 icon 类型（SVG/bitmap/无）选择渲染方式。

需要从 `PluginGrid` 导入 `isSvgIcon` 函数。

### 5. CSS（ShellLayout.css）

新增 `.nav-item__plugin-icon` 样式（24×24px）。

## 依赖关系

- `isSvgIcon` 函数当前在 `PluginGrid.tsx` 中定义，需要导出供 `ShellLayout.tsx` 使用
- `usePluginIconQuery` 在 `jsplugin-query.ts` 中定义
- `buildCoverUrl` 在 `url-helper.ts` 中定义

## 验证

1. 运行 smoke 测试：`npx vitest run src/__tests__/smoke.test.tsx`
2. 运行 plugin-icon 测试：`npx vitest run src/features/jsplugin/__tests__/plugin-icon.test.ts`
3. 运行全量测试：`npx vitest run`
4. 构建部署并 ADB 截图验证