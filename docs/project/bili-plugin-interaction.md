# Bili 插件主导航状态保留与列表交互（2026-11-15）

2026-11-16：用户已授权提交推送及父指针同步；下文保留提交前验证快照。核对 `/tmp/bili-followup/worktrees.json` 后代码完全一致，本轮只补授权记录。实际提交、CI 及既有自动发布的结果以 Git/Actions 为准。

对应 [English](../en/project/bili-plugin-interaction.md)。基线：Lynx `2447fade1affad9dda94f0bd68aff932680d91d8`、bili `2317a4a8a3d0964571a52725b7bcd2fb3e2124d2`，加本批未提交工作树。主仓库未修改；未更新子模块指针、提交、推送或发布。

## 行为与边界

- Web 的插件宿主已经隐藏保留 worker，但原生 frame 归属于路由页，切到曲库就卸载。现在原生主导航插件由 Shell 持有，首次访问后保留实例，曲库往返沿用同一 frame，因此搜索、结果、选歌、设置草稿和滚动容器仍在。普通推入页面与 Web 继续使用原有路径。
- 原生隐藏页收到 `lifecycle: paused`，选中后收到 `resumed`，隐藏页不转发应用回前台事件。bili 据此暂停下载/同步/二维码的界面轮询，返回时刷新数据。主题及播放状态通道继续有效。
- 缓存仅在当前 Shell/登录会话内存在，不写服务器。服务器作用域变更会重建容器，插件版本/更新时间变更会重建 frame，停用/卸载移除实例；离开 Shell 或退出登录会清理。未承诺跨应用重启或完整播放器页面往返的持久化。
- bili 的分 P 展开状态与已取得分 P 数据分开，支持收起和无额外请求的再次展开。长标题明确约束两行、换行与省略，给勾选、封面和按钮预留宽度。
- 导入歌单、监控收藏夹及监控目标歌单统一使用可取消的搜索弹层，每页最多 20 项，关闭时只显示当前项。搜索遍历全列表；当前选项、空结果及分页边界均保留。输入不再将每次输入值反写到原生控件，避免搜索弹层输入回显竞态。
- Web 输入事件还存在宿主竞态：自定义元素升级前到达的 `enableEvent` 被可选调用静默丢弃，真实输入框有文字但搜索按钮仍禁用。固定版本的 web-core 开发补丁及生产补丁现在缓存事件计数，定义就绪后重放，并抵扣期间删除的绑定；锁文件只更新补丁哈希。部署 HTML 回退时也需要同步新的服务端 `web-core/` 资源。

## 验证

Linux amd64、Node 22.17.1、pnpm 11.15.1；插件浏览器为 Docker Chromium 121，端口 30602 的独立数据库与插件目录 `/tmp/bili-followup/`。

- Lynx `pnpm exec tsc -b`、`pnpm test`（363 文件 / 3820 项）、`pnpm run build`（Lynx/Web 双包）、`pnpm run build:web` 及 `pnpm run test:release`（89 项）通过。日志 `/tmp/bili-followup-host-{types,tests-final,build,web,release}.log`。首轮全量有 3 项失败：新增查询消费者需补现有 Shell/Smoke 隔离 mock，整页容器背景又触发玻璃填色闸门；补 mock 并复用既有父背景后全量通过，未放宽玻璃闸门。
- 原生渲染分支的组件测试验证曲库往返保留同一 frame 和搜索状态，更新/停用销毁，隐藏时暂停和忽略应用前台事件。隔离副本故意只渲染当前 frame，返回库页时找不到原 frame，新回归失败（1 failed / 2 passed），日志 `/tmp/bili-followup-host-negative.log`。这是受控 native 分支语义验证，不能代替 Android 实机。
- `web-event-upgrade.test.ts` 直接执行安装后生产包的事件方法，验证升级前绑定、提前解绑、计数及已销毁节点，3 项通过；旧生产包对照 2 failed / 1 passed，日志 `/tmp/bili-followup-event-negative.log`。浏览器最终脚本只使用正常键盘与指针操作，没有手工补绑或注入输入事件。隔离服务器从可执行文件目录取 web-core，确认 HTTP 返回资源 SHA-256 为 `04aa9c9c276ca8c1547233a53eea5a252e5b743d21395d7171ca9050ad406df7` 后重跑通过，避免仅复制到数据库目录而测到旧包。
- 补丁安装期间，旧 node_modules 的 cssnano 符号链接残留到未安装的 lilconfig，构建报缺模块；冻结清洁安装后恢复，未升级锁文件依赖。同时进行构建/测试曾因 dist 被清理导致发布产物测试 ENOENT，最终按构建完成后再全量测试的顺序执行。实际 `web/dist` 经隔离静态服务在 390px 打开，登录页、3 个输入控件、cross-origin isolation 和无 pageerror 检查通过：`/tmp/bili-followup-client-preview.log`。首轮预览断言假设中文，而浏览器采用英文；改为检查真实登录标题节点，不修改产品语言。
- bili 59 项测试、前后端类型检查、双包构建及 validate 通过；日志 `/tmp/bili-followup-{tests,types,backend-types,build,validate}.log`。选项页测试首次按 TypeScript 默认 ES3 转译，Map 迭代断言失败；改为与前端一致的 ES2020 后通过。
- `tests/details.browser.cjs` 用真实 HTML 回退页面与受控业务数据验证：320px、超长中英标题，标题 42px 高且不越过按钮；分 P 收起再展开总计一次请求；1000 歌单只渲染 20 行，实际键盘搜索“999”、选中和取消均通过。日志 `/tmp/bili-followup-browser.log`。原包对照因缺少“收起”操作按预期失败，日志 `/tmp/bili-followup-browser-negative.log`。
- 原有稳定性回归维持标题/滚动区域/导航位移 0px、240px 滚动保留和匿名收藏夹请求 0 次；30 组尺寸/明暗/五页检查及短视口保存读回通过。日志 `/tmp/bili-followup-{stability,layout}.log`。

Not run：本批 Android/iOS/HarmonyOS 原生真机及 Flutter；原生模拟器此前在宿主启动阶段退出 139，本轮没有把 Web 截图视作 Android 验收。未跑真实 B 站账号导入/下载。原生状态保留需要更新主程序；仅安装新插件不能阻止旧主程序销毁 frame。

最终工作树 SHA-256 清单在 `/tmp/bili-followup/worktrees.json`，浏览器截图位于 Chrome 容器 `/tmp/bili-followup-{search,picker,settings}.png`。
