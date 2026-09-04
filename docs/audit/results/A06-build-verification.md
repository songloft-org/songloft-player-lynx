# A06 结果 — 构建、测试与交付可复现性

## 结论

TypeScript 与 Rspeedy 双环境构建通过，现有原生契约测试也通过；全量测试不是绿色，且契约门禁只验证 Harmony 模块注册，不验证其方法表或关键语义。

## 已确认问题

- [AUD-004](../Findings.md#aud-004-p2-播放器响应式测试门禁稳定失败)
- [AUD-009](../Findings.md#aud-009-p2-原生契约门禁遗漏-harmonyos-方法面)：185 项契约测试全绿仍未阻止本次发现的 Harmony 缺方法和占位实现。

## 验证证据

- `node node_modules/typescript/bin/tsc -b`：通过。
- `node_modules/.bin/rspeedy build`：通过，同时产生 Lynx `2167.8 kB` 与 Web `2247.6 kB` 产物。
- 全量 Vitest：2 个文件失败；18 项失败、2015 项通过。`input-css` 的 4 个超时在隔离运行时 5/5 通过，归为本机竞争噪声。
- `full-player-responsive` 隔离运行仍 14 失败、5 通过，归为稳定门禁缺陷。
- `native-module-contract.test.ts` 隔离运行 185/185 通过。

## 已排除与缺口

- `package.json` 没有 `packageManager` 字段，但三条 CI workflow 均显式安装 pnpm 10；当前 Corepack/pnpm 11 元数据与 SQLite 报错是本机执行环境问题，不登记为代码库缺陷。
- Linux 环境未执行 Xcode 工程解析、Android Gradle 构建或 Harmony hvigor 构建；JS build 不能替代这些宿主闸门。
