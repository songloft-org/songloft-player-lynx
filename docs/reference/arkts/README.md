# ArkTS 参考资料

本目录收录 HarmonyOS 宿主开发所需的 ArkTS 语言约束和编码参考。它们用于帮助开发者与 AI 在修改 `harmony/**/*.ets` 前避开 ArkTS 编译限制，不承担本项目原生模块契约或平台能力清单的权威维护职责。

## 推荐阅读顺序

1. 修改或生成 ArkTS 代码前，先读 [ArkTS 约束速查](./ArkTS约束速查.md)。
2. 新增文件或做代码审查时，再读 [ArkTS 编程规范速查](./ArkTS编程规范速查.md)。
3. 遇到编译错误、TypeScript 迁移或速查表覆盖不到的语法时，查 [从 TypeScript 到 ArkTS 的适配规则](./从TypeScript到ArkTS的适配规则.md)。
4. 需要完整命名、格式和编程实践示例时，查 [ArkTS 编程规范](./ArkTS编程规范.md)。

## 项目约束与判据

- 原生模块方法、callback、事件和注册矩阵以 [原生模块参考](../native-modules.md) 为准。
- HarmonyOS 支持范围和降级行为以 [平台参考](../platforms.md) 为准。
- 新增或修改模块时遵循 [原生模块开发指南](../../guides/native-development.md) 和根目录 [AGENTS.md](../../../AGENTS.md) 的跨平台同步要求。
- ArkTS 语言与 SDK 约束会随 HarmonyOS API 和 DevEco Studio 演进；本目录用于开发参考，最终以仓库当前 API 12 配置、DevEco 编译器诊断和 Build Hap 结果为准。

## 文档清单

| 文档 | 用途 |
|---|---|
| [ArkTS 约束速查](./ArkTS约束速查.md) | AI 和开发者的高频语法限制、替代方案及错误码入口 |
| [ArkTS 编程规范速查](./ArkTS编程规范速查.md) | 命名、格式和常见编程实践检查清单 |
| [从 TypeScript 到 ArkTS 的适配规则](./从TypeScript到ArkTS的适配规则.md) | 完整限制说明、迁移示例和重构建议 |
| [ArkTS 编程规范](./ArkTS编程规范.md) | 完整编码风格和编程实践示例 |
