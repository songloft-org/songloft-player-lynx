# 永久访问 Token（songloft-org/songloft#546）

新增设置 → 永久访问 Token，支持桌面主从面板与移动路由 `/settings/personal-tokens`。输入名称创建独立设备凭证，完整 Token 仅在成功弹窗显示一次，可复制 Token 或完整 Authorization 请求头；失败时可重试或手动选择。列表分页显示时间及撤销状态，撤销前确认。

使用认证 `PersonalTokenApi` 与 `/api/v1/auth/personal-tokens`，请求与重试绑定打开页面时的服务器和账号会话，过时响应不进入新会话。TanStack Query 只缓存管理信息；完整凭证不进入 Query/Mutation 缓存或持久存储。复用已有 Input、ConfirmDialog、返回策略及带回执的剪贴板 facade，无原生模块变更。

2026-10-28，Linux x86_64 / Node 22.17.1 / pnpm 11.15.1，基线 `1d9317a87ef2967b6acfd90ba6ac8b731fbe5c48` + 未提交工作树：类型、双 bundle、embedded Web 构建及相关 430 项测试通过。首轮有两项旧 Markdown 夹具失败，现已改为独立双语表格样本并保留原有断言；最终全量 352 文件 / 3724 项及 89 项发布工具检查全部通过。

Docker Chrome 实际界面验证创建、复制 Token/请求头、关闭后隐藏凭证、携带 Token 下载真实封面（200 / 248 字节）、确认撤销及撤销后 401。证据 `/tmp/songloft-546-lynx-ui-result.json`、对应 PNG；源码指纹及日志索引 `/tmp/songloft-546-verification.json`。

Not run：Android/iOS/HarmonyOS 宿主编译与设备、报告人的 NAS/HA/ESPHome/音箱。本批已获提交、推送、同步父 gitlink 和回复 #546 的授权；正式发布和关闭 Issue 不在授权内，实际状态以 GitHub 记录为准。

实际 Chrome 流程同时在 1280×900 主从布局与 390×844 窄屏路由通过，窄屏证据 `/tmp/songloft-546-lynx-mobile-ui-result.json` 与对应 PNG；此项不是移动真机验收。
