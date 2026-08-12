# 文档索引

Songloft Player Lynx 客户端项目文档。

## 项目状态

| 指标 | 值 |
|------|-----|
| 源码规模 | 295+ 文件 / 34K+ 行 TypeScript |
| 特性模块 | auth · home · library · library-ops · player · playlist · settings · jsplugin |
| 原生模块 | SongloftAudio · SongloftStorage · SongloftPlatform · SystemAppearance（Android + iOS） |
| 测试 | 809 vitest |
| 构建产物 | ~1699 kB |
| 已验证平台 | Android 真机 · iOS 原生模块编译通过 |

## 文档目录

| 文件 | 说明 |
|------|------|
| [PROGRESS.md](./PROGRESS.md) | 分批开发进展记录（批1–32），每批交付内容与遗留事项 |
| [bug.md](./bug.md) | 手动测试发现的 bug 跟踪清单 |
| [plan.md](./plan.md) | 原始迁移调研文档（迁移启动前的技术可行性研究，4 篇子文档的母本） |
| [swagger.json](./swagger.json) | 后端 API 规范（OpenAPI） |

### 迁移调研参考（预研阶段产出，当前作为历史参考）

以下 4 篇文档产出于项目启动前，用于论证迁移可行性与规划路线。项目启动后已按实际推进，部分结论已被实践验证或超越。

| 文件 | 说明 | 当前状态 |
|------|------|----------|
| [lynx_migration_overview.md](./lynx_migration_overview.md) | 迁移动机、平台矩阵、技术栈决策 | P0/P1/P2 已完成验证并落地 |
| [lynx_capability_matrix.md](./lynx_capability_matrix.md) | Flutter vs Lynx 逐项能力对照 | 核心能力已实现，剩桌面/DLNA/Live Activity |
| [lynx_native_modules_spec.md](./lynx_native_modules_spec.md) | 自研原生模块接口草案 | Audio/Storage/Platform 已实现（A/I） |
| [lynx_migration_roadmap.md](./lynx_migration_roadmap.md) | P0–P4 分阶段路线与风险登记 | P0✅ P1✅ P2✅ P3部分 P4未开始 |

## 迁移路线完成度

```
P0 技术验证     ████████████████████ 100%  — 音频/路由/Query/UI 全部验证通过
P1 基础设施     ████████████████████ 100%  — 网络/鉴权/存储/i18n/主题/路由
P2 核心业务     ████████████████████ 100%  — auth/library/player/playlist/home/settings
P3 平台特性     ████████████░░░░░░░░  60%  — EQ(A/I)、数据导入导出、播放历史、主题包、歌词编辑、后端更新、DLNA投屏、悬浮歌词、Live Activity 已完成；桌面(Lynxtron)待做
P4 双轨发布     ░░░░░░░░░░░░░░░░░░░░   0%  — 未开始
```
