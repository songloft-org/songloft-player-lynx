# 贡献指南

[English](CONTRIBUTING.en.md)

## 开始之前

先读 [README](README.md)、[AGENTS.md](AGENTS.md) 和 [HARNESS.md](HARNESS.md)。后端、Flutter 客户端和本客户端是独立仓库；后端接口以其 Swagger 为准。

缺陷报告请附客户端版本、commit、平台/系统版本、后端版本、复现步骤与脱敏日志。现有缺陷与设备验证欠账见 [bugs.md](docs/project/bugs.md) 和 [handoff.md](docs/project/handoff.md)。

## 本地开发

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm test
pnpm run test:release
```

`postinstall` 与 `patches/` 是构建的一部分，不要跳过补丁或提交 `node_modules`、签名材料和产物。

修改原生能力需同时核对 TypeScript facade、平台实现、注册位置与事件名。修改 `web/` 需实际打开构建产物；原生变更需编译对应宿主。参见[构建指南](docs/guides/build-and-run.md)与[测试指南](docs/guides/testing.md)。

## 提交约定

维护者直接在 `main` 提交。外部贡献者可先开 Issue 讨论，提交方式遵循维护者安排；仓库没有功能分支或 PR 的强制流程。

使用 `type(scope): 描述`，不加 `Co-Authored-By`。引用父仓库 Issue 时写完整的 `songloft-org/songloft#123`。文档有对应英文版时同步修改；新安装、发版与贡献文档须中英文同步。

提交前格式化改动文件，运行相关验证及 `git diff --check`。说明验证范围，区分单元/契约测试、宿主编译与真机行为。不要把单元测试通过写成设备验收通过。

## 发布

只有维护者执行[发版流程](docs/guides/releasing.md)。`dev` 滚动更新；版本 tag 与已发布版本不覆盖。开源采用 [Apache-2.0](LICENSE)，第三方源码与资源保留原有许可说明。
