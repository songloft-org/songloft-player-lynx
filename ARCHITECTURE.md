# 项目架构分析

本文件提供稳定的代码探索入口。详细设计、平台差异与 Lynx 运行约束分别由 [`docs/architecture/overview.md`](docs/architecture/overview.md)、[`docs/architecture/platform-differences.md`](docs/architecture/platform-differences.md) 和 [`docs/architecture/lynx-constraints.md`](docs/architecture/lynx-constraints.md) 维护。

## 模块依赖关系图
src/router.tsx -> src/features/* -> src/core + src/models + src/shared；feature store/query -> src/native facade 或 src/core/network；src/native -> Android/iOS/HarmonyOS/Web 宿主实现。

## 核心业务流程
页面交互 -> feature store/query -> core network 或 native facade -> 后端/宿主模块 -> 事件或响应 -> store/query 更新 -> ReactLynx 重渲染。

## 架构模式
按 feature 分域的分层客户端：路由与共享 UI 在上层，Zustand 管客户端态，TanStack Query 管服务端态，src/native facade 隔离各平台宿主模块。

## 模块接口与通信方式
- 页面 -> Zustand store / TanStack Query：用户动作和状态读取
- feature api -> core api-client：HTTP 请求、鉴权刷新和模型解析
- feature store -> src/native facade -> NativeModules：callback Promise 化与平台降级
- 宿主 -> sendGlobalEvent/globalProps -> src/index.tsx 监听器：原生状态变更回传

## 关键模块标记
- src/index.tsx：业务 bundle 启动与宿主事件装配
- src/router.tsx：路由表、ThemeProvider 与全局覆盖层挂载点
- src/native/native-modules.ts：宿主模块访问边界
- src/core/network/api-client.ts：后端请求入口

平台原生模块的准确方法、事件和注册矩阵以 [`docs/reference/native-modules.md`](docs/reference/native-modules.md) 为准；返回链路以 [`docs/reference/back-navigation.md`](docs/reference/back-navigation.md) 为准。本文件不复制这些易变化的契约表。
