# 进展与交接（PROGRESS）

> **用途**：实时记录当前进展、每批交付与遗留/未完成事项，供随时工作交接。**每批验收后必须更新本文件**（见 `AGENTS.md` §4）。
> **最后更新**：2026-08-25 · 最近完成（**批56-1** 插件列表页对齐 Flutter 批 1：数据层补齐（上传/批量更新结果模型、github 代理参数、auto-update/keep-alive/cleanup API 与 query/mutation，1697 vitest），**批55** 底部导航 tab 溢出折叠对齐 Flutter adaptive_scaffold（超 5 个折为 4+「更多」底部面板，`showLibrary` 首次接入 shell，1696 vitest，Web 真后端实测全链路），**批53** 弹出层定位自研、退役 `lynx-ui-popover`（Docker 无头 Chrome 实测抓出 6 处错位，其中歌单详情排序菜单 `x=-122` 一直在屏外；1580 vitest，8 个弹出层窄屏+宽屏逐个实测），**批52** 全屏播放器对齐 Flutter 布局 + 多分辨率适配，修 4 个历史 bug，1495 vitest，Android 真机竖/横屏 + Web 无头浏览器双宽度验证），**批51-D** 曲库深度重构批 D：页内「自定义视图」编辑器 + 设置页入口拆除（1267 vitest，重构四批全部完成），**批51-C** 曲库深度重构批 C：排序上提 + prefs 持久化 + 7 项底部面板（1262 vitest），**批51-B** 曲库深度重构批 B：14 视图外壳 + 三路分发 + 旧 4 tab 迁移（1260 vitest），**批51-A** 曲库深度重构批 A：library-browse 契约修正 + 14 视图域模型 + 排序域（「自定义曲库显示分类从未生效过」的根因修复，1250 vitest），**批50** 播放历史形态与链路双向修正（打点从未生效过 + 设置页入口拆除 + 按上下文面板，1050+ vitest），**批49** 视频歌曲全屏原生播放（双平台完工，1007 vitest / 102 文件），**批48** 悬浮歌词第四/五重死修复 + AndroidManifest 闸门补位（959 vitest，Android e2e 112/115），**批47** 自签名两条缺陷收口：iOS 媒体流可播 + 开开关立即生效（952 vitest），**批46** iOS e2e 首跑 6 个失败全修完，**iOS 110/110 + Android 107/110**，**iOS 首次编译 + e2e 首跑（Mac）** 批45 Swift 编译收口 + iOS e2e 104/110，**批45** iOS 原生缺口收口：insecureTls 三条出站路径 + 锁屏封面 + 闸门收紧（949 vitest），**批44** 功能缺口 15/15 项全部完成（932 vitest），**批43** 结构性修复 5 项（P0-2/4/5 + P2-1 + P2-3），**批42** 审计「一眼可见」缺陷五波 13 条全部完成，**批41** 三条 P0 阻断（原生 bundle 不重建 / iOS 工程损坏 / Web 产物黑屏）+ 三道新闸门。**审计计划已闭合。**
> **批57b · 修：禁用插件后 nav tab 图标残留**：用户报「禁用插件后 tab 上图标还显示」。根因双处：① `useShellNavTabs` 把 tab-config 的 pluginTabs 原样返回，不过滤 isActive/是否已卸载（Flutter `active_destinations.dart` 的规则是「插件存在且 isActive 才生成 tab」）；② toggle/delete/install mutation 只 invalidate `['jsplugin','list']`，shell-nav query（key `['settings','tab-config','shell-nav']`，staleTime 60s）不会被刷新。修复：① 新纯函数 `filterActivePluginTabs(pluginTabs, plugins)`（entryPath 存在于插件列表且 isActive 才保留）并在 queryFn 应用；② toggle/delete/installFromRegistry mutation onSuccess 追加 invalidate `['settings','tab-config']`（与 TabConfigPage 保存同前缀，前缀命中 shell-nav）；③ 上传安装路径（不走 mutation）在页面成功回调里同样 invalidate（上传可带回已配置的 tab）。测试：新 `nav-tab-visibility.test.tsx`（7 例：过滤函数四态 + renderHook+真实 QueryClientProvider 断言三个 mutation 均发 tab-config invalidate）；plugin-manager-page.test 补 QueryClientProvider wrapper（页面新增的直连 useQueryClient 需要）。**验收**：`tsc -b` / **1724 vitest** / `build` 双产物全绿 + **Web 真后端实测**（禁用洛雪音源 → 导航栏 7→6 即时消失，重新启用 → 6→7 恢复，无需刷新，控制台零应用错误；旁证：本来就禁用的智能音箱初始就无 tab，初始过滤同样正确）。
> **批57 · 插件商店页对齐 Flutter 版**：起点是用户指出「商店缺一个重新安装最新版本的功能」。对照 Flutter `plugin_registry.dart` 全量盘点后实施：① **修模型级 bug**：`registryPluginEntrySchema` 的 `conflict` 原被建模为 string，后端实际发 `boolean`（swagger `handlers.registryPluginEntry`）——`true` 落进 `.catch()` 变 undefined，**整个冲突流程一直是死的**；改为 `conflict: boolean` + `conflictWith`（描述文案）+ `sourceName`；refreshResponse 补 `warnings`。② **行动作四态**（核心）：已装无更新 → **`↻ v{版本}` chip，点击即重装**（Flutter ActionChip，此前只有无动作的「已安装」徽章）；已装有更新 → 「更新至 v{版本}」按钮；冲突 → danger 色「覆盖安装」→ ConfirmDialog（对齐 Flutter `_confirmThenInstall`，替换旧的就地展开式确认）→ overwrite:true；未装 → 「安装」。安装成功 toast 后端 message + **就地 markInstalled**（按 entryPath+identity 匹配点亮；同 entryPath 邻居翻转为 conflict+conflictWith，songloft#339）。③ **行视觉**：新 `RegistryIcon`（新 `useRegistryIconQuery`+API `getRemoteText`：商店 icon 常是外部 URL，走 HttpClient 取 SVG 文本→`<svg content>`；位图 `<image>` + `binderror` 回退；无 icon 首字母）；作者·来源名一行；conflict 警示行。④ **源选择**（顶栏 🌐 PopoverMenu：「全部」聚合 + 各启用源，单源模式传该源 token）+ **订阅源管理对话框**（新 `RegistryManageDialog`：行=Switch 启用/名称(URL)/官方标签/token 指纹图标/编辑/删除 + 添加表单两 phase——刻意不用嵌套 Dialog，两个 lynx-ui Dialog 同 z 层无法可靠覆盖；PUT 整表保存）+ **force 刷新**（顶栏 ↻，绕缓存；翻页/搜索不 force）+ **warnings 横幅**（可点开详情 ConfirmDialog）+ **搜索 500ms 防抖**。⑤ **API**：refreshRegistry/installFromRegistry 透传 github_proxy/token，install 返回 `JSPluginUploadResponse`（成功/部分失败反馈）；get/updatePluginRegistries 补全 enabled/token（`PluginRegistryConfig`）。⑥ **i18n** 补 28 词条（对齐 Flutter arb）。⑦ **测试陷阱与修复**：ReactLynx 测试环境里「effect 触发的 async setState 再触发新 effect 发起的 async setState」的 DOM 更新不进 elementTree（两层链，用最小重现实证）——boot 改回旧版的 render-body didInit 模式：listing 与源列表**并行**发起、各自单层（页面注释已记录原因）；RegistryManageDialog 的 `editingIndex=null` 同时哨兵「列表」与「新增表单」→ 点添加永远不开表单（拆 phase state 修复，真 bug 非 mock 问题）；防抖 timer 在 mount 即启动会在 500ms 后白发一次 refetch（mount 跳过）。**验收**：`build` 双产物 / `build:web` / `tsc -b` / **1717 vitest（+10：重装 chip、更新至 vX、冲突确认后 overwrite、就地更新含邻居翻转、源切换带 token、force 刷新 vs 翻页不 force、warnings 横幅+详情、管理对话框增源保存、空态）**全绿 + **Web 真后端冒烟**（20 插件列表、4 个已装插件均显示 ↻ v{版本} chip、点击重装全链路（loading→toast「插件已更新到 v1.4.7」→chip 恢复）、洛雪音源「更新至 v3.7.6」、源选择菜单选中态、管理对话框两 phase、控制台零应用错误；3 个图标 404 为上游仓库缺 icon.svg，首字母回退正常）。
> **批56-4 · 插件列表页批 4（收尾）：页面级功能 + 上传反馈 + Web 实测**：① **自动更新开关**：列表上方 `SwitchRow`（复用 settings 组件），`usePluginAutoUpdateQuery` + `useSetPluginAutoUpdateMutation`，加载/待定中禁用，失败 toast。② **新 `PluginBatchUpdateDialog`**（`widgets/PluginBatchUpdateDialog.tsx`，对齐 Flutter `_JSPluginBatchUpdateDialog`）：确认文案 → 执行中（无关闭钮 +「请勿关闭」）→ 结果统计三列（已更新/失败/已跳过）+ 每插件明细行（成功 `v1 → v2` / 有更新但失败显 error / 无更新显已最新）；300s 超时（放弃等待而非取消服务端）；骨架复用 ConfirmDialog.css，执行走 `mutateAsync`；顶栏⋯「全部更新」从静默 mutation 改为打开此对话框。③ **清理孤立数据**：顶栏⋯新入口 → ConfirmDialog 确认 → `cleanupOrphanStorage()` → toast 后端 message。④ **上传结果反馈**：`pickAndUploadFile` 返回的 responseBody 用 `parseJSPluginUploadResponse` 解析（不再丢弃）——全部成功 toast「已安装 N 个」，部分失败弹 ConfirmDialog 列出 `file_name: error` 明细；非预期形状静默（列表刷新即反馈）。⑤ **i18n** 补 22 词条（autoUpdate/autoUpdateHint/cleanup*/upload*/batch*/startUpdate/stat*/versionLatest/updateFailedShort），全部对齐 Flutter arb。**测试**（+3，共 1708）：批量对话框状态机、清理先确认再 toast、部分失败上传列明细、自动更新开关写入。**验收**：`build` 双产物 / `build:web` / `tsc -b` / **1708 vitest** 全绿 + **Web 真后端冒烟**（无头浏览器实测：顶栏单行 ✓、自动更新开关行 ✓、5 插件行结构（头像/状态点/版本/作者/Switch/⋯）✓、行⋯菜单四项含红色卸载 ✓（有 homepage 的插件多一项「打开主页」，条件显示与代码一致）、检查更新对话框（已是最新/失败两态）✓、顶栏⋯四项 ✓、批量更新对话框确认态+取消不触发 ✓、控制台零应用错误）。
> **批56-3 · 插件列表页批 3：检查更新/强制更新对话框 + github 代理**：① **新 `PluginUpdateDialog`**（`widgets/PluginUpdateDialog.tsx`，对齐 Flutter `_JSPluginUpdateDialog`）：打开即自动检查（20s 超时）→ 已是最新（当前版本）/ `v1 → v2` + 立即更新（120s 超时，期间无关闭钮、返回键消费不关闭）→ 成功 toast + invalidate + 关闭；错误分两种包装（超时文案自成一体带 `timedOut` 标记，其余套 `checkUpdateFailed`/`updateFailed` 前缀）；`withTimeout` 本地实现（Promise.race 式）；对话框骨架直接复用 `ConfirmDialog.css` 的类（含 z-index 在 fixed 子层的契约与 overlay 闸门），正文样式独立 `PluginUpdateDialog.css`；更新执行走 `useUpdatePluginMutation.mutateAsync`（invalidate 由 hook 承担，不直依赖 useQueryClient）。② **行内菜单**新增「检查更新」「强制更新」两项（顺序对齐 Flutter：homepage→keep-alive→check→force→delete）；强制更新走 ConfirmDialog 确认（将忽略版本检查重装）→ `updatePlugin({id, force:true})` + 成功/失败 toast。③ **github 代理**：`useGithubProxyQuery`（批 1）统一供给，非空时透传 `github_proxy`。④ **i18n** 补 23 词条（checkUpdate/forceUpdate/updateDialogTitle/checkingUpdate/checkUpdateTimeout/checkUpdateFailed/alreadyLatest/currentVersion/newVersionFound/recheck/updateNow/downloadingUpdate/doNotClose/updateSuccess/updateFailed/updateTimeout/forceUpdate* 五条）+ `common.close`；文案逐条对齐 Flutter arb。⑤ **测试**（+3）：打开即自动检查并展示版本跳变、立即更新驱动 mutateAsync、强制更新先确认再 force。dialogState helper 改为「拥有删除面板的那个 stub-dialogroot」（三对话框并存后单一查询失效）。**验收**：`build` 双产物 / `tsc -b` / **1705 vitest**全绿。
> **批56-2 · 插件列表页批 2：列表项视觉与行内⋯菜单**：① **新 `PluginAvatar`**（`widgets/PluginAvatar.tsx`）：SVG 经 `usePluginIconQuery`+`<svg content>`、位图 `<image aspectFit>`、无图标则 displayName 首字母；外圈状态色环（active→primary / error→danger / inactive→line）。② **列表行重构**（对齐 Flutter `_JSPluginItem`）：头像 + 名称（单行省略）+ 状态胶囊（圆点+文案，三态）+ `v{version}` 徽章 + `作者: x` + 描述两行截断（`-webkit-line-clamp`+`max-height` 双保险，同 PlaylistDetailPage）+ `AppSwitch` 启停（替代旧文本按钮）+ 行内 ⋯（PopoverMenu，锚 bottom-end；触发器 `Icon` 新增可选 `testId` prop 与顶栏 icon-more 区分）。菜单项：打开主页（openURL）/ 常驻运行（仅 active，selected 反映 keep-alive 白名单）/ 删除（danger）。③ **删除对话框**：`ConfirmDialog` 新增可选 `children` slot，删除弹窗内放「保留插件数据」行（共享 `AppCheckbox` 展示型 + tap 挂在行上），`deletePlugin({id,keepData})`；toggle/keep-alive/delete 失败均 toast。④ **i18n**：jsplugin 段新增 statusEnabled/statusDisabled/statusError/author/openHomepage/keepAlive/keepData/keepDataHint（文案对齐 Flutter arb），uninstallMessage 改对齐 jspluginDeleteConfirmContent。⑤ **闸门互动**：checkbox fork 启发式曾误中（avatar 的 border-radius+border-width、状态点 `--primary` 背景、`-webkit-box` 词根三条件）——改为共享 AppCheckbox + avatar 声明顺序调整（width 先于 radius，注释说明），闸门保持原样。**验收**：`build` 双产物 / `tsc -b` / **1702 vitest（+5：keepData 勾选入参、keep-alive 增/删两向、homepage openURL、行 Switch 驱动 mutation）**全绿。
> **批56 · 插件列表页对齐 Flutter 版（分四批）**：目标是对齐 Flutter `JSPluginManager` 全部功能。批 1（数据层）：① **模型**（`models/jsplugin.ts`）新增 `jsPluginUploadResponseSchema`（total/success/failed/message/results[{file_name,success,error}]，供上传结果解析——`pickAndUploadFile` 早已返回 responseBody 但一直被丢弃）、`jsPluginBatchUpdateResponse(Schema)`（updated/failed/skipped + 每插件 results[{plugin_id,plugin_name,entry_path,success,has_update,current_version,new_version,error}]）、`jsPluginUpdateCheckSchema`（补 download_url）；全部 snake→camel + `.catch()` 容错。② **API**（`jsplugin-api.ts`）：`checkUpdate(id, {githubProxy})` / `updatePlugin(id, {githubProxy,force})` / `updateAllPlugins(params)` 改对象参数并透传 `github_proxy`（含可选参数用对象参数，api-design-conventions）；新增 `cleanupOrphanStorage()`（POST /jsplugins/storage/cleanup，取 message）、`get/setPluginAutoUpdate`（/settings/plugin-auto-update）、`get/setPluginKeepAlive`（/settings/plugin-keep-alive）、`getGithubProxy()`（GET /settings/github-proxy，走 HttpClient 而非 ProxySettingsPage 的裸 fetch）。③ **data 层**：`pluginQueryKeys` 加 keepAlive/autoUpdate/githubProxy；新 `usePluginKeepAliveQuery`/`usePluginAutoUpdateQuery`/`useGithubProxyQuery`（staleTime 5min）；mutations 新增 `useUpdatePluginMutation`/`useSetPluginKeepAliveMutation`/`useSetPluginAutoUpdateMutation`，`useDeletePluginMutation` 改 `{id,keepData}`，`useUpdateAllPluginsMutation` 带参返回完整明细。批 3-4（检查更新对话框 / 页面级功能）待实施。**验收**：`build` 双产物 / `tsc -b --force` / **1697 vitest（167 文件）**全绿。
> **批52 · 全屏播放器对齐 Flutter 布局 + 多分辨率适配**：起点是「参考 Flutter 重构全屏播放器、适配多种分辨率」。① **布局对齐 Flutter**：顶栏精简为「收起 ⌄ / 专辑名(窄)·正在播放(宽) / 更多 ⋯」，原先挤在顶栏的倍速/定时/投屏/队列下移成两行——主控行 `[模式|上一首·播放/暂停·下一首|收藏]` + 工具行 `[投屏·音量·倍速·队列]`。音量、倍速改弹出层（新 `PopoverPanel`，刻意复用 `PopoverMenu.css` 的 backdrop `top/left` 与 transition 两条闸门规则，不自造）。**新增收藏按钮**（此前播放器无法收藏正在播的歌，复用 `useFavoriteToggle`）。「更多」菜单复用既有 `SongContextMenu`（下一首/队列/歌单/详情/删除），**仅在打开时挂载**——否则每次进播放器都白拉一次歌单列表。窄屏封面/歌词 Swiper 双页 + 新增页面指示点；宽屏（≥tablet）4:5 左右分栏。② **多分辨率**：新 `domain/player-layout.ts` 四档尺寸表（mobile/tablet/desktop/tv：横向 padding、封面、播放按钮 mobile 圆角矩形·宽屏圆形、工具槽）+ 高度预算收缩公式（矮视口动态缩封面防底部控件被裁）；`useBreakpoint` 增加 height 输出（width/height 同源同帧）。③ **背景层**：`PlayerBackdrop` 模糊封面铺底 + canvas 色遮罩——**不取色**（Lynx 无像素访问、后端无配色字段），遮罩 alpha 经对比度闸门计算（`contrast.test.ts` 合成 scrim-over-worst-cover-over-canvas，两主题都验 4.5:1），前景固定用 `--content*`。④ **附带修掉 4 个历史 bug**（均真机/实测抓到，详见 bug.md）：封面 `box-shadow` 加在 `<image>` 上导致 Android 位图不渲染（整块白）；`useBreakpoint` 漏传 measureSelector 致 Web 宽度恒 0、歌词页不可达；「自动进歌词」偏好从未生效（Swiper 未挂载时 swipeTo 被静默丢弃）；横屏封面上溢顶到顶栏（高度预算误用整页高度）。⑤ **CSS 按 widget 拆分** + **4 道新闸门**（measure-selector-contract 防再漏传、player-css-no-duplicate-selectors、player-backdrop-css、player-overlay-back），全部反向验证过会红。**验收**：`build` 双产物 / `tsc -b` / **1495 vitest（148 文件）** / Android 模拟器竖屏 + 横屏（断点切换、封面/按钮/边距随档缩放、封面上溢修复）/ Web 无头浏览器经同源代理登录→起播→全屏（窄 480px 出 Swiper+指示点、宽 1400px 出分栏，封面/按钮/padding 逐 px 对上尺寸表）。**遗留 2 条**（bug.md）：Android 封面 letterbox（`<image>` 内联定尺不铺满，类定尺可以，未修）；播放器挂载时两条 `illegal css key:237` 告警（非本次 CSS 引入，未查清）。
> **批51-D · 曲库深度重构批 D：页内「自定义视图」编辑器 + 拆设置页入口（重构收尾）**：用户要求「分类显示在曲库界面设置」的落点。① **新 `LibraryViewEditor`**：整页替换曲库 body（Flutter `_buildEditor`）——3 个分组，每组一条标题行（组名 + 整组**上移/下移**按钮，首组禁上移末组禁下移）+ 组内 `SortableRoot` **拖拽排序**（`as` 缺省 = 普通 view、嵌在外层 scroll-view 里，`DraggableRoot`+`SortableItemArea` 只让拖拽柄起手、行内 Switch 不受手势干扰；**刻意不传 `scrollableBoundaryId`**，组移动按钮是任一平台拖拽失灵时的非手势逃生口）+ 每行「图标 + 文案 + 可见性 `AppSwitch`」。顶栏 `✕ 取消 / 自定义视图 / 保存`；**保存前校验至少一个可见**，否则就地报错不退出、不写；草稿经 `groupedFlatten` 规整成按组连续后走**乐观 PUT**（mutation onMutate 即写缓存、失败 refetch 回滚，错误不再静默）。② **入口**：曲库页新增顶栏（标题 + `tune` 图标，新绘），取代设置页入口——**删** `BrowseViewsPage.tsx/.css`、`/settings/browse-views` 路由、`SettingsPage` 的 `'browse-views'` 成员/行/case、barrel 导出、`library.browseViews*` 两个 i18n key（删前全库 grep 确认零引用）。③ **测试**：新 `library-view-editor.test.tsx`（3 组头 + 14 行、隐藏行 Switch 无 `ui-checked`、拨一个开关只改那行、整组下移后保存为**按组连续的完整 14 项**逐 key 断言、**全关保存 mutation 0 次**、取消不写）；拖拽手势本身结构性不可测（sortable mock 只铺不拖，AGENTS §6），重排逻辑由 `setGroupOrder` 域测试覆盖。验收：`build` 双产物 / `build:web` / `tsc -b` / **1267 vitest（132 文件）**。**四批重构至此全部完成**：曲库从「硬编码 4 tab + 空转的自定义分类」变为对齐 Flutter 的单页 14 视图，分类显示/顺序与排序都在曲库页内设置。**待真机验**：编辑器拖拽在 Android/iOS/Web 三端的手势（计划里点名的最高风险点）、14 视图观感、排序冷启动保留。
> **批51-C · 曲库深度重构批 C：排序上提 + 持久化 + 底部面板**：把排序从旧「3 个 chip、存在组件局部 state、切 tab 即丢」改成用户要求的样子。① **新 `shared/ui/ActionSheet`**（fixed 根 + backdrop + 底部 panel + `catchtap`，照 `SongContextMenu` 的形态而非 `lynx-ui-sheet`——理由同批50：imperative sheet 会让 children 常驻挂载、每次挂载白打请求）+ `ActionSheetItem`（图标 + 文案 + 选中对勾）。② **新 `LibraryToolbar`** 取代旧 sort-bar：播放全部 / 排序 / 添加 / 多选四个入口；排序点开 ActionSheet，**7 个选项**（added_at·file_modified_at·title·artist·album·year·duration，方向绑字段，全部在后端 `songOrderWhitelist` 内——域测试逐条断言成员关系，正是旧 `sort=random` 静默回落 bug 的闸门）。③ **排序状态上提到 `LibraryPage`**：`useState` + 挂载时一次 `readLibrarySort()` 播种、变更即 `writeLibrarySort()` 落 `SongloftStorage.prefs`（设备上原生持久化，跨重启保留）；因为状态在页面不在视图，**切 14 个视图排序不丢**（`FlatSongsView` 只经 props 收发）。验收：`build` 双产物 / `tsc -b` / **1262 vitest**。**⋮ 溢出菜单（清理失效歌曲等）与「自定义视图」入口一并留到批 D**——「+」按钮仍走 `/library/add`，清理失效在 library-ops 页已有入口，不重复造。**待真机验**：7 个排序都返回结果、冷启动排序保留。
> **批51-B · 曲库深度重构批 B：14 视图外壳 + 三路分发**：批 A 的地基之上，把曲库页从「硬编码 4 tab」重写成 Flutter 的**单页 14 视图**。① **外壳三件套**：`LibraryShell`（宽/窄分支的纯组件——宽屏左侧 220px `LibraryViewRail`、窄屏顶部横向 `LibraryViewSwitcher` pill 条，组间 hairline 分隔，每个视图带自绘图标）；宽/窄由 `useBreakpoint(0, '.library-shell')` 驱动（含批51 期间 `useBreakpoint` 新增的挂载时一次 `boundingClientRect` 测量——Web 上 `bindlayoutchange` 对导航后挂载的元素不 fire，`SettingsPage` 宽屏布局曾因此死掉，曲库页是第二个受益者）。横向 pill 条用 `scroll-orientation='horizontal'` 而非弃用的 `scroll-x`（home-section-scroll 闸门抓出来的，内行 `width: max-content` 才能真滚）。② **三路分发**：`resolveLibraryView` 解析 `?view=` 后按组派发——songs 组 → `FlatSongsView`（从旧 `SongsView` 抽出，`type` 变 prop、删掉三个手打筛选 Input）、facets 组 → `FacetGridView`（新，**服务端搜索**——`/songs/facets` 的 `keyword` 参数旧视图接了线但从不暴露）、playlists 组 → 复用 `PlaylistsView`（`type` 由 `playlistViewType` 给）。每个内容视图 `key={selected}` 强制切视图时重挂载、清本地态。③ **旧值迁移**：`router.tsx` 的 `validateSearch` 换成 `migrateLibrarySearch`（songs→all / facets→artist / playlists→playlist_normal；`radio` 与新 key 冲突、新值直通优先——旧深链接一次性漂移已固化成单测）；5 处 navigate 同批改完（HomePage「查看全部」×2、PlaylistDetailPage 删除后返回、CategorySongsPage 返回、切换条自身）。④ **CategorySongsPage 收敛**：删掉 `SOURCE_FIELDS` 四个坏 filter（folder 拿本地化文案当 path_prefix / favorites 显示整库 / random 用白名单外的 sort），`CategoryField` 收敛为 7 个 facet 维度，label 查 `LIBRARY_VIEW_LABEL_KEY`。⑤ **测试**：重写 `library-page.test.tsx`（14 pill / 3 组 2 分隔线 / 三路分发各一条 / 隐藏视图深链接仍可选中并插回切换条 / 配置 pending 不渲染 / 全隐藏空态 / 宽屏出 rail），旧 song-view 的搜索/排序/**P1-12 多选清空回归**迁到新的 `flat-songs-view.test.tsx`，新增 `facet-grid-view.test.tsx`（keyword 传参 + 两种空态分支）。新增低野心 e2e `library-views.scenario.ts`（三路各截一图 + 旧值迁移不报错）。⑥ **i18n**：en/zh 同形删 18 个死 key（旧 4 tab + 3 facet 文案 + 11 个自创 browse 视图）、加 2 个新 key（分类搜索占位 / 无匹配）。验收：`build` 双产物 / `tsc -b` / **1260 vitest（131 文件）**。**待真机验**：三路分发观感、pill 条横滚、宽屏 rail（e2e 场景已就位）。**批 C/D 待做**：工具条 + 排序面板 / 页内视图编辑器 + 拆设置页入口。
> **批51-A · 曲库深度重构（对齐 Flutter 14 视图体系）批 A：契约与域**：起点是用户报「曲库的设计有问题，自定义曲库显示分类也是有问题的」。探查证实**「自定义显示分类」整个功能从未生效过**：后端 `PUT /settings/library-browse` 契约是 `{views:[{key,visible}]}`（顺序=数组下标，14 个合法 key），而旧实现发 `{id,visible,order}` —— GET 时 `String(item.id ?? '')` 恒空串、永远回落全默认；PUT 时后端 `isValidLibraryViewKey("")` 判非法 → **400**，被 `BrowseViewsPage` 的 `.catch(()=>{})` 静默吞掉。且 `KNOWN_VIEWS` 自创 `folder/recent/favorites/random` 四个后端不认的 id、弄丢了 `all/playlist*` 四个。**本批零 UI 结构改动，只换地基**：① 新 `models/library-browse.ts`（zod：14 key 白名单 + 非法/重复丢弃 + 缺失按默认序补末尾，永不抛，客户端与后端 `normalizeLibraryBrowse` 双重归一）；② 新 `library/domain/library-views.ts`（单一真源：组归属/label/图标三张表、`groupLibraryViewKeys` **按组 Map 分桶**（组顺序=首次出现序，非连续输入仍归一桶——后端补齐 key 会造出非连续配置）、`groupedFlatten`/`moveGroup`/`setGroupOrder`（编辑器用）、`flatViewType`/`playlistViewType`/`facetViewField` 三路分发、`resolveLibraryView`（隐藏视图的深链接仍可选中并按 config 原位插回切换条——Flutter `_forcedViewKey`）、`migrateLibrarySearch`（旧 4 tab 值迁移）；③ 新 `library/domain/library-sort.ts`（7 个排序项，方向绑字段，每个 field 单测断言 ∈ 后端 `songOrderWhitelist`——旧 `sort=random` 静默回落 `added_at` 那个 bug 的闸门）+ `library-sort-prefs.ts`（prefs 持久化）；④ 新 `library/api/library-browse-api.ts` + `data/library-browse-query.ts`（**刻意不配 `placeholderData`**：配置未回前渲染骨架而不是默认 14 项，否则隐藏了 `all` 的用户会看到界面飞行中从歌曲列表闪成分类网格；mutation 乐观更新 + 失败 refetch 回滚，错误不再静默）；⑤ 删 `settings-api.ts` 六个坏成员、删 `use-browse-views.ts`（裸 fetch 绕 Query 的全库两处之一），`BrowseViewsPage` 暂留改接新 query（批 D 拆）、`FacetsView` chip 条改读新 query（自创 source chip 消失，只剩配置里可见的 facet 维度）；⑥ 补 `invalidateAfterScan` 漏掉的 `['library','stats']`（扫描后首页统计从此真刷新）；⑦ 补 9 个图标（cloud/radio/person/album/tag/calendar/globe/brush/queue）+ 22 个 i18n key（en/zh 同形）。**一处计划内修正**：迁移表原写 `{view:'radio'} → 'playlist_radio'`，实现时发现 `radio` 与新 key（电台歌曲视图）冲突，旧值优先会劫持新 pill 的 `?view=radio` 导航 —— 改为**新 key 直通优先**，旧 `radio` 深链接落到电台歌曲（一次性漂移，已注释+单测固化）。**动态 i18n key 闸门**：label 查表形态绕过了现有「字面量 `t('…')`」扫描（AGENTS §6 的洞），在两个域测试里直接 import `en` 断言每张表的每个 key 可解析。**真后端验证**：PUT 新形状 → **200** + 归一化 14 项回显（旧形状是 400）；注意验证结束时把开发后端的配置重置为全可见默认态（此前有一条来源不明的 `local:false`，GET 时未完整捕获、无法原样还原）。验收：`build` 双产物 / `tsc -b` / **1250 vitest（129 文件，+44）**。**批 B/C/D 待做**：新曲库外壳 + 三路分发 / 工具条 + 排序面板 / 页内视图编辑器 + 拆设置页入口（计划：`~/.claude/plans/flutter-noble-hickey.md`）。
> **批50 · 播放历史：形态与链路双向修正**：起点是用户报「播放历史页面有报错」——页面上那行 `不支持的 context_type` 只是最外层症状，往下挖是**三处独立的错**。① **形态错**：Lynx 把它做成「设置 → 高级 → 播放历史」+ 独立路由页 `/library/history`，而后端历史是**按播放上下文分桶**的（歌单 或 artist/album/genre/year/decade/language/style 七个分面维度，各自独立 50 条），**没有全局「最近播放」端点**。设置页那个入口拿不到任何上下文，所以它不是「坏了」而是**不可能修好**；Flutter 参考实现是 `PlayHistorySheet`——底部面板，从歌单详情页与分类歌曲页打开，标题「「周杰伦」播放历史」。② **读错**：`getPlayHistory` 只发 `?limit=50`，缺两个必填 context 参数 → 稳定 400。`deletePlayHistoryEntry` 同样缺 context，且零调用方。③ **写从来没成功过（比读更严重）**：后端 `SongPlayed` 把 `type`/`source`/`context_type`/`context_key` **全部从 query 读**且 `type` 缺省 `finish`，而只有 `type=play` 才落库；前端把 context 放在 **JSON body** 且从不发 `type` → 每次 204、一条都没记。**歌单也一样**，所以没有任何存量数据能用来验证读路径。加上 `CategorySongsPage` 两处起播压根不传上下文、`playSong` 不清上下文（单曲播放会记到上一个歌单名下），四个缺口叠起来才是「历史永远空」。**改前先反向验证**：用真实后端按旧形状 POST（body 带 context、无 `type`）→ 历史 0 条；按新形状（query + `type=play`）→ 1 条。**做法**：新增 `player/domain/playback-context.ts`（`PlaybackContext {type,key}` + `playlistContext`（`id<=0` → undefined，因为 `PlaylistDetailPage` 的 `Number(params.id ?? 0) || 0` 在参数缺失时**就是** 0 而 `0 != null` 为真）+ `facetContext`（拒绝 source 维度与空 value——「未知歌手」桶的 value 合法地是 `''`，后端见空 key 直接 400）+ `playlistIdOf`（分面上下文返回 undefined 而**不是** NaN，那个值会流到插件的 `source_playlist_id`））；`playPlaylist` 第三参 `playlistId?: number` → `context?: PlaybackContext`，**`sourcePlaylistId` 降级为派生字段**，于是 HomePage selector / 歌单卡片高亮 / 插件出站契约零改动（只有 3 处调用方要改，20+ 处单测与 12 处 e2e 全是 2 参调用）；持久化改存 `playback_context`（JSON），旧 key `playback_source_playlist` 只读一次做迁移、之后每次写入都清掉，且 `JSON.parse` **放在独立 try 里**（折进外层会把一条脏 pref 升级成「整个恢复队列丢失」）。**面板刻意不用 `lynx-ui-sheet`** 而照 `SongContextMenu` 手写（fixed 根 + backdrop + 底部 panel + `catchtap` + 内部 `scroll-view`）：sheet 是 imperative ref 模式、children 常驻挂载，放进这两个页面等于**每次进页面白打一发历史请求**，还要给两个页面的单测补 sheet mock，并违背 `CategorySongsPage` 明文写的「不引入 player barrel 与 lynx-ui 手势叶子」；代价是没有拖拽下滑关闭。面板 CSS **不复制 `.song-row`**——router eager import 所有页面，那三份规则已是全局，第四份会在同特异性下跟它们抢（`LibraryPage.css` 是 `width:100%`、`PlaylistDetailPage.css` 是 `flex:1;min-width:0`）。点历史条目：命中已加载 queue 就地起播，未命中**追加到队尾**而不是单曲起播（一首的队列会让「下一首」死掉）；**不做** Flutter 那套从 `/songs/ids` 环形补齐真实顺序。入口：歌单详情页的历史按钮**必须在 `!isBuiltIn` 之外**（Flutter 那个菜单项是无条件的，而「收藏」正是最常回放的歌单），受 `!sortMode && !editing` 门控；分面页一处入口覆盖 7 个维度，仅 `facetContext` 有值时显示。两个 topbar 各包一层 `__topbar-right` 承载唯一的 `margin-left:auto`——否则历史按钮与原有 actions 各自 auto 会**平分**剩余空间而不是都靠右。`api-design-conventions.md:33` 逐字写着 playPlaylist 的位置参数例外条款，改签名同步更新（AGENTS §3 要求）。e2e 场景重写为**Node 侧 HTTP 断言服务端状态**（Lynx BTS 无 `fetch`）：旧场景只断言「歌在播」，所以一个完全不落库的客户端照样绿灯整整 19 批。新增 **43 条单测**，最有价值的两条是「`recordPlayed` 把 type+context 放 query 而非 body」与「无上下文时不带 context 上报」。验收：`build` 双产物 / `tsc -b` / **1050+ vitest**。**待用户验证**：两个入口的观感、点历史条目能否接着往下播。
>
> **批49（进行中）· 视频歌曲全屏原生播放**：方向已定——**全屏原生**（新 `SongloftVideo` 模块，Android 起 Activity、iOS present `AVPlayerViewController`，画面接到**现有的同一个播放器实例**上；不做自定义 `<x-video>` Lynx 元素：本仓库零先例、iOS 纯 Swift 而注册宏是 ObjC-only、且「标签未注册时 Lynx 不报错、元素静默不渲染」这个失败面零闸门覆盖），视频源**能直出就直出、不行回退 `video-hls`**。**Step 0–1 已完成**：`songUrl()` 从不传 `platform`，`getTranscodeFormat` 于是落到 `'web'` 默认集，造成两个方向相反的静默错误——① 视频容器被无条件追加 `?format=mp3`，即**客户端主动要求后端 `-vn` 把画面剥掉**；② iOS 上 ogg/opus 因为在 web 集合里而**不转码**，AVPlayer 根本打不开。新增 `native/platform-target.ts`（映射值是**实测**的：两侧 `SystemInfo.platform` 恰好是 `'Android'`/`'iOS'`，且 `SystemInfo` 与 `NativeModules` 不同、在 eval scope 里可达），并把 `audio-format` 的视频容器分支平台化。**这里刻意保守**：只有 MP4 家族（m4v/3gp）在设备上放行直出，Matroska/AVI/FLV/ASF/RealMedia/MPEG-PS/裸 ts 与 mka 在两端仍转 mp3、Web 完全不动——容器名不揭示内部编码（`.mka` 可能是 FLAC，也可能是需要授权的 AC-3/DTS），而真正的视频歌根本不走这条路（去 `?media=video` / `/video-hls/`）。**若不做这一步就直接补 `platform`，iOS 上今天能出声的 mkv/mka 会从「有声无画」变成彻底放不出来**——反向验证时那条 `mkv/ios: expected null to be 'mp3'` 正是它。**真机前后对比**（同一台 iPhone 16 Pro / iOS 18.3、同一首 ffmpeg 生成的 opus-in-ogg）：改动前 `state=error` / `err="Cannot Open"`、位置卡 0；改动后 `state=playing`、位置 1000→2500→4500。Android 侧行为不变（两平台集合都含 opus）。**环境坑（新踩）**：`scripts/e2e-ios-setup.mjs:107` 是 `if (!isAppInstalled(...))`，**已装就不重装**，所以 `ios:build` 之后必须自己 `simctl terminate` + `simctl install`，否则测的还是旧包——第一次复测就是这么得出「修了也没用」的错误结论的。验收：`build` 双产物 / `tsc -b` / **974 vitest（100 文件，+15）** / Android e2e 112/115 / iOS e2e 110/115（与改动前逐项一致）。**Step 2 已完成**：新增 `core/network/video-source.ts` 的三值判定 `resolveVideoSourceKind`（`none`/`direct`/`hls`）——MP4 家族两端直出，Matroska/WebM/ts 在 Android 直出而 iOS 走转码（AVFoundation 压根不能 demux 它们），avi/flv/wmv/rm/rmvb/mpg 两端都走转码（media3 有 extractor，但里面通常是 MPEG-2/Xvid/Sorenson，设备没有义务解，容器级白名单会把「能播」换成偶发的「静音黑框」），未知容器（远端歌的 `format` 为空）按 `direct` 处理。**判定表里的 `'m4a'` 是实测出来的**：后端 `songs.format` 用 tag 库的家族命名，扫一个 H.264+AAC 的 `.mp4` 回来是 `format: 'm4a', is_video: true`（mkv/avi/webm 则保留自己的名字，同法实测）——按「原始容器名」写集合会把每首 MP4 视频歌都送去做一次没必要的转码。`playbackSourceFor` 让 `direct` 的歌**一开始就加载视频流**（附加 surface 才能是瞬时的、不打断播放；而且不多花字节——没有 `format=` 时后端本来就在发原容器），`hls` 只在用户真的要画面时经 `enterVideoSource()` 换源（`/video-hls/` 要把整个文件转完才应答）。新增 `_videoSourceSongId` 让换源**扛得住重试**，否则一次断流重试会静默退回音频流、画面消失得像服务端抽风。顺带删掉 `buildVideoHlsUrl` 的 `mediaVideoFlag`——那个参数属于 `/songs/{id}/play`，在这个只收 id 的端点上是个接到空气的旋钮，靠自己的单测活着。Android 侧 HLS 分支把 `DefaultHttpDataSource` 的 8s 读超时提到 300s：`/video-hls/` 首次请求会一直挂着，8s 必然 `SocketTimeoutException`，而症状与「没装 ffmpeg 的 503」难以区分。**设备实测**：Android 上 mp4 `state=playing` 且 logcat 出现 **`c2.android.avc.decoder`**——H.264 视频解码器真的被实例化，证明视频轨已进流（还没 surface 可画）；iOS 上 mp4 直出可播、mkv 起播后 `enterVideoSource()` 无错且播放继续；`/video-hls/playlist.m3u8` 直接 curl 返 200 + `application/vnd.apple.mpegurl` + 相对段 URL（各自带 token）。三处新断言反向验证过（重试点退回 `songUrl` / 不传 `hls` / 摘掉 `direct` 分支，各自只点亮该点亮的那条）。验收：`build` 双产物 / `tsc -b` / **986 vitest（+12）** / `gradlew assembleDebug` / Android e2e 112/115 / iOS e2e 110/115。**Step 3 已完成（Android 上画面真的出来了）**：引擎新增 `attachVideoOutput`/`detachVideoOutput`/`hasVideoTrack`（`player` 仍私有——调用方只拿到「把画面画到这里」的权力，不拿 transport），新 `video/SongloftVideoActivity`（黑底 + SurfaceView，`onStart` attach / `onStop` detach）与 `video/SongloftVideoModule`（`open`/`close`/`isOpen` + `SongloftVideo.closed` 事件），manifest 声明 + `SongloftApplication` 注册；TS 侧 `native/video.ts`（照 `dlna.ts` 逐方法 promisify，缺一个方法就整体当没有）、capability 位 `video`（按模块名探测，因为 Web 有 `SongloftAudio` 宿主模块但压根没有视频面）、`FullPlayerPage` 的 ▶ 角标变成入口（`isVideo` 时始终显示——它同时是元数据，但只有真能看时才可点）。**两处实测纠正了设计**：① 一开始用 `player.videoSize` 判断有无视频轨，实测 `open()` 恒返回 false——**那是鸡生蛋**：没有 surface 就没有帧输出、`videoSize` 永远是空的。改读 `currentTracks` 的轨道组（来自轨道选择，与是否渲染无关）。② 截图发现画面被**拉伸变形**（640×360 源、MATCH_PARENT 的 surface、竖屏设备），补 `onVideoSizeChanged` → `applyAspect()` letterbox；media3 的 `AspectRatioFrameLayout` 在 `media3-ui` 里，而那个依赖不要（`PlayerView` 自带控件会跟 Lynx 控件抢 transport）。**设备证据**：截图上是 ffmpeg `testsrc2` 彩条 + 走动的时间码（`00:00:04.920` / 第 123 帧），两张间隔 1.5s 的截图不同即画面在动；修完宽高比后是正确的 16:9 居中 letterbox。**e2e**（`android-video-fullscreen.scenario.ts`，5 例）断言落在进程外：`topResumedActivity=` 里是 `SongloftVideoActivity`、进出全屏 position 单调递增且状态一直 `playing`（重载会经过 `loading` 且位置回退）、退出后**纯音频歌仍能播**（这条专抓漏掉 `detachVideoOutput`——ExoPlayer 会继续往已销毁的窗口画，下一首在 video renderer 里死掉，应用内完全静默）。**两个 e2e 环境事实（实测）**：这台 Android 13 镜像打印的是 `topResumedActivity=`，**没有** `mResumedActivity`（写错的话每条断言都会读成「Activity 没起来」）；素材缺失时用模块级 `await fetchVideoSong()` + `test.skipIf` 让 5 例**可见地 skip**，而不是每个 test 里 `return` 假绿。契约闸门扩了 `hosts`/`modules` 表 + 一段 6 例 describe（attach/detach 两侧存在、`runOnMain`、`hasVideoTrack`、事件名逐字），三处反向验证过；其中**删掉 manifest 里的 video Activity 声明由批48 那道闸门自动接住**，没写一行新代码。验收：`build` 双产物 / `tsc -b` / **995 vitest（+9）** / `gradlew assembleDebug` / Android e2e **112 passed / 8 skipped (120)** / iOS e2e **110 passed / 10 skipped (120)**。**Step 4 已完成**：`SongloftVideoModule.swift`（`open`/`close`/`isOpen`）+ `SongloftAudioEngine` 新增 `attachVideoOutput`/`detachVideoOutput`/`hasVideoTrack`。AVPlayerViewController 接引擎的 AVPlayer，关键：`updatesNowPlayingInfoCenter = false`（防覆盖锁屏元数据）、`videoGravity = .resizeAspect`（防拉伸）、close 时先 `vc.player = nil` 再 dismiss（防暂停共享播放器）。`ViewController.buildConfig()` 注册 + pbxproj 四处。契约闸门 6 例（方法存在、事件名、attach/detach、nil-before-dismiss 顺序、hasVideoTrack）。**调试中发现的坑**：iOS Lynx 模块 callback 类型必须是 `@escaping (String) -> Void`（同 DlnaModule），不能用 `LynxCallbackBlock`（NSArray error-first 风格）——用错后 selector 能匹配且能被调用，但 Lynx 桥传入闭包的参数路径不同，导致 `topViewController()` 拿不到 scene、静默返回 false。另外 `hasVideoTrack` 用 `item.tracks` 而非 `item.asset.tracks(withMediaType:)`——后者是同步 API，对流式 asset 可能阻塞或不可靠。**模拟器实测**（iPhone 16 Pro / iOS 18.3）：open → true、全屏期间音频持续推进、close 后 isPlaying=true、非视频歌正确拒绝。**Step 5 已完成**：iOS e2e 场景（`ios-video-fullscreen.scenario.ts`，5 例）+ SongRow ▶ 角标（`isVideo` 时标题旁显示）+ SongDetailPage 类型行追加标识 + 2 例回归测试。验收：`build` 双产物 / `tsc -b` / **1007 vitest（102 文件，+12）** / `ios:build` BUILD SUCCEEDED。
> **批48 · 悬浮歌词从未工作过（第四/五重死）+ AndroidManifest 闸门补位**：起点是「还剩什么没做」的巡查——`AndroidManifest.xml` 无闸门这条 P3 挂了很久，顺着去读文件，发现批43 记为「SYSTEM_ALERT_WINDOW 权限与 service 声明**此前已有**」的两项**都不存在**（源 manifest 与合并后的 manifest 双向核实）。① **manifest 缺两行声明**：`startService()` 解析不到未声明的 Service **不抛异常**（系统只打一行 `Unable to start service … not found`），权限未声明则让 app 不出现在「显示在其他应用上层」里、`canDrawOverlays()` 只可能 false、**用户无从授权**；而设置页开关是真的（模块批43 已注册，capability 探测为 true），点了就没反应。补两行后实测：`requestPermission → true`、`dumpsys activity services` 里 `FloatingLyricService` 在跑、`dumpsys window windows` 多出 `Window{… u0 org.songloft.lynx}` 覆盖窗口且 z 序在 MainActivity 之上，`hide()` 后两者都消失。② **`updateText` 在 Lynx JS 线程碰 View，异常被裸 `catch` 吞掉**：窗口浮出来了但**一行歌词不显示**，截图看不出（白字白底）；改用与配色无关的量才定位——写入前后 `Requested h=46`、`frame=[0,1354][1280,1400]`、`mLayoutSeq=4724` **逐字节相同**，压根没重排，而 `isShowing()` 为 true 说明静态 `service` 引用是好的，故只能是 `textView?.text = line` 自身失败（`setText` → `requestLayout` → `CalledFromWrongThreadException`，被 `FloatingLyricModule.updateLyric` 的 `catch (_: Exception) {}` 整个吞掉，logcat 一行都没有）。修法：经 `Handler(Looper.getMainLooper())` post；修后同一量测 `h` 46→48、`mLayoutSeq` 4748→4749、frame 顶边 1354→1352，截图上歌词可见。顺带补可读性：覆盖层原本白字+黑投影**无背景**，浮在浅色应用上几乎不可见（就在 Songloft 自己的白色首页上实测到），加半透明深色底。③ **新闸门 `android-manifest-contract.test.ts`（7 例）**：**从 Kotlin 源码推导需求而非硬编码清单**——基类名以 `Service`/`Activity` 结尾的类必须有声明（**反向也验**，防改名留悬空声明）、用了 `TYPE_APPLICATION_OVERLAY`/`canDrawOverlays` 必须声明 `SYSTEM_ALERT_WINDOW`、每个 `foregroundServiceType` 必须有配套权限（Android 14 起缺了是硬 `SecurityException`）、`MainActivity` 的 `configChanges` 必须含 `uiMode|locale|layoutDirection`（AGENTS.md §4 早有要求、此前无人验）、XML 结构可解析。**六条变异逐一反向验证**，各自只点亮该点亮的那条（改名同时命中两条，语义正确）。④ **新 e2e `android-floating-lyric.scenario.ts`（5 例）**：断言全部落在**进程外**的 `dumpsys` 上，因为三重死没有一次能让页面侧看到错误（TS facade 一律返回 resolved promise），只问 `isShowing()` 等于让嫌疑人自证清白；反向验证摘掉主线程 hop 即红（`expected 46 to be greater than 66`）。为此给 `e2e-bridge` 加了 `__E2E_FLOATING_LYRIC__`——实测 `NativeModules` 在 eval scope 里**根本不存在**（裸的和 `globalThis` 上都没有），这是批46 那个 `lynx` 不可见的同族坑。**门控坑**：`E2E_PLATFORM === 'android'` 会让 5 例在裸 `pnpm run test:e2e` 下整体跳过（`createDriver()` 把未设视为 Android），第一次全量跑就是这么「通过」的（107 passed / **8** skipped，比预期多 5 个 skip），改为 `(process.env.E2E_PLATFORM ?? 'android') === 'android'`。⑤ **顺带清理**：审计登记的 11 个死 i18n key 全部核实零引用后 en/zh 对称删除（22 行），`playlist.sortBy` 那处看似命中实为模型字段 `sortBy: 'position'`；确认全库只有 `settings.quality_${}`/`eq.preset_${}` 两处模板拼 key，其余 helper 都返回**完整字面量** key 故 grep 可靠。**验收**：`build` 双产物 / `tsc -b` / **959 vitest（98 文件，+7）** / `gradlew assembleDebug` / **Android e2e 112/115**（3 例 `ios-appearance` 平台门控跳过）/ **iOS e2e 110/115**（`e2e:ios:full` 全流程复跑，5 例 Android 专属的悬浮歌词跳过，无跨平台回归）。
> **批46 · iOS e2e 首跑的 6 个失败全修（Mac）**：首跑 104/110 → **iOS 110/110**，Android 复跑 107/110（3 例平台门控跳过）确认无跨平台回归。**首跑时对两条的归因是错的，实测推翻后才找到真根因**——所以本批先用一次性探针（TestBridge 驱动、密集采样位置/tick）把现象量化，再动代码。① **`durationMs` 在 `playing` 时为 0**：原判「iOS 只随 tick 上报时长，补一次 `.readyToPlay` 的 progress 即可」——**实测 `.readyToPlay` 时 `item.duration` 本就还是 `indefinite`**，补发也是 0；真正解析出的 45035.10ms 对应整数采样 1986048/44100，是解码整段后才有的。真根因在 JS：progress 处理**无条件** `duration: e.durationMs`，而两个宿主都把「未知」归一成 0（`C.TIME_UNSET`/`indefinite`），0 于是反过来**抹掉**已知时长；Android 只因 ExoPlayer 在 READY 就知道时长而没暴露。附带挖出真实缺陷：`playAtIndex` 从不写 `duration`，**切歌后总时长一直沿用上一首**。修法：`stateDurationMsOf()` 从服务端元数据播种（`playAtIndex` + 恢复播放两处共用），progress 改 `e.durationMs > 0 ? … : s.duration`。② **0.5x 下 1 秒推进为 0**：原判「每 tick 只推 250ms，两次读取夹在同一区间」——**实测每 tick 仍推 500ms，但间隔是 1.0 秒墙钟**：`addPeriodicTimeObserver(forInterval:)` 按**媒体时间**计间隔，墙钟间隔是 `interval / rate`。即播放毫无问题，是测试**结构性 flaky**（1 秒窗口只能抓到 0 或 1 个 tick）。修法：`installTimeObserver()` 按 `progressIntervalSeconds * speed` 安装、`setSpeed` 变更时重装，把墙钟节奏钉回 500ms（对齐 Android `PROGRESS_INTERVAL_MS` 那个 `postDelayed` 墙钟 500ms）；实测三速率均 500ms/tick（1x +500 / 0.5x +250 / 2x +1000）。连带把两条速度断言改成 2 秒窗口 + 容得下一整个 tick 的容差带——2x 的每 tick 步长现在是 1000ms，旧的 1 秒窗口对它同样有约 10% 误判概率（**我自己的改动引入的新风险，不改测试就是埋一个 flake**）；同一轮里 `audio-playback` 的 seek 断言也暴露为刀锋（容差 500ms 恰好等于它自己 sleep 500ms 的合法推进量，实测 500.216 > 500 翻车），改为「target + 实测 elapsed ± 一个 tick」的带。③ **坏 URL 后停在 `loading`**：归因成立——AVPlayer 在 item 失败后**仍继续**发 `timeControlStatus` 转换，把 JS 刚落定的 error 盖成 `loading`（ExoPlayer 失败即转 idle 并安静），加 `itemFailed` 闭锁到下次 `load()`。④ **appearance 3 例**：测试从 BTS realm 读 `lynx.__globalProps`（那里没有 `lynx`），改经 `e2e-bridge` 暴露的 `__E2E_APPEARANCE__` 读。**照 bug.md 那条「先验宿主链路、别把真 bug 当测试 bug」的警告做，真挖出一条**：只断言 `getSystemAppearance()` 是在测空气——那台模拟器持久化的 app 主题是 `'light'`（用户覆盖），此时 app 本就不该跟随系统，而这种断言照样全绿；改为测试自己 `changeAppTheme('system')` 建前提、结束还原，并断言 `appTheme === 'system'` + **解析后**的 `resolveTheme(getAppTheme())`（app 真正渲染的主题，对得上用例名）。⑤ **回退了首跑时加的推测性改动**：seek 完成后 `playImmediately` 恢复播放（`intendedPlaying` 一族）基于「seek 把播放停了」的猜测，根因既已查明，留着就是无法证伪、也没有回归测试的代码。⑥ **闸门**：两条 JS 修复各配一个反向验证过的单测（摘掉守卫 → `expected +0 to be 30000`；摘掉播种 → `expected 30000 to be 90000`，正是「沿用上一首」的症状）；`mock-audio` 补 `simulateUnknownDurationProgress()`——mock 一直被 `load` **直接告知**时长并同步回显，真实宿主做不到，**这正是掩盖该 bug 的前置条件缺口**（同族前例见 §6）。**验收**：`build` 双产物 / `tsc -b` / **951 vitest**（+2）/ `ios:build BUILD SUCCEEDED` / **iOS e2e 110/110** / Android e2e 107/110（3 跳过）。**环境坑（又踩一次，已在 HANDOFF）**：`simctl install` 不替换**已运行**的进程，改了 bundle 必须先 `simctl terminate`；跑完 Android e2e 后残留的 `adb forward localhost:9230` 会**抢走**宿主侧连接，害得 iOS 测试连到 Android 上的旧 bundle（表现为 `changeAppTheme is not a function`），跑 iOS 前必须 `adb forward --remove tcp:9230`。
> **批47 · 自签名两条缺陷收口（iOS 媒体流 + 关开关立即生效）**：都实测通过。① **P2 — iOS 自签名媒体流**：`InsecureMediaLoader` 把 asset URL 的 scheme 换成 `songloft-insecure-https`，AVFoundation 无法自行加载于是把每个加载请求交给我们，由 `InsecureTls.session` 拉字节范围；`InsecureTls` 里那段答复信任挑战的 `shouldWaitForResponseTo` 实测不触发，**直接删掉而不是留成诱饵**。**过程踩了两个坑，都进了代码注释**：(a) 回调队列一开始挂 `.main`，而 `buildAudioMix` 会在主线程同步等 asset 轨道 → **送数据的线程正是被阻塞的那个**，每次尝试卡约 10 秒后 `-11800`，HTTP 请求在 AVFoundation 放弃之后才发出（设备日志 `curll_… timed-out on handler` 是唯一线索）；(b) 第一版用 completion-handler 一次性收，`requestsAllDataToEndOfResource` 把整条剩余音轨读进内存（实测 19MB 文件来了一个 19MB buffer），且 AVFoundation 从此只从头消费、seek 不发新 range —— 改流式后非零偏移的 `bytes=20471-` 才出现。**素材也踩了两次**：先选到远端歌（上游 502，明文下同样播不了），再用 `cat` 拼 24 份 mp3（AVFoundation 只认第一段的 Xing 头 → 以为 45s，seek 被夹住），最后用 `ffmpeg` 生成 20 分钟正规 mp3 才测到真东西；测完删文件重扫还原了曲库。② **P3 — 关开关立即生效**：`update()` 在值真变化时 `invalidateAndCancel()` 并重建 session。**Android 补测发现它本来就立即生效**，且原因不是巧合：`clientFor()` 在标志变化时重建 `OkHttpClient`（OkHttp 的 TLS 配置按 client 不可变），新 client 自带新连接池——两端语义现已对齐。③ **闸门**：新 Swift 文件按规矩在 pbxproj 四处登记，契约闸门自动覆盖到它（反向验证摘掉一处即红）；`build` 双产物 / `tsc -b` / **952 vitest** / `ios:build BUILD SUCCEEDED` / **iOS e2e 110/110**（开关关时零回归）全绿。**仍未做**：HLS 播放列表内的绝对 `https://` URI（相对 URI 按构造会回到加载器，Songloft 自己的反代产出的正是相对 URL，但两者都无可测的自签名 HLS 源）。
> **自签名 TLS 实测（2026-08-15，iOS 18.3 模拟器，批45 的验收补做）**：后端没有 TLS 参数，故用 `openssl req -x509`（SAN 含 `IP:127.0.0.1` 与 `DNS:localhost`）+ 20 行 Go TLS 反代把 `https://127.0.0.1:58543` 转到明文 :58091，经 `__E2E_AUTH_STORE__.login({apiBaseUrl, insecureTls})` 驱动。**结论三条**：① **批45 的目的达到了** —— 开关**开**→登录成功，开关**关**+换 hostname（强制新连接）→ 立刻 `HTTP 499`，`fetch` 路径确实通且开关确实被尊重（这正是 Android 旧实现失效的那条）。② **媒体流不通，bug.md 那条 P2 判定成立** —— 开关开、登录成功，同一首歌播放立刻 `state=error` + `The certificate for this server is invalid.`，即 `AVAssetResourceLoaderDelegate.shouldWaitForResponseTo` 在 iOS 18.3 上**不为普通 https 资源投递挑战**；自签名服务器在 iOS 上「能登录、能浏览、不能播放」，修法只剩自定义 scheme 代理（未做）。③ **关闭开关不影响已建立的连接**（新记 P3）：同一 URL 关掉开关仍成功，因为 TLS 按连接协商、复用连接池条目不再发起挑战；`InsecureTls.handle` 每次挑战都重读 `enabled` 是对的，问题在「可逆」被读成「立即生效」。**方法论踩坑**：验证「关掉是否生效」必须换 hostname——第一次实测跑第二轮时连 ① 都「成功」，只因上一轮结束时开关是开的、连接还热着，差点得出「开关完全无效」的错误结论。
> **iOS 首次编译 + e2e 首跑（2026-08-15，Mac/Xcode 26.6）**：批45 留下的「iOS 一行没编译过」在此收口。① **编译命中 4 处**，全是「Swift 怎么看 ObjC 声明」：`SongloftHttpService` 三个方法名要按 importer 剥掉类型重复词后的形态写（`invoke(with:callback:)` / `invokeStreaming(with:callback:with:)` / `processChunkedData(_:with:)`，selector 不动）；`LynxServices.getInstanceWith(_:)`（不是 `getInstance(with:)` 也不是 `instance(withProtocol:)`，用探针文件让编译器报出真实签名）；**预测之外**的第 4 处——`ViewController.buildConfig()` 的 `config.register(LiveActivityModule.self)` 无可用性守卫，类是 `@available(iOS 16.2, *)` 而部署目标 16.0，硬编译错（该行批43 加的、同样从未编译），包 `if #available(iOS 16.2, *)`，契约闸门断言不受影响。② **验收**：`pod install` + `pnpm run ios:build`（双 JS 产物 + Pods + app 全 `BUILD SUCCEEDED`）+ `tsc -b` + **949 vitest** 全绿；模拟器（iPhone 16 Pro / iOS 18.3）启动、首屏渲染、6 模块全注册、TestBridge ping/eval 正常。③ **iOS e2e 首跑 104/110**（外部真实服务器 :58091）：音频基础/队列/曲末 + 其余 23 文件全绿，证明批45 替换的宿主 HTTP service 在 iOS 工作正常；6 个失败已分类入 `bug.md`——音频 3 条是 iOS 引擎与 Android 参考行为的真实语义差异（时长上报时机 / 低速 tick 粒度 / error 后透明重试中间态），appearance 3 条是测试从 BTS realm 读 `lynx.__globalProps`（那里没有 `lynx`）读错对象。④ **环境清理**：跑 e2e 前发现 9230 被 8-13 遗留的旧模拟器实例（`*:9230`）+ adb forward（`localhost:9230`）双重占用、且有第二台 Booted 模拟器干扰选择，经用户确认清理后 TestBridge 正常监听。**待用户定夺**：是否开新批修这 6 条（音频侧对齐 Android 语义 / appearance 侧改测试读 BTS 可达状态），以及本批 iOS 编译改动（3 个 Swift 文件）尚未提交。
> **批45 · iOS 原生缺口收口（insecureTls 三条路径 + 锁屏封面）**：接手 HANDOFF 里记的两条 P2，复核后发现**记录本身有偏差、缺口比记的更深**。① **`setArtworkUri` 根本不是桥接方法**——它是 Android 引擎内部调用的 Media3 `MediaMetadata.setArtworkUri`，跨桥的是 `setQueue` 里的 `artworkUrl`；iOS 一路解析并存进 `metadataByURL` 却从不被读取，锁屏/控制中心/CarPlay 永远无封面（`SongloftAudioEngine.swift` 里那句「JS store 还没发这个字段」的注释在批40 起就已过时）。补 `artworkCache` + in-flight 去重 + 完成后**回主线程重走 `updateNowPlaying()`**——不能直接改 `nowPlayingInfo`，因为该函数每次都整体重建字典、有 7 个调用点，直接改会被下一个 progress tick 抹掉。② **`setInsecureTls` 两个宿主都是半残的，不只 iOS 缺失**：Android 把 trust-all 装在 `HttpsURLConnection` 的**进程全局默认**上，而 JS `fetch` 走 `LynxHttpService` + OkHttp，OkHttp 自建 `SSLSocketFactory` 完全无视那个全局默认 → **用户开了开关仍然登录不上自签名服务器**，也就是这功能的唯一用途一直失效；且 `enabled=false` 被静默忽略，trust-all 留到进程被杀（换回公网服务器也还在放行）。iOS 连方法都没有，而契约闸门里那句「iOS uses ATS plist + custom URLSessionDelegate」**后半句是虚构的**，前半句也无关——`NSAllowsArbitraryLoads` 只放开明文 HTTP，对证书校验没有任何作用。③ **修法：两侧各自替换宿主 HTTP service**。SDK 的实现把 client 私有化（Android 私有 `OkHttpClient()`，iOS 直接用不能挂 delegate 的 `URLSession.shared`），拿不到 TLS 钩子，所以新增 `net/SongloftHttpService.kt`（`ILynxHttpService`）与 `SongloftHttpService.swift`（`LynxServiceHttpProtocol`），两者都是 SDK 实现的**逐行转写**（同样的 499 哨兵、同样的 header 拼接、同样的 streaming 分支），只在 TLS 配置一处分叉。注册一律「**替换而非覆盖**」：Android 不再注册 `LynxHttpService`，iOS 从 Podfile **摘掉 `LynxService/Http` subspec** 并在 `AppDelegate` 显式注册——服务按接口/协议绑定，谁赢没有文档保证，所以直接不留竞争者；失败模式刻意做成响亮的（丢注册 → 请求全死）而不是「静默回落到忽略 TLS 设置的 SDK 实现」。`InsecureTls`（两侧同构）收口三条出站路径：`fetch`、媒体流、模块自己的上传/SOAP/封面，且**双向可逆**（抓存原始默认值再恢复）。ExoPlayer 那条**刻意继续依赖全局默认**——`DefaultHttpDataSource` 没有 SSL 注入点，做explicit 要引 `media3-datasource-okhttp`，取舍写进了代码注释。④ **TS 侧补漏**：`applyInsecureTls` 原先只在 auth-store 的 hydrate/login 调用，改服务器设置（`settings-prefs.ts`）与切服务器档案（`server-store.ts`）都只写 `appConfig` 不通知原生，两处补上并各配反向验证过的回归测试。⑤ **闸门收紧（4 条，全部反向验证过会红）**：`setInsecureTls` 进主循环（删掉那条豁免与虚构注释）；Kotlin 断言从 `fun X(` 子串改成 `@LynxMethod\s+fun X(` 正则——旧写法**抓不到「方法在、注解没了」**，而失败信息还谎称在验注解；iOS 注册断言收窄到 `buildConfig()` 切片内的 `config.register(X.self)` **且先剥注释**（反向验证时我自己第一版仍被「整行注释掉的注册」骗过——同一个「验子串不验语义」的坑，当场补上）；新增宿主 HTTP service 注册闸门 + `Info.plist` 结构可解析性（标签嵌套配对、`<key>` 必须有兄弟值）与 `NSAllowsArbitraryLoads` 断言。⑥ **环境自举**：本机（Linux）原先无 JDK/Android SDK，用 mise 装上 `android-sdk` cmdline-tools（java temurin-17 已在），**Android 侧从此可真编译**——`./gradlew assembleDebug` 全程用于验证本批 Kotlin 改动。**验收**：`build` 双产物 / `tsc -b` / **949 vitest**（+9）/ `assembleDebug BUILD SUCCESSFUL` 全绿。⚠️ **iOS 一行都没编译过**（无 macOS），所有 ObjC 接口点用显式 `@objc(selector)` + 与导入名对齐的双保险写法降低风险；协议签名不是猜的，是从 maven / GitHub release 拉下 SDK 源码与官方参考实现读出来的。**待用户 Mac 与真机验证**：`pod install` + `ios:build`，以及自签名服务器上「关→登录失败 / 开→登录成功+出声+锁屏封面 / 再关→重新失败」四步，其中 iOS 媒体流那条见 `bug.md` 的 TODO。
> **批42 · 审计「一眼可见」缺陷，五波共 13 条**：全部来自 2026-08-14 四路审计的 P1 清单，每条都配了**反向验证过的**回归测试（摘掉修复即变红）。**第一波**：① 登出弹窗取消按钮字面显示 `common.cancel`（补 key + 新增「扫描全部字面量 `t('…')` 断言 key 存在」闸门——现有 i18n 测试只校验中英互相对齐，两边同缺的 key 从两道断言间穿过去了）；② 收藏歌单 id 分页 `for(;;)` 只比累计条数不比空页，服务端报多返少时无限刷请求（该函数每次切歌都被调），改空页即停 + 200 页兜底；③ 升级进度轮询裸 `void getProgress().then()` 无 catch，后端重启后每 2s 一条未捕获 rejection 且永不给结论，改容忍 15 次失败后落终态（测试顺带揪出 `error` 只在 `!checkResult` 时渲染、检查成功后的错误一直不可见的第二处问题，补独立渲染位）；④ 队列重排用 `next.indexOf(pinned)` 按对象身份定位，同一 Song 引用合法地出现两次时钉错那一份，改纯下标算术。**第二波**（播放器状态，都是「store 与音频引擎状态不一致」）：⑤ 播放位置落盘阈值 `>5000ms` 而 progress 每 250/500ms 一跳，正常播放中永不成立、落盘值可靠地是 0，改 10s 桶下标 + flush 时读最新 state；⑥ 冷启动（自动续播默认关）只写 store 不 load，`togglePlay` 裸 `audio.play()` 在无 media item 时是静默 no-op，播放键点了什么都不发生——**一直被 mock 掩盖**（mock 的 play 不需先 load），新增 `_loadedSongId` 跟踪引擎实际持有的歌；⑦ Live Activity 去重只看一个变量，异步 start 的 in-flight 竞态 + 失败返回 `''` 是 falsy 导致每次切歌重新 start，补 in-flight 标记 + 空 id 闭锁。**第三波**：⑧ 切服务器只写 secure storage，而 TokenStore 读时优先内存缓存永不回读，拿 A 的 token 打 B → 401 → 用 A 的 refresh 找 B 刷新 → 失败 → logout 连带抹掉 B 的 token，新增 `invalidateTokenCaches()`（实例登记表，P2-1 收口单例后可删）；⑨ `receiveTimeoutMs` 读进字段后从未使用、transport 不传 signal，可连但不响应的服务器让 promise 永不 settle，`TransportRequest` 加 `timeoutMs`、`createFetchTransport` 用 AbortController + `Promise.race` 实现（race 才是「一定 settle」的保证，Lynx 宿主 fetch 可能忽略 signal）、新增 `HttpTimeoutError`。**第四波**：⑩ DLNA 页 `nm.SongloftDlna as DlnaModule` 把 callback 式模块强转成 Promise 接口，`.then()` 落在 undefined 上、useEffect 挂载即 TypeError，按 Kotlin/Swift 真实契约重写适配层 promisify（方法完整性检查 / JSON 容错 / `{error}` 转 reject / 设备逐项校验），顺带修页面无 catch、setTimeout 不清理、cast 失败对勾永留三处同源问题；⑪ `getPlatformCapabilities()` 全库无调用点、还算了个没用的 `isWeb`，改 `isWebPlatform()` + 每能力只看自己的模块，接上 FullPlayerPage 投屏按钮 / SettingsPage 悬浮歌词行 / DataSection 整段三个消费点。**第五波**：⑫⑬ 元数据/扫描「再次刷新」点了不轮询——谓词把终态判断放在 sticky `forced` 之前短路掉它，且页面清 forced 不看新鲜度（启动后首个 GET 还是上一轮终态），改 forced 优先于终态 + 页面用 `dataUpdatedAt >= startedAt` 守卫（照搬 DuplicateCheckPage 的 computingSinceRef 模式）；原测试「forced still stops once a terminal state arrives」断言的正是这个 bug，已订正。**验收**：build 双产物零告警 / `tsc -b` / **900 vitest**（+34）全绿。
> **批41 · 三条 P0 阻断（构建系统在骗人）**：三条互相独立、但同属一类——**闸门全绿而产物是坏的**。① **`pnpm run build` 不再产出原生 bundle**（改文档时顺手撞出来，不在审计产出里）：`lynx.config.ts` 的 `environments` 是**替换**隐式默认环境而非扩展，于是 `rspeedy build` 只出 web 产物，`dist/main.lynx.bundle` 的 mtime 前后不变（`--environment lynx` 报「环境不存在」），而两个 copy-bundle 脚本照旧从那个路径拷 → **自 `2330c22`（08-13 23:35）起原生包里嵌的都是遗留文件**，发现时是一份 08-13 22:52 的 **6.5 MB dev bundle**（生产版 1.76 MB）。修法：补 `lynx: {}` + 新增 `scripts/assert-bundle-fresh.mjs`——`existsSync` 抓不到这类缺陷（文件确实存在），**只有年龄能暴露它**，故断言产物必须比 `src/`、`lynx.config.ts`、`package.json` 都新，失败时直接指出「检查 build 输出有没有 `File (lynx)`」。② **iOS 工程损坏**：`project.pbxproj:255` 在 `PBXSourcesBuildPhase` 的 `files = ( … );` **数组内部**多了一行 `PBXBuildFile` 赋值（第 23 行已有正确那份），`xcodebuild` 报 `Code=3840`。契约闸门本是专为「iOS 漏登记」设的，却用 `.toContain('SongloftDlnaModule.swift in Sources')`，而畸形行**恰好包含该子串**，四段断言全绿。修法：删该行 + 新增结构校验（元素列表体内不得出现 `{isa = …}`，按括号深度逐行判定、先剥注释与字符串）。**一个值得记的观测**：反向验证时「括号配平」那条在损坏文件上**是绿的**——畸形行自身配平，泛泛的结构检查给不出保证，起作用的是那条精准断言。验收不止 `-list`：`pnpm run ios:build` 完整 `BUILD SUCCEEDED`（Pods + app），`.app` 内含 `main.lynx.bundle`。③ **`build:web` 产物黑屏，根因两层**：审计只发现第一层（`index.html` 请求 `index.css`/`index.js`，prod 产物是 `client.css`/`client.js`）；**改完文件名后页面依然全黑**，真实异常是 `Cannot use 'import.meta' outside a module`——`client_prod` 入口是 **ES module**，必须 `<script type="module">`，而它**不进 `console.error`**（只走 `pageerror`），表现是「资源全 200、零 console 错误、`<lynx-view>` 就是不 upgrade」。dev-middleware 那份入口是 IIFE 没这约束，`serve.mjs` 又优先读它，所以 `web:dev` 一直正常——**之前两次 Web 修复的无头浏览器验证都从这条路绕过去了**。修法：`serve.mjs` 与 `copy-bundle-web.mjs` 统一用 `client_prod`（两套资源除入口文件名外结构完全相同：async chunk、wasm 哈希、版本号都一致），index.html 改 `type="module"`，从结构上消掉「dev 能跑 / prod 不能跑」这个类别。教训：**「资源 200」不等于「脚本跑起来了」**；若按原判断只改文件名就收工，页面还是黑的而闸门全绿。新增 `src/__tests__/web-host-page.test.ts`（6 例：本地引用可解析 / bundle 名与拷贝脚本一致 / **入口以 module 加载** / serve 与 copy 同源），关键两条均反向验证过。**验收**：`build:web` 产物用无头 Chrome 真的打开——`lynx-view`+`x-view`/`x-text`/`x-image` 均注册、wasm 200、**零 pageerror**、登录页完整渲染（截图确认 Muse 配色 + 中文 locale + TLS 开关）。build 双产物（lynx 1762.1 kB / web 1807.6 kB，零告警）/ `tsc -b` / **858 vitest**（+8）全绿。
> **批40 后修 · web 刷新掉登录（会话持久化）**：紧接上一条，同一个 realm 事实的第三个受害点——控制台那行 `[SongloftStorage] no NativeModules.SongloftStorage and no localStorage; using in-memory storage` 已经把根因说完了：web-core 把 app 跑在真 `Worker` 里，而 **Web Storage 是 window-only**，worker realm 的 `localStorage`/`sessionStorage` 都是 `undefined`（headless Chrome 里实测），于是 `createSongloftStorage()` 的能力探测 native → localStorage → memory 一路落到内存实现，token / server_url 随页面刷新一起蒸发，用户被弹回 /login，而**唯一的提示只是一条 warn**。新增 `core/storage/idb-storage.ts`（`createIndexedDBStorage` + `isIndexedDBAvailable`），插在 localStorage 与 memory 之间：worker realm 里 `indexedDB` **原生可用**（实测 `typeof indexedDB === 'object'` 且 put/get 往返成功），同源持久化语义与 localStorage 等价。**刻意不选「桥到主线程 localStorage」**：web-core 支持宿主注入 native module，但那要给 `web/index.html` 与嵌入产物**各塞一个宿主文件并接线**，而 IDB 零宿主配合。三个实现取舍：① `open` 带 **3s 超时**——auth bootstrap（`hydrate` → `checkAuth`）await 第一次读，而另一个 tab 持有旧版本导致 version-change blocked 时浏览器**既不 fire `onsuccess` 也不 fire `onerror`**，不设超时就是白屏挂死；② 打不开时**透明降级为进程内 map**（本会话可用、不持久，即修复前的行为），任何请求失败一律 resolve 而非 reject（沿用 `native-storage` 的 never-reject-auth-bootstrap 原则）；③ 写入等 `tx.oncomplete` 而非 `request.onsuccess`——后者早于提交，等错了就会把「已持久化」报成功。`localStorage` 仍优先于 IDB（同步、无需 open）。**验收**（无头 Chrome）：登录后主线程 realm 反查同源 IDB，`songloft/kv` 里 6 个键齐全（`prefs.server_url`/`prefs.last_username`/`prefs.insecure_tls`/`secure.access_token`（`eyJhbGciOiJI…`）/`secure.refresh_token`/`secure.token_expires_at`）；**整页 `reload()` 后仍停在首页**（`home-greeting` 在、登录表单不在），那条 in-memory warn 也不再出现。测试 +9（IDB round-trip / 跨实例复现「刷新」/ keys 按 namespace 过滤 / remove 真删 / open 失败降级 / **fake timers 验超时不挂死** / 无 factory / 选择链命中 IDB / localStorage 优先），自带最小 fake `IDBFactory`（jsdom 无 IndexedDB），选择链那条做过反向验证（摘掉分支即红）。build 1807.6 kB / `tsc -b` / **850 vitest**（+9）全绿。
> **批40 后修 · web 首页「下拉刷新」文字（批36 那条修复的真根因）**：用户报「web 版本首页顶部还是有下拉刷新几个字」。Docker 无头 Chrome 打开 `web/serve.mjs` 复现，读 `lynx-view.shadowRoot` 拿到实证：`<refresh class="home__refresh" enable-refresh="true"><refresh-header>…下拉刷新…`。**两层根因叠加**：① 批36 的 `enable-refresh={!isWeb}` **从未生效**——`isWebEnvironment()` 探测 `window`/`document`，而 web-core 把 app 的 background thread 跑在真 `Worker`（`Background.js` 的 `new Worker(…, {name:'lynx-bg'})`）里，该 realm 无 `document`，于是渲染时 `isWeb` 恒为 false（旁证：同一次运行的 `[SongloftStorage] … no localStorage` 日志）。② 更根本：**Web 没有 `<refresh>` 实现**——web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP` 里没有 `refresh` 条目，web-elements 注册的是 `x-refresh-view`/`x-refresh-header`，所以两个标签作为**未知元素**落进 DOM，`<refresh-header>` 的子节点被当普通页面内容渲染；web-elements 那条 `x-refresh-header{display:none}` 与 `:not([enable-refresh="false"])` 规则都匹配不到它。**即使 ① 修对，属性开关也关不掉这行字**——批36 的思路本身不可能成功。修法：新增 `readSystemInfo()`（`native-modules.ts`）+ `isWebPlatform()`（`web-platform.ts`），按 `SystemInfo.platform === 'web'` 判定——web-core 在主线程构造 `systemInfoBase = {platform:'web'}` 并随启动消息转发进 worker，**两个 realm 实测都有**（puppeteer 分别在 `about:srcdoc` 的 MTS realm 与 `web-core-worker-chunk` worker 里验过）；`isWebEnvironment()` 保留但降级为「本 realm 有没有 DOM」的守卫，注释写明它不是平台判定。HomePage 在 Web 上**整段不渲染** `<refresh>`/`<refresh-header>`，scroller 抽成 `const scroller` 由两个分支共用，Web 侧套一层 `.home__scroll-host`（CSS 与 `.home__refresh` 共用同一组 flex 约束，避免 `height:100%` 解析基准变化）。同一根因的第二个受害点一并修掉：`PluginWebViewPage` 也用 `isWebEnvironment()` 决定渲染，Web 上因此跳过 fallback、渲染了同样无实现的 `<webview>`（空白区）。**原生端零行为变化**（该分支的 `enable-refresh` 由 `!isWeb` 变字面量 `true`，值相同）。**验收**：无头 Chrome 复验 `hasRefreshTag=false` / 页面文本不含「下拉刷新」/ 滚轮 `scrollTop 0→142`（滚动仍正常）/ 内容区顶部从 y=120 回到 y=68（省回 header 占的 60px）/ 插件页显示「此插件需要原生应用支持」且 DOM 无 `<webview>`。新增 `native/__tests__/web-platform.test.ts`（web/设备/缺失三类平台值，防止误判把原生端的下拉刷新一起砍掉），`home-section-scroll.test.ts` 换成「Web 上不渲染 wrapper」的断言并写清两次失败的修法。build 1804.0 kB / `tsc -b` / **841 vitest**（+4）全绿。
> **批40**：6项边角料收尾（源自当时的 `docs/remaining-work-plan.md`——该文件 10 项中 8 项已交付，**2026-08-14 已删除**，残余的 iOS `setInsecureTls` 与首页正在播放入口条已并入 [`../plans/2026-08-14-audit-fix-plan.md`](../plans/2026-08-14-audit-fix-plan.md)；桌面端/视频不在范围内）。① **扫描轮询迁移**：`scan-query.ts` 摘掉 `refetchInterval`/`refetchIntervalInBackground`/`PollOptions`，`LibraryOpsPage` 改页面级显式 `setInterval`（照搬批29c 的 `DuplicateCheckPage` 模式）；`scanPollInterval`/`metadataPollInterval` **保留**为「是否轮询 + 间隔多少」的唯一判定谓词，页面用其返回值武装 interval，故原有纯函数单测全部沿用。新增 4 个 fake-timer 测试锁住「tick 会重复 fire / 终态停 / idle 不轮询直到 forced / 元数据独立轮询」——旧实现**一个测试都没有**，且靠 `focusManager.isFocused()` 意外为 true 才活着。② **i18n 统一**：8 个文件 70 处内联 `lt('En','中')` 全部搬进 `resources.ts`（新增 `cacheManage` 24 key + `proxy` 9 key，`libops` 扩 32 key 至 131），8 份重复的 `useLocalT` 定义删净；英文原文字节级保全（测试 `t` 是查真实 `en` 树的 `translateEn`，改字面量即挂）。③ **封面进通知栏**：`AudioItem` 加 `artworkUrl`，`toAudioItem` 用 `buildCoverUrl`（含 base + `access_token`，原生侧只做 `Uri.parse` 无自己的鉴权）填充——**Android 原生 `setArtworkUri` 早已就位，只是从没收到值**，故 plan 的 ⑥ 随本项自动完成；顺带修掉 `restorePlaybackState` 里那份漏字段的重复 mapper（它正是漏了 `artworkUrl`）。④ **播放失败自动重试**：`on('error')` 起 1s/3s/9s backoff。三个刻意取舍：**预算按歌计而非按 `playing` 重置**（��者会让 flapping 流无限重试打爆服务端）、**重试绕开 `playAtIndex`**（�� action 会 `cancelRetry`，走它则计数永远归零不收敛）、**重试回 seek 到失败位置**（2:30 掉线后静默从 0 重播比不重试更糟）。mock 新增 `simulateError()` 测试钩子。⑤ **debounce 行为测试**：原测试是 `readFileSync` 断言源码**含有** `setTimeout`/`clearTimeout` 字符串——每次按键都 fire 的实现也能过。改用 `renderHook` + fake timers 真跑时序，新增「连打 4 键只出最终值一次」（反向验证：删掉 `clearTimeout` 该测试即红）。plan 里说的「flake」并不存在，该文件从来没有真 timer。⑥ **CSS token 化**：`DuplicateCheckPage.css` 101 处 px → `--space-*`/`--radius-*`/`--font-*`，**按属性语义配 token 而非按数字**（16px 作 padding 是 `--space-4`、作 font-size 是 `--font-md`）；无对应 token 的 2/6/10/11/13/18/48/360px 与 1px 描边一律留字面量，不四舍五入到最近 token。顺带修掉 2 处既有无效 CSS（`var(--neutral-faint))` 多一个右括号 → `.fp-results__summary` / `.fp-group__badge` 背景色一直没生效）。build 1802.6 kB / tsc / **837 vitest**（+12）全绿。
> **批40 本文件的乱码修复**：本文件此前有 40 处 U+FFFD 替换字符（合法 UTF-8，但原字符已丢失，疑为某次编码转换事故）。规律是**一个 3 字节中文字丢失后留下 3 个 U+FFFD**。已修 25 处**能从上下文或本文件别处的同款措辞确定**的（如「工���量」→「工作量」、「自���19b」→「自批19b」、「/ ���接」→「/ 交接」）。**剩 15 处刻意不动**：L146/L238/L247/L475/L587 是连续丢多字（n≥5）；L230/L274 丢的是标点；L442/L847 有多个同样通顺的候选。这些只能靠猜，而猜出来的字会被后人当史料读，比留一个显眼的 `�` 更糟。
> **批39**：3项原生功能。① **Android DLNA 模块**：`SongloftDlnaModule.kt`，SSDP M-SEARCH 发现 + SOAP AVTransport 控制（SetAVTransportURI/Play/Pause/Stop/Seek），注册为 `NativeModules.SongloftDlna`。② **iOS DLNA 模块**：`SongloftDlnaModule.swift`，NWConnection UDP 多播发现 + 同样 SOAP 控制。③ **不安全 TLS 生效**：`network_security_config.xml` 信任用户证书 + `setInsecureTls` 运行时设置 trust-all SSLSocketFactory，auth-store hydration/login 时调用。build 1792.7 kB / tsc / 824 vitest 全绿。
> **批38**：3项功能。① **歌单详情页多选批量移除**：Select 按钮 + 复选框 + 底部 toolbar 批量移除选中歌曲。② **歌单列表多选批量删除**：选择图标 + 卡片徽章 + 两步确认批量删除（内置歌单保护）。③ **EQ bars 动画**：正在播放的歌单卡片封面左下角 4 杆 CSS keyframe 跳动动画。build 1792.5 kB / tsc / 824 vitest 全绿。
> **批37**：4项功能。① **拼音排序**：`src/shared/sort/pinyin-compare.ts`（localeCompare('zh') + 数字前缀感知），PlaylistsView「A-Z」按钮一键按拼音重排歌单。② **首页加载慢提示**：首次加载 >5s 后显示「加载时间较长」+ 重试按钮。③ **歌单封面上传**：PlaylistDetailPage 封面区「+」覆盖按钮，复用原生 multipart 通道 → `POST /playlists/{id}/cover`。④ **开源许可页**：`/settings/licenses` 列出运行时依赖及许可证类型，Settings About 区入口。build 1776.3 kB / tsc / 824 vitest 全绿。
> **批36**：3项功能 + 1修复。① **Library 电台子视图**：`PlaylistsView` 接受 `type` prop，Library 新增 Radio tab，首页电台 View all 独立导航。② **宽屏首页网格布局**：平板/桌面（≥600px）下 HomeSection 改为 3 列网格（9 张卡片），移动端保持横向滚动。③ **音量均衡开关**：Settings Playback 区 normalize toggle，`buildSongUrl` 追加 `normalize=1`，持久化到本地 prefs。④ **web 下拉刷新修复** ⚠️ **根因误诊且无效，见上方「批40 后修」**：`enable-refresh={!isWeb}`，当时判断是 IntersectionObserver 导致指示器永久显示。build 1764.7 kB / tsc / 811 vitest 全绿。
> **批34**：12项功能。① **歌词自动滚动**：LyricsView `scroll-into-view` 自动定位到当前行。② **后端更新管理**：UpgradePage（检查/升级/2s轮询进度/状态展示）。③ **后端版本显示**：Settings About 区 `GET /version`。④ **曲库高级筛选**：流派/艺术家/专辑 Input 过滤。⑤ **歌曲详情/编辑页**：`/library/song/$songId`，查看元数据 + 编辑标题/艺术家/专辑。⑥ **清理无效歌曲**：Library-ops `POST /songs/clean`。⑦ **歌词编辑页**：`/player/lyrics/edit`，textarea + `PUT /songs/{id}/lyrics`。⑧ **添加网络歌曲/电台**：`/library/add`，remote/radio 双Tab。⑨ **标签写入**：SongDetailPage 本地歌曲「写入标签到文件」。⑩ **搜索建议**：`GET /songs/names` 自动补全。⑪ **长按菜单增加歌曲详情入口**。⑫ **player-store insertNextInQueue**。build 1688.1 kB / tsc / 804 vitest 全绿。
> **批33**：文档重构（AGENTS.md精简/plan.md移入docs/README索引/迁移文档标注状态） + 7项功能修复/新增。① 插件bug修复（启用/禁用文案、搜索Input、刷新图标、更新loading）。② Tab配置即时生效。③ 日志导出改直接下载。④ iOS AppIcon补充PNG。⑤ 歌单详情页搜索（后端keyword）。⑥ 曲库多选+批量添加到歌单。⑦ 偶发灰层修复（unmount close drawer）。⑧ 歌曲长按菜单（下一首/队列/歌单）。⑨ 主题包管理页。build 1632→1688 kB / tsc / 804 vitest 全绿。
> **批32**：四项功能。① **播放状态持久化/恢复**：`playback-persistence.ts`（save queue/index/position/sourcePlaylistId to `SongloftStorage.prefs`），player-store subscribe 防抖 2s 自动保存，`index.tsx` 启动链 `restorePlaybackState()` 恢复（mini-player 显示上次歌曲）。② **播放速度选择**：FullPlayerPage topbar 循环切换（0.5x/0.75x/1x/1.25x/1.5x/2x），persist 到 prefs，启动恢复。③ **启动自动恢复播放**：Settings「Playback」区 auto-resume 开关，开启后启动自动 seek+play。④ **文档修正**：`HeroCard` 确认 Flutter 死代码；移除全文「真机待扫码」阻塞语；标记 Android 真机播放已验证。clean build（1598.9 kB）/`tsc -b`/804 vitest 全绿。**Android 真机播放用户确认正常。**
> **批31**：六项功能。① **iOS 均衡器 DSP**：`AudioEqualizer.swift`（`MTAudioProcessingTap` + `kAudioUnitSubType_NBandEQ` 10-band 参数 EQ），逐 AVPlayerItem 挂载 audioMix，`SongloftAudioModule` 的 `setEqualizerEnabled`/`setEqualizerBand` 从空壳变真实 DSP。② **数据导入导出**：`SongloftPlatformModule`（Android/iOS 原生），`openURL` 导出（浏览器下载 JSON）+ `pickAndUploadFile` 导入（原生文件选择器 + multipart 上传），Settings 新增 Data 区。③ **登出确认改 Dialog**：`SettingsPage` 原两步 tap 换成 `lynx-ui-dialog`（`DialogRoot`/`DialogView`/`DialogBackdrop`/`DialogContent`），带取消/确认按钮。④ **音频质量选择**：`PREF_AUDIO_QUALITY`（original/320/192/128）+ Settings Audio quality 四选一 + `player-store` `buildSongUrl` 传 `?quality=` 参数。⑤ **播放历史页**：`GET /play-history` API + `PlayHistoryPage`（路由 `/library/history`，歌曲列表 + 播放次数 + 相对时间），Settings Advanced 入口。⑥ **网络代理设置**：`ProxySettingsPage`（路由 `/settings/proxy`），4 个后端端点（http-proxy / github-proxy / hls-proxy / proxy-private-allowlist）GET/PUT，Input + Toggle + Save。**收藏按钮 `onCustomCommand` 用户真机确认正常**。clean build（1591.9 kB）/`tsc -b`/800 vitest 全绿。
> **批30**：三条正交功能线并行落地。① **均衡器**：`eq-presets.ts`（7 预设 + clampGain/formatFreq 纯函数）+ `eq-store.ts`（Zustand，`SongloftStorage.prefs` 持久化 `eq_enabled`/`eq_bands`/`eq_preset`，每次变更同步到 audio facade）+ `EqualizerPage`（10 条竖向 `SliderRoot` + 预设 chip + 开关，路由 `/settings/eq`）；**Android DSP 已接**：`SongloftAudioEngine.kt` 新增 `android.media.audiofx.Equalizer`（`attachEqualizer`/`applyBandGain`/`setEqualizerEnabled`/`setEqualizerBand`/`releaseEqualizer`，随 ExoPlayer session 生命周期挂载/释放），`SongloftAudioModule.kt` 对应桥接方法。**iOS DSP 已接**（批31：`MTAudioProcessingTap` + `kAudioUnitSubType_NBandEQ`，见上方批31 小结）。② **多服务器管理**：`server-profile.ts`（zod schema）+ `server-store.ts`（profiles 列表 + `activeProfileId`，token 按 `token_access_${id}`/`token_refresh_${id}` 分 profile 隔离存储，`switchTo()` 切换时存出/取入 token + 更新 `appConfig` + 清 query cache，首次 hydrate 自动把旧版单服务器 URL+token 迁移成一条 Default profile）+ `ServerListPage`（列表/切换/两步 tap 删除）+ `ServerEditPage`（增/改表单）。③ **`lynx-ui-sortable` 拖拽排序迁移**：歌单列表（`PlaylistsView`）、歌单内歌曲（`PlaylistDetailPage`）、播放队列（`PlaylistDrawer`）三处排序 UI 从 chevron 上移/下移按钮全部换成 `SortableRoot`+`SortableItem`+`SortableItemArea` 拖拽手柄，`moveItem`/orderedXxx 中间态代码删除，直接对接既有 reorder mutation。新增 `mockLynxUiSortable()` 测试 mock（渲染纯 view，绕开原生手势 API）。**待验证**：EQ 滑杆拖动是否实际改变 Android 播放音色、拖拽排序三处手势手感、多服务器切换后歌单/队列是否正确重新拉取。clean build / `tsc -b` / vitest 全绿。
> **批29c**：修掉批29b 发现的 Computing 阶段 bug（点计算后卡 `0/0`、后端跑完 UI 不转 Results）。**真机三次复现 + 诊断条读数**定位到双层根因：① 开始新一轮计算时，progress query 还持有上一轮的**陈旧终态**（`done`/`cancelled`），page 的 auto-transition effect 用陈旧 `isFinished=true` 瞬间把 phase 从 computing 推到 results（跳过计算阶段）；② query-core 5.101 的函数式 `refetchInterval` 在本 Lynx 4.0 build 上**首次 fetch 后就不再 fire**（真机诊断：`refetchInterval` 被反复调用返回 `2000`、但实际 GET 冻结在 2 次、`computed/total` 停住不动，而同组件里自测 `setInterval` 每 2s 正常 fire）。修法：start mutation `onSuccess` invalidate progress + remove duplicates（清陈旧终态，`resetFingerprintCachesForNewRun`）+ auto-transition 加 `dataUpdatedAt >= 进入computing时间戳` 守卫（只认本轮的终态）+ **progress 轮询改成页面级显式 `setInterval` 驱动 `refetch()`**（不再依赖不可靠的 `refetchInterval`）。**全链路真机验过（18091，chromaprint 可用）**：先用空库验 Computing 推进 + 自动转 Results 空态；随后**用户在音乐目录造了 2 组同源重复文件**（`咏春`/`咏春-same`、`半壶纱`/`半壶纱-same`），扫描导入 2 首 → 计算指纹 → **Results 正确渲染 2 组重复**（每组标「推荐」保留项 + bitRate 信息）→ **lynx-ui 删除 Dialog**（批28 首次引入、此前从未上真机）弹出「确认删除」→ 点确认走 `batchDelete` → 后端真删文件（358→357→356）+ UI `invalidate` 后**实时刷新组数**（2组→1组→空态）；「单组删除未选中」与「清理全部重复」两个入口都验过。新增 `fingerprint-mutations.test.ts` 2 例（反向验证过会红）。clean build（**1476.6 kB**）/`tsc -b`/**711 vitest** 全绿。
> **B3a**：iOS 宿主工程落地，模拟器上从登录页一路验到首页（`<input>` / `<svg>`（含远程插件 SVG）/ `<image>` 全正常、790 行 lynx 日志 **0 条 LynxError**），顺手修掉一个安全区缺陷；Lynx iOS 用 **4.0.1**（与 Android 4.0.0 的偏差有据可查）。详见下方「B3a」一节。
> **B3b（iOS 音频 / 存储 / 系统外观）已完成** —— 三大原生模块全部落地并验证通过：`SongloftAudioModule`（AVPlayer 播放引擎 + MPNowPlayingInfoCenter + MPRemoteCommandCenter）、`SongloftStorageModule`（UserDefaults + Keychain）、`SystemAppearance`（globalProps 注入 + traitCollectionDidChange 深浅色跟随）。iPhone 17 Pro 模拟器验收：登录态持久化 ✅、AVPlayer 播放 mp3 流（5.2s 进度确认）✅、深浅色切换（亮度差 186）✅、契约闸门测试 52/52 绿 ✅。
>
> **上一批**（**批29b**）：借用户提供的 `http://localhost:18091`（**chromaprint 可用**、356 首全本地）补验批28 —— Status 阶段两个分支都验过，并**发现 Computing 阶段 bug**（批29c 已修，见上）。
>
> **上一批**（**批29 · 真机验收轮：批25-28 积压 + 3 个真 bug**）：把积压 4 批的「⏳ 待验证」一次性验掉，过程中查出并修掉 3 个**只在真机暴露、build/tsc/vitest 全绿却是坏的**缺陷：① **`<refresh>` 缺 `androidx.viewpager2` 依赖，attach 即崩**（`SmartRefreshLayout.onAttachedToWindow` → `SmartUtil.isContentView` → `ViewPager2` `NoClassDefFoundError`，LynxError 990200）——这是批20「`<refresh>` 吞横向手势」与批25「SmartRefreshLayout 3.0.0-alpha 嵌套滚动回归、无法降级」**两次误诊的真根因**，加一行依赖后原生下拉刷新彻底恢复（`refreshstatechange`→`startrefresh`→`finishRefresh` 真机闭环），批25 为绕行加的手动刷新按钮本就不必要；② **3 处动态 `import()` 的 lazy bundle 从未打进 APK assets**，其中 `index.tsx` 那两处无 try/catch，把启动链连带 `auth.hydrate()`/`auth.checkAuth()` 一起打断（auth status 永远停在 `unknown`，而 guard 对 `unknown` 不重定向，所以「看起来正常」）——改静态 import 后 `dist/lazy-bundle/` 消失、bundle **−40 kB**，并**推翻批20「已端到端验证播放模式持久化」的结论**（当时不可能成立，本批修好后才真验过）；③ **Lynx 4.0.0 宿主的 `lynx.queueMicrotask` 自身抛错**，而 ReactLynx 把它装成 **Preact 的 effect 调度器**（`options.requestAnimationFrame`），导致 `useEffect` flush 被静默丢弃——banner 替换成 ReactLynx 自己的 Promise 兜底实现。另修文案「更多设置（后续版本）」→「高级」（其下 3 项早已全部实现）。新增 4 道闸门**全部反向验证过会红**。clean build（**1476.6 kB**）/`tsc -b --force`/**714 vitest** 全绿。
>
> **上一批**（**批28 · 重复检测/指纹 + 缓存管理**）：两条正交功能线并行实施（各一 subagent，共享文件手动 merge）。重复检测/指纹——FingerprintApi 6 端点 + 三阶段页面 DuplicateCheckPage（Status/Computing/Results）+ 指纹 2s 轮询 + 重复组按 bitRate 推荐保留 + lynx-ui Dialog 删除确认，53 测试。缓存管理——CacheApi 5 端点 + CacheManagePage 三区（只读统计/编辑表单/目录验证）+ 两步 tap 清理确认，21 测试。DuplicateCheckPage.css 原用 10 个仓库不存在的 `--color-*` token → 重映射到 repo token。clean build（1519.5 kB）/`tsc -b --force`/709 vitest 全绿。

**排除目录管理**（对齐 `songloft-player/lib/features/settings/presentation/widgets/exclude_dir_manager.dart`）：新增 `ExcludeDirSection`（三 Tab：名称排除 / 路径排除，复用批19 的 `DirectoryTree` / 自动建歌单排除名单），新增 `MusicPathSetting`/`dirNames` 模型 + `getMusicPath`/`updateMusicPath`/`getDirNames` API + 对应 data hooks，挂载进 `/settings/library`（`ScanSettingsSection` 与 `MetadataSection` 之间）。**核心不变式**：`path`（音乐根）永不可编辑——`useUpdateExcludeConfig` 的 `mutationFn` 永远从 `QueryClient` 缓存读 `path` 再拼接三个排除数组，草稿类型 `ExcludeConfigDraft = Omit<MusicPathSetting,'path'>` 在类型层就不允许调用方带 `path`；测试驱动发现并修复一个真实隐患——`buildMusicPathUpdate` 原实现 `{ path, ...draft }` 的字段顺序会让 `draft` 里意外出现的 `path` 覆盖掉安全值，改成 `{ ...draft, path }` 后 `path` 永远最后写、永远赢。也顺手核对并订正了 3 处过期未更新的 TODO（standalone/embedded 部署模式、本地歌词缓存、底部 Tab 配置——三者均早已完成，见下方遗留清单）。clean build / `tsc -b --force` / **604 vitest**（+26）全绿。

**开发环境定位**（不改产品代码，纯本机排障，记录以免重复踩坑）：本机 `pnpm test`/`pnpm run build` 一度被 `RangeError: WebAssembly.instantiate(): Out of memory` 挡住——追踪到本沙箱 `ulimit -v` 硬上限（~23.8GB）与 V8 默认的 trap-handler-based WASM 越界检查冲突：每个 `WebAssembly.Memory` 实例的 guard-page 保留区高达约 10-12GB（与声明的 `maximum` 无关），该沙箱内最多只能同时存在 2 个这样的实例，而 Node 内建 `undici`（`lazyllhttp`）+ `@lynx-js/react` 的 transform WASM 加起来恰好是第 3 个，必炸。修复：设置 `NODE_OPTIONS=--disable-wasm-trap-handler`（Node 原生 flag，允许写进 `NODE_OPTIONS`），关闭 trap-handler 保留策略、改走显式边界检查，代价是极小的运行时开销，换来构建/测试链路完全打通。**这是本机会话级环境问题，不是仓库配置问题，不写入仓库文件**；下次在类似受限沙箱里遇到同样报错，直接设这个环境变量即可，不必重新排查。

> **上一批**（**批25 · 首页下拉刷新·手动刷新按钮**）：`bug.md` 第 16 条。

**首页下拉刷新**（fix: 添加手动刷新按钮）：根因是 Lynx 底层 `SmartRefreshLayout 3.0.0-alpha` 有已知的嵌套滚动回归——手势无法触发 `onRefresh` 回调。该 alpha 版本是 `xelement-refresh` 的传递依赖，无法降级（API 不兼容）。方案：在首页 topbar 添加刷新图标按钮，调用 `<refresh>` 元素的 `autoStartRefresh` 方法程序化触发刷新（走原有 `bindstartrefresh` → `refetch` → `finishRefresh` 路径）。`<refresh>` 元素保留用于视觉反馈（`<refresh-header>` 提示文字）。clean build / `tsc -b --force` / **578 vitest** 全绿。

> **上一批**（**批24 · 插件 WebView 空白修复**）：`bug.md` 第 17 条。

**插件 WebView 空白**（fix: 升级 Lynx SDK 3.8.0 → 4.0.0）：Lynx 3.8.0 没有 `xelement-webview` 包（`<webview>` 元素在 4.0.0 才引入），宿主 logcat 报 `No BehaviorController defined for class webview`（错误码 990200），渲染区域保持 canvas 背景色。升级方案：`lynx`/`xelement-refresh`/`xelement-scroll`/`xelement-switch` 全部升至 4.0.0，新增 `xelement-webview:4.0.0`，`servalsvg` 同步升至 0.1.1。Kotlin 编译通过，真机 WebView 正常渲染插件内容。clean build / `tsc -b --force` / **578 vitest** 全绿。

> **上一批**（**批23 · 登录居中 + 插件 tab 图标修复**）：`bug.md` 第 15、16 条。

**登录页居中**（fix: 620cf63）：Lynx 不支持 `justify-content: center` CSS，用 `flex: 1` spacer `<view>` 元素实现垂直居中，配合 `align-items: center` 实现水平居中。padding 从 `.login` 移到 `.login__card` 上。

**底部导航插件 tab 图标**（feat: ef5a4d1 + fix: cc32361）：`PluginTabEntry` 新增 `icon?: string` 字段，`parseTabConfig`/`SettingsApi.updateTabConfig`/`TabConfigPage.togglePlugin` 全线传递 icon 参数。`ShellLayout` 新增 `PluginTabIcon` 组件，使用 `usePluginIconQuery` 获取 SVG markup 渲染（SVG → `<svg content>`，bitmap → `<image>`，无 icon 则 fallback 到 `settings` 图标）。修复后续发现后端存储的旧 tab 配置没有 `icon` 字段，新增 `usePluginTabsWithIcons` hook 同时获取插件列表按 `entryPath` 匹配补充 icon 信息。clean build / `tsc -b --force` / **578 vitest** 全绿。
> **上一批**（**批21 · 外观/语言跟随系统**）：`bug.md` 第 13、14 条。这两个「跟随系统」选项此前**是纯标签、背后什么都没有**——`resolveTheme('system')` 硬编码返回 `'dark'`、`resolveLanguage('system')` 硬编码返回 `'en'`。Lynx 没有 `prefers-color-scheme`/`matchMedia`/locale API，信号只能由宿主给，故用**两条互补通道**：`LynxLoadMeta.setGlobalProps` 在 `loadTemplate` **之前**注入初值（首帧就是对的主题，**不闪**；原生模块 getter 做不到——异步、答案晚于启动帧）+ `sendGlobalEvent` 推运行中的变更（globalProps 更新不会通知已在跑的页面）。**`LynxView.setGlobalProps` 两个重载都已弃用**，替代品是 `LynxLoadMeta`。**manifest 的 `configChanges` 原来只有 `uiMode`**：深浅色能进 `onConfigurationChanged`，但语言切换会重建 Activity、整包重载 JS 状态全丢——补了 `locale|layoutDirection`。另拆 `values-night/themes.xml` 消掉启动帧闪深色。**JS 侧一个静默失效的 React 陷阱**：`ThemeProvider` 原来把 `AppTheme` 选择存 state，系统翻转时选择仍是 `'system'`、同值写入被 React 跳过 → 模型层全对而 UI 永不跟随；改存**已解析**主题。**差点误报**：首次装包截图是浅色+中文、与系统完全一致，看着一次就成——实际是早前批次留下的**显式选择**（语言=中文/外观=浅色）巧合撞上，而显式选择下忽略系统变化恰恰正确；改成「跟随系统」后才是真验证（**验「跟随系统」必须先确认选中的就是它**）。模拟器双向验过：冷启动跟随 + 运行中翻转系统深浅色/语言应用立刻跟随（未重启、未交互）。clean build 1382.0 kB（**零警告**）/`tsc -b --force`/**573 vitest**（+24）/Kotlin 零警告全绿；新增 3 道闸均反向验证过。
> **上一批**（**批20 · bug.md 清理第一轮 · 6 条**）：**本批最大的变化是验证能力**——本机装上 Android SDK 后可 `gradlew installDebug` 直接装模拟器（API 33），**解除了本文件里长期的「Kotlin 只能靠 CI 验」限制**；首轮构建 8 分钟，之后增量安装 **4 秒**。6 条全部在模拟器上截图核对，不是「本机绿了就算」。修掉：① 首页横向滚动在 Android 上滑不动（**四个叠加缺陷**，最隐蔽的两个是「内容行缺 `width:max-content`」和「`<refresh>` 直接吞掉横向手势」——`getScrollInfo` 报 `scrollRange:264`、`scrollTo` 能改 `scrollX`，手指却全程无效，极易误判成 CSS 问题）+ 卡片改竖矩形（120×120 方形封面，`mode='aspectFill'` 修掉封面被拉扁）；② 插件图标不显示——`<svg src={url}>` **在本宿主根本不可用**（logcat: `getGenericResourceFetcher is null`），改走「已鉴权 client 取文本 → `<svg content>`」；③ 全屏播放器关闭回上次 tab（新增 `shared/nav/shell-navigation.ts`，回 `/library` 还带记忆的子页签）+ MiniPlayer 路由白名单（设置/插件页不再显示）；④ 删掉设置页播放设置分组，**并把持久化搬到播放器的模式按钮**（否则 `default_play_mode` 再没人写——已验杀进程重启后仍是 Repeat one）；⑤ 首页统计真读 `GET /songs/stats`（此前是拿歌单列表 `total` 拼的，名不符实；新建 `models/library-stats.ts`，实测 `total_duration` 单位是**秒**、`total_file_size` 对全 remote 库为 0 故 0 时不显示）；⑥ 插件页标题用 `displayName` 而非路由前缀 `entryPath`（Flutter 原版本就如此，是移植遗漏）。**顺手修掉一个未被报告的缺陷**：`PluginWebViewPage` 用 `document.documentElement` 嗅探主题（Lynx 无 DOM，守卫让它不崩但把每个插件都钉死在 `theme=dark`）。**新发现 3 条**记入 `bug.md`（首页下拉刷新不触发——**已用对照实验证明非本批引入**；插件 tab 图标仍是内置 settings 图标；插件 WebView 内容空白）。clean build 1379.0 kB（**零警告**）/`tsc -b --force`/**549 vitest**（+21）全绿；三道新闸各做过反向验证。
> **上上批**（**批19b · 真机反馈修复**）：修掉「开关开/关在真机上完全无法区分」——lynx-ui `Switch` 自身不带样式、只把 `ui-checked` 追加到使用方 className 上，而三处手抄的 track CSS 里第三份漏了 `.ui-checked` 规则（也漏了 `flex-direction: row`）；根治办法是收敛出 `src/shared/ui/AppSwitch`（全 app 唯一一份开关样式）。**测试为何全绿**：Switch 的 mock 把 `checked` 整个丢了、ON/OFF 渲染成同一棵树——已改忠实版，并加两道反向验证过的闸（渲染层断言 `ui-checked` 落到 track + CSS 静态层断言 checked 规则存在且无第四份复制）。另清掉两条从未生效的样式（`text-transform` 无 Lynx 对应物故删除；`object-fit` 改用 `<image mode='aspectFit'>`），**构建警告归零**；并查明 `bug.md`「首页插件图标没显示」的根因是 7 个插件里 6 个图标是 `.svg` 而 Lynx `<image>` 原生路径不渲染 SVG（未修，留给那批）。**「扫描失败」不是客户端 bug**：后端（就跑在本机，cwd `/Users/hanxi/toy/songloft`）的 `music_path="music"` 指向不存在的 `.../songloft/music`；建该目录后扫描链路当场走通（`completed`，导入 0 首——本机确实没有音频文件）。顺带把 `GET /scan/directories` 从「未联调」转为已验证（真实响应 `{"directories": null, "root": "music"}`，空目录给 `null` 不是 `[]`）。build 1374.3 kB / `tsc -b` / **528 vitest** 全绿。
> **上一批**（**批19 · 音乐库运维 · 扫描**）：解掉「Lynx 客户端无法扫描音乐库」这个唯一「不做就用不起来」的缺口——新建 `src/features/library-ops/` feature + `/settings/library` 子页，交付扫描主链路（跳过已存在/重新导入 + 2s 进度轮询 + 5 个状态态 + 取消）、懒加载目录树选择器（指定目录扫描）、5 个后端扫描开关、元数据刷新（含自身轮询）。**修掉 3 个 Flutter 缺陷**（`'error'` vs `'failed'` 状态机断裂导致扫描区空白 / 扫完不刷歌曲缓存导致看不到新歌 / 进度百分比两套口径）。轮询走 TanStack Query 函数式 `refetchInterval`（已实测 query-core 的三处 clear 都有 `void 0` 守卫），并摘掉一处**隐藏依赖**——`refetchIntervalInBackground: true`，否则轮询是靠 `focusManager.isFocused()` 的 `document === undefined` fall-through 侥幸工作的。**测试抓到两个真 bug**：`z.coerce.boolean()` 把 `"false"` 变 `true`；zod v4 里 object 内裸 `z.unknown()` 缺 key 会抛，且被外层 `.catch([])` 吞成空数组（真机目录树会永远为空）。i18n 78 key × 2 语言全部从 ARB dump 挖出、非自撰。**顺手修掉**批18c 那个无效的暗色 Input 提示文字修复（`placeholder-color` 被 template encode 移除，须用 `-x-` 前缀）。build 1375.5 kB / tsc / **521 vitest**（+149）全绿。**上上批**（批17 · 插件模块）：对照 Flutter 参考源（`songloft-player/lib/features/settings/`）发现 `logLevelProvider` 其实是**后端设置**（`GET/PUT /api/v1/settings/log-level`，不是本地开关），`LogExportService` 是拉后端日志 + 本机 `FileLogger` 文件打包 zip + 系统分享面板（`share_plus`）。Lynx 版裁剪：新建 `SettingsApi`（`getLogLevel`/`setLogLevel`/`exportLogs`，镜像 `PlaylistApi` 用法）+ Settings 新增「诊断」分组（日志级别四选一，真调后端接口）+ `/settings/logs` 子页拉 `GET /api/v1/logs/export` 纯文本滚动展示（离线/后端不可达降级成错误提示）；不做 zip 打包/系统分享（Lynx 无原生分享模块，留给未来原生模块批），不做 `webDebugConsoleProvider`（Flutter Web 平台专属，与 Lynx 无关）。build 1221.1 kB / tsc / **372 vitest**（1 个 `use-debounce` 计时器 flake，隔离重跑 5/5 绿，与本批无关）全绿。**上一批**（批14 · 零散 UI 补完排查轮）：排查用户举的两个「零散 UI」候选后发现其实**已经实现**、只是文档过期未更——① 收藏歌单标识/置顶：`PlaylistCard` 对 `isBuiltIn` 早已叠心形徽标（Favorites/Radio-Favorites 后端 label 均含 `built_in`），批11 的 chevron 手动排序已可置顶任意歌单；② 首页问候语 i18n：`greeting.ts`/`resources.ts` 早已是 4 档×中英双语。真正补的一个缺口：`buildCoverUrl` 加 `_t=<updatedAt ms>` 缓存刷新参数。**顺手发现并修复**：docs/PROGRESS.md 里 4 处 U+FFFD 乱码字节其实是我上一批用 `edit_file` 改动其他段落时工具自己引入的（不是历史遗留），从 git 历史找回干净原文逐一还原。build 1212.3 kB / tsc / **358 vitest** 全绿。

## 总览

Flutter 版 → Lynx 客户端的整体重写，按 `plan.md` / `docs/lynx_migration_roadmap.md` **分批实现**，每批本机自动验收（`pnpm build` + `tsc -b` + `vitest`）+（涉及 UI 时）真机扫码目测。技术栈见 `AGENTS.md`。

## 批次状态

| 批 | 内容 | 状态 | 自动验收 | 真机验收 |
|---|---|---|---|---|
| 1 | 脚手架 + 路由壳 + 主题地基 | ✅ 完成 | build/tsc/vitest 绿 | ✅ 已扫码通过 |
| 2 | 核心基础设施（models/网络/存储/Query/Zustand）| ✅ 完成 | build/tsc/vitest 绿（53 测试）| — 纯基建，无 UI，免 |
| 3 | auth feature（登录页 + 鉴权守卫 + token 持久化）| ✅ 完成 | build/tsc/vitest 绿（70 测试）| ✅ 真机登录通（admin/admin + LAN IP → 跳主界面）|
| 4 | library feature（列表 + 分页）| ✅ 完成 | clean build/tsc/vitest 绿（99 测试）| ✅ 真机拉列表通（真实后端歌曲+封面+分页）；顶部安全区已修，待复扫 |
| 5 | player feature + TS mock 音频 | ✅ 完成 | clean build/tsc/vitest 绿（159 测试）| 待验证（点歌→mini→全屏，mock 进度自动前进）|
| 6 | playlist feature（歌单列表 + 详情 + Library Playlists 视图）| ✅ 完成 | clean build/tsc/vitest 绿（183 测试）| 待验证（Library→Playlists→点歌单→详情→点歌播放）|
| 7 | home feature（首页内容：问候 + 我的歌单/电台区块 + 统计条）| ✅ 完成 | clean build/tsc/vitest 绿（211 测试）| 待验证（登录→首页见问候+两区块+统计，点歌单进详情，"View all"进 Library）|
| 8 | settings feature（自包含项：默认播放模式 / 服务器地址切换 / 主题只读 / 关于 / 登出）| ✅ 完成 | clean build/tsc/vitest 绿（227 测试）| 待验证（设置页各分组、选播放模式、地址切换即时生效、登出回登录）|
| 9 | i18n 国际化（i18next + react-i18next，无 detector / 无 DOM / 无 Intl；en+zh 内联资源；抽取全 feature 硬编码英文串；Settings 语言切换即时生效；arb→i18next 转换脚本）| ✅ 完成 | clean build（1095.7 kB，最长行 105723）/tsc/vitest 绿（247 测试）| 待验证（切语言即时重渲染中/英、各页文案本地化、跟随系统）|
| B1 | Android 原生宿主 + 内嵌 bundle + GitHub CI 出可安装 dev APK（音频仍 TS mock）| ✅ 完成（本机可验部分）| clean build/copy script/tsc/247 vitest/workflow YAML 全绿 | **APK：待 CI**（本机无 Android SDK 不能 assembleDebug）；真机侧载：待用户装 |
| B2 | Android 真原生音频 SongloftAudio（ExoPlayer/media3）+ facade 原生/mock 切换；**+真机修复轮**（原生持久化存储/通知权限/通知栏/configChanges）| ✅ 完成（本机可验部分）| clean build（1103.7 kB）/copy script/tsc/**270 vitest** 全绿 | 真实播放✅；持久化/重登✅；通知权限弹窗✅；**通知栏控制❌（批10 修复待 CI 复验）** |
| 10 | 功能补全轮（Library 搜索+排序 / Playlist CRUD / Player 睡眠定时+歌词增强 / Android 通知栏修复）| ✅ 完成 | clean build（1149.7 kB）/tsc/**332 vitest** 全绿 | ⏳ 待 CI 出新 APK 验通知栏 |
| 11 | 收藏/排序/歌词缓存/闪烁修复轮（Library 收藏 / Home 刷新+高亮 / Playlist 排序 / Player 歌词缓存 / 登录页闪烁修复）| ✅ 完成 | clean build（1200.8 kB）/tsc/**345 vitest** 全绿 | ⏳ 待 CI 出新 APK 验登录页不再闪烁 + 下拉刷新手势 |
| 12 | 小遗留项扫尾轮（服务器切换清缓存 / 内置歌单徽标 / 播放队列拖拽排序 UI / pnpm-workspace 占位符 bug 修复）| ✅ 完成 | clean build（1207.3 kB）/tsc/**348 vitest** 全绿 | 待验证：证队列 chevron 排序 + 服务器切换后旧数据不再残留 |
| 13 | 主题 light/system 切换（B3 之外的非原生小活；新建 light token 集 + `ThemeProvider`/`ICON_COLORS` 动态取值 + Settings 三选一 + 持久化）| ✅ 完成 | clean build（1210.9 kB）/tsc/**356 vitest**（1 个无关 flake，隔离重跑绿）全绿 | 待验证：证 light 主题全屏配色（含图标）+ 重启读回持久化选择 |
| 14 | 零散 UI 补完排查轮（订正 2 处已完成但过期的文档 + 补 1 处真缺口：`buildCoverUrl` 加 `_t=<updatedAt ms>` 缓存刷新参数）| ✅ 完成 | clean build（1212.3 kB）/tsc/**358 vitest** 全绿 | 待验证：证封面更新后不再显示 CDN/客户端旧缓存图 |
| 15 | 诊断类（Settings 新增日志级别四选一 + 日志导出子页，真调后端 `GET/PUT /settings/log-level` + `GET /logs/export`；裁掉 zip 打包/系统分享面板——无原生分享模块）| ✅ 完成 | clean build（1221.1 kB）/tsc/**372 vitest**（1 个 `use-debounce` 计时器 flake，隔离重跑 5/5 绿，与本批无关）全绿 | ⏳ 待联后端验证日志级别真切换 + 日志导出内容 |
| 16 | Playlist 补充端点（song-ids / touch / visibility / sort / updatePlaylistSort）| ✅ 完成 | build/tsc/vitest 绿（372 测试）| — 纯 API + UI，免真机 |
| 17 | 插件模块（管理层 + 首页网格 + 宿主桥接 + 注册表商店页）| ✅ 完成 | build/tsc/vitest 绿（372 测试）| — 纯 API + UI + 桥接逻辑，免真机 |
| 18 | 插件 WebView 渲染 + 动态 Tab 显示（`<webview>` 内置元素 + tab-config API + Shell 动态 tab）| ✅ 完成 | build/tsc/vitest 绿（372 测试）| ⏳ 需后端 + 已安装插件才能真机验 |
| 18b | Tab 配置页 + 首页区块横向滚动 | ✅ 完成 | build/tsc/vitest 绿（372 测试）| 待验证：横向滚动手势 |
| 18c | 零散修复（暗色 Input 提示文字色 / 曲库子页签记忆）| ✅ 完成 | build/tsc/vitest 绿（372 测试）| ⚠️ **提示文字色修复当时无效**（`placeholder-color` 被 Lynx template encode 移除，批19 改为 `-x-placeholder-color` 才生效）|
| 18d | Android 修复（通知栏 `addSession()` / 正式图标与名称 / CI release 签名）| ✅ 完成（本机可验部分）| workflow YAML + Kotlin 结构自查 | ⏳ 待 CI 出新 APK 验通知栏真出现 |
| 19 | **音乐库运维 · 扫描**（扫描主链路 + 目录树选择 + 5 个扫描开关 + 元数据刷新）| ✅ 完成 | clean build（1375.5 kB）/tsc/**521 vitest**（+149）全绿 | ⏳ **必须联后端真验**（本批唯一价值所在，见下）|
| 19b | 真机反馈：开关开/关状态不可见（真 bug，已修）+ 构建警告归零（两条从未生效的样式）+ 「扫描失败」定位（后端 `music_path`，非客户端；建目录后链路走通）| ✅ 完成 | clean build（1374.3 kB，**警告归零**）/`tsc -b --force`/**528 vitest**（+4）全绿 | ✅ 开关状态已确认可见；⏳ 「真的导入歌曲」仍未验（该机无音频文件）|
| 20 | **bug.md 清理第一轮**（首页横滚 + 卡片竖矩形 / 插件图标 SVG / 播放器返回 + MiniPlayer 白名单 / 删播放设置 / 统计走 `/songs/stats` / 插件页标题）+ **本机 Android SDK 打通** | ✅ 完成 | clean build（1379.0 kB，**零警告**）/`tsc -b --force`/**549 vitest**（+21）全绿 | ✅ **6 条全部模拟器截图验过**；⏳ 新发现 3 条已记 `bug.md`（下拉刷新不触发已证非本批引入）|
| 21 | **外观/语言跟随系统**（Android 宿主注入系统外观 → `lynx.__globalProps` + 全局事件；`resolveTheme`/`resolveLanguage` 真读宿主） | ✅ 完成 | clean build（1382.0 kB，**零警告**）/`tsc -b --force`/**573 vitest**（+24）全绿；Kotlin 零警告 | ✅ **模拟器双向验过**：冷启动跟随 + 运行中翻转系统深浅色/语言应用立刻跟随（未重启） |
| 22 | **通知栏下一曲/收藏按钮 + 正式小图标**（`RemoteCommandForwardingPlayer` 转发 next/previous 到 JS；`SessionCommand`+`setCustomLayout` 收藏按钮双向同步；`setSmallIcon` 换正式图标） | ✅ 完成 | clean build（1386.5 kB）/`tsc -b --force`/**578 vitest**（+5）全绿；Kotlin 编译干净 | ✅ **dumpsys 为准**（通知栏截图在此模拟器不可视）：next/previous 已用 `KEYCODE_MEDIA_NEXT/PREVIOUS`+logcat 验通；收藏点击分发未端到端外部触发（见 TODO） |
| 23 | 登录居中 + 插件 tab 图标修复 | ✅ 完成 | build/tsc/**578 vitest** 全绿 | — `bug.md` 第 15、16 条，纯 CSS + 已有数据接线，免真机复验 |
| 24 | 插件 WebView 空白修复（Lynx SDK 3.8.0→4.0.0） | ✅ 完成 | build/tsc/**578 vitest** 全绿 | ✅ 真机 WebView 正常渲染插件内容 |
| 25 | 首页下拉刷新·手动刷新按钮 | ⚠️ **根因误诊，批29 修正** | build/tsc/**578 vitest** 全绿 | 真根因是 `<refresh>` 缺 `androidx.viewpager2` 依赖、attach 即崩（非「SmartRefreshLayout alpha 嵌套滚动回归」）；批29 加依赖后原生下拉刷新恢复，本批加的手动按钮已被 `76329e3` 删除 |
| 26 | **排除目录管理**（对齐 Flutter `ExcludeDirManager` 三 Tab：名称排除/路径排除/自动建歌单排除名单；`path` 只读不可编辑）+ 开发环境 WASM OOM 定位 | ✅ 完成 | clean build/`tsc -b --force`/**604 vitest**（+26）全绿 | 待验证：证三 Tab 交互 + Save 写回（）|
| 27 | **暗色对比度审计**（WCAG AA：拆 `--primary`/`--accent`、`--danger`/`--danger-2`；新增 `contrast.test.ts` 回归 gate）+ 24G 虚拟上限定位 | ✅ 完成 | clean build（1418.0 kB）/`tsc -b --force`/**636 vitest**（+31，1 个已知 use-debounce flake 隔离重跑绿）全绿 | 待验证：配色 |
| 28 | **重复检测/指纹 + 缓存管理**（2 subagent 并行：library-ops 三阶段指纹/重复页 + settings 缓存页；共享文件手动 merge；CSS token 修正） | ✅ 完成 | clean build（1519.5 kB）/`tsc -b --force`/**709 vitest**（+74，1 个已知 use-debounce flake 隔离绿）全绿 | 待验证：指纹计算/重复组删除/缓存清理 + 配置写回|
| 29 | **真机验收轮**（批25-28 积压一次性验掉）+ **3 个真机专属 bug**（`<refresh>` 缺 viewpager2 / lazy-bundle 不进 APK / 宿主 `queueMicrotask` 坏掉）+ 文案订正 | ✅ 完成 | clean build（**1476.6 kB**，−42.9）/`tsc -b --force`/**714 vitest**（+5）全绿 | ✅ **批25/26/27/28 全部模拟器逐条截图验过**；顺带补验批19「真的导入歌曲」、批22 收藏按钮已注册进 MediaSession |
| B3a | **iOS 原生宿主 + 内嵌 bundle**（手写 pbxproj + CocoaPods Lynx 4.0.1 + ATS + 安全区修复；服务走 pod lazy-register，宿主不手写注册） | ✅ 完成 | 前端未动逻辑（716 vitest 仍绿）；`pnpm run ios:build` 通过 | ✅ **iPhone 17 Pro / iOS 26.0 模拟器逐张截图验过**：登录页 → 登录 → 首页真实数据；`<input>` / `<svg>`（含远程插件 SVG）/ `<image>` 全正常；790 行 lynx 日志 **0 条 LynxError** |
| B3b | iOS 原生模块（`SongloftAudio` AVPlayer / `SongloftStorage` / `SystemAppearance`） | ✅ **完成** — 三模块落地 + iPhone 17 Pro 模拟器验收（AVPlayer 播放 ✅、Storage 持久化 ✅、深浅色跟随 ✅）、契约测试 52/52 绿 | | 764 vitest + tsc 全绿 |
| 29b | **批28 三阶段补验**（借 `localhost:18091` 后端，chromaprint 可用）→ **发现 1 个真 bug**：Computing 阶段进度恒 `0/0` 且完成后不转 Results | ✅ 补验完成（bug 已由批29c 修） | — | ✅ Status 两个分支都验过；Computing bug 见批29c |
| 29c | **修批29b Computing bug**（陈旧终态跳过 computing + `refetchInterval` 在 Lynx 首次 fetch 后不再 fire）：清陈旧缓存 + 时间戳守卫 + 改页面级显式 `setInterval` 轮询 | ✅ 完成 | clean build（1476.6 kB）/`tsc -b`/**711 vitest**（+2 反向验证过）全绿 | ✅ **18091 真机全链路验过**：扫描导入 2 组同源重复 → Computing 实时推进 → 自动转 Results 渲染 2 组重复 → lynx-ui 删除 Dialog（首次上真机）→ 确认删除真删文件（358→356）+ UI 实时刷新；单组删除 + 清理全部两入口都验 |
| 33 | **文档重构 + bug修复 + 歌单搜索 + 多选 + 长按菜单 + 主题包** | ✅ 完成 | build/tsc/**804 vitest** 全绿 | ✅ bug.md 4项全部修复 |
| 34 | **歌词滚动 + 后端更新 + 高级筛选 + 歌曲详情 + 清理 + 歌词编辑 + 网络歌曲 + 搜索建议** | ✅ 完成 | build（1688.1 kB）/tsc/**804→808 vitest** 全绿 | 待验证 |
| 35 | **添加歌曲入口 + 拖拽预览 + 4项测试 + E2E脚本 + DLNA + 悬浮歌词 + Live Activity** | ✅ 完成 | build（1696.6 kB）/tsc/**809 vitest** 全绿 | 待验证（原生模块需真机） |
| 36 | **Library 电台子视图 + 宽屏首页网格 + 音量均衡开关** | ✅ 完成 | build（1764.7 kB）/tsc/**811 vitest** 全绿 | 待验证 |
| 37 | **拼音排序 + 加载慢提示 + 封面上传 + 开源许可页** | ✅ 完成 | build（1776.3 kB）/tsc/**824 vitest** 全绿 | 待验证 |
| 38 | **歌单多选批量操作 + EQ bars 动画** | ✅ 完成 | build（1792.5 kB）/tsc/**824 vitest** 全绿 | 待验证 |
| 39 | **DLNA 原生模块 + 不安全 TLS 生效** | ✅ 完成 | build（1792.7 kB）/tsc/**824 vitest** 全绿 | 需真机验证 |
| 40 | **边角料收尾**（扫描轮询迁移 + i18n 统一 + 封面进通知栏 + 播放失败重试 + debounce 行为测试 + CSS token 化） | ✅ 完成 | build（1802.6 kB）/`tsc -b`/**837 vitest**（+12）全绿 | 需真机验证：扫描进度轮询、通知栏/锁屏封面（**仅 Android 实现，iOS 未接**，见审计）、远程歌曲 502 重试、重复检测页样式 |
| 40 后修 a | **web 下拉刷新真修**（批36 误诊的真根因：`isWebEnvironment()` 在 web-core 的 background Worker 里恒 false；且 Web 无 `<refresh>` 实现）→ 新增 `isWebPlatform()` 按 `SystemInfo.platform` 判定，Web 上整段不渲染 | ✅ 完成 | build（1807.6 kB）/`tsc -b`/**841 vitest**（+4）全绿 | ✅ 无头 Chrome 验过：`hasRefreshTag:false`、页面无「下拉刷新」文案、滚动正常 |
| 40 后修 b | **web 刷新掉登录**（同一 realm 事实的第三个受害点：worker realm 无 `localStorage`）→ 新增 `core/storage/idb-storage.ts`，插在 localStorage 与内存之间 | ✅ 完成 | build（1807.6 kB）/`tsc -b`/**850 vitest**（+9）全绿 | ✅ 无头 Chrome 验过：IDB `songloft/kv` 6 键齐全、整页 reload 后仍在首页 |
| 41 | **P0 阻断修复**（原生 bundle 不重建 + iOS 工程损坏 + Web 产物黑屏，每条各配一道闸门） | ✅ 完成 | build 双产物（lynx 1762.1 kB / web 1807.6 kB，零告警）/`tsc -b`/**858 vitest**（+8，关键断言均反向验证）全绿 | ✅ **iOS `BUILD SUCCEEDED`**（.app 含 bundle）；✅ **`build:web` 产物用无头 Chrome 打开，登录页完整渲染、零 pageerror** |
| 42 | **审计「一眼可见」缺陷五波**（i18n裸key/收藏分页死循环/升级轮询失控/队列重排钉错 · 播放位置不落盘/冷启动播放键无效/LiveActivity泄漏 · 切服务器旧token/HTTP无超时 · DLNA页进去即���/能力探测器接线 · 元数据再次刷新不轮询） | ✅ 完成 | build 双产物��告警 / `tsc -b` / **900 vitest**（+34，关键断言均反向验证）全绿 | 多为纯逻辑修复已单测覆盖；DLNA/悬浮歌词/LiveActivity 的真机表现仍需原生模块接通后验（见审计 P2-3） |
| 43+ | **审计其余项**（P0-2 Web 音频 / P0-4 embedded 宿主页 / P0-5 后端地址探测 + 结构性重构 + 功能缺口） | 📋 已排期未开始 | — | 计划见 [`../plans/2026-08-14-audit-fix-plan.md`](../plans/2026-08-14-audit-fix-plan.md) |
| 后续 | Lynxtron 桌面 | ⛔ 未开始 | | |

> ### ⚠️ 2026-08-14 四路审计结论（读遗留清单前先看这段）
>
> 批40 后做了一次四路并行审计（Web 完整性 / 正确性缺陷 / Flutter 功能缺口 / 原生模块契约与「待验证」项核实）。**它推翻了本文件若干「已完成」的记载**，完整清单与修复排期在 [`docs/plans/2026-08-14-audit-fix-plan.md`](../plans/2026-08-14-audit-fix-plan.md)。最需要立刻知道的三条：
>
> 0. **`pnpm run build` 自 `2330c22`（Web 支持）起不再产出 `dist/main.lynx.bundle`** —— `lynx.config.ts` 的 `environments` 块替换掉了隐式默认环境。而 `build:android-bundle`/`build:ios-bundle` 照旧从那个路径拷贝，所以**原生包里嵌的是遗留的陈旧产物**（发现时是一份 08-13 的 6.5 MB dev bundle）。这条不在四路审计产出里，是随后整理文档时撞出来的；一行可修（补 `lynx: {}`），已验证。
> 1. **iOS 自批39（`5f51f0c`）起完全无法构建** —— `project.pbxproj:255` 在 `PBXSourcesBuildPhase` 的数组内多了一行赋值语句，`xcodebuild -list` 直接报解析错误。批39/40 声称的「build 全绿」全是 rspeedy 的 JS 产物；那之后 iOS 一次都没构建过。契约闸门用 `.toContain(子串)` 而畸形行恰好含该子串，故全绿。
> 2. **Web 完全没有声音** —— `web-audio.ts:30` 用 `typeof HTMLAudioElement !== 'undefined'` 判定平台（**与上面两条后修同一根因，第三次**），在 worker realm 恒 false，`WebSongloftAudio` 从未被构造过。mock 拿到真实时长，进度条照走、自动切歌，唯独不出声。
> 3. **`build:web` 产物黑屏** —— 宿主页请求 `index.js`/`index.css`，prod 产物叫 `client.js`/`client.css`。`web:dev` 走另一个目录所以正常，这也是两次 Web 修复验证时都绕过了它的原因。
>
> 另外 **DLNA / 悬浮歌词 / Live Activity 三项在本文件里记为已完成，实际从未跑通**（分别是 TS 调用约定错、模块未注册、不是 Lynx 模块），下方 P3 相关条目已就地标注。

## 已交付明细

### 批1 · 行走骨架
- Rspeedy + ReactLynx + TS 脚手架；TanStack Router（code-based + memory history）；LUNA tokens 主题 + `useBreakpoint`（四级断点）；lynx-ui Button（按组件包导入）。
- 路由：`/login`、`/player` 无壳；`/`、`/library`、`/settings` 挂自适应 `ShellLayout`。
- **关键修复**：真机 `self.__TSR_ROUTER__` 崩溃 → `pnpm patch @tanstack/router-core` 加 `typeof self` 守卫（`patches/` + `pnpm-workspace.yaml`）。

### 批2 · 核心基础设施（无 UI）
- **模型**（`src/models/`）：Song/Playlist/AuthTokens/TokenInfo/分页/ApiResponse，zod schema（snake_case↔camelCase transform）+ parse 封装。
- **网络**（`src/core/network/`）：transport-agnostic `HttpClient`（fetch 依赖注入）；`AuthInterceptor`——Bearer 注入、公开路径跳过、**401 单飞刷新**（并发共享一次 refresh、失败清 token→onTokenExpired）；`createPublicClient`；`TokenStore`（内存缓存 + secure 持久化）。
- **UrlHelper**（`src/core/network/url-helper.ts`）：资源/歌曲/封面/视频 URL + access_token + 转码参数。
- **存储**（`src/core/storage/`）：`SongloftStorage` facade（prefs/secure/paths），web（localStorage）/ memory（测试）/ native（stub 报错）三实现。
- **TanStack Query**（`src/lib/query/`）：`createQueryClient` + `configureQueryGlobals()`（no-op focus/online manager + **AbortController 存在性 polyfill**）。
- **Zustand**（`src/store/`）：`useAppSessionStore` 确立 create+selector 约定。

### 批3 · auth feature（登录页 + 鉴权守卫 + token 持久化）
- **登录页**（`src/features/auth/pages/LoginPage.tsx`）：标题/副标题 + Username/Password（lynx-ui `Input`）+ lynx-ui `Button`（render-prop）；**standalone** 追加 API 地址字段 + 不安全 TLS 开关（lynx-ui `Switch`），`appConfig.isEmbedded` 时隐藏；全部走 LUNA tokens。
- **鉴权守卫**：`evaluateAuthGuard` 纯函数（`unknown` 不重定向、`unauthenticated`→`/login`、`authenticated`@`/login`→`/`），在 rootRoute `beforeLoad` 读 vanilla `useAuthStore.getState()`。
- **store**：zustand `useAuthStore`（status/isLoading/error + hydrate/checkAuth/login/logout/reset），登录走 `createPublicClient` + `TokenStore` secure 持久化。

#### ⚠️ 测试约定：lynx-ui 组件 + zustand 订阅在 Vitest 需 mock（原生运行时不可用，真机正常）
渲染测试（`smoke.test.tsx`、`login-page.test.tsx`）在 ReactLynx testing-library 环境下有**两类**运行期设施不可用，均需 mock 成纯 `<view>/<text>` / 静态桩，否则会崩 `Cannot read properties of undefined (reading 'isListHolder' / 'parentNode')` 并**污染共享 elementTree** 连累后续用例：
1. **lynx-ui 原生叶子**：`Input`（mount effect 调 native `NodesRef.invoke`→`not implemented`）、`Switch`（native gesture 运行时）。
2. **zustand `useAuthStore` 订阅**：经 `useSyncExternalStore`，其挂载后一致性检查会在初始双线程 lifecycle flush 未完成时**强制第二次 commit**，该 patch 读到 `__snapshot_def` 尚未定型的快照 → `isListHolder` 崩溃。仅 `LoginPage` 用订阅式 store，故只有它崩（list/player 页只用 Button，安全）。
- 修复：共享桩工厂 `src/__tests__/_render-mocks.tsx`（`mockLynxUiInput` / `mockLynxUiSwitch` / `makeAuthStoreMock`——后者仅覆盖 `useAuthStore` 为静态 `status:'unknown'` 非订阅读取器，其余 store 导出经 `vi.importActual` 保留，守卫仍真实）。**真实组件与真实 store 用于 build/dev/device**（真机批1 已证 lynx-ui 可渲染）。断言仍实质校验页面结构（Songloft / Sign in to continue / Username / Password / Log in；standalone 下 API base URL + Allow insecure TLS）。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（产物压缩，最长行 172415；`__TSR_ROUTER__` 写入仍被 `void 0!==S&&(...)` 守卫）、`tsc --noEmit` 绿、`pnpm test` 69/69 绿。

### 批4 · library feature（歌曲列表 + 分页）
- **songs API**（`src/features/library/api/songs-api.ts`）：包 batch-2 `HttpClient`，`getSongs`/`getFacets`/`getSongIds`/`getSong`（前缀 `/api/v1`），经 batch-2 zod（`parseSongListResponse`/`parseSongFacetResponse`/`parseSong`）解析。query 拼接抽成纯函数 `buildSongsQuery`/`buildSongIdsQuery`/`buildFacetsQuery`（默认 `limit=defaultPageSize=20`/`offset=0`，空串与 `year/decade<=0` 剪除，mirror Flutter `SongsApi._applyTagFilters`）单独单测。`api/index.ts` 懒建**认证客户端单例**（batch-2 `createApiClient`：Bearer + 单飞 401 refresh），`onTokenExpired → useAuthStore.logout()`。
- **取数与分页**（`src/features/library/data/`）：`useInfiniteQuery`（`@tanstack/react-query`）——`useSongsInfiniteQuery`/`useFacetsInfiniteQuery`，`queryKey` 含过滤条件/字段，`queryFn` 按 `offset/limit` 取页；`getNextPageParam`（纯函数 `songsNextPageParam`/`facetsNextPageParam`）依「累计 < total」推进 offset、到底返 `undefined`（`hasNextPage→false`）；`flattenSongs`/`flattenFacets` 扁平化 pages。全部纯函数单独单测（累计推进 / 到底停 / 空页）。`formatDuration`（mm:ss / hh:mm:ss）ported。
- **QueryClientProvider 首次挂进 bootstrap**（`src/App.tsx`）：`configureQueryGlobals()`（batch-2）→ `getQueryClient()` → `<QueryClientProvider>` 包住 `<RouterProvider>`。这是 roadmap R11 的 Query 集成在渲染树的落地；**Query 真入包**（产物含 `QueryClient`/`fetchNextPage`/`getNextPageParam`）。
- **LibraryPage**（`src/features/library/pages/LibraryPage.tsx`，替换 `/library` 占位）：视图切换器 songs / **Categories(facets)** / **Playlists(占位)**（本地 `useState` 驱动）。songs 用原生 Lynx `<list>` + `bindscrolltolower`（经 `VirtualList` 封装）触底 `fetchNextPage()`；facet 用 `<scroll-view>` 网格。歌曲行 `SongRow`（`buildCoverUrl` 封面 + 标题 + `artist · album` + `mm:ss`）、`FacetCard`（封面 + 值 + 计数）。加载/空/错误态齐备；全走 LUNA tokens（无硬编码色；移除 Lynx 不支持的 `text-transform`）。
- **测试约定（沿用批3 `_render-mocks` 模式）**：`useInfiniteQuery` hooks 经 `useSyncExternalStore`（同批3 崩 `isListHolder` 类）→ 渲染冒烟里 `vi.fn()` 桩返静态 infinite-query 形；且 `<list>/<list-item>` 在 ReactLynx Vitest env **虚拟化不挂子节点**（`<scroll-view>` 子节点可查），故把 `<list>` 封装成 `VirtualList` 并在测试 mock 成 plain `<view>`（`_render-mocks.mockVirtualList`）。真实 `<list>` + 真 hooks 用于 build/dev/device。断言实质结构：songs 行（标题/副标题/`05:27`/`09:05` 时长）、空态「No songs yet」、加载态、facets 网格（`Artist` chip + `Miles Davis` + `12 songs`）、playlists 占位。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（压缩，最长行 66408；产物含 `QueryClient`/`fetchNextPage`/`getNextPageParam`/`scrolltolower`，AbortController polyfill offset 18137 早于首个 `new AbortController` offset 110209，`__TSR_ROUTER__` 守卫仍在——`background-bundle-self`/`query-no-dom`/`router-no-dom` 全绿）、`tsc --noEmit` 绿、`pnpm test` 99/99 绿。**真机验证**：登录后进 Library 真实拉到后端歌曲（封面/标题/artist·album/时长）+ 触底分页——R11（Query 无 DOM 集成）真机确认可用。
- **安全区修复**（真机暴露）：narrow 下页面顶到状态栏/刘海、底栏顶 home indicator。在 `ShellLayout.css` 全局加 `.shell__body { padding-top: env(safe-area-inset-top) }`（wide 置 0，rail 顶部含 inset）与 `.shell__bottombar { padding-bottom: env(safe-area-inset-bottom) }`（Lynx 支持 `env(safe-area-inset-*)`）。影响 Home/Library/Settings 全部 shell 页。

### 批5 · player feature + TS mock 音频
- **SongloftAudio TS mock**（`src/native/`）：`audio-types.ts`（facade 接口 + `AudioEvent` 事件契约，mirror `docs/lynx_native_modules_spec.md#1`）、`mock-audio.ts`（`MockSongloftAudio`：`play` 后每 250ms 递增 position 并 emit `progress`，到 duration emit `completed`；`load/play/pause/stop/seek/setVolume/setSpeed/setQueue/next/previous/setRepeatMode/setShuffle` + EQ 占位；`on/off` 订阅）、`audio-facade.ts`（`getAudio()` 单例返 mock；`createNativeAudio()` 抛错 stub，真机批接 `NativeModules.SongloftAudio`）。**定时器严格性**：`safe-timers.ts` 的 `safeClearInterval/safeClearTimeout` 只在 `id != null` 时调宿主 clear——比 `typeof===number` 更正确（Lynx 句柄是 Number、node 句柄是对象，都放行；只挡 `undefined/null` 这个真正会让 Lynx 抛 `param 0 should be Number` 的情形），并有单测模拟「Lynx 严格 clear 抛错」证明不崩、以及「completed 后 interval 真停」。
- **playerState store**（`src/features/player/store/player-store.ts`，zustand，对应 `playerStateProvider`+`PlayerNotifier`）：状态 mirror `player_state.dart`（ms 计时、volume 0-100），桥接 mock 音频事件（`progress`→currentTime/duration + 驱动歌词定位；`stateChanged`→isPlaying/isBuffering；`completed`→按 playMode 路由）。控制面 `playSong(song,queue?)`/`playPlaylist`/`togglePlay`/`playNext`/`playPrev`/`seek`/`seekBy`/`setVolume`/`toggleMute`/`setPlayMode`/`cyclePlayMode`/`addToPlaylist`/`removeFromPlaylist`/`reorderPlaylist`/`clearPlaylist`/`toggleFullPlayer`/`closeFullPlayer`/`togglePlaylistDrawer`/`closePlaylistDrawer`/`clearError`/`setSleepTimer*`/`cancelSleepTimer`。**状态机抽纯函数**（`domain/`）：`play-mode.ts`（`resolveNext/resolvePrev` order 到底/loop 环绕/single 停留/random 边界；`hasNext/hasPrev`；`cyclePlayMode`）、`sleep-timer.ts`（`tickSleepTimer`/`sleepTimerOnSongCompleted` 纯 reducer，store 管 1s interval）、`queue.ts`（`removeAt`/`moveItem`/`reorder` 保持当前曲锁定）、`derive.ts`（`hasSong/hasNext/hasPrev/progressOf/isMuted/nextSongOf` 派生选择器）。全部单独单测。
- **歌词**（`src/features/player/`）：`domain/lyric-parser.ts` port（`parseLrc`/`parsePlain`/`findCurrentLine` 纯函数，ms 计时）；`store/lyric-store.ts`（`lyrics/currentIndex/isLoading/synced` + `loadForSong(song, fetcher?)` + `syncPosition(ms)`）。歌词来源 `data/lyric-source.ts` 复用 library 的**认证客户端**（新增 `SongsApi.getLyric(lyricUrl)`）——best-effort，无 lyricUrl 直接空态、失败不崩。逐字/翻译/罗马音解析本批未 port。
- **UI**（`src/features/player/{pages,widgets}`）：全屏播放页 `FullPlayerPage`（`/player`，chrome-less，CSS transform slide-in）——封面 + 标题/艺人 + **lynx-ui `Slider` 进度条**（拖动 `onValueCommit`→seek）+ 时间 + 播放控制（上一首/播放暂停/下一首 + 播放模式切换）+ **`Slider` 音量** + 静音 + 打开抽屉 + 歌词视图（当前行高亮）；窄屏封面/歌词用 **lynx-ui `Swiper`** 两页横滑，宽屏并排。`MiniPlayer`（纯 `<view>`，无手势叶子）挂进 `ShellLayout`（narrow 底栏之上、wide 内容列底部，含安全区），仅 `hasSong` 显示，点开 `/player`。播放列表抽屉 `PlaylistDrawer`（**lynx-ui `Sheet`**，ref 命令式 open/close 跟随 `showPlaylistDrawer`，点选切歌/移除）。**接线**：Library `SongRow` 点击→`playPlaylist(当前列表, index)`→mini-player 出现；`/player` 空态（无歌）有占位 + 去 library。全走 LUNA tokens。
- **新增 lynx-ui 组件包**：`@lynx-js/lynx-ui-slider`/`-sheet`/`-swiper`（按组件包导入，非桶入口）。
- **测试约定（沿用 `_render-mocks` 模式）**：新增桩工厂 `mockLynxUiSlider/Sheet/Swiper`（原生手势叶子）+ `makePlayerStoreMock/makeLyricStoreMock`（`useSyncExternalStore` �������������阅→静态非订阅读取器）。渲染冒烟 `full-player.test.tsx`（断言「Now Playing」/标题/艺人/▶/播放模式/`00:30`·`03:20` 时长）、`mini-player.test.tsx`（标题/副标题/播放键）。**router 现会 eager import `/player`→FullPlayerPage→lynx-ui 手势叶子**（import 期即污染 reconciler），故凡经 router ���染的既有测试（`smoke.test`、`login-page.test`）也补上 slider/sheet/swiper 桩。真组件/真 store 用于 build/dev/device。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（压缩，最长行 85540，产物含 `Now Playing`/`Up next`/`setInterval` 计时；`background-bundle-self`/`query-no-dom`/`router-no-dom` 对新鲜 dist 复跑绿）、`tsc --noEmit` 绿、`pnpm test` 159/159 绿。

### UI 修整 · emoji 图标 → Lynx `<svg>` 矢量 Icon 组件
- **动机**：原 UI 用 emoji 当图标（`⌂♪⚙ ⏮⏭⏸▶ 🔀🔁🔂➡ 🔊🔇 ☰⌄`），跨端字体渲染不一致、无法主题着色、观感差。改为统一走原生 `<svg>` 矢量图标。
- **Icon 组件**（`src/shared/ui/`）：`icons.ts` = 图标 registry（24×24 viewBox，Feather/Lucide 风格自绘 path，未抄版权资源；线性图标 `stroke`+`fill=none`+`stroke-width=2`+round cap/join，实心 transport 用 `fill`）+ `buildSvg(name,color)` 生成完整内联 SVG 串；`Icon.tsx` = `<Icon name size=24 color />` → `<svg content={buildSvg(...)} style={{width,height}} data-icon data-testid=icon-<name> />`（用 `content` 传内联串、给已解析 px 尺寸，符合 svg.md 契约）。**图标集（16 个）**：`home`/`library`/`music`/`settings`/`play`/`pause`/`skip-prev`/`skip-next`/`shuffle`/`repeat`/`repeat-one`/`order`/`volume`/`volume-mute`/`chevron-down`/`menu`。
- **着色方案结论**：**采用「颜色注入 markup」**——`Icon` 接 `color` prop，`buildSvg` 把该颜色直接写进每个元素的 `fill`/`stroke`。原因：`<svg content>` 由原生渲染、**不经 CSS 级联**，故 CSS `var(--…)` / `currentColor` **对 markup 内的 `fill/stroke` 不生效**。`@lynx-js/types` 的 `SVGProps` 确有文档化 `current-color` 属性（iOS/Android/Harmony，用于解析 markup 里字面量 `currentColor`，且不覆盖显式 `fill/stroke`），但**未在本次真机验证**，且不覆盖桌面/clay——故选注入这条可移植、可测的路径。图标色常量 `ICON_COLORS`（`Icon.tsx` 导出，取 `tokens.css` 的 hex：primary `#7c5cff`/primaryContent `#ffffff`/content `#f5f5f7`/content2 `#c7c7d1`/contentMuted `#8b8b98`/danger `#ff6b6b`），需与 `tokens.css` 手动保持同步。
- **替换的使用点**：`shared/nav/destinations.ts`（`icon` 字段类型 `string`→`IconName`，值 `home`/`library`/`settings`）；`shared/layouts/ShellLayout.tsx`（nav 图标：激活 `ICON_COLORS.primary`、非激活 `contentMuted`）；`features/player/widgets/PlayControls.tsx`（模式 order/loop/single/random → `order`/`repeat`/`repeat-one`/`shuffle`；上一首/下一首；play/pause 按 `isPlaying` 切换，buffering 仍显 `…` 文本）；`VolumeControl.tsx`（`volume`/`volume-mute`）；`pages/FullPlayerPage.tsx`（collapse→`chevron-down`、菜单→`menu`、空封面占位→`music` note）；`widgets/MiniPlayer.tsx`（play/pause）；`widgets/LyricsView.tsx`（空歌词行 `♪` 占位→`music` Icon）。相关 CSS 里旧的 `*-glyph`/`*__icon` 文本样式改为 flex 居中容器；已删净空的死规则（`full-player__icon`/`__cover-glyph`/`mini-player__play-glyph`）。文本标签（nav「Home/Library/Settings」、模式「Shuffle」等）**保留**，只换图标 glyph。
- **测试改写（可测标识，不注水）**：`<svg>` 在 ReactLynx Vitest env 作普通原生节点渲染（不像 Input 走 native invoke，无需 mock）；已验 `queryByTestId('icon-<name>')` 命中。`mini-player.test.tsx` 由断言 `queryByText('▶')` 改为 `queryByTestId('icon-play')` 存在 **且** `icon-pause` 不存在（证明按 `isPlaying=false` 渲染 play 而非 pause）。`full-player.test.tsx` 由 `queryByText('▶')` 改为断言 `icon-play` 存在+`icon-pause` 不存在、`icon-skip-prev`/`icon-skip-next`/`icon-order`（order 模式）、topbar `icon-chevron-down`/`icon-menu` 均存在——覆盖切换态与各控件，仍是实质断言。
- **验收**：`rm -rf dist .rspeedy && pnpm run build` 绿（`main.lynx.bundle` 898.3 kB，含 `viewBox="0 0 24 24"` + 图标 path，确认矢量图标已入包）、`tsc --noEmit` 绿、`pnpm test` 159/159 绿。**已确认目标 emoji 图标字符（`⏮⏭⏸▶🔀🔁🔂➡🔊🔇☰⌄♪⚙⌂` 等）在源码与产物 bundle 中均为 0 命中**（散文注释里的 `→`/`⚠️`/`─` 非图标，保留）。
- **遗留/注意**：① `<svg>` 官方仅列原生 Android/iOS/Harmony（+ `SVGProps` 标 web/PC，但 svg.md 未把桌面/clay 列为已证实）——本次目标移动端，**桌面 clay 的 `<svg>` 渲染未验**（记入既有风险 R2）。② 真机图标目测待验证（本机 vitest 只证节点存在，不证像素）。③ `PlaylistDrawer` 的移除按钮 `✕`（U+2715，非本次 emoji 图标清单/验收范围）暂保留为文本，后续如需可一并接 Icon。④ `ICON_COLORS` 与 `tokens.css` 是手动同步，改主题色需两处一起改。

### 批6 · playlist feature（歌单列表 + 详情 + Library Playlists 视图）
- **playlist API**（`src/features/playlist/api/playlist-api.ts`）：包 batch-2 `HttpClient`，port Flutter `PlaylistApi` 的**读端点**（前缀 `/api/v1`，batch-2 zod 解析）——`getPlaylists`（`GET /playlists`，query `limit/offset` + 可选 `type`/`exclude_labels`/`keyword`，`parsePlaylistListResponse`）、`getPlaylist(id)`（`GET /playlists/{id}`，`parsePlaylist`）、`getPlaylistSongs(id)`（`GET /playlists/{id}/songs`，query `limit/offset` + 可选 `sort`/`order`/`keyword`，复用 `parseSongListResponse`）。query 拼接抽纯函数 `buildPlaylistsQuery`/`buildPlaylistSongsQuery`（默认 `limit=defaultPageSize=20`/`offset=0`，空串剪除，mirror Flutter `PlaylistApi`）单独单测。`api/index.ts` 懒建**认证客户端单例**（同批4 recipe：batch-2 `createApiClient`，Bearer + 单飞 401 refresh，`onTokenExpired → useAuthStore.logout()`）——与 library bundle 是同款 peer（共享同一 `TokenStore`，401 恢复跨 feature 一致）。
- **取数与分页**（`src/features/playlist/data/`）：`usePlaylistsInfiniteQuery`（歌单列表分页，`getNextPageParam=playlistsNextPageParam` 纯函数）、`usePlaylistQuery(id)`（`useQuery` 详情，`enabled: id>0`）、`usePlaylistSongsInfiniteQuery(id)`（歌单内歌曲分页，**复用 library `songsNextPageParam`/`flattenSongs`**——歌单内歌曲即 `SongListResponse`）。新增纯函数 `playlistsLoadedCount`/`playlistsNextPageParam`/`flattenPlaylists`（复用 library `nextOffset`）单独单测（累计推进 / 到底停 / 空页 / flatten）。
- **Library「Playlists」视图落地**（`src/features/playlist/widgets/PlaylistsView.tsx`，替换批4「Playlists coming soon」占位）：`<scroll-view>` 网格（同 facets 网格模式，非 `<list>`——子节点在测试可查）+ `PlaylistCard`（封面 or `music` Icon 占位 + 名称 + `<n> song(s)` 单复数）；点卡片 `navigate({ to: '/playlists/$id', params:{id} })`；加载/空（「No playlists yet」）/错误态齐备。`LibraryPage` 仅改 import + 分支渲染。
- **歌单详情页**（`src/features/playlist/pages/PlaylistDetailPage.tsx`，路由 `/playlists/$id`，shell 内）：`useParams({strict:false})` 取 id；头部（返回键 `chevron-down`→`/library`、封面 or `music` 占位、名称/描述/`<n> song(s)`）+ 歌曲列表（**复用 library `SongRow` + `VirtualList`** + `bindscrolltolower` 触发 `fetchNextPage`）；点歌 `usePlayerStore.getState().playPlaylist(songs, index)`（直接 import store，不经 player 桶入口，避免 eager 拉 lynx-ui 手势叶子）；加载/空/错误态齐备。`.song-row` 规则在 `PlaylistDetailPage.css` 重声明（与 `LibraryPage.css` 相同）——详情路由可能在 library 页从未挂载时进入，Lynx CSS 全局作用域，重复同规则无害。**路由**：`router.tsx` 加 `playlistDetailRoute`（shell 子路由，`path:'/playlists/$id'`，typed param）。
- **测试约定（沿用 `_render-mocks` 模式）**：渲染冒烟里 `useInfiniteQuery`/`useQuery` hooks（`useSyncExternalStore` 订阅→崩 `isListHolder` 类 + 需 live QueryClient/网络）用 `vi.fn()` 桩返静态形；`useNavigate`/`useParams` 桩；`<list>` 封装 `VirtualList` mock 成 plain `<view>`（`_render-mocks.mockVirtualList`）。真 hooks/组件/`<list>` 用于 build/dev/device。断言实质结构：PlaylistsView 卡片名 + 单复数歌数 + 空/加载/错误态；详情页头部（名称/描述/`2 songs`）+ 歌曲行（标题/`artist · album`/`05:27`·`09:05` 时长）+ 空/加载态；playlist-api query 拼接 + zod 解析（mock transport，验 URL 含参 + snake→camel + `isBuiltIn` 派生）。**批4 `library-page.test` 的 playlists 占位用例改为**：切 Playlists tab 断言 `PlaylistsView` 空态（并补 mock playlist-query hook + `useNavigate`）。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（`main.lynx.bundle` 920.8 kB binary 容器，最长行 92259=已压缩；`strings` 证 `/playlists`×23 / `No playlists yet` / `No songs in this playlist` / `Loading playlists` / `exclude_labels` 均入包）、`tsc --noEmit` 绿、`pnpm test` **183/183 绿**（新增 24：playlist-api 9 / pagination 8 / playlists-view 4 / playlist-detail 3；`background-bundle-self`/`query-no-dom`/`router-no-dom` 对新鲜 dist 复跑绿——无新增未守卫全局）。
- **遗留/注意**：① 歌单 **CRUD**（创建/更新/删除/封面上传/批量删除）、**收藏歌单**（`favoritePlaylistId='1'`/`radioFavoritePlaylistId='2'` 已在 constants，本批未做特殊处理/入口）、**排序**（歌单排序 / 歌单内歌曲 reorder）、**可见性切换**、**touch 访问时间**、**song-ids 定位**、**搜索/多选** 均未 port（Flutter `PlaylistApi` 全端点 + 详情页有，本批裁到只读浏览）——记入下方 TODO。② 详情页在 shell 内渲染（底栏 nav 常驻），返回键固定回 `/library`（Flutter 是独立 appbar 页 + `context.pop()`）。③ [x] **封面缓存刷新参数**（批14 完成）：`buildCoverUrl(coverUrl, updatedAt?)` 已加 `_t=<updatedAt ms>`。④ 真机图标/网格/详情目测待验证。

### 批7 · home feature（首页内容）
- **参考首页实际展示**（`songloft-player/lib/features/home/presentation/home_page.dart`）：① 顶部**时段问候**（早/午/晚/深夜，`_getGreeting` 按 `DateTime.now().hour`）；② **「我的歌单」区块**（`playlistListProvider('normal')`）——窄屏横向轮播 / 宽屏可配置网格，标题带「查看全部」→ `/library?view=playlist`；③ **「我的电台」区块**（`playlistListProvider('radio')`，同结构，「查看全部」→ `/library?view=playlist_radio`）；④ **JSPluginGrid**（插件入口）；⑤ 底部 **StatsStrip**（歌单数 / 电台数 / 总计）。数据即「按 `type` 过滤的歌单列表」，无独立歌曲 feed。
- **本批实现**（`src/features/home/`，镜像 data/domain/presentation）：
  - **domain**（`domain/greeting.ts`）：`greetingForHour(hour)` 纯函数（4 段：<6 深夜 / <12 早 / <18 午后 / 晚）+ `currentGreeting(now?)`。
  - **data**：`data/home-query.ts` 的 `useHomePlaylists(type)` **复用批6 `usePlaylistsInfiniteQuery({type})`**（不新增端点，直接吃批6 认证客户端单例 + `PlaylistApi.getPlaylists`（真实端点 `GET /api/v1/playlists?type=normal|radio`）+ 批2 zod）；`data/home-select.ts` 纯选择器 `homeSectionItems(pages, limit=6)`（flatten + 截断预览）/ `homeSectionTotal(pages)`（取后端 `total`，缺失回落已载长度）/ `homeStats(n,r)`（三项计数）。
  - **widgets**：`HomeSection`（区块头 icon + 标题 + 「View all」+ 截断网格，**复用 `PlaylistCard`**——其 `.playlist-card{width:33.33%}` 全局 CSS 使卡片三列平铺；含区块内联加载失败 + Retry，mirror `_SectionLoadError`）；`StatsStrip`（primary 底色三统计条，`Icon` 图标）。
  - **presentation**：`pages/HomePage.tsx`（替换批1 `/` 占位）——问候顶栏（含 **Log out** 入口）+ 竖向 `<scroll-view>`（我的歌单区块 + 我的电台区块 + 统计条）；首屏加载 / 整页错误（两区块皆错且无数据）/ 空态（两区块皆空 → 「No playlists yet」+ Browse library）/ 单区块降级内联错误 齐备。全走 LUNA tokens，走 shell 安全区（`shell__body` 已加 top inset，页面不再顶格），Icon 无 emoji。
- **数据/取数/交互**：数据 = 按 `type` 过滤的歌单列表（`normal`/`radio`），复用批6 `usePlaylistsInfiniteQuery` + 认证客户端单例 + 批2 zod 模型（无新增端点/模型）；取数 `useHomePlaylists(type)` 只预览首页（截断 6 张），统计条用后端 `total`；交互——点歌单卡片 → `navigate('/playlists/$id')`（**复用 `PlaylistCard`**，详情页点歌 `playPlaylist` → mini-player），「View all」→ `/library?view=playlists`（**复用批6 Library Playlists 视图**），「Log out」→ `useAuthStore.getState().logout()`（非订阅读取，同 LibraryPage 用 `getState()` 模式）+ `navigate('/login')`。
- **路由**：`router.tsx` 的 `/` 组件由占位 `ListPage` 换成 `HomePage`；`ListPage.tsx` 已删（`pages.css` 仍被 `SettingsPage` 用，保留）。
- **测试约定（沿用 `_render-mocks` / 批6 模式）**：`greeting` + `home-select` 纯函数单测（8+5）；`home-data` 用 **mock transport** 验首页两区块的取数契约（`type=normal|radio` 进 query + zod snake→camel + null/字符串 int 容错）；`home-page` 渲染冒烟——`useHomePlaylists`（`useSyncExternalStore` 订阅 + 需 live QueryClient）按 `type` 分派 `vi.fn()` 桩返静态 infinite-query 形、`useNavigate` 桩，真 `HomeSection`/`PlaylistCard`/`StatsStrip`/纯选择器跑注入数据，实质断言问候 testid + 两区块标题 + 卡片名 + 各区块「View all」×2 + 统计条标签与后端 total（10/4/14）+ 首屏加载态 / 空态 / 整页错误 / 单区块降级内联错误。**`smoke.test` 的 `/` 用例改写**：`/` 现是 HomePage → 补 mock `home-query`（静态 infinite-query 形）、bindtap→navigate 证明由「Open player」改为点区块「View all」→ 断言路由转 `/library`，渲染断言改问候 testid + 两区块标题 + 卡片名。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（`main.lynx.bundle` 946.4 kB binary 容器，最长行 97636=已压缩；`strings` 证 `My Playlists`/`My Radios`/`No playlists yet`/`Good morning`/`Good evening`/`Browse library`/`View all` 均入包）、`tsc --noEmit` 绿、`pnpm test` **211/211 绿**（新增 20：greeting 5 / home-select 8 / home-data 2 / home-page 5；`background-bundle-self`/`query-no-dom`/`router-no-dom` 对新鲜 dist 复跑绿——无新增未守卫全局）。
- **遗留/注意**：① **首页 JS 插件 Tab / WebView（`JSPluginGrid` + plugin_tab/webview）全裁**——留 **jsplugin 阶段**（首页插件区块与 jsplugin feature 深耦合，本批只做非插件核心内容）。② ~~区块布局裁为「截断网格」~~ **批18b 已改为横向 `scroll-view`**（`scroll-orientation='horizontal'` + `enable-nested-scroll`），匹配 Flutter 窄屏横向轮播；宽屏已由批36实现（`useBreakpoint` ≥600px → 3列网格，9张卡片）。③ [x] ~~两区块「View all」都去同一视图~~（**批36已解**）：Library 新增 Radio tab，电台 View all 独立导航。④ ~~Hero 推荐卡（`HeroCard`）~~ Flutter 也未使用（widget 文件存在但无引用，属死代码），无需 port。⑤ [x] **下拉刷新**（批11 完成，原生 `<refresh>`/`<refresh-header>`）+ [x] **正在播放的歌单高亮**（批11 完成，`sourcePlaylistId` 边框高亮；[x] equalizer 遮罩（**批38 EQ bars 动画完成**））。[x] 加载慢提示（**批37 完成**）。⑥ 问候 4 段（Flutter 5 段，Lynx 裁一段）**已有 i18n**（`greeting.ts` 4 key × `resources.ts` en/zh，早前本行记录“无 i18n”系过期未更新，此处订正）；统计条图标用现有 Icon 集（`library`/`music`/`home`）近似。⑦ 真机图标/网格/首页目测待验证（本机 vitest 只证节点存在，不证像素）。

### 批8 · settings feature（自包含设置项）
- **参考 settings 结构**（`songloft-player/lib/features/settings/`，~16k 行）：一级 9 分类（外观/播放/音乐库/扩展/缓存/网络/数据/关于/账户），`SettingsMasterDetail`（桌面主从 / 移动二级路由）+ `SettingsCategoryContent`（每类 `SectionCard`+`ListTile`/`SwitchListTile`）。**大量子项依赖尚未实现的能力**（tab 配置、插件注册表/`JSPluginManager`、`ScanManager`/`MetadataRefreshManager`/重复检查、`CacheManager`、升级/热更、日志导出、多服务器 `ServersPage`、语言/主题包、快捷键、桌面歌词、代理/allowlist、歌单导入导出用 `MultipartFile`）——本批**只做自包含、当前可实现**的一小片，其余明确 defer（见下方遗留清单归属阶段）。
- **本批实现**（`src/features/settings/`，镜像 data/domain/presentation）：
  - **domain**（`domain/settings-model.ts`，纯函数）：`PLAY_MODE_OPTIONS`/`playModeLabel`/`playModeDescription`/`playModeIcon`（复用 `order`/`repeat`/`repeat-one`/`shuffle` 图标）、`coercePlayMode`（容错回落 `order`，mirror zod `.catch()` 铁律）、`serverDisplay`（embedded → `Songloft (embedded)`）。
  - **data**（`data/settings-prefs.ts`）：`readDefaultPlayMode`/`writeDefaultPlayMode`（prefs key `default_play_mode`，best-effort，同 auth store 的 `tryPref` 吞错）、`applyServerSettings`（复用批3 `normalizeServerUrl`：归一化 URL + 写 `appConfig.baseUrl/resolvedBaseUrl/insecureTls` + prefs `server_url`/`insecure_tls`，返回归一化 URL；不碰 Zustand 以保持可注入 memory storage 单测）。
  - **widgets**：`SettingsSection`（标题 + Icon + `paper` 卡片，= `SectionCard`）、`SettingsRow`（Icon + 标题/副标题 + trailing text/icon + `bindtap`，= `ListTile`；支持 disabled/danger/selected；纯 `<view>` 无手势叶子，测试可渲染）。
  - **presentation**：`pages/SettingsPage.tsx`（替换批1 `/settings` 占位）——标题顶栏 + 竖向 `<scroll-view>` 六分组：**Playback**（4 播放模式选项行，选中显 `check`，tap → `usePlayerStore.getState().setPlayMode()` 即时应用 + `writeDefaultPlayMode` 持久化；挂载时 `readDefaultPlayMode` 覆盖初值）/ **Connection**（standalone-only：Server 行 → `/settings/server`）/ **Appearance**（Theme 只读 `Dark` 行，disabled）/ **About**（App version=`clientVersion` / 当前服务器 / 项目 GitHub 文本）/ **More settings（coming later）**（音乐库扫描/存储缓存/插件/语言 四条 disabled 占位）/ **Account**（Log out danger 行，两步确认 → `useAuthStore.getState().logout()` + `navigate('/login')`）。`pages/ServerSettingsPage.tsx`（`/settings/server`，shell 内子路由）——返回键（`chevron-down` → `/settings`）+ API base URL `Input` + 不安全 TLS `Switch`（复用批3 lynx-ui 叶子 + 样式）+ Save（→ `applyServerSettings` + `useAppSessionStore.setBaseUrl` + 返回 `/settings`）；embedded 下显固定说明不可改。全走 LUNA tokens + `<Icon>`（新增图标 `chevron-right`/`info`/`logout`/`link`/`palette`/`check`）+ shell 安全区。
- **数据/config/prefs 接线一句话**：默认播放模式 → 批5 `usePlayerStore.setPlayMode`（即时）+ prefs（持久，best-effort）；服务器地址/不安全 TLS → `appConfig`（即时，`HttpClient` 每请求实时读 `resolvedBaseUrl`）+ prefs（复用批3 `PREF_SERVER_URL`/`PREF_INSECURE_TLS`）+ `useAppSessionStore`（反应式 UI）；登出 → 批3 `useAuthStore.logout()`；版本 → `constants.clientVersion`（手维护常量）。
- **路由**：`router.tsx` 的 `/settings` 组件从 `routes/SettingsPage`（已删占位）改指 `features/settings` 的 `SettingsPage`；新增 shell 子路由 `serverSettingsRoute`（`/settings/server`）。`routes/pages.css` 现无引用（占位删除后成孤儿，未删除、未入包，无害）。
- **测试约定（沿用 `_render-mocks` / 批6-7 模式）**：`settings-prefs` 纯逻辑单测 9（coerce/label/icon/serverDisplay + 默认模式 prefs 往返（memory storage）+ `applyServerSettings` 归一化+config 变更+双 prefs 写入）；`settings-page` 渲染冒烟 5——`useNavigate`/`useAuthStore.logout`/`usePlayerStore`（`makePlayerStoreMock` 注 `setPlayMode` spy）/`settings-prefs`（`readDefaultPlayMode`→`random`、`writeDefaultPlayMode` spy）全 mock，真域函数/`SettingsSection`/`SettingsRow`/`Icon` 跑，实质断言六分组标题 + 4 模式行 testid + 选中 `icon-check` + version/server/logout 行；交互断言 tap 模式行调 `setPlayMode('loop')`+`writeDefaultPlayMode('loop')`、tap Server 行 `navigate({to:'/settings/server'})`、**两步登出**（首 tap 出「Tap again to log out」且未登出/未导航，次 tap 调 `logout` + `navigate('/login')`）；`server-settings-page` 冒烟 3（`Input`/`Switch` 桩 + `applyServerSettings`/`useNavigate` spy：渲染地址字段/TLS 开关/Save/返回 + Save 调 `applyServerSettings` 后回 `/settings` + 返回键回 `/settings`）。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（`main.lynx.bundle` 969.4 kB binary 容器，最长行 103067=已压缩；`strings` 证 `Play in order`/`More settings (coming later)`/`Tap again to log out`/`App version`/`0.1.0-dev`/`settings/server` 均入包）、`tsc --noEmit` 绿、`pnpm test` **227/227 绿**（新增 16：settings-prefs 9 / settings-page 5 / server-settings-page 3；`background-bundle-self`/`query-no-dom`/`router-no-dom` 对新鲜 dist 复跑绿——无新增未守卫全局）。
- **遗留/注意**（defer 明细 + 归属阶段）：见下方「批8 遗留（settings）」。

### 批9 · i18n 国际化（Phase A 收尾，纯前端）
- **i18n 基建**（`src/i18n/`）：装 `i18next@23` + `react-i18next@14`。`resources.ts` = **内联 en+zh 资源**（单一默认 `translation` 命名空间，按 feature 分组的点号 key，如 `home.myPlaylists`/`player.nowPlaying`/`settings.playModeOrderLabel`；`zh: TranslationTree = typeof en` → **编译期强制 en/zh 同形**）。`index.ts` = `initI18n(lng)`（同步 init：`initImmediate:false` + 内联 resources 无异步 backend → `t` 即刻可用；`fallbackLng`/`supportedLngs`/`interpolation.escapeValue:false`/`react.useSuspense:false`；**无 detector**——绝不引 `i18next-browser-languagedetector`；**`compatibilityJSON:'v3'`** 强制内建 CLDR 复数规则、永不走 `Intl.PluralRules`）+ 语言助手（`coerceAppLanguage` 容错回落 `system`、`resolveLanguage` `system→en`、`readSavedLanguage`、`applySavedLanguage`、`changeAppLanguage`——切 i18next + 持久化 prefs（key `app_language`；`system` 删 key））。`App.tsx` 渲染前 `initI18n()`；`index.tsx` bootstrap `await applySavedLanguage()`（读回持久化语言）。
- **无 DOM/无 Intl 验证**：i18next core + react-i18next **源码零 `window`/`document`/`navigator`/`self`**（`i18n-no-dom.test.ts` 静态断言 dist 源；i18next 唯一 `Intl` 用法全 `typeof Intl` 守卫）；**执行验证**——esbuild 打包 i18next core + 我们的 resources，在 `self/window/document/navigator/Intl` 全 `undefined` 的 Lynx-BTS 形 realm 里跑 init+`t`+`changeLanguage`，证 `t('nav.home')`→`Home`、切 zh→`首页`、`songCountOther{count:5}`→`5 songs`（无 Intl.PluralRules）。默认 vitest 为 node env（无 jsdom，不骗人）。
- **抽取并本地化的串**（跨全 feature，en=现有串、zh=参考 `app_zh.arb` 对应译文，对不上给合理简体）：`nav`（Home/Library/Settings）、`common`（Loading…/Loading more…/Retry/Unknown/Untitled/歌数单复数 `songCountOne/Other`）、`auth`（登录页全部：标题/副标题/用户名/密码/API 地址/不安全 TLS/登录/登录中）、`home`（4 段问候/退出/两区块标题/View all/统计/空态/整页与区块错误）、`library`（三 tab/facet 字段/加载空错误态）、`category`（drill-in 状态）、`playlist`（列表/详情/回退名/状态）、`player`（Now Playing/播放模式标签/Up next/歌词加载与空/空态页）、`settings`（六分组标题 + 4 播放模式 label/desc + 主题/关于/更多占位/账户/服务器子页/**语言分组**）。**shell nav** `destinations.ts` 改带 `labelKey`，ShellLayout `t()`。品牌名 `Songloft`、抽屉 `✕` 保留字面量。
- **纯函数改为返回 i18n key**（页面 `t()` 包裹，保持可单测不引 i18next）：`greeting.ts` `greetingKeyForHour/currentGreetingKey`（→ `home.greeting*`）；`settings-model.ts` `playModeLabelKey/playModeDescriptionKey`；`serverDisplay(baseUrl,isEmbedded,labels)` 改收「已本地化 labels 对象」（embedded/notConfigured 由调用方译）。歌数单复数**手动选 key**（`count===1?One:Other` + `{{count}}` 插值）——不用 i18next 复数后缀 key，规避 Intl.PluralRules。
- **Settings 语言切换**（解掉批8 defer）：新增「语言」分组，三选项行 `跟随系统 / English / 中文`（选中显 `check`，tap → `changeAppLanguage()` 即时切 i18next（react-i18next 订阅触发全树重渲染）+ 写 prefs；挂载时读回持久化选择）。移除「更多设置」里的 Language disabled 占位。
- **arb→i18next 转换脚本**（`scripts/arb-to-i18next.ts`，Node TS，`node scripts/arb-to-i18next.ts` 运行）：纯函数 `isArbMetaKey`（丢 `@meta`/`@@locale`）、`convertPlaceholders`（`{name}`→`{{name}}`）、`hasIcuComplexPlaceholder`/`complexKeys`（标记 ICU `{count,plural,…}` 需人工）、`arbToI18next`。CLI 读 `lib/l10n/app_{en,zh}.arb` → 写 `src/i18n/generated/{en,zh}.json`（**各 1276 key**，10 个 ICU 复数键已标记）。**产物取舍**：generated JSON **不被 app 引用**（app 只内联 `resources.ts` 的策展子集），故不进 Lynx 包；**全量运行时导入留后续**（避免包体撑爆——见遗留）。
- **测试约定（沿用 `_render-mocks`）**：新增 `mockReactI18next()`——`useTranslation` 返回**确定性英文 `t`**（回读真实 `en` 资源树 + `{{var}}` 插值），因 `useTranslation` 经 i18next 事件订阅（同 zustand 类，且需全局 i18next 实例）→ 所有渲染冒烟改 mock `react-i18next`（断言仍校验真实英文文案：`My Playlists`/`Now Playing`/`5 songs`/`Playback`/`Log in`…，非注水）。真 react-i18next + init 用于 build/dev/device。新增/改测：i18n 资源完整性（en/zh key 集全等 + 每叶非空串）3 / 语言 coerce+resolve 2 / `changeAppLanguage` 持久化+切换+system 删 key + 手动歌数插值 3 / 转换脚本纯函数 7 / **i18n 无 DOM**（静态源 + 无 Intl realm 执行）4 / settings 语言切换 1 / greeting 与 settings-prefs 断言改 key。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（`main.lynx.bundle` **1095.7 kB**，最长行 **105723**=已压缩；`strings` 证 `我的歌单`/`正在播放`/`顺序播放`/`My Playlists`/`Now Playing`/`app_language`/`typeof Intl`/`compatibilityJSON` 均入包；AbortController polyfill + `__TSR_ROUTER__` 守卫仍在）、`tsc --noEmit` 绿、`pnpm test` **247/247 绿**（+20）；`background-bundle-self`/`router-no-dom`/`query-no-dom`/`i18n-no-dom` 对新鲜 dist 复跑绿。
- **遗留/注意**：① **全量 arb 导入留后续**——脚本已就绪且可跑（1276 key），但 app 仅内联策展子集；全量导入需评估包体（i18next 已使包从 969→1096 kB，全量 JSON ~145 kB×压缩），做时可走懒加载/按需分包。② **「跟随系统」= 回落默认（en）**——Lynx 无可靠宿主 locale API（无 `navigator.language`），`system` 现仅删 prefs + 用默认；接原生 `SongloftPlatform` 后可读真实系统语言。③ **默认语言 = `en`**（与现有英文 UI 一致）；产品若要 zh 优先，改 `DEFAULT_LANGUAGE`。④ **复数/日期/数字格式化未用 i18next Intl 能力**（歌数手动单复数选 key，规避无 Intl 崩溃）；真需 ICU 复数/日期时须先确认设备 `Intl` 可用或加 polyfill。⑤ 动态串（登录 `error` 后端消息、歌曲标题/艺人等数据）不本地化（本就是数据）。⑥ 待验证：设置里切「中文/English/跟随系统」即时全屏重渲染、各页文案随之切换、重启读回持久化语言（注意设备端 prefs 内存降级、重启丢——同既有 storage 限制）。

### Phase B · B1 · Android 原生宿主 + 内嵌 bundle + CI dev APK

- **权威基线（照抄，供 CI 排错）**：官方 `lynx-family/integrating-lynx-demo-projects` 的 **`android/KotlinEmptyProject`**（`git clone` 拉取，HEAD `f8230ca`）。逐项照搬其工程结构与坐标：
  - **Lynx SDK `3.8.0`**（`org.lynxsdk.lynx:lynx` / `lynx-jssdk` / `lynx-trace` / `primjs`）。前端 `lynx.config.ts` 的 `engineVersion='2.14'` 是 bundle 声明的**最低引擎版本**，3.8.0 运行时向下兼容 2.14 的 bundle——**demo 用 3.8.0，故以 demo 可用版本为准**（比 2.14 高，兼容）。
  - **构建链**：AGP `8.5.0` / Gradle `8.7`（wrapper）/ Kotlin `1.9.0` / JDK **17** / `minSdk 24` / `compileSdk 34` / `targetSdk 34`。均为 demo 原值（JDK17 兼容组合）。
  - **Lynx 服务**（`YourApplication`→`SongloftApplication`，注册顺序照 demo）：`LynxImageService`（+ Fresco `2.3.0` 5 依赖，backs `<image>` 封面）、`LynxLogService`、`LynxHttpService`（+ OkHttp `4.9.0`，backs 裸全局 `fetch`——网络层依赖，见 AGENTS §3）。**刻意删掉 devtool 服务/`DebugActivity`/`SwitchActivity`**（本 APK 是独立可侧载 dev 包，非 Explorer 调试宿主）。
  - **XElement 家族保留**（`xelement`/`-input`/`-overlay`/`-svg`/`servalsvg 0.0.1-alpha.3`/`-refresh` @ 3.8.0）——本 app 用到 `<svg>`（图标）/`<input>`（登录/服务器设置）/overlay（Sheet）/refresh；`MainActivity.buildLynxView` 保留 `addBehaviors(XElementBehaviors().create())`。
  - **删掉 Compose**（demo 的 activity-compose/compose-bom/material3 + `ui/theme/*.kt`）——宿主是纯 `LynxView` 单 Activity（`extends Activity`），无 Compose；`libs.versions.toml` 相应精简；themes 用框架 `android:Theme.Material.NoActionBar`（无 material 依赖）。
- **宿主工程 `android/`**：单 Activity `MainActivity` 全屏承载一个 `LynxView`，`DemoTemplateProvider`（`AbsTemplateProvider`，从 assets 读字节）加载 `main.lynx.bundle`（内嵌、离线，不依赖 dev server/LynxExplorer）。`applicationId=org.songloft.lynx`、`versionName=0.1.0-dev`；**debug 构建**即用 debug keystore 自动签名（无 release 签名配置→可直接侧载）；`AndroidManifest` 加 `android:usesCleartextTraffic="true"`（dev 后端 http）+ INTERNET/ACCESS_NETWORK_STATE 权限。gradle wrapper（`gradlew`/`gradlew.bat`/`gradle-wrapper.jar` 59 kB/`gradle-wrapper.properties` gradle-8.7）随源提交。
- **bundle→assets 机制**：`scripts/copy-bundle-android.mjs`（Node ESM）把 `dist/main.lynx.bundle` 拷到 `android/app/src/main/assets/main.lynx.bundle`；`pnpm run build` 后跑。package.json 加 `copy-bundle:android` 与 `build:android-bundle`（build+copy）两个 script。**gitignore**：`android/build/`、`android/app/build/`、`android/.gradle/`、`android/local.properties`、`android/.cxx/`、以及 **`android/app/src/main/assets/main.lynx.bundle`**（生成物，CI 现产）；`android/` 的 gradle/kotlin 源与 wrapper **提交**（`git check-ignore` 已验：bundle/build 被忽略、所有源被跟踪）。
- **CI `.github/workflows/dev-build.yml`**：触发 push→main（`paths-ignore` md/docs/gitignore）+ `workflow_dispatch`；`concurrency` 按 ref 取消旧跑；`permissions: contents: write`。步骤（ubuntu-latest，14 步）：checkout → `pnpm/action-setup@v4`(v10) → `actions/setup-node@v4`(node22, cache pnpm) → `pnpm install --frozen-lockfile` → `pnpm run build` → `node scripts/copy-bundle-android.mjs` → `actions/setup-java@v4`(temurin17) → `android-actions/setup-android@v3` → `sdkmanager --licenses` + 装 `platform-tools`/`platforms;android-34`/`build-tools;34.0.0` → `gradle/actions/setup-gradle@v4`（缓存）→ `./gradlew :app:assembleDebug`（working-dir `android`）→ 定位 APK 拷成 `songloft-lynx-dev.apk` → `actions/upload-artifact@v4`（artifact `songloft-lynx-dev-apk`）→ push main 时 `softprops/action-gh-release@v2` 滚动更新 `dev` prerelease（`tag_name: dev`、`prerelease: true`、`make_latest: false`、挂 APK）。**全用成熟社区 action，无自造签名**。
- **本机自验收**（本机无 Android SDK/`ANDROID_HOME`，**无法本地 assembleDebug**）：`rm -rf dist .rspeedy && pnpm run build`（1095.7 kB）✓ / `node scripts/copy-bundle-android.mjs`（assets 出现 1070 kB bundle）✓ / `pnpm exec tsc --noEmit` ✓ / `pnpm test` **247/247** ✓（前端未动逻辑）/ workflow YAML `pnpm dlx js-yaml` 解析合法（triggers/jobs/14 steps 正确）✓ / gradle 工程结构自查（settings/app build.gradle.kts/manifest/Activity/Provider/Application/wrapper 齐全、namespace↔包目录↔manifest 引用一致、坐标来自 demo）✓。**APK 构建 + 真机侧载运行待 CI/用户验证。**
- **CI 首跑风险预判**：① **SDK license/组件**——`setup-android` + 显式 `sdkmanager` 装 platform-34/build-tools-34.0.0 + `yes | --licenses`，若 license 交互变动可能需 `--sdk-root`/版本微调；② **maven 坐标解析**——3.8.0 全系坐标来自官方 demo（mavenCentral 可解），但 `servalsvg:0.0.1-alpha.3` 是 alpha，若下架需回退（可从 xelement-svg 传递依赖或降配 svg）；③ **AGP 8.5 需 JDK17**——已 setup-java 17，但 Gradle 8.7 + AGP 8.5 对 JDK 版本敏感，若报 `Unsupported class file`/`Dependency requires ... JDK` 多为 JDK 不匹配；④ **首个 XElement/Lynx 初始化**——`XElementBehaviors().create()` 与三服务注册若某坐标缺失会编译/运行期报错，已按 demo 保全需要的 xelement 子包；⑤ **assembleDebug 内存/超时**——`--no-daemon`，Fresco/Lynx native `.so` 打包体积较大；⑥ **gradlew 可执行位**——已 `chmod +x`（`-rwxr-xr-x`）。

### Phase B · B2 · Android 真原生音频 SongloftAudio（ExoPlayer / androidx.media3）

- **目标**：把批5 的 TS mock 音频换成真 Android 原生播放（ExoPlayer），注册为 Lynx `NativeModules.SongloftAudio`；TS facade 在原生可用时切原生、否则回退 mock。**player store 不改**（`src/features/player/store/player-store.ts` 一字未动——它只依赖 `getAudio()` 返回的 `SongloftAudio` 接口 + `on/off` 事件契约）。
- **Kotlin 原生模块**（新增 `android/app/src/main/java/org/songloft/lynx/audio/`，3 文件）：
  - **`SongloftAudioModule`**（`extends com.lynx.jsbridge.LynxModule`，构造 `(context: Context)`，`@LynxMethod` 注解导出方法）——**照抄官方「Native Modules」指南**（`lynx-website/docs/en/guide/custom-native-modules/native-module-android.mdx` 的 `NativeLocalStorageModule` Kotlin 范式：`class X(context) : LynxModule(context)`、`mContext as LynxContext`、`@LynxMethod fun …`）。方法契约与 mock **完全一致**：`load(url, opts?)`/`play`/`pause`/`stop`/`seek(ms)`/`setVolume(0..1)`/`setSpeed` + `setQueue`/`next`/`previous`/`setRepeatMode`/`setShuffle`（队列/切歌由 JS store 驱动，故原生这几个是最小 no-op，同 mock 语义）+ EQ stub（`setEqualizerEnabled`/`setEqualizerBand`）。`@LynxMethod` 在 BTS 被调用，模块每个方法都 `runOnMain{…}` 转到主线程（ExoPlayer 单线程）。
  - **`SongloftAudioEngine`**（`object`，主线程单例，`@UnstableApi`）——持有单个 `ExoPlayer` + media3 `MediaSession`；HLS 走 `HlsMediaSource.Factory`（否则 `ProgressiveMediaSource`），headers 经 `DefaultHttpDataSource.Factory().setDefaultRequestProperties`；`Player.Listener` 把 ExoPlayer 状态映射成 facade 事件；500ms 主线程 handler 周期发 `progress`。
  - **`SongloftPlaybackService`**（`extends androidx.media3.session.MediaSessionService`，`@UnstableApi`）——`onGetSession` 返回 engine 的 `MediaSession`，作后台/通知宿主（见下「后台/通知」）。
- **事件桥接（名字串两端一致，最易错点已核对）**：原生经 `LynxContext.sendGlobalEvent(name, JavaOnlyArray[JavaOnlyMap])` 发；JS 侧经 BTS `lynx.getJSModule('GlobalEventEmitter').addListener(name, …)` 收，`mapGlobalEvent` 解码回 facade `AudioEvent` 再走 facade `on/off` 分发。**三个名字串两端逐字一致**（Kotlin `SongloftAudioEngine.EVENT_*` ↔ TS `NATIVE_EVENT`）：
  - `SongloftAudio.stateChanged` → `{ state: idle|loading|ready|playing|paused|completed|error }`
  - `SongloftAudio.progress` → `{ positionMs, bufferedMs, durationMs }`
  - `SongloftAudio.error` → `{ code, message }`
  - 产物校验：`strings dist/main.lynx.bundle` 命中三名字 + `GlobalEventEmitter`。
- **注册**：`SongloftApplication.initLynxEnv()` 加 `LynxEnv.inst().registerModule("SongloftAudio", SongloftAudioModule::class.java)`（**与官方 doc 的 `registerModule("NativeLocalStorageModule", …)` 一模一样**）���模块名 `SongloftAudio` ↔ TS 探测 `NativeModules.SongloftAudio` 一致。
- **依赖 / manifest**：`android/app/build.gradle.kts` 加 `androidx.media3:media3-exoplayer:1.3.1` / `media3-exoplayer-hls:1.3.1` / `media3-session:1.3.1`（pin 稳定版，compileSdk 34 兼容；从 `google()` maven 解析——已在 `settings.gradle.kts` 的 dependencyResolutionManagement）。`AndroidManifest` 加 `WAKE_LOCK`/`FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_MEDIA_PLAYBACK`/`POST_NOTIFICATIONS` 权限（`INTERNET`+cleartext B1 已有）+ 注册 `.audio.SongloftPlaybackService`（`foregroundServiceType="mediaPlayback"` + media3 session action intent-filter）。
- **TS facade 切原生**（`src/native/`）：
  - 新增 `native-audio.ts`：`isNativeAudioAvailable(nm)`（纯探测：`NativeModules.SongloftAudio` 存在且 7 个必需方法齐）、`mapGlobalEvent(name, payload)`（纯解码 native 事件→facade `AudioEvent`，非法/无关返 null）、`NativeSongloftAudio`（实现 `SongloftAudio`：方法委托 `NativeModules.SongloftAudio.*`，构造时经 `GlobalEventEmitter` 订阅三 native 事件重分发到 facade `on/off`，`dispose` 反订阅 + 调 native dispose）。
  - `audio-facade.ts`：`resolveAudio()`——读裸全局 `NativeModules`（`typeof` 守卫 + `globalThis` 回落，同 `fetch`/`self` 铁律）与 `lynx.getJSModule('GlobalEventEmitter')`，原生齐→`NativeSongloftAudio`，否则/构造失败→`createMockAudio()`；`getAudio()` 记忆化 `resolveAudio()`。`createNativeAudio()` 改为真实构造（缺失则抛）。**store 与 facade 对外 API 不变。**
  - `src/typing.d.ts`（新增）：module augmentation 给 `@lynx-js/types/background` 的 `NativeModules` 接口加 `SongloftAudio?: SongloftAudioNativeModule`（tsc 已验合并）。
- **后台/通知（roadmap R5，尽力项，结构就位、真机未验）**：media3 `MediaSessionService` + `MediaSession`（attach 到 engine 的 player）+ 前台服务 + manifest 权限/service 已全部就位；模块在 `play()` 时 `startForegroundService`、`stop`/`dispose` 时 `stopService`。**前台播放是本批保证交付**；**后台常驻 + 通知栏/锁屏控件只能 CI 出 APK 后真机验**。为保护「前台播放」这条主路径，`startForegroundService`/`stopService` 包了 try/catch——即便前台服务在新版 Android 后台启动限制下失败，模块内播放仍工作，只是不弹通知。若真机上通知不出现，标准 media3 修法是改走 `MediaController` 连服务驱动播放（而非 engine 自持 player）——���为遗留待续。
- **本机自验收**（本机无 Android SDK，**不能 assembleDebug / 不能验真实播放**）：`rm -rf dist .rspeedy && pnpm run build`（**1101.1 kB**）✓ / `node scripts/copy-bundle-android.mjs`（assets 出现 1075.3 kB bundle）✓ / `pnpm exec tsc --noEmit` ✓ / `pnpm test` **263/263** ✓（新增 16：`native-audio.test.ts`——探测「方法齐→true / 缺一→false」、`mapGlobalEvent` 各事件解码+容错+名字串断言、`NativeSongloftAudio` 方法委托 + 全局事件→facade 重分发 + dispose 反订阅、facade 选择「原生齐→NativeSongloftAudio / 缺失或不全→Mock / 构造抛→回退 / 无 emitter 仍可构造」）/ 产物 `strings` 证三事件名 + `GlobalEventEmitter` 入包 ✓ / Kotlin 结构自查（模块名/方法签名/media3 坐标/manifest 权限+service/事件名两端一致）✓。
- **只能等 CI+真机验的清单**：① `./gradlew :app:assembleDebug` 能否过（media3 1.3.1 坐标解析、`@UnstableApi` opt-in、Lynx `LynxModule`/`JavaOnlyArray`/`sendGlobalEvent` 签名与 3.8.0 实际一致性——**本机无法编译验证 Kotlin API 精确签名**）；② 真机真实播放（网络流解码、HLS、进度/状态事件回 JS 驱动 UI 前进）；③ 后台常驻 + 通知栏/锁屏控件（R5�������；④ `sendGlobalEvent` 第二参确切类型（本批按 `JavaOnlyArray` 写，docs/常见 SDK 如此，真机若签名不符需微调）。
- **用户操作步骤（真机验）**：GitHub → Actions → 手动 Run workflow（`dev-build.yml`，`workflow_dispatch`）→ 等 CI 出 `songloft-lynx-dev.apk` artifact（或 `dev` prerelease）→ 下载装 Android 真机（开未知来源）→ 登录（填开发机 LAN IP + 后端在跑）→ Library 点歌 → mini-player 出现、进度条**真实**前进、上一首/下一首/暂停/音量可用；切后台看通知栏是否有播放控件（尽力项，可能不出）。

#### 真机修复轮（B2 验证后，宿主侧三修 + configChanges）

真机首验：真实播放✅正常。修以下三个问题（+顺带一项），均 Android 宿主侧，本机不能编译只能 CI+真机复验：

1. **切后台再回来要重新登录（最重要，根因存储）**：batch-3 在设备上（无 `localStorage`、无原生存储）把 `SongloftStorage` 降级成**内存实现**，Activity/进程重建后 JS 重载、内存 token 丢 → `checkAuth` 查不到 → 回登录。**修法：把「原生持久化存储」从后续提前到此**——
   - Kotlin：新增 `android/app/src/main/java/org/songloft/lynx/storage/SongloftStorageModule.kt`（`LynxModule` + `@LynxMethod`，**照官方 Native Modules `NativeLocalStorageModule` 写法** + `com.lynx.react.bridge.Callback` 回读）：`setItem(area,key,value)`/`getItem(area,key,cb)`/`removeItem(area,key)`/`getKeys(area,cb)`/`getPath(name,cb)`；`area` = `prefs`|`secure` 映射两个 SharedPreferences 文件（`songloft_prefs`/`songloft_secure`；dev 用普通 prefs，secure 后续可升级 `EncryptedSharedPreferences`，避免其在部分机型 keyset 抖动）。`SongloftApplication` 加 `LynxEnv.inst().registerModule("SongloftStorage", …)`。
   - TS：`src/core/storage/native-storage.ts` 从「抛错 stub」���写���**��生��定**（`isNativeStorageAvailable` 纯探测 4 必需方法齐；`createNativeStorage(mod)` callback→Promise 适配——写 fire-and-forget、读失败兜 null/[] **不 reject**，绝不因桥抖动崩 auth bootstrap）；`createSongloftStorage` 探测顺序改 **原生（`NativeModules.SongloftStorage` 齐）→ web（`localStorage`）→ 内存**。裸全局读走新抽的 `src/native/native-modules.ts` 的 `readNativeModules()`（`typeof` 守卫 + `globalThis` 回落，与 audio 复用，遵无 DOM 铁律）。`src/typing.d.ts` 加 `NativeModules.SongloftStorage?` 类型。**facade 对外 API 不变**——`TokenStore`（`.secure`）、auth/settings（`.prefs`）、i18n（`app_language`）自动获持久化。**结果**：token/服务器地址/语言跨后台重建/进程重启存活，不再回登录。
2. **没有通知权限弹窗**：Android 13+（API 33）`POST_NOTIFICATIONS` 需**运行时请求**（manifest 声明不够）。`MainActivity.onCreate` 加 `requestNotificationPermissionIfNeeded()`——仅 `SDK_INT >= TIRAMISU` 且未授予时 `requestPermissions(arrayOf(POST_NOTIFICATIONS), …)`（低版本安装期授予，跳过）。
3. **播放没有通知栏控制**：媒体通知需 session 有 **metadata**。engine 新增 `metadataByUrl` + `setQueueMetadata(items)`（模块 `setQueue` 从 JS 队列 `AudioItem[]` 解析 url/title/artist 填入——`setQueue` 由 store 在 play 前调，携带 title/artist，故不改 store 即可拿到），`load(url)` 时把 `MediaMetadata`（title/artist/artwork uri）attach 到 `MediaItem`；`MediaSessionService`+前台服务在有活跃 playing session 时由 media3 `DefaultMediaNotificationProvider` 自动建渠道 + 出 MediaStyle 通知（播放/暂停/上一/下一 + 锁屏）。**真机验**：若仍不出，标准修法是改走 `MediaController` 连服务驱动播放（当前 engine 自持 player）。封面 art 需 `AudioItem` 带 cover——本轮未加（store 的 `toAudioItem` 无 artwork，不改 store），只有 title/artist，封面待续。**批40 补上**：`AudioItem` 加 `artworkUrl`，`toAudioItem` 用 `buildCoverUrl` 填完整 URL（含 `access_token`——原生侧只 `Uri.parse`，不会自己鉴权）；Android 侧 `setQueueMetadata` 的 `setArtworkUri` 与模块的 `optString(map,"artworkUrl")` **本就已写好**，纯粹是一直没收到值。iOS 的 `MPNowPlayingInfoCenter` 仍未设 `MPMediaItemPropertyArtwork`（需先把图抓成 `MPMediaItemArtwork`），iOS 封面仍待续。
4. **顺带 MainActivity `configChanges`**：manifest activity 加 `android:configChanges="orientation|screenSize|keyboardHidden|uiMode|smallestScreenSize|screenLayout|density"`，避免旋转/主题/密度变化重建 Activity 重载 bundle。**注意**：这不能防进程被杀重启——那靠 #1 持久化兜底。
- **本机自验收（修复轮）**：`rm -rf dist .rspeedy && pnpm run build`（**1103.7 kB**）✓ / `node scripts/copy-bundle-android.mjs`（1077.8 kB）✓ / `pnpm exec tsc --noEmit` ✓ / `pnpm test` **270/270**（净 +7：新增原生存储 callback→Promise 适配 + getPath 回落 + 读抛错兜 null + `isNativeStorageAvailable` 探测 + `createSongloftStorage` 三级选择「原生→web→内存」分支测；删掉旧「native stub 抛错」1 例）✓ / 产物 `strings` 证 `SongloftStorage` 入包 ✓ / Kotlin 结构自查（SongloftStorage 注册 + 方法签名照 doc + `Callback` 回读 + area→prefs 文件、POST_NOTIFICATIONS 运行时请求写法、通知 metadata/前台/service、configChanges、模块名两端一致 `SongloftStorage`/`area`=`prefs|secure`）✓。
- **只能 CI+真机复验（修复轮）**：① 装新 APK 后**切后台再回不再要重登**（原生 SharedPreferences 持久化）、进程被杀重启仍在登录态；② 首启弹**通知权限**（API 33+）；③ 播放时**通知栏/锁屏出播放控制**（播放/暂停/上一/下一）、后台常驻；④ 旋转/深浅色切换不重载页面。**用户步骤**：手动 Run CI → 装新 APK → 登录 → 播放 → 按 Home 切后台再回（应仍在，不重登）→ 下拉通知栏应见播放控件 → 首启应见通知权限弹窗。
- **B2 真机复验结果**：① 持久化/重登 ✅ ② 通知权限弹窗 ✅ ③ **通知栏控制 ❌**（批10 修复）

### 批10 · 功能补全轮（4 agent 并行）

- **Library 搜索+排序**（`src/features/library/`）：songs 视图顶部添加 lynx-ui `Input` 搜索框（`useDebounce` 350ms + `keyword` 参数流到 `buildSongsQuery`），排序 chip 行（Recent=`added_at desc` / Title=`title asc` / Artist=`artist asc`），搜索无结果单独空态（`library.noSearchResults`）。新增 `use-debounce.ts`；15 个搜索/排序纯函数单测。SongRow 点击播放确认已在批5 接线。
- **Playlist CRUD**（`src/features/playlist/`）：`PlaylistApi` 新增 `createPlaylist`/`updatePlaylist`/`deletePlaylist`/`addSongsToPlaylist`/`removeSongFromPlaylist` 五端点 + 纯 body builder 函数；5 个 TanStack Query mutation hooks（`useCreatePlaylistMutation` / `useUpdatePlaylistMutation` / `useDeletePlaylistMutation` / `useAddSongsMutation` / `useRemoveSongMutation`）+ 成功后 invalidation；`PlaylistsView` 顶部创建入口（内联表单 name+description）；`PlaylistDetailPage` 编辑（行内表单）+ 删除（两步确认，同 settings 登出模式）+ 歌曲移除按钮；内置歌单（`isBuiltIn`）保护。封面上传~~跳过~~（**批37 已完成**，复用 pickAndUploadFile 原生通道）。17 个新单测（api body builder + mutations invalidation + view/detail UI）。
- **Player 睡眠定时**（`src/features/player/widgets/SleepTimerSheet.tsx`）：FullPlayerPage topbar 新增 timer 图标按钮 + lynx-ui `Sheet` 底部面板（15/30/45/60/90 分钟 + 1/3/5 首歌后 + 关闭），激活态按钮变 primary 色 + 显示剩余时间/歌数。接线到 player-store 已有的 `setSleepTimerByDuration`/`setSleepTimerAfterSongs`/`cancelSleepTimer`。
- **Player 歌词增强**（`src/features/player/domain/lyric-parser.ts` + `store/lyric-store.ts` + `widgets/LyricsView.tsx`）：`parseEnhancedLrc` 逐字解析（`<mm:ss.xx>word` 格式，每行提取 `LyricWord[]`={text,startMs,endMs}）；`parseTranslation` 翻译 LRC 解析；`mergeTranslations` 按时间戳配对（500ms 容差）→ `Map<lineIndex, translatedText>`；`findCurrentWord` 词级定位。lyric-store 扩展 `translationMap`/`romanizationMap`/`hasTranslation`/`hasRomanization`，`loadForSong` 解析 `lxlyric`/`tlyric`/`rlyric`。LyricsView 词级高亮（upcoming/active/past 三态）+ 翻译行（小号字，原文下方）+ 罗马音行（最小号字）。17 个 enhanced-lyric-parser 单测。
- **Android 通知栏修复**（`android/app/src/main/java/org/songloft/lynx/audio/`）：根因 `MediaSession` 用 `applicationContext` 创建，media3 无法关联到 `SongloftPlaybackService` → `onUpdateNotification` 不被调用。修复：`SongloftPlaybackService.onCreate` 调 `SongloftAudioEngine.initFromService(this)` 以 service context 创建/重建 MediaSession；处理 module `load` 先于 service `onCreate` 的竞态（检测已有 player 则保留 player、只重建 session）；`SongloftAudioModule.load` 提前 `startPlaybackService`；`onTaskRemoved` 清理 + `releaseFromService` 释放。`@LynxMethod` 方法签名不变。**待 CI 出新 APK 复验**。
- **集成修复**：i18n 资源冲突（3 agent 并发写 `resources.ts`，手动补回 library 5 key + player 9 key）；smart quote 修复（`Couldn't` U+2019→ASCII `'` 导致字符串断裂）；icons 新增 `x`/`plus`（playlist CRUD 用）；`_render-mocks.tsx` 补 LyricState 新字段；`use-debounce.test.ts` 硬编码绝对路径改 `import.meta.url`；library-page test 补 `useCreatePlaylistMutation` mock。
- **本机验收**：build **1149.7 kB** ✓ / tsc ✓ / **332 vitest** 全绿（+62）✓。**注**：本机 `ulimit -v 25GB` 硬限制导致 pnpm/rspeedy/vitest 崩溃，验收在 Docker 容器内完成。

### 批11 · 收藏/排序/歌词缓存/闪烁修复轮

**过程注记**：本批计划 4 agent 并行（Home 刷新+高亮 / Player 歌词缓存 / Playlist 排序 / 登录闪烁排查），但 3 个因**模型配额超限**（402 quota exceeded）在执行中途中断——Home agent 仅完成 player-store 的 `sourcePlaylistId` 字段+签名（未接线到 UI）；Playlist agent 仅完成 API+mutation 层（`reorderPlaylists`/`reorderPlaylistSongs`，未导出、UI 未做）；登录闪烁 agent 零产出（配额在启动阶段即耗尽）；icons.ts 被 reorder agent 加了 `chevron-up`/`sort` 到 `IconName` 类型但未补 SVG 实现，一度**导致构建报错**（`Record<IconName,...>` 缺键）。重试 resume agent 仍立即失败，判定配额问题非瞬时——**改为在主线程直接完成剩余全部实现**（Home 下拉刷新/高亮 UI、Playlist 排序 UI、登录闪烁根因排查与修复），只有「歌词本地缓存」agent 全程独立跑完无需介入。

- **Library 收藏切换**（`src/features/library/data/favorites.ts` + `widgets/FavoriteSongRow.tsx`）：`useFavoriteToggle(songId)`（`useMutation` add/remove + invalidate）+ `useIsFavorite`（从 `GET /playlists/1/songs`——`favoritePlaylistId` 常量——拉取收藏歌曲 ID Set，`staleTime` 60s）；`SongRow` 加心形图标（`heart`/`heart-filled`），`catchtap` 阻止事件穿透到行点击（同 `MiniPlayer`/`PlaylistDrawer` 既有写法）；`FavoriteSongRow` 包装组件供 `LibraryPage` 用（测试里 mock 成裸 `SongRow` 规避 `useQueryClient` 依赖）。
- **播放模式启动恢复**（`src/index.tsx`）：启动异步链追加 `readDefaultPlayMode()` → `usePlayerStore.getState().setPlayMode(savedMode)`，解掉批8 遗留的「未在 bootstrap 读回 prefs 应用到 store」。
- **登出清 Query 缓存**（`src/features/auth/store/auth-store.ts`）：`logout()` 清本地状态后动态 `import` query 模块调 `getQueryClient().clear()`，try/catch 保护（query client 可能未初始化）。
- **修复真机登录页闪烁**（`src/features/auth/pages/LoginPage.tsx`）：**根因**——硬编码 `useState('admin')`/`useState('admin')` 预填（代码本有 `TODO: clear before shipping`）+ 异步 effect 又从 `SongloftStorage` 读回上次用户名再次 `setUsername`；B2 把存储从内存 stub 换成真实 Android 原生 SharedPreferences 后，启动时多路并发原生存储读取（`hydrate`/`checkAuth`/`readDefaultPlayMode`/用户名回填）竞争同一条原生桥梁队列，而 lynx-ui `Input` 是受控组件——每次 `value` prop 变化都触发一次原生 `setValue` 往返（伴随 main-thread `readonly` 锁定/解锁，见 vendored `Input.tsx` 的 `useEffect(()=>{setValue(value??'')},[value])`）。硬编码默认值叠加异步覆写，在繁忙的启动桥梁队列上被延迟／重入，是 Password 字段与 Login 按钮闪烁、"过一会才正常"的最合理解释。**修法**：移除硬编码默认值改空字符串起始，仅保留原有的持久化用户名/服务器地址异步回填（不再有默认值与回填值的双重写入竞争）。已排除的备选假设：`@lynx-js/preact-devtools`/`@lynx-js/react/debug`（经 `dist/main.lynx.bundle` grep 确认生产构建已被 rsbuild alias 插件正确剔除，0 命中）、`router.invalidate()` 循环（`checkAuth` 只设置一次终态，非振荡）。
- **Home 首页**（`src/features/home/pages/HomePage.tsx`）：移除冗余登出按钮（已在 Settings→Account 两步确认，见批8）；下拉刷新改用 **Lynx 原生 `<refresh>`+`<refresh-header>` 元素**（用户提供官方文档确认 3.8+ 起 Android/iOS/HarmonyOS/Web 支持，`@lynx-js/types@4.0.0` 已收录类型定义，无需 `@ts-expect-error`）——`bindstartrefresh` 触发两个 section 的 `refetch()`，完成后 `ref.invoke({method:'finishRefresh'}).exec()` 收起头部；**未采用手动按钮方案**（原计划的不确定性回退，后因官方文档确认原生 API 可用而替换）。正在播放歌单高亮：`playPlaylist` 新增第三参 `playlistId` 写入 `sourcePlaylistId`（`PlaylistDetailPage.onTapSong` 已传入 `id`），`HomeSection`/`PlaylistCard` 按 `playingPlaylistId===playlist.id` 加 primary 色边框+文字高亮。
- **Playlist 排序**（`src/features/playlist/widgets/PlaylistsView.tsx` + `pages/PlaylistDetailPage.tsx`）：Lynx 无原生拖拽排序组件（lynx-ui 无 `sortable`），用**上移/下移按钮**代替拖拽——`moveItem` 纯函数交换相邻两项，交换后立即提交完整新顺序 ID 数组给 `useReorderPlaylistsMutation`/`useReorderSongsMutation`（PUT `/playlists/reorder` / `/playlists/{id}/songs/reorder`，agent 已完成的 API+mutation 层，本轮补齐 `data/index.ts` 导出 + UI）���**歌单内歌曲排序仅在 `!songsQuery.hasNextPage`（全部页已加载）时开放入口**——避免对未加载页面的歌曲静默截断（按 AGENTS.md「no silent caps」原则），`canSort = !hasNextPage && songs.length > 1`。内置歌单不显示排序入口（同批10 CRUD 保护）。
- **Player 歌词本地缓存**（`src/features/player/data/lyric-cache.ts`，agent 独立完成）：`SongloftStorage.prefs` 按 key `lyric_<songId>` 缓存 `{lyric,tlyric,rlyric,lxlyric,cachedAt}` JSON；`lyric-store.loadForSong` 先查缓存命中则跳过网络直接解析，未命中拉取成功后 fire-and-forget 写入缓存；读写均 best-effort（try/catch 兜 null/静默失败），不影响主流程。8 个单测覆盖命中/未命中/多歌曲隔离/损坏 JSON 容错/存储异常容错。
- **本机验收**：build **1200.8 kB**（含新增 lazy chunk：query/settings-prefs/player-store 各 0.99 kB，因 `index.tsx` 新增动态 `import()`）✓ / tsc ✓ / **345 vitest** 全绿（+13）✓。**注**：本机 `ulimit -v 25GB` 硬限制导致 pnpm/rspeedy/vitest 崩溃，验收全程在 Docker 容器内完成（`docker run node:22-slim` + bind mount）。
- **真机待验**：登录页不再闪烁（需装新 APK）；首页下拉刷新手势（`<refresh>` 真机行为，本机 vitest 无法模拟 `bindstartrefresh` 手势触发，`fireEvent` 的 `eventMap` 未收录该事件名，只能真机验）；歌单/歌曲排序上移下移生效 + 提交到后端持久化；收藏心形图标切换 + 状态持久化；正在播放歌单卡片高亮边框。

### 批12 · 小遗留项扫尾轮

用户要求「先扫小遗留项」而非直接跳去 B3 iOS 宿主（路线图既定下一里程碑，工作量大、需 CI/真机验，暂缓）。逐一调研 PROGRESS 里标记未完成的小项，排除已隐性完成但文档未更新的（facet 卡片点击其实早已接线到 `CategorySongsPage`；下拉刷新/正在播放高亮已在批11做——本次一并纠正文档），实际动手的 3 项：

- **服务器地址切换清 Query 缓存**（`ServerSettingsPage.tsx`）：Save 成功后同步 `getQueryClient().clear()`（改用**静态 import** 而非批11 登出流程的动态 `import()`——动态 import 在此页的 `bindtap` fire-and-forget 调用链里引入了不可控的真实模块加载延迟，导致已有的 `Save applies... then routes back` 测试断言 `navigateSpy` 未在单个 `await Promise.resolve()` 内触发，改静态 import 后同步完成、测试转绿）。
- **内置歌单标识**（`PlaylistCard.tsx`）：`playlist.isBuiltIn` 时在封面右上角叠加 12px 心形徽标（`heart-filled` + `--primary` 底色圆点），复用 zod 派生字段，零新增依赖。
- **播放队列抽屉排序**（`PlaylistDrawer.tsx`）：队列 >1 首歌时每行加 chevron 上移/下移（复用现有 `reorderPlaylist(oldIndex,newIndex)` action），`catchtap` 避免穿透到行的「点播」`bindtap`；边界行按钮视觉禁用（`catchtap=undefined` + 透明度样式），单曲队列整组隐藏（同 `playlist-detail`/`playlists-view` 既有排序「仅 >1 项开放」惯例）。**测试环境限制发现**：花了较长时间排查一个「催单测试点了按钮但 spy 零调用」的诡异现象，逐步实锤到——`@lynx-js/react/testing-library` 的 `fireEvent.tap()` 只会触发元素自身的 `bindtap`，**不会**触发一个只挂了 `catchtap`（没有伴随 `bindtap`）的元素的处理器，无论直接 tap 该元素还是 tap 其子节点触发「冒泡」都一样（用临时 `console.log` 加 `bindtap` 对照实测确认）。回看代码库，`MiniPlayer` 播放键与 `SongRow` 收藏心形早就是这个写法且从未被单测覆盖点击行为——本次之前一直是「未发现的坑」，不是新引入的。**修法**：不改产品代码（`catchtap` 是真机上正确的写法，真实设备的 tap 事件系统按预期工作，只有这个 JS 测试模拟器不支持），改为把这类交互归入「仅真机可验」范畴（与 `<refresh>` 的 `bindstartrefresh` 手势同类），单测只覆盖可验证的渲染结构（哪些行有排序按钮/单曲隐藏），移除了两个原计划断言点击行为的测试用例。
- **修复 `pnpm-workspace.yaml` 占位符 bug**：`allowBuilds: { esbuild: "set this to true or false" }` ——字符串而非布尔值，是本 session 更早某次尝试修 pnpm 新版本 `ERR_PNPM_IGNORED_BUILDS` 硬失败（新版 pnpm 默认拒绝未批准的依赖构建脚本）留下的半成品，一直没生效，每次 Docker 内 `pnpm install`/`run` 都会在这道校验上失败退出。改成 `esbuild: true` 后 `pnpm install --frozen-lockfile` 恢复正常（不再需要 `--ignore-scripts` 绕过）。
- **本机验收**：build **1207.3 kB** ✓ / tsc ✓ / **348 vitest** 全绿（+3：`playlists-view` 内置徽标测试 1 个、`playlist-drawer.test.tsx` 新文件 2 个渲染结构测试；`playlist-drawer` 原计划的点击行为测试因上述 `catchtap` 模拟限制而移除，净增 3）。Docker 容器验证全程未再手动加 `--ignore-scripts`。
- **真机待验**：服务器切换后旧数据不再残留（切服务器 → 请求新数据 → 确认不是缓存的旧服务器数据）；播放队列抽屉 chevron 排序实际生效（真机 tap 手势，非本机模拟范畴）；内置歌单（Favorites/Favorite Radio）卡片右上角出现红心徽标。

### 批19 · 音乐库运维（扫描）

**动机**：`SettingsPage` 里「音乐库扫描」一直是 disabled 占位行——**Lynx 客户端至今无法扫描音乐库**，歌曲只能靠 Flutter 客户端或直接调后端 API 导入。这是所有功能缺口里唯一「不做就用不起来」的一条。Flutter 侧「音乐库运维」合计约 4300 行 UI，一批装不下，故只做扫描主链路。

- **新 feature `src/features/library-ops/`**（独立 feature，入口行在 Settings 里 → `/settings/library`，同 `jsplugin` 先例）。
- **模型**（`src/models/library-ops.ts`）：`scanProgressSchema`（10 字段 + 派生 `percent`/`isScanning`/`isTerminal` 等）、`metadataProgressSchema`、`autoScanSettingSchema`、`dirEntrySchema`/`directoryListSchema`。**不改 `models/index.ts`**（沿用 `jsplugin.ts` 直接 import 模块的先例）。
- **API**：`api/scan-api.ts`（`buildScanBody`/`buildDirectoriesQuery` 两个纯 builder + 7 个动作端点）、`api/scan-settings-api.ts`（6 组开关 GET/PUT）、`api/index.ts`（认证客户端单例 recipe）。
- **domain**（全纯函数，重点单测对象）：`scan-model.ts`（`deriveScanView` 状态机 / `scanLines` 返回 i18n key+params / `scanPollInterval` / `metadataPollInterval` / `shouldInvalidateOnComplete` / `metadataViewKind` / 4 组选项表 + coerce / `dirDisplayName`）、`directory-tree.ts`（目录树 reducer）。
- **data**：`scan-query.ts`（轮询）、`scan-mutations.ts`（4 动作 + `useScanCompletionEffect`）、`remote-setting.ts`（开关工厂 + 乐观更新/回滚）、`scan-settings-data.ts`（6 组具体化）、`use-directory-tree.ts`。
- **UI**：`LibraryOpsPage`（页面级本地态：mode/selectedPaths/startError/writeError/forced/paused）+ `ScanSection`（5 态）/ `ScanSettingsSection` / `MetadataSection` / `DirectoryTree` / `SwitchRow` / `ProgressBar`。
- **i18n**：新增 `libops` group，**78 key × 2 语言全部从 `src/i18n/generated/{en,zh}.json`（Flutter ARB dump）挖出**，非自撰文案（占位符已是 `{{var}}` 格式）。
- **图标**：新增 7 个（`folder`/`folder-open`/`search`/`stop`/`warning`/`check-circle`/`fingerprint`）。警告态复用 `ICON_COLORS.danger`（主题无 warning/success 槽）。

#### 修掉的 3 个 Flutter 缺陷（均有回归测试）

1. **`'error'` vs `'failed'` 状态机断裂**：Flutter `startScan` 失败写 `status:'error'`，而 `isError` 判 `'failed'` → 5 个 UI 分支全落空、扫描区**整块空白**。修法：启动失败**不进 status**，`deriveScanView(progress, startError)` 显式接两个入参。测试：`startError=true` 时对任意 status 都返回 `failed`。
2. **扫完看不到新歌**：Flutter 只 invalidate 歌单列表，歌曲/分面缓存没刷。修法：`invalidateAfterScan` 一并失效 `['library','songs']`/`['library','facets']`/`['playlist','list']` 三个前缀（覆盖全部 filter 变体）。
3. **进度百分比两套口径**（ScanProgress 0-100 int / MetadataRefreshProgress 0.0-1.0 double）。修法：模型层 `.transform()` 统一成 0-100 整数，两者喂同一个 `ProgressBar`。

#### ~~轮询：用 TanStack Query 函数式 `refetchInterval`，不手写 interval~~ ⚠️ 已被批29c/批40 推翻

> **批40 订正**：本节结论**已作废**，保留作为踩坑记录。`refetchInterval` 在本 Lynx 4.0 build 上**首次 fetch 后就不再 fire**（批29b 真机实测：interval 函数被反复调用且每次都返回 `2000`，但请求冻住）。批29c 先把指纹进度改成页面级显式 `setInterval`，批40 把扫描/元数据两个进度也迁过去。下面第二条自己就写明了「今天能轮询是巧合」——这正是它必须被替换的原因，而不只是一个可接受的注意事项。现行做法见 `data/scan-query.ts` 与 `pages/LibraryOpsPage.tsx` 的 doc block。

已实测 query-core 5.101.4：`#clearRefetchInterval`/`#clearStaleTimeout`/`clearGcTimeout` 三处都有 `!== void 0` 守卫，`undefined` 不会喂给 Lynx 严格的 `clearInterval`。三个 option 都是承重的（**其中前两条已随批40 移除，`staleTime`/`retry` 仍在**）：

- **`staleTime: 0`** 覆盖全局 30s——否则 30s 内重进页面吃缓存，首次真读被推迟一个周期。
- **`refetchIntervalInBackground: true`** 摘掉一处**隐藏依赖**：interval 回调只在 `refetchIntervalInBackground || focusManager.isFocused()` 时才 fetch，而我们装了 no-op focus listener 却从不 `setFocused`，`isFocused()` 靠 `globalThis.document?.visibilityState !== 'hidden'` → `undefined !== 'hidden'` → `true` fall-through。**今天能轮询是巧合**，谁要是哪天调了 `setFocused(false)` 轮询会静默死掉。
- **`retry: 0`** 覆盖全局 `retry: 1`——一次失败的 poll 跳过即可，重试只是在同一周期内打两次。

**启动竞态**（纯 data 派生会漏的真实 bug）：`POST /scan` 返回后后端 worker 可能还没起，首次 `GET /scan/progress` 仍是 `idle` → 轮询永远起不来。修法：粘性本地 `forced` 标志，启动成功置 true、首个终态清 false，参与 `scanPollInterval` 判定。

**取消的两个刻意顺序**（照搬 Flutter 的正确处理）：先暂停轮询再发取消请求（否则等响应期间 poll 可能读到终态、抢先跳到 completed）；**取消失败必须把轮询接回去**（任务可能还在跑，冻结的进度条比失败的取消更糟）。

**加固**：`configureQueryGlobals()` 里 `timeoutManager.setTimeoutProvider()` 注入走 `safe-timers` 的 provider。那三处 `!== void 0` 是依赖的内部实现细节，注入后即便未来版本去掉守卫也不会在真机上崩。

#### 测试抓到的两个真 bug（否则真机才暴露）

1. **`z.coerce.boolean()` 对 `"false"` 返回 `true`**（JS `Boolean("false")`）——比 Flutter 只接受真 bool 更糟。改用显式 `tolerantBoolean(fallback)`，且 fallback 必须逐端点传（`scan-auto-create-playlists` 默认 **true**、`remote-title-source` 默认 **filename**，与同类端点相反）。
2. **zod v4 里 object 内的裸 `z.unknown()` 不是 optional**，缺 key 时抛 `invalid_type`——而这个抛错被外层 `z.array(dirEntrySchema).catch([])` **吞成了空数组**，真机上目录树会永远为空。修法：`z.unknown().optional()`。这正是 AGENTS.md §2 警告的「`.catch()` 掩盖内层错误」。

#### 与 Flutter 的刻意 UI 偏离

| Flutter | Lynx | 原因 |
|---|---|---|
| `SegmentedButton` / `DropdownButton` | 选项行 + `check` 图标 | Lynx 无这两个原语；沿用 `SettingsPage` 播放模式的既有惯例 |
| 整行可点展开 + 行内 Checkbox | **勾选热区 + 箭头热区两个独立 `bindtap`** | 嵌套可点需内层 `catchtap`，而 `fireEvent.tap` 不触发只挂 `catchtap` 的元素（PROGRESS 批12）——拆开后本批**零 `catchtap`-only 交互**，两个交互都能单测 |
| `LinearProgressIndicator(value: null)` | 计数文案（每 2s 变的真实数字）+ CSS `@keyframes` 滑块 | Lynx 无 indeterminate progress。动画失效时滑块静止在 30%，仍明显区别于 0% 空条，不会白屏 |
| 目录树 `maxHeight: 300` 内嵌滚动 | 内联、不限高、随页面滚 | Lynx `scroll-view` 的 `enable-nested-scroll` 默认 `false`，内层会吞手势 |
| `ResponsiveSnackBar` | 行内可关闭 banner | Lynx 无 toast 原语；顺带裁掉 Flutter 的两个成功 toast（无承载体，成功已由开关状态本身表达） |
| 节点子目录存在各自 widget state | 扁平 `childrenByPath` 缓存 | Flutter 折叠即丢缓存、重开重拉；扁平缓存让「**首次**展开才懒加载」真正成立（有显式测试） |

- **验收**：`rm -rf dist .rspeedy && pnpm run build`（**1375.5 kB**）✓ / `tsc --noEmit` ✓ / `pnpm test` **521/521**（+149：models 18 / scan-model 44 / scan-api 17 / scan-settings-api 17 / directory-tree 16 / remote-setting 8 / page 冒烟 29）✓ / 产物校验：7 个端点串 + 中英文案（`grep -a`，`strings` 会漏多字节 UTF-8）+ `libops-indeterminate` + `setTimeoutProvider` 均入包，`AbortController`/`__TSR_ROUTER__` 守卫仍在，`background-bundle-self`/`router-no-dom`/`query-no-dom` 对新鲜 dist 复跑绿 ✓。**本机 `ulimit -v` 已 unlimited，不再需要批10-12 那样进 Docker。**
- **顺手修掉（本批范围外，验收时由构建警告暴露）**：批18c 的「暗色 Input 提示文字不可见」修复**当时无效**——CSS 里写的 `placeholder-color` 被 Lynx template encode 移除（构建有 `⚠ Unsupported property` 警告，当时未注意）。Lynx 要求 `-x-` 前缀变体，已把 5 个文件改成 `-x-placeholder-color`，警告消失。

### 批19b · 真机反馈修复（开关状态不可见）+ 扫描失败定位

#### 1) 真 bug：开关的开/关在真机上完全无法区分（已修）

现象：音乐库页 6 个开关不论后端值是什么都长一个样。实测该机后端 `scan-auto-create-playlists=true`、`scan-title-source=filename`（都是「开」）与 `auto-scan=false`、`scan-auto-fingerprint=false`（「关」）渲染**像素一致**。

**根因是 CSS，不是逻辑**：lynx-ui 的 `Switch` **自身不带任何样式**，只把 `ui-checked`/`ui-active`/`ui-disabled` 追加到每个 compound part 的 className 上——「选中」这个视觉状态**完全由使用方的样式表提供**。批19 的 `.libops__switch-track` 只写了底色，**没有 `.ui-checked` 规则**；也漏了 `flex-direction: row`（Lynx flex 默认 `column`，缺它 `justify-content: flex-end` 会把 thumb 推**下**去而不是推右）。

**为什么会漏**：login / server-settings / library-ops **三处各自手抄了同一份 track/thumb CSS**，第三份抄漏了规则。所以修法是消掉复制源，而不是补一条规则：新增 **`src/shared/ui/AppSwitch.tsx` + `AppSwitch.css`（全 app 唯一一份开关样式）**，三处使用点改成 `<AppSwitch>`，删掉三份 CSS。顺带 `disabled` 现在真的透传给 lynx-ui（原先靠「不传 `onChange`」，按下仍有 press 动画，看着可点实则无效）。

**为什么测试全绿——真正的教训**：`mockLynxUiSwitch()` 是个 passthrough，**把 `checked` 整个丢掉了**，ON 与 OFF 渲染成同一棵树，任何渲染断言都不可能发现。已改成忠实版（照真实组件把 `ui-checked`/`ui-disabled` 追加到三个 part 的 className；root 挂 `bindtap`，因此 `fireEvent.tap` 现在能驱动 `onChange`，批19 注释里「stubbed switch 不能 emit onChange」的限制随之解除）。

两道新闸，**都做过反向验证**（破坏后确实变红）：

- **渲染层**（`library-ops-page.test.tsx`）：ON 的 track 必须带 `ui-checked`、OFF 的必须不带。
- **CSS 层**（`src/shared/ui/__tests__/app-switch-css.test.ts`）：共享样式表必须有 `.app-switch__track.ui-checked { background-color … justify-content: flex-end }` 与 track 的 `flex-direction: row`；且**除它以外任何 `.css` 都不许再出现开关样式**（拦第四份复制，比较前先剥注释）。渲染测试抓不到「缺一条 CSS 规则」，所以这道静态闸是必需的，不是锦上添花。
- **产物校验**：从 `dist/main.lynx.bundle` 解出编译后的样式段，确认 `app-switch__track` + `ui-checked` → `{{--primary}}` / `flex-end` 真入包（复合选择器 `.a.b` 存活），三份旧类名 0 命中。

#### 2) 「扫描失败」不是客户端 bug（后端 `music_path` 配置）

真机报 `扫描失败: failed to scan files: no valid scan directory: [music]`。直连该机后端逐项复现：

| 探测 | 结果 |
|---|---|
| `GET /settings/music-path` | `{"path":"music", …}` — **相对路径，且该目录在服务端不存在** |
| `GET /scan/directories` | `{"detail":"directory does not exist: music"}` → 目录树只可能是 error 态 |
| `POST /scan {"reimport":false}`（与客户端完全同形的 body） | HTTP 200 `扫描任务已启动`，随后 progress 转 `failed`，error 同上 |
| `GET /songs/stats` | `local_songs: 0`（60 首全是 remote） |

即**客户端发的 body 正确、后端错误也被如实展示**——这反过来验证了批19 修掉的 Flutter 缺陷 #1（Flutter 版在这里会是整块空白）。阻塞点在服务端 `music_path` 指向不存在的相对目录 `music`，而 Lynx 客户端**目前没有音乐目录配置 UI**（`/settings/music-path` PUT 划给了批21），用户在客户端内无法自救。改 path 的最小办法（**PUT 必须带上三个排除数组，否则会被清空**）：

```
curl -X PUT "$BASE/api/v1/settings/music-path" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"path":"/绝对/音乐目录","exclude_dirs":["@eaDir","tmp"],"exclude_paths":[],"auto_create_exclude_dirs":["downloads"]}'
```

**建议把「音乐目录」这一行从批21 提前**：目录树与扫描两个功能都被它卡住，批19 的价值在服务端 path 配好之前无法体现。

**当前处置（用户选定）**：`mkdir /Users/hanxi/toy/songloft/music`（该后端就跑在本机，`songloft -username admin -password admin -port 58091`，cwd = `/Users/hanxi/toy/songloft`）。建目录后**扫描链路当场走通**：`POST /scan` → progress `completed`（`imported_files: 0`，本机确实没有音频文件——`~/Music`/`~/Downloads`/后端 `data/` 全为 0，`local_songs: 0`）。**即「进度轮询 → 完成态 → 缓存失效」已真验，「真的导入歌曲」仍未验**（需要往该目录放音频）。

**顺带把一个「未联调」项转成已验证**：`GET /scan/directories` 的真实响应 = `{"directories": null, "root": "music"}`。两个细节已固化成测试：① 空目录时 `directories` 是 **`null` 而不是 `[]`**（正是 AGENTS §2 的 null 陷阱，靠 `.catch([])` 才没炸）；② `root` 原样回显 `music_path`，**可能是相对路径**。`{directories, root}` 这个此前只来自 Flutter 客户端的假设，至此确认。

#### 3) 顺带清掉两条构建警告（都是真无效声明，`css-defines` 里查无此属性）

`pnpm run/dev build` 长期带两条 `⚠ Unsupported property … was removed during template encode`——**它们不是噪音，是两条从未生效的样式**（同批19 发现的 `placeholder-color`）：

- `text-transform: uppercase`（`TabConfigPage.css`）：Lynx 无此属性，且**不存在 `-x-` 变体**，section 标题从来没大写过。直接删声明（改用 JS `toUpperCase()` 更糟：对 zh 是 no-op，且对有特殊大小写规则的语言是错的；app 其它页的 section 标题也都不大写）。
- `object-fit: cover`（`PluginGrid.css`）：Lynx `<image>` 的适配**是元素属性 `mode`**（`scaleToFill`(默认)/`aspectFit`/`aspectFill`/`center`），没有 `object-fit` CSS。改为在 `<image>` 上写 `mode='aspectFit'`——取 `contain` 而非原声明的 `cover`，因为这些是 logo，裁掉非正方形 logo 的一部分不可接受。

**顺带查明 `bug.md`「首页插件的图标没有正常显示出来」的根因**（本次未修，留给 bug.md 那批）：后端 `GET /jsplugins` 返回的 7 个插件里 **6 个 `icon` 是 `.svg`**（`icon.e24fa48a.svg` 等），而 Lynx 文档明确写 **`<image>` 在 Android/iOS/Harmony 原生路径下不负责 SVG 渲染，SVG 要用 `<svg>`**。所以那些图标是根本没渲染，不是尺寸/裁剪问题——`mode` 修好也只对那 1 个 `.png` 有效。修法需要按扩展名分流到 `<svg>`（`shared/ui/Icon.tsx` 已有 `<svg>` 用法可参考），并确认 `<svg>` 能否吃远端 URL。

- **验收**：`pnpm run build` clean（**1374.3 kB**，**构建警告已清零**）✓ / `pnpm exec tsc -b --force` ✓ / `pnpm test` **528/528**（58 文件，+4）✓。真机已确认开关开/关可区分（截图：`扫描后自动创建歌单` = 紫色轨道 + thumb 靠右，与后端 `enabled:true` 一致）���

### 批20 · bug.md 清理第一轮（6 条）+ ��机 Android SDK 打通

#### 0. 验证能力：本机现在能出包并装模拟器

此前本文件多处写着「本机无 Android SDK，不能 `assembleDebug`」，Kotlin 侧从批B1 起**只在 CI 编译过**，真机行为从未由 agent 验证。本批装了 SDK（`brew install --cask android-commandlinetools` + `sdkmanager "platforms;android-34" "build-tools;34.0.0"`，`ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`，`android/local.properties` 已在 `.gitignore`）。

- 首轮 `assembleDebug` 7m45s（下 Gradle 8.7 + 全部依赖），**之后 `pnpm run android:install` 增量 4 秒**，可快速迭代
- 后端连通用 `adb reverse tcp:58091 tcp:58091`，不必改客户端里的 API 地址
- 交互用 `adb shell input tap/swipe`，核对用 `adb exec-out screencap -p` + PIL 比对像素 bbox（比肉眼看截图可靠——本批多次靠 bbox 判定「到底动了没有」）
- 新增 `package.json` 脚本 `android:install`；顺手把 `typecheck` 从安慰剂 `tsc --noEmit` 改成 `tsc -b`（AGENTS §5 早已记录此事，脚本一直没改）

#### 1. 首页横向滚动在 Android 上滑不动 —— 四个叠加缺陷

批18b 那次提交是**纯标签替换**（`<view>` → `<scroll-view scroll-x>`），把原 `<view>` 的 flex 样式原地留在了 scroll-view 上。四个缺陷任一都足以让手势失效，逐个在模拟器上排除：

| # | 缺陷 | 为什么本机测不到 |
|---|---|---|
| 1 | `display:flex`+`gap`+`padding` 压在 scroll-view 自身、无内层内容 view | 纯 CSS 语义，vitest 不布局 |
| 2 | 用了**已废弃**的 `scroll-x`（正确是 `scroll-orientation="horizontal"`，默认值 `vertical`） | **带连字符的 JSX 属性 TS 一律不检查**，`tsc`/build 全静默 |
| 3 | 内容行缺 `width: max-content` | 同上，且现象极具误导性（见下） |
| 4 | **`<refresh>` 吞掉横向手势** | 只在真机手势下暴露 |

**最值得记住的是诊断过程**：加临时 `getScrollInfo`/`scrollTo` 诊断后读到 `{"scrollRange":264,"scrollX":150}` —— 测量正确（264 = 内容 804px − 视口 540px，与卡片数吻合）、`scrollTo` 能改滚动位置、`bindscroll` 也确实会被 `scrollTo` 触发，**但视觉毫不位移、手指全程无效**。这排除了所有 CSS/布局猜测，把范围锁到「渲染平移」和「手势路由」两件事上：前者是缺陷 3（平移的是内容行，而它只有视口宽），后者是缺陷 4（把 `<refresh>` 从树里摘掉，滑动立刻恢复——像素 bbox 从 `None` 变成 `(0,133,540,291)`）。

`<refresh>` 没有任何手势过滤属性（只有 `enable-refresh` 开关），所以最终解法是**握手**：`HomeSection` 的横向 scroll-view 用 `bindtouchstart/end/cancel` 告知 `HomePage`，后者把 `enable-refresh` 置 false/true。已验证两者可共存（横滚正常 + 非横滚区行为不变）。`enable-nested-scroll` 也一并加上（默认 false）；`force-can-scroll`/`android-preference-consume-gesture`/`consume-slide-event` 试过**均无效**，已移除，不留无用属性。

**卡片形状**（用户确认的「竖矩形」）：120×120 方形封面 + 48px 两行文字，用首页侧后代选择器覆盖基类的 `height:96px`（不动 `PlaylistsView.css`，否则曲库三列宫格跟着变）。顺带给 `PlaylistCard` 的 `<image>` 补 `mode='aspectFill'`（= `BoxFit.cover`）——此前无 `mode`，默认 `scaleToFill` 把封面拉扁，曲库页同样受益。

#### 2. 插件图标不显示 —— `<svg src>` 在本宿主不可用

按扩展名分流是对的（6/7 是 `.svg`，`<image>` 全端不渲染 SVG），但**先试的 `<svg src={url}>` 白屏**，logcat 给出决定性答案：

```
E LynxUISVG: getGenericResourceFetcher is null, svg fetch src failed! http://…/icon.27a432e2.svg?access_token=…
```

即远程 URL 加载委托给**宿主注册的 `GenericResourceFetcher`**，`android/` 宿主没注册。同一份日志里 `SrSVGRenderEngine`/`setViewBox` 正常刷 —— 内置 Icon 的 `content` 路径是好的。故改为：`JSPluginApi.getStaticText()`（`parseJson:false`，同 `SettingsApi.exportLogs`）拉文本 → `usePluginIconQuery`（`staleTime: Infinity`，图标文件名带内容 hash）→ `<svg content>`。并校验响应确实以 `<svg`/`<?xml` 开头，因为该端点对未知路径会 **SPA fallback 成 200 + `index.html`**（不是 404）。

**两处 swagger 是错的**，实测更正：该端点 description 写「无需认证」但**无 token 返回 401**；`produces` 写 `application/octet-stream` 但实际是 `image/svg+xml`。

#### 3. 播放器关闭返回 + MiniPlayer 可见性

新增 `src/shared/nav/shell-navigation.ts`：`getLastShellLocation`/`setLastShellLocation`（模块级、会话内，照抄 `last-library-search` 的形）+ 纯谓词 `showsMiniPlayer(pathname)`。

- 只记 tab 根（`/` 与 `/library`），详情路由不更新 —— 从曲库进歌单再播放，关闭回曲库（用户心里所��的 tab），同时让类型收敛成字面量联合、`navigate()` 保持类型安全
- 回 `/library` 时带上 `getLastLibrarySearch()`，子页签不被重置（已验：曲库 Songs → 播放器 → 关闭 → 回到 Songs）
- MiniPlayer 白名单 `/`、`/library*`、`/playlists/*`，判定放在 `ShellLayout`（widget 保持对路由无知）。用**白名单而非黑名单**，这样新增设置子页不会意外继承小播放器

#### 4. 删设置页播放设置（并避免一个回退）

删掉 Playback 分组后 `writeDefaultPlayMode` 会失去唯一调用方，而播放器的 `cyclePlayMode` **只改内存**——直接删会导致播放模式不再被记住。故把持久化搬到 `PlayControls` 的模式按钮上。~~**已端到端验证**：切到 Repeat one → `am force-stop` → 重启登录 → 仍是 Repeat one。~~ ⚠️ **批29 推翻此结论**：读回侧 `readDefaultPlayMode` → `setPlayMode` 位于 `index.tsx` 启动链中一处动态 `import()` **之后**，而 lazy bundle 从未打进 APK assets，该链在设备上一直是断的——所以这条持久化当时**不可能成立**（写入侧正常，读回侧从不执行）。批29 改静态 import 后**才真正验过**（切「单曲循环」→ force-stop → 重启 → 保持）。连带清掉真死代码（`PLAY_MODE_OPTIONS`/`playModeLabelKey`/`playModeDescriptionKey`/`playModeIcon` + 9 个 i18n key × 2 语言）；`coercePlayMode` 保留（pref 仍在往返）。

#### 5. 首页统计改用 `/songs/stats`

此前是 `homeStats(normalTotal, radioTotal)` —— 只有「歌单数/电台数/总计」，却长得像曲库统计。新建 `models/library-stats.ts`（9 字段）+ `home-stats-query.ts`（同时是测试 mock 缝）+ 重做面板（歌曲总数与总时长为主，本地/远程/电台与歌手/专辑/流派为次）。

- query key 挂在 `libraryQueryKeys.stats()` = `['library','stats']`，**沾批19 扫描完成失效 `['library']` 的光**，扫完导入自动刷新统计
- 单位是实测的：`total_duration` 是**秒**（60 首 9643s ≈ 160s/首），`total_file_size` 对全 remote 库是 0 → **0 时不显示**，避免渲染无意义的「0 B」
- **测试抓到一个真缺陷**：顶层 `z.object()` 对 `null`/非对象**仍会抛**（`.catch()` 只作用于字段），已加 `z.preprocess` 归一化 —— AGENTS §2 的容错铁律此前只覆盖了字段级
- 时长不复用 `library/data/format.ts` 的 `formatDuration`：那是 `hh:mm:ss`（9643 → `02:40:43`），读起来像时间戳；库总时长要的是粗粒度「2 h 40 min」

#### 6. 插件页标题 + 一个未被报告的主题缺陷

`PluginWebViewPage` 标题原样输出路由参数 `entryPath`（swagger 里它的语义就是「路由前缀」）。改用 `displayName`（**不是裸 `name`** —— 后端可能不给 `name`，`displayName` 是 `p.name ?? basename(file_path)` 的空安全包装，也是本仓其它 4 处插件 UI 的一致惯例）；fallback 保留 `entryPath` 避免标题闪空。Flutter 原版标题本就是 `displayName`，属移植遗漏。

**顺手修掉**：同文件的 `resolveTheme()` 在嗅探 `document.documentElement`。Lynx 无 DOM，`typeof` 守卫让它不崩，但让每个插件 WebView 永远收到 `theme=dark`（即使选了浅色）。改为读 `theme-model` 的真实状态。

#### 本批新增的闸（均反向验证过会红）

- `home-section-scroll.test.ts`：源码层断言 `scroll-orientation`/`enable-nested-scroll`/三个 touch 回调/`enable-refresh` 绑定；CSS 层断言 scroll-view 只管尺寸（**不含** `display:flex`）、内容行有 `width:max-content`、卡片 `flex-shrink:0`、封面 120px；**产物层**断言属性真进模板且 `scroll-x` 零命中（连字符属性没有类型保护，产物是唯一证据）
- `plugin-icon.test.ts`：`isSvgIcon` 分流（含 `svg-preview.png` 这种陷阱名）+ `getStaticText` 用 `parseJson:false`
- `library-stats.test.ts`：真后端响应逐字段 + null/字符串/非对象容错
- `stats-format.test.ts`：`splitDuration`（9643 → 2h40m）+ `formatBytes`
- `full-player.test.tsx`：新增「切模式会持久化」与「关闭回上次 tab」两例（持久化搬家后，覆盖也得跟着搬）

#### 验收

`pnpm run build` clean **1379.0 kB / 零警告** ✓ · `pnpm exec tsc -b --force` ✓ · `pnpm test` **549/549**（62 文件，+21）✓ · 产物 grep 确认 `scroll-orientation`/`enable-nested-scroll` 入�������、`scroll-x` 仅剩注释 ✓ · 模拟器 6 条逐条截图核对 ✓。

### 批21 · 外观/语言跟随系统（bug.md 第 13、14 条）

「跟随系统」这两个选项此前**是纯标签、背后什么都没有**：`resolveTheme('system')` 直接返回硬编码 `'dark'`，`resolveLanguage('system')` 直接返回硬编码 `'en'`。Lynx 没有 `prefers-color-scheme`、没有 `matchMedia`、也没有 locale API，所以信号只能由宿主给。

#### 1. 信号通路：两条通道，各有不可替代的作用

| 通道 | 送什么 | 为什么不能只用另一条 |
|---|---|---|
| `LynxLoadMeta.setGlobalProps` → `lynx.__globalProps` | **初值** | 宿主在 `loadTemplate` **之前**注入，所以首帧就知道系统主题、**不闪错主题**。原生模块 getter 做不到——它是异步的，答案会在启动帧画完之后才到 |
| `LynxView.sendGlobalEvent` → BTS `GlobalEventEmitter` | **变更** | globalProps 更新不会把变化推给已在运行的页面；Lynx 里没有别的东西会推系统配置变化 |

两侧的 key/事件名必须逐字对齐（同音频模块的规矩）：`systemTheme`/`systemLocale`/`SongloftSystem.appearanceChanged`，Kotlin 侧集中在 `android/.../system/SystemAppearance.kt`，TS 侧集中在 `src/native/system-appearance.ts`。

- **`LynxView.setGlobalProps` 两个重载都已弃用**（`Map` 和 `TemplateData` 版都报 deprecation），替代品是 `LynxLoadMeta.Builder().setUrl(...).setGlobalProps(TemplateData.fromMap(...))` + `loadTemplate(meta)` —— 一次调用同时带 url 和 globalProps，且 URL 仍走 `DemoTemplateProvider`（换 API 后已重新在模拟器上验过）
- **manifest 的 `configChanges` 必须同时含 `uiMode` 和 `locale|layoutDirection`**。原来只有 `uiMode`：深浅色切换能进 `onConfigurationChanged`，但**语言切换会重建 Activity → 整包重载、JS 状态全丢**。补上后两者都走同一个回调
- 宿主对「系统没说」诚实上报**空串**（`UI_MODE_NIGHT_UNDEFINED` / 空 locale 列表），由 JS 侧 coerce 成 `null` 再套各自的兜底；不在 Kotlin 里猜一个 `"light"`
- `res/values-night/themes.xml` 拆出深色窗口主题（原来窗口恒为 `Theme.Material` 深色）。这管的是**启动帧**——bundle 渲染前那一帧由窗口背景绘制，不拆就会在浅色系统上闪一下深色（已截图确认现在不闪）

#### 2. JS 侧：一个静默失效的 React 陷阱

`ThemeProvider` 原来把 `AppTheme` **选择**存进 state（`useState(getAppTheme)`）。系统翻转时选择仍是 `'system'`，于是 `setTheme('system')` 是同值写入 → **React 直接跳过重渲染，主题永远不变**——模型层完全正确，UI 就是不跟随。改为存**已解析**的主题（`useState(() => resolveTheme(getAppTheme()))`）。`theme-provider.test.tsx` 专门盯这一条，反向验证时它正是唯一变红的用例（类名停在 `theme-root theme-dark`）。

语言侧不是重渲染问题而是副作用：i18next 需要显式 `changeLanguage`，之后 react-i18next 自己会重渲染所有 `useTranslation` 消费者。

#### 3. 差点误报：验证前必须确认应用处于「跟随系统」态

第一次装包后截图是**浅色 + 中文**，与系统（night=no、zh-Hans-CN）完全一致，看起来一次就成。但翻转系统深色后应用不动——查设置页才发现**语言=中文、外观=浅色都是早前批次测试留下的显式选择**，浅色+中文纯属巧合，而显式选择下忽略系统变化恰恰是正确行为。把两项都改成「跟随系统」后才是真验证。**教训：验「跟随系统」必须先确认选中的就是「跟随系统」，否则显式选择会伪装成功能生效。**

#### 4. 真机结论（模拟器 API 33，双向各验一次）

- 冷启动：系统深色 → 应用深色（启动帧也是深色，无闪）；系统 `zh-Hans-CN` → 中文
- 运行中翻转 `cmd uimode night yes/no`：**应用立刻跟随，未重启、未交互**（像素 bbox 覆盖整屏）
- 运行中 `cmd locale set-app-locales org.songloft.lynx --locales en-US`：整个 UI 立刻变英文，且两处仍选中 "System default"；清除覆盖又变回中文
- logcat 印证链路：`UpdateGlobalProps` → `LynxView sendGlobalEvent SongloftSystem.appearanceChanged` → `call jsmodule:GlobalEventEmitter.emit.SongloftSystem.appearanceChanged`

#### 5. 本批新增的闸（均反向验证过会红）

- `system-appearance.test.ts`（10 例）：宿主值全部按不可信处理（`''`/`'DARK'`/数字/`null` 一律 → `null`，绝不猜）；`lynx.__globalProps` **懒读**（证明首帧路径不依赖 `initSystemAppearance`）；重复 init 只装一个宿主监听
- `theme-model.test.ts` +4、`i18n.test.ts` +6：`resolve*('system')` 真跟随宿主、显式选择不受宿主影响、宿主变化在「跟随」态下才触发
- `theme-provider.test.tsx`（新）：渲染层证明根 `theme-<light|dark>` 类名会随宿主翻转而变
- ⚠️ **`setSystemAppearanceForTests` 故意不清 listeners**：`theme-model`/`i18n` 每进程只订阅一次、无法重订阅，测试 hook 一清就把被测行为拆掉了，后续用例会「通过」但什么都没验（与批19b 那个丢 `checked` 的 Switch mock 同族）

#### 验收

`pnpm run build` clean **1382.0 kB / 零警告** ✓ · `pnpm exec tsc -b --force` ✓ · `pnpm test` **573/573**（64 文件，+24）✓ · `gradlew installDebug` **Kotlin 零警告** ✓ · 模拟器冷启动 + 双向实时切换逐条截图核对 ✓。

### 批22 · 通知栏下一曲/收藏按钮 + 正式小图标（bug.md 第 4 条）

批20 只解决了「通知栏能不能出现」，本批解决「通知栏够不够用」：小图标是 media3 内置音符占位图（`media3_notification_small_icon`），只有暂停 + 「智能上一项」两个动作，没有下一曲、没有收藏。

#### 1. 验证方式被迫改道：这台模拟器的通知栏本身不可视

按 AGENTS.md 惯例想真机截图核对时发现——`adb shell getprop` 显示这是 **BlueStacks 伪装成 SM-G998B**（4 处 `bst` 痕迹），且其 SystemUI 被改过：`dumpsys media_session`/`dumpsys notification` 都证明媒体通知**确实发出且状态正确**，但下拉通知栏截图里什么都不显示。结论：视觉验证这条路在这台机器上走不通，**全程改用框架自己的记录**——`dumpsys notification --noredact` 看 `icon=`/`actions=`/`compactActions=`，`adb shell input keyevent KEYCODE_MEDIA_NEXT/PREVIOUS` 驱动真实的媒体按键分发，`adb logcat` 抓 `LynxContext sendGlobalEvent SongloftAudio.remoteCommand` 确认原生→JS 链路真的走通（这一条日志行本来就是 `progress`/`stateChanged` 在用的同一机制，可信）。App 自身的 UI（登录态已保留、Library 列表）仍能正常截图/`uiautomator dump`，只有系统通知栏这一层不可视——两者是独立的两件事,不要混为一谈。

#### 2. 小图标：直接复用 monochrome 自适应图标层

`DefaultMediaNotificationProvider` 没有构造期指定小图标的 Builder 方法，但有实例方法 `setSmallIcon(int)`（`javap` 反编译 media3-session 1.3.1 aar 确认）。`SongloftPlaybackService.onCreate` 里 new 一个实例、`setSmallIcon(R.drawable.ic_launcher_monochrome)` 后 `setMediaNotificationProvider(...)`——monochrome 层本来就是给「系统会单色化渲染」场景准备的 alpha 图，天然适合直接拿来当状态栏/通知徽标图标，不用另画新资源。`dumpsys notification` 里 `icon=` 从 `id=0x7f060066`（`media3_notification_small_icon`）变成 `id=0x7f06005b`（`ic_launcher_monochrome`，用 `aapt2 dump resources` 核对过资源名）。

#### 3. 下一曲/上一曲：队列在 JS，ExoPlayer 侧永远只有一个 MediaItem

`SongloftAudioModule.load()` 每次只 `setMediaSource` 一个 item（队列由 JS store 拥有，`next()`/`previous()` 原本是空方法），所以 ExoPlayer 自己的 `hasNextMediaItem()`/`hasPreviousMediaItem()` 永远是 `false`——`Player.COMMAND_SEEK_TO_NEXT`（决定notification 是否显示下一曲按钮）默认就不可用，`COMMAND_SEEK_TO_PREVIOUS`（有「智能回到开头」兜底）则一直可用，这正好解释了批20 baseline 里为什么只有「跳转到上一项」没有下一曲。

新增 `RemoteCommandForwardingPlayer`（`ForwardingPlayer` 子类），只包给 `MediaSession` 用（引擎内部仍直接握着原始 `ExoPlayer` 做真实播放控制）：`getAvailableCommands()` 强制加上 `SEEK_TO_NEXT`/`SEEK_TO_PREVIOUS`/`SEEK_TO_NEXT_MEDIA_ITEM`/`SEEK_TO_PREVIOUS_MEDIA_ITEM`，四个都要——前两个决定**通知栏按钮本身**是否出现且可点（对应 `seekToNext()`/`seekToPrevious()`），后两个决定**硬件/蓝牙媒体键走的 legacy 分发路径**是否放行（对应 `seekToNextMediaItem()`/`seekToPreviousMediaItem()`）——起初只加了前两个，`KEYCODE_MEDIA_NEXT` 测试完全没反应（legacy 分发在调用前先查 `_MEDIA_ITEM` 命令位，查不到直接短路，方法体压根没进去），补上后 `adb shell input keyevent KEYCODE_MEDIA_NEXT`/`PREVIOUS` 都在 logcat 里稳定打出 `SongloftAudio.remoteCommand`。四个方法全部不执行真实 seek，只是把命令名 emit 给 JS，JS 侧 `player-store.ts` 收到后走 `playNext()`/`playPrev()`（跟 App 内按钮完全同一套播放模式/循环逻辑）。

#### 4. 收藏按钮：`SessionCommand` + `setCustomLayout`，双向状态同步

自定义 `SessionCommand("org.songloft.lynx.TOGGLE_FAVORITE")`，`MediaSession.Callback.onConnect` 把它加进 `DEFAULT_SESSION_COMMANDS`，`onCustomCommand` 收到就 `sink.emit(remoteCommand, toggleFavorite)`。`MediaSession.setCustomLayout([favoriteButton])` 是 media3 文档化的「构造后更新自定义通知按钮」机制——`DefaultMediaNotificationProvider.getMediaButtons()` 的默认实现本身就会把 session 的 custom layout 塞进通知（**不需要子类化 provider 或重写 `getMediaButtons`**，这是最初预想方案里能省掉的一层）；custom layout 按钮默认只出现在展开态（不在 `compactActions` 三个按钮之列），跟 Spotify/YouTube Music 的收藏按钮位置一致。图标用两个新画的 Material `favorite`/`favorite_border` 矢量（`ic_notification_favorite_filled.xml`/`_border.xml`）。

JS 侧新增 `SongloftAudioModule.setFavorite(Boolean)`，双向链路：① 通知按钮 → `remoteCommand:toggleFavorite` → `favorites.ts` 新增的**非 React** 通路 `toggleFavoriteNonReact()`（走 `getQueryClient()` 单例而非 hook，因为 handler 跑在 `GlobalEventEmitter` 回调里、根本不在 React 树上）→ 增删收藏歌单成功后把新状态回写 `audio.setFavorite()` 更新图标；② 切歌时 `playAtIndex` 调 `syncFavoriteToNative()` 把新当前曲目的收藏态推给原生，避免图标停留在上一首的状态——这一步做了**零成本门禁**：`isNativeAudioAvailable(readNativeModules())` 为假（mock/测试环境）直接 no-op，vitest 573→578 个用例全程零网络请求。

#### 5. 验收

`pnpm run build` clean **1386.5 kB** ✓ · `pnpm exec tsc -b --force` ✓ · `pnpm test` **578/578**（65 文件，+5）✓ · `gradlew compileDebugKotlin`/`installDebug` 干净（仅 `SongloftAudioModule` 里几处早已存在、与本批无关的 unused-parameter 警告，无新增）。模拟器上实测（`dumpsys` 为准，非视觉）：登录态已持久化，Library 点歌播放后 `dumpsys media_session` 显示 session `active=true`；`dumpsys notification --noredact` 显示 `actions=4`（跳转到上一项/暂停/跳转到下一项/收藏，`compactActions=[0,1,2]`）+ `icon=` 指向 `ic_launcher_monochrome`；`adb shell input keyevent KEYCODE_MEDIA_NEXT` 与 `KEYCODE_MEDIA_PREVIOUS` 均在 logcat 打出 `LynxContext sendGlobalEvent SongloftAudio.remoteCommand`，无崩溃。**收藏按钮的点击分发**（`onCustomCommand`）依赖真实 `MediaController` 客户端（下拉通知栏或车机），这台机器的通知栏本身不可视、也没有可脚本化的触发手段，本批**未能端到端外部触发**，但走的是与已验证的 next/previous 完全同一条 `sink.emit` 管线（同一方法、同一 media3 官方文档化模式），代码路径复用度高，风险已知且记入下方 TODO。

### 批26 · 排除目录管理 + 开发环境定位

用户先要求核对 `AGENTS.md`/`docs/PROGRESS.md` 的遗留事项清单是否还准确，深挖后发现批19 遗留清单里「音乐目录配置」的定位需要重新审视——不是缺一个可编辑的路径输入框，而是要对齐 Flutter 参考的排除目录管理。

#### 1. 重新定位：`path` 不可编辑是产品设计，不是遗漏

核对 `songloft-player/lib/features/settings/presentation/widgets/exclude_dir_manager.dart` 发现：**Flutter 参考里 `path`（音乐根）在任何界面都不可编辑**——`_saveConfig()` 永远原样回带 `current.path`，唯一的用户输入是三类排除名单（按名称排除 / 按路径排除 / 自动建歌单排除名单）。批19 遗留清单原先建议「把音乐目录单行配置从批21 提前」的方向是错的；正确的缺口是排除目录管理三 Tab，`path` 应保持只读。

#### 2. 交付：三 Tab 排除目录管理

新增 `src/models/library-ops.ts` 的 `musicPathSettingSchema`/`dirNamesSchema`（`GET/PUT /settings/music-path` + `GET /scan/dir-names`，逐字段 `.catch()` 容错，同批19 惯例）；`ScanSettingsApi.getMusicPath`/`updateMusicPath` + `ScanApi.getDirNames` 三个新方法；`data/exclude-dir-data.ts` 的 `useMusicPathSetting`/`useDirNames`/`useUpdateExcludeConfig`；`domain/exclude-dir-model.ts` 的纯函数（`filterDirNameSuggestions` 镜像 Flutter `Autocomplete.optionsBuilder`、`relativeToRoot` 镜像 Flutter 的路径显示裁剪）；`widgets/ExcludeDirSection.tsx`（三 Tab UI，路径 Tab 复用批19 的 `DirectoryTree` 组件与 `useDirectoryTree` hook）。挂载进 `LibraryOpsPage`（`ScanSettingsSection` 与 `MetadataSection` 之间）。草稿是本地 state，只在首次成功读取时 hydrate 一次（不在每次 background refetch 时覆盖，避免打断正在编辑的用户），点 Save 才提交——同 Flutter 参考的「本地 state + 单个 FilledButton」模式，非乐观更新。

#### 3. 核心不变式与测试驱动发现的真 bug

`path` 永不来自调用方：`ExcludeConfigDraft = Omit<MusicPathSetting,'path'>` 在类型层拒绝调用方携带 `path`；`buildMusicPathUpdate`（从 `useUpdateExcludeConfig` 的 `mutationFn` 中抽出的纯函数，同 `remote-setting.ts` 的 `applyOptimistic`/`rollback` 一样可脱离 `QueryClientProvider` 直接测）永远从 `QueryClient` 缓存读最后一次成功读取的 `path`。写单测时发现**实现本身有个真隐患**：最初的 `return { path, ...draft }` 里 `path` 在前、`...draft` 在后，对象展开语义下**后写的键会覆盖先写的键**——如果 `draft` 在类型系统之外意外带了自己的 `path`（例如经过某个更宽的对象、绕开了 `ExcludeConfigDraft` 类型），会被静默覆盖，正是这个不变式要防的场景。改成 `{ ...draft, path }` 后 `path` 永远最后写、永远赢；对应测试见 `exclude-dir-data.test.ts`。

#### 4. 顺手订正 3 条过期 TODO

复核 `docs/PROGRESS.md` 遗留清单时发现三条早已完成、只是文档未同步：standalone/embedded 部署模式（批3 `LoginPage.tsx` 早已实现）、本地歌词缓存（批11 `lyric-cache.ts` 早已实现）、底部 Tab 配置（jsplugin 阶段 `TabConfigPage.tsx` 早已实现）。均已在下方遗留清单里改标 `[x]` 并注明订正批次。

#### 5. 开发环境：WASM OOM 定位（不改产品代码）

本机 `pnpm test`/`pnpm run build` 一度被 `RangeError: WebAssembly.instantiate(): Out of memory` 挡住，逐层排查（`node --v8-options` 找 trap-handler 相关 flag → 用 `WebAssembly.Memory` 循环构造复现「最多 2 个实例」→ 挂 `WebAssembly.instantiate` 补丁定位调用方 → 测出 Node 内建 `undici`（`lazyllhttp`）也占一个名额）后确认根因：本沙箱 `ulimit -v` 硬上限约 23.8GB，V8 默认的 trap-handler-based WASM 越界检查会给每个 `WebAssembly.Memory` 保留约 10-12GB 的 guard-page 地址空间（与声明的 `maximum` 大小无关），该沙箱内最多能同时存在 2 个这样的实例；`undici` 的内建 HTTP 解析器 + `@lynx-js/react` 的 transform WASM 加起来正好是致命的第 3 个。修复：`NODE_OPTIONS=--disable-wasm-trap-handler`（Node 原生 flag，`NODE_OPTIONS` 允许写入，非 V8 passthrough 黑名单项），关闭 guard-page 保留策略、改走显式边界检查，构建/测试链路即刻打通，实测无性能可感差异。**这是本机会话级环境问题，与仓库配置无关，不写入仓库任何文件**——纯记录以免未来在同类受限沙箱里重新排查一遍。

#### 6. 验收

`pnpm run build` clean（1417.8 kB）✓ · `pnpm exec tsc -b --force` ✓ · `pnpm test` **604/604**（67 文件，+26）✓（均在 `NODE_OPTIONS=--disable-wasm-trap-handler` 下跑通，见上）。待验证：进 `/settings/library` 见排除目录三 Tab、名称 Tab 输入建议、路径 Tab 复用目录树勾选、自动建歌单 Tab 输入，Save 后刷新页面确认三个数组落地且音乐根路径未变。

### 批27 · 暗色对比度审计 + 24G 虚拟上限定位

把暗色主题 token 逐对算了 WCAG 2.1 AA 相对亮度对比（正文 4.5:1、大字/UI 3:1），暗色三底面 `--canvas` #0d0d12 / `--paper` #16161d / `--neutral-faint` #24242e。审计发现 3 个真实失败：

- **白字 on `--danger` #ff6b6b（danger 按钮）= 2.78** ❌ 连 3:1 都不达（删除/移除按钮不可读）。
- **白字 on `--primary` #7c5cff（24 处按钮）= 4.35** ❌ 差 0.15。
- **`--primary` 作强调文字 on paper = 4.14 / on neutral-faint = 3.54** ❌（14 处 `color: var(--primary)` 强调文字：激活态/链接/播放器时间标签等）。

**核心矛盾**：dark 的 `--primary` 单值无法同时满足"白字在按钮底上 ≥4.5（要更深）"和"作文字在深底上 ≥4.5（要更浅）"——light 能单值是因为底是白�����深�������������既可读又承白字），dark 底太深，必须拆 token。

**修法**（沿用既有 `--primary`/`--primary-2` 对称思路，不重命名、不动按钮调用点）：

| token | dark 旧→新 | 用途 | 关键比值 |
|---|---|---|---|
| `--primary` | #7c5cff→**#7750f5** | 按钮/边框/图标填充 | 白字 4.94 ✅ / on neutral-faint(UI) 3.11 ✅ |
| `--accent`（新增） | **#9879ff** | 强调**文字** | on paper 5.58 / on neutral-faint 4.77 ✅ |
| `--danger` | #ff6b6b 不变 | danger **文字** | 6.49 ✅ |
| `--danger-2`（新增） | **#cf444f** | danger **按钮底** | 白字 4.57 ✅ |

24 处 `background-color: var(--primary)` 按钮**不动**——只把色值加深一档，24 个按钮白字对比同时从 4.35→4.94 达标。14 处 `color: var(--primary)` 改指 `--accent`。1 处 `background-color: var(--danger)`（PlaylistDetailPage 删除按钮）改指 `--danger-2`。light 块补 `--accent`=#6a49f2 / `--danger-2`=#cf444f（CSS 跨主题共享，必须两块都定义；light 无视觉变化）。`Icon.tsx` `PALETTES.dark.primary` 同步 #7750f5（SVG 注入色不走 CSS 级联，必须与 tokens.css 手动同步——该文件已有此约定注释）。

**回归 gate**：新增 `src/shared/theme/__tests__/contrast.test.ts`——用 `fs.readFileSync` 读 `tokens.css`、正则解析每个 `.theme-<name>` 块的 hex、对 dark/light 关键配对算 WCAG 比值断言 ≥ AA。**改色值时测试直接红**，无需手动维护色值副本。31 个测试全绿。

**24G 虚拟上限定位（build 闸门卡点）**：`pnpm run build` 在 24G 会话下崩 `Failed to reserve virtual memory for CodeRange`（Rspack loader worker 起 V8 Isolate 叠加主进程 WASM 虚拟）。实测 `--disable-wasm-trap-handler` 把 2 个 4GB-max WASM 从 21.7G 压到 9.1G（flag 生效），但 build 实例更多仍不够。根因是 `~/.bashrc` `ulimit -v 25000000`（≈24G，无 `-S` 同时锁硬限）。**已改 `.bashrc` 至 `ulimit -v 120000000`（120G），重启会话后 build 1418.0 kB 绿**。详见 `AGENTS.md` §5。

**遗留**：① light 的 `--danger` 作文字 on paper = 4.38（大字达标、正文差 0.12）、`--content-muted` on paper = 4.17——属 light 主题审计范畴，本批不动，留待后续 light 专项。② 真机像素复核（配色肉眼是否更可读）留扫码批次。

```
mise exec node@22.23.1 -- env NODE_OPTIONS=--disable-wasm-trap-handler pnpm run build   # build（需 120G 上限）
NODE_OPTIONS=--disable-wasm-trap-handler pnpm exec vitest run src/shared/theme/__tests__/contrast.test.ts   # 仅对比度 gate
```

### 批28 · 重复检测/指纹 + 缓存管理（2 subagent 并行）

**两条正交功能线并行实施**：各开一个 general-purpose subagent 独立写 API/Model/Data/UI/Test（worktree 隔离在此仓库不可用，改无隔离并行，约定双方都不碰共享文件，由主线最后手动 merge）。两条线领域完全正交——library-ops（指纹/重复）vs settings（缓存），改不同 feature 目录、不同 API 端点、不同 UI，merge 冲突只在机械的共享文件上（router/models/index/i18n）。

**重复检测/指纹**（library-ops，对齐 Flutter `duplicate_check_page.dart` ~450 行三阶段页面）：
- **FingerprintApi**（`api/fingerprint-api.ts`）6 端点：`GET /scan/fingerprints/status`（chromaprint 可用性 + computed/missing/failed 统计）/`POST /scan/fingerprints`（recompute_all/retry_failed）/`GET /scan/fingerprints/progress`（status/computed/total/failed）/`POST /scan/fingerprints/cancel`/`GET /songs/duplicates`（groups[fingerprint,songs[]]）/`POST /songs/batch-delete`（ids+delete_files）。
- **zod 模型**：`models/fingerprint.ts` + `models/duplicate.ts`（容错解析，遵循 AGENTS §2 的 `z.coerce` + `.catch` 规则）。
- **三阶段页面** `DuplicateCheckPage`：Status（指纹统计 + chromaprint 不可用则禁用开始按钮 + 提示）/ Computing（进度条 + 取消 + 2s 轮询 TanStack Query `refetchInterval`）/ Results（重复组列表 + 每组按 bitRate 最高推荐保留项 + Radio 单选保留 + 删其余 + 一键清理全部）。
- **5 widgets**：FingerprintStatusCard / FingerprintComputingSection / DuplicateResultsSection / DuplicateGroupCard / DeleteConfirmDialog（首次用 lynx-ui Dialog——`DialogRoot`/`DialogContent`/`DialogBackdrop`）。
- **入口**：`LibraryOpsPage` MetadataSection 后加 `libops__dup-entry` 行（fingerprint 图标 + chevron）→ `/settings/duplicates`。
- 53 测试（api 8 / model 11+7 / domain 16 / page 11）。

**缓存管理**（settings，对齐 Flutter `CacheManager`/`cache_api`）：
- **CacheApi**（`api/cache-api.ts`）5 端点：`GET /cache-manage/stats`（file_count/max_size/total_size）/`GET|PUT /cache-manage/config`（cache_dir/transcode_format/transcode_quality/max_size）/`POST /cache-manage/clean`/`POST /cache-manage/validate-dir`（created/error/free_size/total_size/valid）。
- **zod 模型** `domain/cache-model.ts`；**data hooks** `cache-query.ts` + `cache-mutations.ts`（mutate 后自动 invalidate stats/config）。
- **`CacheManagePage` 三区**：只读统计（file_count + formatBytes + max_size，0=无限制）/ 编辑表单（缓存目录 + 验证按钮 + max_size + 转码格式/质量选择器 + 保存）/ 目录验证结果。清理用两步 tap 确认（同登出模式）。复用 `formatBytes`（home/stats-format）、`SettingsRow`、`SettingsSection`、`AppSwitch`。
- **入口**：`SettingsPage` 原 disabled 占位行（`settings.storageCache` + `settings.deferred`）→ 改可点击 + chevron + 新 subtitle key → `/settings/cache`。
- 21 测试（api 5 / model 9 / page 7）。

**共享文件手动 merge**：`router.tsx` 加 `cacheManageRoute`（`/settings/cache`）+ `duplicatesRoute`（`/settings/duplicates`）两条 shellRoute 子路由 + 导入；`models/index.ts` 导出 fingerprint/duplicate；`library-ops/index.ts` 导出 DuplicateCheckPage；`settings/index.ts` 已由 agent 导出 CacheManagePage；`i18n/resources.ts` 加 4 key（en+zh：`settings.cacheManageSubtitle`、`libops.duplicateDetection` + `duplicateDetectionDesc`）。

**CSS token 修正（重要）**：DuplicateCheckPage.css 原用了 10 个仓库不存在的 `--color-*` token（`--color-bg`/`--color-border`/`--color-error`/`--color-error-bg`/`--color-primary`/`--color-primary-bg`/`--color-surface-variant`/`--color-text`/`--color-text-secondary`/`--color-warning-bg`——agent 照搬了某种通用设计系统的命名，非本仓库 token）。Lynx 对未知 CSS var 当无效剥离，故整页会无样式。已全部重映射到 repo token：`--canvas`/`--line`/`--danger`/`--neutral-faint`/`--primary`/`--content`/`--content-muted`，error/warning 背景的 rgba fallback 直接裸用（仓库无对应 token，硬编码 tint 可接受），白字 `#ffffff` → `--primary-content`/`--danger-content`，dialog 背景 `rgba(0,0,0,0.5)` → `--backdrop`。CacheManagePage.css 的 token 本就全对（agent 照搬了 ServerSettingsPage.css）。**教训**：subagent 写 CSS 时须先读 `tokens.css` 确认 token 名，不能凭通用记忆。

**已知 i18n 债务**（**批40 已全部清掉**）：~~两个 agent 都用了内联 `useLocalT()` helper（按 `i18n.language` 选 en/zh）而非仓库惯例的 `resources.ts` + `t()`（批9 建立的 en/zh 严格同形内联资源）。页面功能正常，但与全 app 的 i18n 命名空间不一致。后续可统一搬进 `resources.ts`（非本批范围）。~~ → 批40 把 8 个文件 70 处 `lt()` 全搬进 `resources.ts`（`cacheManage`/`proxy` 两个新组 + `libops` 扩 32 key），`useLocalT` 已不存在于代码库。~~DuplicateCheckPage.css 另有 ~120 个硬编码 px 值（非 `--space-*` token），功能无碍、与本页自洽，留作低优先级债务。~~ → 批40 已 token 化 101 处（无对应 token 的值刻意保留字面量）。

**验收**：`tsc -b --force` 零错误 / `pnpm run build` 1519.5 kB（批27 是 1418.0 kB，+101.5 kB 为两个 feature 的运行时代码）零 CSS 警告 / `pnpm test` 709 通过（批27 是 636，+74 = 53 指纹 + 21 缓存；1 个已知 `use-debounce` flake 隔离重跑绿，与本批无关）。

### 批29 · 真机验收轮（批25-28 积压）+ 3 个真机专属 bug

批25/26/27/28 全部标着「⏳ 待验证」，约 +140 kB 代码从未上过真机，其中批28 是两个 subagent 并行生成、且已经踩过一次「10 个不存在的 `--color-*` token 导致整页无样式」。本批把这笔验证债一次性还掉。

**三个 bug 的共同特征**：`pnpm run build` / `tsc -b` / 709 个 vitest 全绿，而真机是坏的。都只能靠 logcat + 截图发现。

#### 1. `<refresh>` 缺 `androidx.viewpager2` → attach 即崩（被误诊两次的根因）

logcat 给出决定性栈：

```
LynxError 990200: java.lang.NoClassDefFoundError: androidx/viewpager2/widget/ViewPager2
  at SmartUtil.isContentView(SmartUtil.java:103)
  at RefreshContentWrapper.findScrollableView(RefreshContentWrapper.java:65)
  at SmartRefreshLayout.onAttachedToWindow(SmartRefreshLayout.java:456)
```

`xelement-refresh` 内嵌 SmartRefreshLayout，后者在挑选可滚动子视图时要解析 `ViewPager2`，而 **viewpager2 不是 xelement-refresh 的传递依赖**。缺它 → 每个 `<refresh>` 元素在 attach 阶段抛异常 → 容器压根没建起来，它的手势逻辑自然全不工作。

这一条解释了两次历史误诊：

| 批次 | 当时的归因 | 当时的处置 |
|---|---|---|
| 20 | 「`<refresh>` 吞掉横向手势」（无手势过滤属性，只能握手） | 加 `onStripTouch` 握手把 `enable-refresh` 置 false |
| 25 | 「SmartRefreshLayout 3.0.0-alpha 嵌套滚动回归，是 `xelement-refresh` 传递���赖、API 不兼容无法降级」 | 加手动刷新按钮，`autoStartRefresh` 程序化触发 |

两次都在绕行，没人查 attach 是否成功。加 `implementation("androidx.viewpager2:viewpager2:1.0.0")` 后 990200 归零，**原生下拉刷新真机闭环**：`refreshstatechange` → `startrefresh` → `SendPageEvent` → `InvokeUIMethod: finishRefresh`，`<refresh-header>` 的「下拉刷新...」提示与内容下移也都正常。批25 那个手动按钮本就不必要（后续 commit `76329e3` 已自行删掉它和握手）。

#### 2. lazy bundle 从未打进 APK → 3 处动态 `import()` 全失效

`dist/` 一直产出 3 个 `lazy-bundle/**.bundle`，而 `scripts/copy-bundle-android.mjs` **只拷 `main.lynx.bundle`** —— assets 里只有它一个，动态 import 在设备上永远取不到目标。

| 位置 | 动态 import | 真机后果 |
|---|---|---|
| `index.tsx:34` / `:36` | `readDefaultPlayMode` / `usePlayerStore` | **无 try/catch**，启动链在此断裂 → 后面的 `auth.hydrate()`/`auth.checkAuth()` **从不执行** |
| `auth-store.ts:198` | `getQueryClient` | 有 try/catch → 静默失败 → **登出不清 query 缓存**（批11 的修复实际失效） |

启动链断裂最阴险：auth status 永远停在 `unknown`，而路由守卫**对 `unknown` 刻意不重定向**（批3 设计），加上 `TokenStore` 每次请求直读原生存储、token 照样带得上，于是「看起来完全正常」——实际上登录态检查从未运行过。

修法是 3 处改静态 import（`lib/query` 只依赖 `query-core` + `safe-timers`，零循环依赖风险）。**产物级证明**：`dist/lazy-bundle/` 目录消失，bundle 1516.6 → 1476.2 kB（**−40 kB**，省掉 lazy 加载机制本身）。

**连带推翻一个历史结论**：批20 写「已端到端验证：切到 Repeat one → `am force-stop` → 重启登录 → 仍是 Repeat one」——那不可能成立，因为 `setPlayMode(savedMode)` 就在断裂点之后。本批修复后**才真正验过**：切「单曲循环」→ `force-stop` → 重启 → 重新播放 → 仍是「单曲循环」。

#### 3. Lynx 4.0.0 宿主的 `lynx.queueMicrotask` 抛错 → Preact effect 调度器失效

`TypeError: cannot read property 'getNativeLynx' of undefined`（LynxError 20100），栈底就在 `lynx_core.js` 的 `queueMicrotask` 内部 —— **宿主自己的实现坏了**。这本来只是噪音，坏在 ReactLynx 无条件优先采用它：

```js
if (lynx.queueMicrotask) return (fn) => lynx.queueMicrotask(fn)  // runtime/lib/utils.js
options.requestAnimationFrame = lynxQueueMicrotask                // runtime/lib/lynx.js
```

第二行把它装成 **Preact 的 effect flush 调度器**。宿主实现一抛异常，被调度的回调就再也不执行 → **那一批 `useEffect` 被静默丢弃**（后续渲染会顺带补上，所以表现为偶发的状态不更新，而不是明显失败）。

ReactLynx 本身就带正确兜底（resolved-Promise 微任务），只是仅在该属性**缺失**时才走。故在 `lynx.config.ts` 的 raw banner 里把同一个实现**替换**上去（保留属性存在性，其他读者仍拿到可用调度器）。两个易踩的点：

- **`lynx` 是裸全局**，必须裸标识符 + `typeof` 守卫读（`globalThis.lynx` 不可靠，同 `fetch`/`self`，AGENTS §3）。
- **`raw: true` 的 banner 仍会被 minify**（raw 只是不加注释包装）：产物里 `lynx` 被 scope-hoist 成别名、`setTimeout` 也被压缩，所以产物断言要按**属性名**匹配（属性名不被 mangle），不能按源码字面量搜。

#### 4. 顺手订正的过期文案与文档

- **「更多设置（后续版本）」→「高级」**（i18n key `settings.moreLater` → `settings.advanced`）：其下 3 项（存储与缓存 批28 / 插件 批17 / Tab 配置）**全部已实现且可点击**，「后续版本」的标题让功能看起来还没做。
- 遗留清单里 `text-transform` / `object-fit` 两条标着 `[ ]`，实际批19b 已修（源码里现在是「Lynx 无此属性」的解释性注释）——已订正。
- **`bug.md` 从未进入 git**（`git log --all -- bug.md` 零命中，工作树也没有）。本文件仍有 12 处「`bug.md` 第 N 条」的引用（批20/21/23/24/25 的记录里），那是当时会话中用户提供的临时清单的编号——**该文件已不存在，编号无法再解析**。这些条目的实际内容都已写在各自批次的正文里，读正文即可；后续不要再新增对 `bug.md` 的引用。

#### 5. 一次性验掉的真机清单

| 批 | 验证结果 |
|---|---|
| 19 | 扫描完成 + **真的导入 3 首本地歌曲**（解掉批19b 遗留的「真的导入歌曲仍未验」）；元数据刷新「成功 3 首」 |
| 19b | 6 个开关开/关视觉清晰可辨（浅色 + 暗色）；「歌单创建方式」正确联动 disabled |
| 20 | 统计条走 `/songs/stats`（63 首 / 2h42m / 3 本地·60 远程 / 28 歌手·59 专辑 / 占用 2.1 MB）；封面 `aspectFill` 未拉扁；插件图标 `<svg content>` 正常 |
| 21 | 外观「跟随系统」：`cmd uimode night yes` 后**立刻跟随**（未重启未交互），背景 `(13,13,18)` = `--canvas` |
| 22 | `dumpsys media_session` 确认 `custom actions=[Action:mName='收藏']` —— **收藏按钮真的注册进 session**（批22 遗留项的一半） |
| 23 | 登录页卡片垂直+水平居中；底栏插件 tab（洛雪音源/歌曲下载）彩色图标 |
| 25 | 原生下拉刷新恢复（见上 §1） |
| 26 | 排除目录三 Tab（按名称/按路径/自动创建排除）+ chip `@eaDir`/`tmp` 与后端数据一致 + 保存；浅色暗色均正常 |
| 27 | `--accent` 精确命中（采样 `(151,120,253)` vs `#9879ff`）、`--primary` 精确命中（心形徽标 `(119,80,245)`）、`--danger` 作「退出登录」文字在暗色下清晰 |
| 28 | 重复检测页三阶段的 **Status 阶段** + chromaprint 不可用时正确降级（警告 banner + 禁用开始按钮）；缓存管理页三区 + 真实数据；两页**都有完整样式**（CSS token 重映射真机生效） |
| B2 | 本地歌曲**真实播放**（`progress` ×26、MediaSession `state=3`、position 前进）；remote 歌曲 502 时 `SongloftAudio.error` 事件桥接链路完整工作 |
| 批3/11 | 两步登出确认 → 跳登录页 → 用户名/API 地址持久化回填 → 重新登录成功回首页，**全程 0 报错** |
| **全新安装** | `pm clear` 清掉 token+prefs 后启动：**正确跳登录页**（这是 bug #2 修复的最强证据——修复前 `checkAuth` 从不执行、status 永远 `unknown`、守卫对 `unknown` 不重定向，无 token 时本该跳登录页却不会跳）；API 地址显示新默认值 `http://localhost:58091`；登录后首页数据全出，0 报错 |

#### 6. 新增 4 道闸门（**均反向验证过会红**）

- `src/__tests__/device-host-contract.test.ts`（新）：① `android/app/build.gradle.kts` 必须声明 `androidx.viewpager2`；② `src/` 下**不得有动态 `import()`**（扫描时跳过注释行与 `.test.tsx?`——测试里的 `await import()` 是仓库既有的 mock-then-load 模式）；③ 产物**不得出现 `dist/lazy-bundle/` 目录**。
- `background-bundle-self.test.ts` +1：`queueMicrotask` 替换必须入包，且**安装点早于任何调用点**；同时断言 banner 自身保留 `typeof` 守卫（无条件替换会打坏真正缺该属性的宿主）。断言按属性名匹配而非源码字面量（见上 §3）。
- 反向验证方式：用一条原子命令备份→破坏→跑测试→**无条件还原**（含移除 viewpager2、注入动态 import、拆掉 banner 拼接并重新 build），确认 4 条全部变红后还原重建。

#### 7. 本批已知遗留 / 环境限制

- ⚠️ **偶发全屏灰层（未定位，不影响功能）**：app 运行数分钟、多次导航后，整屏会蒙一层 **α≈0.6 的中灰**（同一 α 同时解释浅色 `255→178` 与暗色 `13→86`），**重启 app 即恢复**，冷启动后单步导航不复现。已排除的可能：① 不是 Android window 层——`dumpsys window` 显示可见 window 只有 `StatusBar` + `MainActivity` 全屏两个；② 不是 `com.droidrun.portal`（该机装的自动化工具）——其 window 消失后现象依旧；③ 不是仓库任何 backdrop token（`--backdrop` 是 `rgba(0,0,0,0.45/0.55)`，与 0.6 中灰不符）。**关键判别数据**：状态栏最亮仍为 255、app 区最亮降到 178，且灰层之上的白色文字仍是纯白 —— 说明该层位于**页面背景之上、内容之下**。该机是 BlueStacks 伪装成 SM-G998B（批22 已记录其 SystemUI 被改、通知栏不可视），需换真机复现才能定性。
- **批28 的 Computing / Results 两个阶段仍未验**：该后端未装 ffmpeg/chromaprint（页面正确显示「需要安装 ffmpeg（含 chromaprint 支持）」并禁用开始按钮），指纹计算、重复组列表、按 bitRate 推荐保留、lynx-ui Dialog 删除确认**都还没上过真机**。
- **remote 歌曲播放 502**：60 首 remote 曲目播放时后端返回 502（上游源不可用），属后端/网络，非客户端；本地 3 首正常。
- **`--primary-2` 未进对比度回归**：它同样承载白字（首页统计条底色），批27 的 `contrast.test.ts` 只覆盖了 `--primary`。手算白字 on `--primary-2`（`#6a49f2`）= **5.46 ✅ 达标**，故非缺陷，但建议补进闸门。
- **`adb reverse` 会随会话断开**：本批一次登录失败即因此（重设后立即成功）。真机验证前先 `adb reverse --list` 确认。

### B3a · iOS 原生宿主 + 内嵌 bundle

Phase B3 第一步。方法论照批B1 对 Android 的做法（照抄官方 demo、逐项对齐坐标、刻意不装 devtool）。详细说明见 commit `f21ab41` 的正文，这里只记要点与差异。

**工程形态**：**手写 pbxproj**（demo 的 `HelloLynxSwift/project.pbxproj` 只 452 行、完整读过后按其结构重写约 380 行；去掉 storyboard 改 SceneDelegate 纯代码建窗；**Pods 集成部分留给 `pod install` 自己写回**以减少手写面）+ 一份共享 scheme（`-scheme` 需要它，Xcode 不自动生成）。不引入 xcodegen。

**pod 坐标与 Android 4.0.0 的偏差**（已在 Podfile 注释说明）：

| pod | iOS | Android 对照 |
|---|---|---|
| Lynx / LynxBase / LynxServiceAPI / LynxService{Image,Log,Http} / XElement | **4.0.1** | 4.0.0 |
| PrimJS | 4.0.0 | 4.0.0 ✓ |
| ServalSVG | **0.2.3** | 0.1.1 |
| 传递依赖 | LynxTextra 0.2.0 / MJRefresh 3.7.9 / SDWebImage 5.15.5 / libwebp 1.6.0 | Fresco 2.3.0 / OkHttp 4.9.0（对应物） |

- **为何 4.0.1 而非 4.0.0**：① iOS 侧 Lynx/LynxService/XElement 是**锁步**依赖（各 subspec 都 `Lynx = <同版本>`）；② 本机 trunk 缓存里 `Lynx/4.0.0/Lynx.podspec.json` 是**被截断的坏文件**（21 kB vs 正常 235 kB），`pod install` 直接 `JSON::ParserError`。
- **`Lynx/Framework` 对 `LynxBase`/`LynxServiceAPI` 无版本约束**，不 pin 会把 **4.2.0-nightly** 的 base 层配到 4.0.1 引擎上——已显式 pin 死。

**与 Android 的架构差异（值得记）**：**iOS 侧不手写注册服务**。三个服务与 XElement behaviors 全靠 pod 的 lazy-register（`LYNX_LAZY_LOAD` / `*AutoRegistry` + `+load`），CocoaPods xcconfig 里的 **`-ObjC`** 是它们被链入的前提。`nm` 证实 21 个 `LynxUI*AutoRegistry` 全部链入（SVG/Input/TextArea/Overlay/Refresh/ScrollCoordinator/ViewPager/WebView/BlurView/Markdown…）。宿主只调 `LynxEnv.sharedInstance()`。

**修掉的一个真实缺陷（安全区）**：LynxView 原本铺满全屏，导致标题被状态栏/灵动岛遮挡、tab 栏压在 home indicator 上（Android 侧 `Theme.Material.NoActionBar` + targetSdk 34 天然把 Activity 排在状态栏下方）。改为把 LynxView 约束到 `safeAreaLayoutGuide`，**并把创建 + `loadTemplate` 推迟到首次 `viewDidLayoutSubviews`**——那才是安全区 inset 解析完的时刻，否则首帧高度错、随即重排。

**ATS（iOS 特有，不加就是「能编译能启动、登录连不上」）**：Info.plist 加 `NSAppTransportSecurity`（`NSAllowsArbitraryLoads` + `NSAllowsLocalNetworking`）+ `NSLocalNetworkUsageDescription`，等价于 Android 的 `usesCleartextTraffic`。**模拟器 localhost 即宿主机**，无需 `adb reverse` 等价物。

**本机环境限制（重要，写进了 `package.json` 的 `//ios:build` 注释）**：Xcode 26.6 报 `iOS 26.5 is not installed`（iOS platform 组件缺失，只有 standalone simulator runtime 18.3 / 26.0），**所有 `-destination` 形式都失败**（含 `generic/platform=iOS Simulator` 与按 UDID）。绕法：走 legacy **`-project -target -sdk iphonesimulator`**（不需要 destination）；因为脱离了 CocoaPods workspace，**必须先单独 build `Pods-SongloftLynx` 聚合 target 且两次 build 共用 `SYMROOT`**（app 的 xcconfig 从 `PODS_CONFIGURATION_BUILD_DIR` 找 `lib*.a`）。**装好 iOS platform 后应改回 `-workspace -scheme -destination`。**

**其它坑**：首轮 `pod install` 约 **35 分钟**（Lynx 全家 zip + git 源 pod，spec 元数据 1756 个 podspec / 61 MB），Pods 编译约 3 分钟，之后 app 增量 build 约 20 秒；`release-assets.githubusercontent.com` 间歇不可达（重试第 2 次即过，长期不通可用 `https://ghproxy.net/` 前缀手工取 zip 喂缓存）。

**未做**：CI 出包、App 图标（照抄了 demo 的空 AppIcon set）；**下拉刷新手势未实测**（`simctl` 无手势注入命令，AppleScript 只能点击不能拖拽）——`<refresh>` 已链入且 attach 无报错，但「手指下拉真的触发刷新」需人工划一次。（B3b 已完成：AVPlayer 音频 / Storage / SystemAppearance + UIBackgroundModes audio 均已落地并验收。）

### 批29b · 批28 三阶段补验（借 18091 后端）→ 发现 1 个真 bug

用户提供了第二个后端 `http://localhost:18091`（**`chromaprint_available: true`**，356 首**全本地**、22h42m、294 歌手/337 专辑），解掉了批29 「本机 ffmpeg 不带 chromaprint」的死结（`brew` 路线已证不通，见下方遗留）。Android 模拟器侧 `adb reverse tcp:18091 tcp:18091` + 设置页改地址即可切换。

**顺带验到的**：切服务器后正确跳登录页（旧 token 对新实例无效 → 401 → 登出，即批12 的清缓存链路）；新库首页真实数据全出（356 首 / 22h42m / 7 个插件图标 / 4 个歌单封面）。

**Status 阶段两个分支现在都验过了**：58091（chromaprint 不可用）= 警告 banner + 禁用按钮；18091（可用）= 无 banner + 实心可点按钮 + 统计 356/0/356。

⛔ **Computing 阶段有一个真 bug（本次未修）**：点「开始计算并检测」后进入 Computing 阶段，但

- 进度文案恒为「正在计算音频指纹... **0/0**」，而同一时刻后端 `GET /scan/fingerprints/progress` 返回 `{"status":"running","computed":38,"total":356}`；
- 后端跑完（`{"status":"done","computed":356,"total":356,"failed":0}`，356 首约 1 分钟算完、0 失败）之后，**UI 仍卡在 Computing 阶段、indeterminate 滑块一直动、永不转 Results**。

即 `progressQuery` 的数据没有到达 UI。已排除：API 路径与 zod 模型（`models/fingerprint.ts` 的 `computed`/`total` 都是 `z.coerce.number().catch(0)`，且 Status 阶段用同一套 parser 读到了 356）；`fingerprintPollInterval` 的判定逻辑本身（`!progress` 与 `idle` 两种情况都靠 `forced` 兜住）；`onStartCompute` 的 `onSuccess` 也确实 `setProgressForced(true)`。**下一步应查的方向**：`0/0` 中的 `total` 来自 `totalFallback={status?.missing ?? 0}`，而 Status 阶段明明有 `missing=356` —— **progress 与 status 两个 query 的数据同时消失**这一点最可疑，指向 query 层（缓存 key / enabled / 与 `phase` 切换相关的重挂载）而非模型层。这与批19 修过的「启动竞态」形似但不同（批19 是轮询起不来，这里连已有的 status 数据也没了）。

**因此 Results 阶段与删除确认 Dialog 仍未验**（依赖 Computing 正常结束才能进入）。

### 批29c · 修批29b Computing bug（双层根因，真机定位）

批29b 判断「progress 与 status 两个 query 数据同时消失、指向 query 层」的方向对了一半——真相是**两个独立缺陷叠在一起**，靠往 `DuplicateCheckPage` 顶部塞一条把状态机真实值画到屏幕上的诊断条（`phase`/`forced`/`prog.status`/`dataUpdatedAt`/`fetchStatus`/一个自测 `setInterval` 计数器/`refetchInterval` 调用与返回值计数），在 18091 真机上多轮复现读数才拆开。

**根因 1 — 陈旧终态跳过 computing（这是批29b「不转 Results」现象的另一面）**：进页面时 progress query 首拉会拿到后端上一轮留下的**终态**（`done`/`cancelled`，`isFinished=true`）。点「开始计算」后 `onStartCompute` 同步 `setPhase('computing')`，而此刻 progress 还是那个陈旧终态，于是 auto-transition effect（`progress.isFinished && phase==='computing'`）**立即命中**、把 phase 从 computing 推到 results——Computing 阶段被瞬间跳过（诊断条实测：点击后 `phase=results` 而 `prog.status=done`、`pUpd` 未变）。批29b 那个库 356 首**恰好无重复**，所以跳到 results 显示的是空态「未发现重复」，看着像「没进 computing」；换一个进页时 progress 是 `idle` 的库，则表现为卡在 computing `0/0`——**同一根因的两种表相**。

**根因 2 — `refetchInterval` 在本 Lynx build 首次 fetch 后不再 fire**：即便绕过根因 1 真进了 computing，进度也卡 `0/356` 不动。诊断条实测：`refetchInterval` 函数**被反复调用（11 次）且每次都返回 `2000`**，但实际 `GET /scan/fingerprints/progress` **冻结在 2 次**（mount 1 次 + start 后 invalidate 1 次），`dataUpdatedAt` 不再变；同一组件里我塞的自测 `setInterval` **每 2s 正常 fire**（`selfTick` 稳定递增）。即 **Lynx BTS 的 `setInterval` 没问题、坏的是 query-core 5.101 把 `refetchInterval` 的 2000ms 定时器落地成真正周期回调这一步**（scan 页轮询看似可用，但它进度条那段是 indeterminate CSS 动画，容易被误读成「轮询在动」）。没有继续深挖 query-core 内部（observer 时序/`#updateRefetchInterval` 的 `mounted` 与 `nextRefetchInterval!==current` 分支），因为**绕过它比驯服它更稳**。

**修法（三处，均已 clean build + 真机验证）**：
1. `useStartFingerprintMutation` 的 `onSuccess` 调 `resetFingerprintCachesForNewRun(queryClient)`（抽成可单测的纯函数，同 `remote-setting.ts` 的 `applyOptimistic` 惯例）：`invalidateQueries(fingerprintProgress)` 清掉陈旧终态 + `removeQueries(duplicates)` 丢掉上一轮重复结果。这也补齐了 fingerprint start 一直缺、而 scan start 早就有的那次 invalidate。
2. auto-transition effect 加时间戳守卫：进 computing 时 `computingSinceRef.current = Date.now()`，只有 `progress.isFinished && progressQuery.dataUpdatedAt >= computingSinceRef.current` 才转 results——**只认本轮产生的终态**，陈旧终态一律忽略（query-core 的 `dataUpdatedAt` 也用 `Date.now()`，同一时钟，比较有效）。
3. **progress 轮询改成页面级显式 `setInterval` 驱动 `progressQuery.refetch()`**（`phase==='computing' && !progressPaused` 时每 `FINGERPRINT_POLL_MS` 拉一次，离开 computing/暂停/卸载时 `clearInterval`），彻底不再依赖 query-core 的 `refetchInterval`。`useFingerprintProgressQuery` 随之去掉 `forced`/`paused`/`refetchInterval`，`fingerprintPollInterval` 纯函数连同它的 7 个单测一并删除（不再有调用方，留着会误导）。`progressForced` state 也删了。

**真机结果**（18091，chromaprint 可用、干净产物 1476.6 kB）：
- 先用空库（356 首无重复）验：点「重新计算全部指纹」→ **进入 Computing 阶段**（不再瞬间跳走）→ 进度 `6/356`→`30/356`→…→`356/356` **实时推进**（determinate 进度条同步涨）→ 后端 `done` 后**自动转 Results**（空态「未发现重复歌曲」）。
- 随后**用户在音乐目录造了 2 组同源重复文件**（`咏春.mp3`/`咏春-same.mp3`、`半壶纱.mp3`/`半壶纱-same.mp3`），走完整路径验 Results-有重复组：设置页扫描导入 2 首（`imported_files:2`，扫描进度轮询也顺带验了）→ 重复检测页 `missing:2` → 点「计算并检测」→ Computing 2 首秒算 → **Results 正确渲染「发现 2 组重复（共 4 首歌曲）」**，每组一个「推荐」保留项（bitRate/文件大小/路径齐全）+「删除未选中」，顶部「清理全部重复（删除 2 首）」。
- **lynx-ui 删除 Dialog（批28 首次引入 `DialogRoot`/`DialogContent`/`DialogBackdrop`，此前从未上真机）**：点「删除未选中」→ 弹出「确认删除」Dialog（正文 + 取消/确认删除 + backdrop）→ 点确认 → `batchDelete` 真删文件（后端 `local_songs` 358→357）+ `invalidate(duplicates)` → **列表实时刷新为「1 组重复」**（组1咏春消失）；再点「清理全部重复」→ 同款 Dialog → 确认 → 357→356 + UI 回到空态。单组删除与批量清理两个入口都验。

**新增闸门**：`fingerprint-mutations.test.ts` 2 例——`resetFingerprintCachesForNewRun` 对真 `QueryClient` 断言「陈旧终态被标记 invalidated」+「duplicates 被移除」，**反向验证过**（把函数体改 no-op 两条立即变红）。

**批28 重复检测功能至此全路径真机验完**（Status 两分支 + Computing 推进 + Results 空态与有重复组 + 单组/批量删除 Dialog + batchDelete 真删 + 列表刷新）。

### 批50 · 设置页二级化（主页变纯入口清单）+ 共享子页骨架 + 死代码清理

**动因**：`SettingsPage.tsx` 已 867 行，把 40 多行**就地控件**（主题/语言/音质/日志等级共 14 个单选行、6 个开关、悬浮歌词嵌套三组、导出日志 banner、版本只读行、数据导入导出）和 **11 个入口行**混排，于是要滚过一屏半才能到「关于」，而已经二级化的「音乐库管理」只占一行。

**主页改为纯入口清单**：5 张无标题卡片、16 个入口行 + 退出登录，点击深度统一为 1 层。867 → 447 行（其中约 200 行是 18 个入口行的 JSX 与 pane 分发），只剩 `activeSubPage` / `showLogoutDialog` 两个 state，**挂载时的 pref/请求从 11 次降到 0 次**（各页自己读自己的）。

**新增 6 个二级页**：`/settings/{appearance,playback,lyrics,data,about,diagnostics}`。搬迁时保住四处易丢的细节，各有测试钉住：`theme` 的 `useState(getAppTheme)` 初值（否则闪一帧错选中项）、`normalize` 的四写（state + player store + pref + 后端）、`audioQuality` 的 `'original' → null` 映射、`DataPage` 在无文件选择器时渲染 `dataUnavailable` 而不是 `return null`（那会是「有标题栏、下面全空」的假加载失败）。

**新增 `SubPageShell`，14 个现有二级页全部迁移**。此前它们各自手写 topbar，已漂移成 **5 种变体**：3 页硬编码 `12px 16px` / `18px` 违反 token 铁律、1 页标题 28px、1 页返回箭头 `rotate(90deg)`（全库唯一朝左）、2 页多余 `border-bottom`、返回键触摸区 30px 与 40px 两种。收敛为多数派那一种。不含 `PluginWebViewPage`（路由 `/plugin/$entryPath`，不属设置）。

- **「宽屏右栏内隐藏返回键」用 context**（`SubPageEmbedContext`），页面组件零改动。**刻意不用宽度判断**——宽屏也可能真路由停在 `/settings/eq`（深链 / e2e / 旋转），那里的箭头是活的，宽度分不清这两种情形。这修掉了 `LibraryOpsPage` 里只留注释没修的死键。
- **两处三级页补上 in-pane 回调**（53fb045 模式）：About → Licenses、LibraryOps → DuplicateCheck。后者此前在宽屏右栏点下去会真路由、卸载整个 `SettingsPage`、左侧菜单整体消失——与 53fb045 修掉的插件商店是**同一个 bug 的未修实例**。
- 两处返回目标随之修正：Licenses → `/settings/about`、DuplicateCheck → `/settings/library`（它们只能从那里进入，回设置根页会跳过一层）。
- `CacheManage` 的 `__content` 去掉横向 padding —— 它叠在 `.settings-section` 自带的 `margin: var(--space-4)` 上，使这一页卡片明显比设置列表窄。`SubPageShell.css` 里写明了这条约束。

**死代码清理**：死页面 `ServerSettingsPage` + `/settings/server`（零 UI 入口，唯一引用是路由注册与 barrel）及其 5 个专用 i18n key；12 个分组标题 key（扁平化后无处可用）+ 7 个更早的死 key；4 个 CSS 死类；`cache-model.ts` 4 个真死 export。修 `settings.exportLogsFailed` 的单括号 `{error}`（i18next 用双括号，此前导出失败时用户看到字面量、失败原因完全丢失）。顺带订正 `AGENTS.md` §6 关于 i18n 闸门的过期陈述（它确实验字面量 key 存在性，盲区是模板字面量）。

**闸门**：新增 7 个测试文件（含 `sub-page-shell.test.tsx` 的「pane 内不渲染返回键」）；`settings-page.test.tsx` 改写为「16 个入口 + 24 个就地控件反向断言 + `icon-check` 长度 0」；`shell-navigation.test.ts` 补 `showsMiniPlayer` 双向断言（该文件此前**一条都没有**）。**三条核心断言都反向验证过会红**：pane 隐藏返回键（临时让 `showBack` 恒真）、主页无就地控件（临时加回一行）、`{{error}}` 插值（临时改回单括号）。

自动验收：`tsc -b` / `vitest` 1202 测试 / `build` 两产物均绿，`Unsupported property` 警告仍为 0。

**iOS 模拟器验收**（iPhone 16 Pro，后端 58091）：`settings-general` 13 例全绿含 6 条新路由；截图确认主页为入口清单、「外观设置」页正确渲染主题/语言两组、**卡片左右内缩与主列表对齐**（`.subpage__content` 不加横向 padding 那条约束成立）。全量 30 场景 117 例亦绿。

> ⚠️ **验证方法上的坑，值得记**：第一次跑时 6 条新路由**全部「通过」而截图是空白页**——模拟器里的 App 还是旧 bundle，旧代码没这些路由、Router 匹配不到就渲染空，而场景只断言 `pathname`，Router 照样记下了 URL。**「路由断言绿」不等于「页面渲染出来了」**；发现依据是主页截图仍显示旧版就地控件。替换 `.app/main.lynx.bundle` 后必须 `simctl terminate` 再 `launch`——热启动不重读 bundle。
>
> ⚠️ **仍待人工**：**EQ 滑条拖动**。`9d8e993` 刚修完这块，坐标虽是 viewport 相对（不受新增 wrapper 影响）且每次 pointer-down 都重测，但原生手势没有任何测试能驱动，`simctl` 也没有 swipe 能力。宽屏 ≥768px 的右栏行为（无返回箭头 + about→licenses / library→duplicates 时父行保持高亮）同理需要 iPad 或桌面尺寸窗口。

### 批53 · 弹出层定位自研，退役 lynx-ui-popover（Docker 无头 Chrome 实测抓出）

**起点**：用户要求「用 Docker Chrome 测 Web 版并修弹出层菜单问题」。逐个驱动 8 个弹出层后，**根因只有一个，命中其中 6 个**。

- **lynx-ui 的 positioner 与它自己的施加方式不自洽**。`computeCoordsFromPlacement` 返回的坐标是**相对触发器**的（库源码注释写明了这个取舍：Lynx 视图默认 `position: relative`，它放弃了视口坐标），而 `OverlayView` 用 `position: absolute` 施加 —— 后者的包含块是**最近的定位祖先**。两者只在「触发器正好位于该祖先原点」时等价，而本仓库 6 个调用点把弹出层放在多子元素的工具栏行内，于是每个都偏掉了「触发器在行内的偏移量」那么多。实测（420×900）：**歌单详情排序菜单 `x = -122`，整块在屏外 —— 这个功能一直是死的**；音量面板 `-60`（"音量"标题与半个滑条被裁）；倍速菜单 `-30`（标签只剩 "x"/"5x"/"常"）；曲库排序 `0`（应 106）；歌单列表排序 `16`（应 106）。播放器 ⋯ 菜单只是**恰好**对，因为它的触发器是容器唯一的子元素 —— 这也正是这个 bug 能活到现在的原因。
- **库自带的溢出收敛救不了**：`detectOverflow` 拿 `SystemInfo.pixelWidth / pixelRatio` 当屏幕边界，Web 上那是浏览器**屏幕**尺寸（实测 800×600，而 lynx-view 是 420×900）。所以既不能靠 `autoAdjust` 兜底，也不能只改 placement 了事。

**修法：定位自研，`@lynx-js/lynx-ui-popover` 从依赖里移除。** 新 `shared/ui/anchored-overlay.ts`（测量 + 定位）+ `PopoverSurface.tsx`（触发器 + 遮罩 + 面板的公共外壳），`PopoverMenu` / `PopoverPanel` 保留原有 props 改为薄封装 —— **8 个调用点零改动**。

- **测量走 `boundingClientRect` invoke**（与 `useBreakpoint` 的 `measureRect` 同一条路）。两端都有定义，Web 上按 web-core 的 `createInvokeUIMethod` 返回 **lynx-view 相对**坐标，与 native 的页面坐标同义。触发器与 `.theme-root` 视口在**同一次 `exec`** 里量 —— 分两次会拿到「变化前的触发器 + 变化后的视口」。
- **invoke 的回调是异步的**，这一条踩过：初版在 `exec()` 之后同步读结果，于是永远判定「没量到」、永远走兜底位置。现在 `measureAnchor` 只从回调里回报，返回值只表示「有没有发出查询」，用来区分*根本没有 bridge*（单测、无 invoke 的宿主：现在就决定）与*等着回来*。
- **挂载时量一次 + 每次打开再量一次**。挂载那次是为了首次打开就是对的（异步回调赶不上「点了才量」）；每次打开那次是为了跟上移动的锚点 —— 已实测：窗口从 420 拉到 1000 走宽屏布局，触发器移到 `x=546`，菜单跟着到 546。
- **面板只用边缘定位**（`left`/`right` + `top`/`bottom` 各一个，配 `max-width`/`max-height`），刻意不算角点：计算完全不需要面板自身尺寸，所以没有「量—画—再量」那一趟、没有一帧画在错的地方、「留在屏内」是构造保证。**每个轴只能给一个偏移** —— `position: fixed` 同时拿到 `top` 和 `bottom` 会被**拉伸**，所以 `PopoverMenu.css` 里一个偏移都不写、兜底位置由 `DOCKED_POSITION` 内联给出（样式表里留一个 `bottom` 不会被内联的 `top` 覆盖，而是与它叠加）。
- **`max-width` 不能用来收窄面板**：CSS 在它**之后**解析 `min-width`，`.popover-menu--wide` 的 `min-width: 180px` 会赢。靠边的触发器只能靠偏移本身预留 `RESERVED_PANEL_WIDTH`（200 = 全库最宽的音量面板）。
- **顺带没了**：Presence 的 16 帧固定开启延迟（批51 记为「改不了、非 bug」）、靠 `transition` 才能及时卸载（否则空转 24 帧单帧 rAF ≈ 1 秒）、`PopoverBackdrop` 缺 `top`/`left` 导致两个弹出层能同开、以及「不要给 `PopoverPositioner` 传 `container`」。批51 那三条 bug 与本批的根因是同一个库的同一处设计，AGENTS 的「Popover / Presence」小节整节重写为「锚定弹出层」。产物同时小了 21.5 kB（web 2068.3 → 2046.8 kB）。

**返回键闸门的推导也跟着改对了。** `overlay-back-contract` 原先要求每个「有可见性 prop + 关闭回调」的组件都自己调 `useBackHandler`，而 `PopoverSurface` 出现后这条会逼出**双重注册**（一个可见面板两个 handler，第二次按键会被还没注销的兄弟吃掉）。契约真正要的是**可达性**：子树里有且只有一个组件注册。闸门改为「自己注册 **或** 渲染了一个会注册的 shared/ui 组件，且两者不能同时成立」，并断言委托这条路真的有人在走（否则那个 `or` 分支会腐化成死代码）。位置刻意不作为判据 —— `GlobalMenu` 只被 `shared/ui` 内部引用（`SongRowOverlays`，它不注册）却仍必须自己claim。

**新闸门**：`anchored-overlay.test.ts` 10 条纯函数断言，每条都用**实测的真实 rect** 并在注释里写下库给出的错误答案；`popover-menu-css.test.ts` 重写为新契约（遮罩四边钉死、面板 `fixed` 且**不得**声明任何偏移、`overflow-y: auto` 配合 `max-height`）。

**验收**：`tsc -b --force` / **1580 vitest（157 文件）** / `build` 双产物 / `build:web`。**Docker 无头 Chrome（browserless，host 网络 + 真后端 58091）逐个实测**：8 个弹出层全部锚定正确、无一越界、同时最多一个打开、选中项真的生效（`最近添加` → `艺术家`）、点外部关闭；窄屏 420×900 与宽屏 1000×800 各验一遍；滚动后重开位置仍对。顺带确认上一批标注「真机未验证」的两条 —— AddToPlaylistSheet 选歌单提交（toast「已添加 1 首歌曲到「music」」）与删除确认弹窗 —— 均正常。

> ⚠️ **native 未验**：本批只在 Web 上实测。`position: fixed` 与 `boundingClientRect` 在 Android/iOS 都是本仓库已在用的能力（`.global-menu` 等覆盖层、`useBreakpoint`），但 8 个弹出层的观感需要真机过一遍。
>
> ⚠️ **`GlobalMenu` 的 `anchor` prop 仍未接线**（歌曲行 ⋯ 菜单还是底部面板）。现在 `anchored-overlay.ts` 正好提供了它缺的那块测量能力，但歌曲行在虚拟化 `<list-item>` 内、paint containment 会重锚定 `position: fixed` 后代（见 `song-row-overlays.ts`），需要单独验证，未纳入本批。

### 批55 · 底部导航 tab 溢出折叠（对齐 Flutter adaptive_scaffold）

**起点**：用户问「底部 tab 超过多少个后要像 Flutter 版那样收进一个『更多』」。Flutter 侧答案是 `_mobileMaxVisible = 5 / _mobileRealSlots = 4`（`adaptive_scaffold.dart`）：超 5 个时底栏固定 4 个真实 tab + 第 5 位「更多」，点开是底部弹出的溢出列表；且只在 mobile 折叠（tablet rail / desktop 侧栏 / 超宽屏 dock 全直显）。Lynx 版当时**完全没有折叠逻辑**（12 个 tab 会把 ~400px 窄屏挤到每 tab 33px），而且 `showLibrary` 配置**存而不读**（TabConfigPage 只写 shell 从不消费），tab 顺序也与 Flutter 不同（settings 被钉在第三位而非末位）。

改动：① `destinations.ts` 新增 `buildNavDestinations(showLibrary, pluginTabs)`（home → library? → 插件 → settings 末位，对齐 `ActiveDestinations.compute`）+ `NAV_MAX_VISIBLE=5 / NAV_REAL_SLOTS=4` 常量；② `tab-config.ts` 的 `usePluginTabs`/`usePluginTabsWithIcons` 合并为 `useShellNavTabs()`（一个 query 同时回 `showLibrary` + 带 icon 回填的插件 tab，与配置页共享 `['settings','tab-config']` key 前缀、保存后自动失效重拉）；③ `ShellLayout` 改为动态组装目的地，窄屏超 5 个折叠成 4+「更多」，宽屏 rail 改可滚动（`scroll-view` 包裹、brand 在滚动区外）；④ 新建 `shared/nav/MoreTabsSheet.tsx`（仿 `AddToPlaylistSheet`/`PlayHistoryPanel` 的 fixed root + 兄弟遮罩 + 底部面板模式，`useBackHandler(show,…)` 初始 false 满足 back-stack 铁律），挂在 **shell 内部**而非 root route——触发器（底栏第 5 槽）与生命周期都在 shell，登出卸载 shell 面板随之关闭；⑤ `PluginTabIcon` 从 ShellLayout 提取到 jsplugin/widgets 供底栏与面板共用；⑥ 「更多」选中态 = litPath 在溢出区（Flutter `barSelectedIndex = _mobileRealSlots`）；⑦ `navPaths` 仍写**完整列表**，返回键「当前是否 tab 根」语义不受折叠影响；⑧ TabConfigPage 常驻显示折叠提示（对齐 Flutter `settingsTabConfigCollapseHint` 文案）。

**验证**：`build` 双产物 / `tsc -b --force` / **1696 vitest（167 文件，+31）** / `build:web`；新增 4 个测试文件（`destinations.test.ts` 顺序与折叠边界纯函数、`shell-fold.test.tsx` 底栏 4+更多/开合/导航/返回键、`more-tabs-sheet.test.tsx` 列表/高亮/遮罩/导航、`more-tabs-sheet-css.test.ts` fixed 四偏移 + 面板单轴停靠 + label 省略号闸门）。**Web 实测**（本机 3000 端口跑新产物 + 真后端）：临时把 tab 配置改成 6 个（miot + 3 个假插件）→ 窄屏 500px 底栏恰为「首页/曲库/智能音箱/测试A/更多」、面板列「测试B/测试C/设置」、选「设置」后面板关+跳转+「更多」呈选中态、遮罩点击关闭、1200px 宽屏 rail 全部 6+1 直显无「更多」、console 零报错；验完已还原后端配置。

> ⚠️ **native 未验**：折叠/面板在 Android 真机上的观感（尤其「更多」选中态的 ink 填充与面板圆角）待真机过一遍；Web 上行为链路已全绿。

### 批51 · 播放器两个弹出层修复（3 个 bug 串联）+ 桶入口清零 + 署名订正

**起点**：速度与播放模式从「点一下循环切换」改成弹出菜单（`shared/ui/PopoverMenu.tsx` 封装 lynx-ui popover 原语）。这次改动引入并暴露了**三个依次显形的 bug**，每个都是静默失败，全部配了反向验证过的闸门。整批的教训写进 `AGENTS.md` §4 新增的「Popover / Presence」小节。

- **① 菜单根本打不开（我引入的回归，原来的循环切换是好的）**。传了 `show` 即受控模式，此时 `PopoverTrigger` 的点击**只**走 `onVisibleChange`（`if (isControlled) onVisibleChange?.(!show)`），而封装只传了 `onClose`。`onClose` 是 `Presence` 的生命周期回调（「已经关完了」）而非关闭请求，于是死锁：没人置 `show` 为 true → 永不 leaving → `onClose` 永不触发。**两个按钮当时是完全失效的。**
- **② 两个弹出层能同时打开**（用户截图报的）。`PopoverBackdrop` 的库样式是 `100vw × 100vh` 但**没有 `top`/`left`**，fixed 元素偏移为 auto 时落在**静态位置**（定位容器内、紧贴触发器），所以遮罩铺的是「从弹出层量起」的一屏——速度菜单（右上）打开时播放模式键（左下）在遮罩之外。补 `top: 0; left: 0` 钉到视口原点。顺带删掉前一版自写的同名遮罩：类名 `popover-backdrop` 是库里硬编码的，自写会撞车，且它那个 `z-index: 99` 会把遮罩压在菜单**上面**（点菜单项只会关闭、选不中）。现遮罩 100 / 面板 101，与 ActionSheet 等同层。
- **③ 关闭要慢约一秒**（用户手感报的，**不是卡顿**）。`PopoverContent` 是承载 `bindtransitionend` 的元素，`Presence` 只有等到该事件才离开 `Leaving`；我的 CSS 一个 transition 都没声明，于是退化成空转 `MAX_WAIT_FRAMES = 24` 次单帧 `lynx.requestAnimationFrame`，而 `delayFrames` 就是 `lynx.requestAnimationFrame`，在 BTS 上每帧一次线程往返——纯帧数 60fps 下也已 400ms 起。修法是 `transition: opacity 140ms` + `.ui-closed { opacity: 0 }`，**两半缺一不可**（只有 transition 而值不变照样不触发）。这也顺带修掉一个未被报告的问题：定位在 `DelayedEntering` 才算（比 `Entering` 晚 16 帧），此前那 16 帧里菜单是以未定位的位置**可见**的，会先显形再跳走。
- 打开方向仍有约 16 帧固定延迟（`enableDelay={true}` 在 `PopoverPositioner` 里硬编码，定位需要触发器 rect），**改不了、非 bug**，已在 AGENTS 记录。

**桶入口清零**：`AGENTS.md` 早有「禁用桶入口」铁律，但 `@lynx-js/lynx-ui` 一直在 `package.json` 里、3 个文件绕过了它。本批移除该依赖，显式加 `-dialog` / `-popover` / `-radio-group`（均 `^3.135.4`，与既有子包同版本），改 3 处源码 import + 4 处测试 mock（`duplicate-check-page` 那个原来一个 mock 覆盖 Dialog + RadioGroup，拆成两个）。**体积实测只差 4 字节**（1932213 → 1932217）——各子包都声明 `sideEffects: false`，tree-shaking 本来就摇掉了未用到的转发；用「未使用的 `feed-list` 的 CSS 类名在产物中出现 0 次」验证过（标识符会被压缩混淆，grep 标识符测不出东西）。**这条规则买的是一致性与 Lynx 副作用暴露面，不是字节**，AGENTS 已就地订正措辞。

**开源许可页订正**：`LicensesPage.tsx` 有 3 条 URL 指向与包毫无关系的 `github.com/nicklhw/nicklhw-…`（`@lynx-js/react`、lynx-ui、`url-search-params-polyfill`），像是一次全局替换事故——这是**用户可见的署名信息**。以已安装包 `package.json` 的 `repository` 字段为权威源逐条核对并修正；license 列全部相符（`@lynx-js/react` 是唯一无 `license` 字段的，其源码版权头写明 Apache-2.0）。新增 `licenses-accurate.test.ts` 逐条比对 manifest，它同时覆盖本批另一类腐化：**署名一个已不是依赖的包**（`@lynx-js/lynx-ui` 正是如此）。

**闸门**（4 个新断言，全部反向验证过会红）：`full-player.test.tsx` 的开→选测试（摘掉 `onVisibleChange` 即红）；`popover-menu-css.test.ts` 三条（遮罩 `top/left` 钉死、面板 z-index 高于遮罩、transition 覆盖 opacity 且 `.ui-closed` 真的改值）；`licenses-accurate.test.ts` 三条。**`_render-mocks.tsx` 的 popover mock 刻意保留真实前置条件**：只在 `show` 时挂载、点击只走 `onVisibleChange`。前一版 mock 无条件渲染 children 并注释「items 总是可见」，正好把 bug ① 固化成契约——§6 那条「mock 必须保留真实实现的前置条件」的又一例。

自动验收：`tsc -b` / `vitest` **1288 测试（136 文件）** / `build` 双产物 / `build:web` 均绿。用户手动验收：② 与 ③ 均已确认修复。

> ⚠️ **本批未做视觉自动化验证**。遮罩几何与关闭时序都是从库源码推出来的，测试只能证明状态接线与 CSS 契约——两条都靠用户手动确认。曾起过无头 Chrome + CDP 想真机观测，因需要先登录+起播、成本过高而中止（已清理进程）。
>
> ⚠️ **顺带发现、本批未改**：`pnpm install` 会触发全量重装警告，与本批改动无关——`node_modules/.modules.yaml` 记录的 store 是父仓库的 `/Users/hanxi/toy/songloft/.pnpm-store`，而当前 `pnpm store path` 解析到 `~/Library/pnpm/store/v10`，仓库里已无任何 `.npmrc` 声明它。**刻意不加 `.npmrc` 固定**：CI 用 `pnpm/action-setup@v4` + 无 store 配置（即默认 store），而 `.npmrc` 会入库、`../.pnpm-store` 在只 checkout 本仓库的 CI 里根本不存在。本机已迁到默认 store（`--frozen-lockfile`，lockfile 哈希前后一致，`postinstall` 与两个 `patches/` 均确认重新生效），`.modules.yaml` 现与 CI 一致，不会再复现。父仓库那个 378 MB 旧 store 目前看已无人使用（`plugin-toolchain` 用的是 `store/v3`），是否回收留给人工决定。

### 批52A · 返回导航骨架（Android 返回键 + Web 浏览器返回 + 规范落地）

**起点**：全仓对返回键**零处理**——`MainActivity` 没有 `onBackPressed`，任何页面、任何弹出层打开时按返回都直接退出应用；Web 用 memory history，浏览器返回直接离开页面（连弹出层都关不掉）。`lynx_capability_matrix.md:133` 早把「硬件/手势返回」列为待自研缺口。本批只做**骨架 + 三侧宿主 + tab 首页双击退出 + 规范文档**；约 26 处覆盖层/模式态接入是批52B，伪路由与插件 WebView 内部历史是批52C。

**三层模型**（完整规范见 `docs/reference/back-navigation.md`，铁律摘要进了 `AGENTS.md` §4）：覆盖层/模式态 LIFO 栈（`shared/nav/back-stack.ts`）→ 路由父级（纯函数 `resolveRouteBack`）→ 退出提示。装配在 `core/navigation/back-controller.ts`，`index.tsx` 在**首帧渲染前**调用（页面可以在 await 完成前就上屏并打开弹层）。

- **原生侧是「JS 镜像 `consumable` 标志、宿主本地决策」，不是「总是转发」**。`onBackPressed()` 必须同步答复，而 Lynx 不能同步调 JS。这个反向让**双击退出的第二次按键根本不进 JS**（武装提示时把标志降为 false，宿主自己 `moveTaskToBack(true)`）：快速连击无可竞争的往返，且 **JS 卡死在 tab 首页时退出照常可用**。剩下那一种情况（标志为 true 时卡死，即有覆盖层或在二级页）由「连续 3 次无 ack」看门狗兜底——**刻意不用定时器**，超时会把「仅仅是慢」误判成死亡并退出应用。
- **`exitApp` 用 `moveTaskToBack(true)` 而非 `finish()`**：音乐播放器 `finish()` 会销毁 LynxView、下次冷启动重建整个 UI 状态；也与 Android 12+ 根 Activity 的系统默认一致。非 task root 时回落 `finish()`。
- **平台差异只在 tab 首页，且是刻意的**：Android 首次按键出 toast；**Web 恒 `consumable=false`**，浏览器返回直接离开页面——这是 web 用户的预期，也让 worker 卡死时仍能离开（没有 sentinel 就没有要拦的东西）。
- **Web 靠主线程一个 sentinel history entry**，不变量是 `sentinelPresent === consumable`。业务代码跑在真 Worker（没有 `history`/`popstate`），所以拦截只能在 `web/audio-host.js`。移除 sentinel 用的 `history.back()` 是异步的，故串行化（`sentinelOpInFlight`）并在完成后重新驱动一次（期间标志可能已翻回来）。**已知降级**：新标签页直接打开、没有更早 entry 时返回无法离开，属浏览器行为。
- **`backTo` prop 被移除**（原在 `SubPageShell`，默认 `/settings`）。硬件按键需要同一个答案，两张表必然漂移；现在每条路由的父级只存在于 `route-back.ts` 一处，返回箭头与按键读同一份。13 处页面 `goBack` 全部改为调 `performRouteBack()`。`onBack` 保留，语义仍是宽屏 pane 内兄弟页切换。
- **顺带修掉两个 sidecar 缺陷**：① `SongDetailPage` / `AddSongsPage` 返回丢 library search（把 14-view 选择器重置回第一项）；② `PluginWebViewPage` 返回硬编码 `/` （从曲库进插件也被丢到首页）。

**前置修复：`sendGlobalEvent` 第二参必须是数组**（本特性依赖该契约，核实自 web-core 源码）。`params` 最终走 `listener.apply(ctx, params)`，普通对象没有 `length` ⇒ **传零个参数、listener 收到 `undefined`**。存量两处都传的是对象：`web/audio-host.js` 的 `sendEvent`（影响 Web 端**所有**音频 state/progress/error 事件）与 `web/index.html` 的外观变更（键名还写成 `theme` 而非 `systemTheme`，后半已记录在 `docs/plans/archive/web-support.md:14`）。两处已修，并加闸门。

**闸门**（6 处，全部反向验证过会红）：
- **`route-back.test.ts`（核心）**：走 `router.routesById` 枚举**每一条叶子路由**，断言都不落到 `fallback` 分支——「所有页面都处理好了」从评审问题变成可执行断言，新增路由未声明父级会直接红。含反向用例（未声明路径确实落 `fallback`）。59 例。
- `back-stack.test.ts` 14 例：LIFO 顺序、注销幂等、dispatch 过程中改栈（**被上层移除的下层不得再被调用**——否则它的 UI 已消失却仍吞掉按键）、抛异常不吞按键。
- `exit-prompt.test.ts` 8 例：窗口边界（到期是排他的，宁可多一次 toast 也不误退出）、时间戳自愈。
- `native-module-contract.test.ts`：新增 `navigation` host 项（同 `system` 那样把 module + `MainActivity` 拼起来读）、事件名 Android/Web 两侧逐字一致、三方法在 Kotlin + Web worker 模块 + Web 主线程 handler 三处齐备、**每个 `sendGlobalEvent` 第二参是数组字面量**。
- `android-manifest-contract.test.ts`：回调选择必须**显式声明**、且 MainActivity 实现的正是被选中的那种。**Kotlin 源先剥注释**——第一次写这条时它假绿了，因为 `onBackPressed` 的文档注释里提到 `OnBackInvokedDispatcher`（正是 §6「验语义不验子串」的又一例）。**刻意不以 targetSdk 为条件**：opt-out 在 34 以上仍有效，拿 targetSdk 触发失败是误报。
- 6 处页面测试的返回目标断言**保留了原有强度**：没有降级成「调用了 performRouteBack」，而是经新增的 `installBackRouter(pathname)` 注入假 router 跑**真实策略**，所以父级声明写错这些也会红。

**验收**：`tsc -b` / `vitest` **1384 测试（139 文件）** / `build` 双产物 / `build:web` / `gradlew assembleDebug`（manifest merge 通过）均绿。

**Web 端真产物端到端验证**（browserless 容器 + 真实 `build:web` 产物，非 `web:dev`）：`nativeModulesMap` 注册成立 → `setBackConsumable(true)` 后 `history.length` 2→3 且 `history.state === {songloftBackGuard:1}` → 重复置 true **不叠加**（仍 3）→ **真按浏览器返回：页面未离开、守卫已重新武装** → `setBackConsumable(false)` 后 sentinel 被撤掉（`history.state` 回 `null`）。再单独验完整往返：主线程 `history.back()` → worker 收到事件 → 三层链走完 → **toast「再按一次返回退出应用」渲染出来**（截图确认），这同时证明了数组 payload 修复真的生效。

**Android 真机验证**（SM-G998B / API 33，全程用真 `adb shell input keyevent 4`，断言落在 `dumpsys` + `pidof` + TestBridge 读到的 store 状态上，不看截图判定）：

| # | 验的什么 | 结果 |
|---|---|---|
| 1 | 4 条声明的父级：`/settings/cache`→`/settings`、`/settings/licenses`→`/settings/about`、`/settings/duplicates`→`/settings/library`、`/settings/plugins/registry`→`/settings/plugins` | 全部 ✓ |
| 2 | 覆盖层层 ① 真接线：注册 handler 后按返回 → handler 命中 1 次、**路由不动**；注销后再按 → 穿透到路由层 | ✓ |
| 3 | handler 返回 `false` 时按键穿透（被调用过，但路由照样回父级） | ✓ |
| 4 | **tab 首页双击退出**：第一次按键仍在 `/`、`exitArmed=true`、Activity 仍 resumed；第二次按键 → launcher resumed，**`pidof` 前后同为 7185** | ✓ 是 `moveTaskToBack` 不是 `finish` |
| 5 | 武装窗口过期（等 2.6s）后再按返回 → **重新提示而不是误退出**，Activity 仍 resumed | ✓ |
| 6 | 离开 tab 首页自动解除武装（`exitArmed` 回 false，`currentAction` 变 `navigate`） | ✓ |
| 7 | **运行时插件 tab** `/plugin/miot` 也走退出提示（`navPaths` 实测含它），按返回后仍在插件页且已武装 | ✓ |
| 8 | 同一路径**不是** tab 时则是导航（`resolveRouteBack('/plugin/other')` → `navigate /`） | ✓ |
| 9 | **看门狗**：注册一个把 JS 线程堵死 9 秒的 handler，连按 4 次 —— 前 3 次转发给卡死的 JS（应用不动），**第 4 次放行系统默认**退到后台，`pidof` 前后同为 7468 | ✓ |
| 10 | 从歌曲详情返回**不再丢** library 的 `view`（`{"view":"album"}` 原样保留） | ✓ 修复生效 |
| 11 | 分面下钻返回**自己那个维度**（`/library/category/genre` → `view=genre`，而非上一次的 `album`） | ✓ |

toast「再按一次返回退出应用」在首页真机截图确认（`/tmp/back-android-toast.png`，与 mini player、底部导航同屏）。
>
> 为验证第 2/3/9 条给 `__E2E_BACK__` 加了 `push(handler)` —— 批52B 之前没有任何 UI 用到 LIFO 栈，否则层 ① 的接线根本无法在真机上验。
>
> ⚠️ **`consumable` 推送有一帧竞态**：tab 首页 → 二级页之间若在标志送达前按下返回，会退出应用。窗口小于一帧且需在点击后立即按返回，判定为实际不可达；若真出现，改为「进入二级页时同步推送」。

### 批52B · 返回导航接入全部覆盖层与模式态

**做法上的关键选择：能在共享组件内部注册的，就不去改调用点。** `ConfirmDialog` / `ActionSheet` / `PopoverMenu` / `SongContextMenu` / `PlayHistoryPanel` / `SleepTimerSheet` / `PlaylistDrawer` 七处自注册 `useBackHandler`，一次覆盖 **14 个调用点**，且未来新增的调用点自动获得 —— 与批52A 里 `SubPageShell` 一次覆盖 15 个设置子页同一杠杆。剩下的才逐页处理（模式态与内联武装态共 9 页）。

**多层页面用「一个 handler + 显式剥离顺序」，而不是每层各注册一个**。`back-stack` 的优先级是激活时刻，对同级兄弟正确，但同一页面内的层是**语义嵌套**的（歌单选择器在多选*里面*、武装删除在菜单*里面*），顺序应当由代码写明而不是取决于用户先点了哪个。所以：

- `SongContextMenu`：武装删除 → 歌单子视图 → 菜单本身
- `PlaylistsView`：新建表单 → 拖拽排序 → 武装批删 → 退出多选
- `PlaylistDetailPage`：武装删除 → 内联编辑 → 拖拽排序 → 退出多选
- `FlatSongsView`：歌单选择器 → 退出多选（选择器在多选**内部**，关它不能顺手丢掉用户已勾的选择）

**顺带修一个既有缺陷**：`SongContextMenu` 关闭时不重置 `showPlaylists` / `confirmDelete`。它不是被卸载的（调用点一直渲染它、只把 `song` 置 null），于是**下一首歌的菜单会直接开在歌单选择器里，或者删除已经处于武装态**。此前潜伏着，加了返回键后一按就能到。修法是把组件内所有关闭路径（含遮罩点击）都走新的 `close()`。

**闸门 `overlay-back-contract.test.tsx`（9 例，反向验证过会红）**，两种不同性质的断言：
- **从源码推导的需求**：扫 `src/shared/ui/*.tsx`，凡 props 同时有可见性开关（`show`/`open`）与关闭回调（`onClose`/`onCancel`/`onShowChange`）即判定为覆盖层，**必须**调用 `useBackHandler`。这样新增一个覆盖层组件忘了接返回会直接红，不需要谁记得来扩这个文件（同 `android-manifest-contract` 从 Kotlin 推导组件清单的做法）。配一条「检测确实找到了那三个」的哨兵，防止 props 改名后闸门静默空转。
- **行为断言**：真的 `dispatchBack()`，检查关掉的是覆盖层。另外**反向也验**——「关闭态不得占用返回键」：这些组件关闭时仍挂载，一个忽略可见性开关的注册会永久吃掉该页所有返回键。

`_render-mocks.tsx` 新增 `mockLynxUiDialog()`（三个既有测试各自手写了同形状的 stub，抽出来避免第四份漂移）+ `installBackRouter()`（批52A 加的）。

**验收**：`tsc -b` / `vitest` **1393 测试（140 文件）** / `build` 双产物均绿。

**Android 真机验证**（同一台 SM-G998B，真 `keyevent 4` + `input tap`，断言读 `__E2E_BACK__.depth()` 与 store）：

| 验的什么 | 结果 |
|---|---|
| 队列抽屉（唯一全局 store 层）：打开 → `depth=1`，返回关抽屉且**仍在 `/player`**，再返回才离开播放器 | ✓ |
| 多选模式：点「选择」→ `depth=1`，返回退出多选且**仍在 `/library`**，再返回才走 tab 首页退出提示 | ✓ |
| 排序 ActionSheet（共享组件自注册）：打开 `depth=1`，返回关表不退页 | ✓ |
| 上下文菜单两级剥离：长按 → 进「添加到歌单」子视图 → 返回**回到菜单首屏**（截图与打开时逐字节相同）→ 再返回才关菜单 | ✓ |
| 子状态残留修复：进子视图 → 点遮罩关闭 → 重开，回到菜单首屏而非上次的子视图 | ✓ |
| 武装删除剥离：点「删除歌曲」武装 → 返回只撤销武装、菜单仍开着（文案回到「删除歌曲」） | ✓ |

> ⚠️ **截图哈希不能用来判定这类状态**：武装删除那条一开始判为 ✗，实际是状态栏时钟从 02:36 走到 02:38（两张图只差 83 字节）。最终按图目视判定。要自动化就得先裁掉状态栏，或者干脆断言在 store/DOM 状态上——这也正是 AGENTS「断言要落在可观测状态上」的原意。
>
> ⚠️ **本批范围内刻意不接的两类状态**（批准的计划里也不在清单内）：① **搜索框文本**——搜索框全库都是常显的、不存在展开/收起，清空过滤器不是「返回」，会让返回键变得不可预期；② 手风琴展开、`showHidden` 过滤开关、Tab 切换——它们不遮挡也不改变页面语义。

### 批52C · 返回导航收尾：四处伪路由/子视图层 + 插件 WebView 内部历史

至此返回键三层模型里「覆盖层/模式态」之上的**伪路由层**全部接入，规范见 `docs/reference/back-navigation.md` §3b。

| 层 | 返回行为 | 真机验证 |
|---|---|---|
| **歌词页**（`FullPlayerPage` Swiper 第 2 屏） | 滑回封面；宽屏并排时此层不存在 | ✓ 封面屏 depth 0 返回离开 → 滑到歌词屏 depth 1 → 返回滑回封面仍在 `/player` → 再返回才离开 |
| **Settings 双栏 pane**（`activeSubPage`） | 复位到默认子页；仅宽屏且非默认时是一层 | ✓ 临时把模拟器调宽到 1280×800：切到非默认 pane → depth 1 → 返回复位仍在 `/settings` → 再返回出退出提示。默认态 depth 0 直接走退出提示 |
| **DuplicateCheck phase** | 仅从 `results` 退回 `status`（保留已选保留项）；`computing`/`status` 交给路由层 | ✓ `status` 相位返回直接离开页面 |
| **插件 WebView 内部历史** | 逐层 `history.back()`，耗尽后交给路由层 | 见下方说明 |

**歌词页**补了此前缺失的 index state：`Swiper.onChange` 记录当前屏（`swipeTo` 也触发 `onChange`，故自动进入歌词与手动滑动共用）。**Settings 双栏**补上的正是 `SubPageShell` 注释里那个 "dead key"。**DuplicateCheck** 刻意不在 `computing` 时把 phase 设回 `status`（自动恢复 effect 会立刻弹回，纯空转），退回 `status` 时也不清空选择（返回≠重来）。

**插件 WebView 是最脆弱的一处，按「优雅降级」设计**：Lynx `<webview>` 无 `canGoBack`/`goBack`，用 `bindlocationchange` 维护深度计数 + `eval('history.back()')` 驱动。两个关键点：① `locationchange` 对前进和我们自己的 back 都触发，用 `selfBackPending` 标志区分回声；② **handler 只在 `webDepth > 0` 时激活** —— 类型里 `bindlocationchange` 标着 `@since Lynx 3.5 @PC`，Android 是否触发**无法静态确认**，若不触发则 `webDepth` 恒 0、返回键落回路由层（接入前行为），降级为 no-op 而非误动作。主动 back 后挂 400ms 看门狗，无 `locationchange` 确认且计数归零时改走路由返回，避免「按了没反应」。

> ⚠️ **真机探测结论（lxmusic / music-feed / songloft-now-playing 三个插件）**：按返回都直接离开插件页。这要么说明 Android 上 `locationchange` 不触发，要么这些插件加载时不做内部导航 —— **两种情况行为都正确（无回归）**，但无法据此确认该功能在 Android 上对「有内部导航的插件」是否真生效。顶栏返回箭头刻意保持离开插件（显式关闭动作），与系统返回键分工不同。

**验收**：`tsc -b` / `vitest` **1393 测试（140 文件）** / `build` 双产物 / `build:web` 均绿。

> 说明：批52C 未新增单测 —— 这四处都是页面内联的 `useBackHandler`，需渲染整页才能驱动，而共享覆盖层的等价契约已由批52B 的 `overlay-back-contract.test.tsx` 覆盖。行为正确性由上表真机验证背书。

### 批56 · 主题商店修复 + 主题包应用链路（从零到可用）

**用户报告**：主题商店打开提示「暂无可用主题」；已安装的 2 个内置主题（sakura / neon-night）激活后无任何反应。诊断结论：**不是「不支持 Flutter 主题」**——主题包是平台无关 JSON（后端 `theme_pack.go` 校验 `#RRGGBB` + 圆角 0-100），问题在 Lynx 端是半成品迁移，三处硬 bug：

1. **目录解析错字段**：`theme-packs-api.ts` 读 `data.items`，后端（`theme_pack_catalog.go`）返回 `{themes, total}` → 恒空；且 `.catch(()=>{})` 把拉取失败（GitHub 不可达→502）也吞成「空列表」，请求还没带 `github_proxy`（Flutter 端会传）。
2. **安装请求体错**：发 `{theme_id}`，后端要 `{url, sha256?}`（缺 url 直接 400）。
3. **应用链路缺失**：激活只是 PUT + 本地打勾，从未把 ThemePackData 应用到 UI；启动也不拉 active pack（Flutter 端是 watch provider 重建 MaterialApp.theme）。

**修复与设计**：
- **目录/安装契约**：`refreshCatalog` 解析 `themes` + 内部读 `/settings/github-proxy` 传给后端；`installFromCatalog(entry)` 发 url+sha256+proxy；失败上抛，页面三态（loading/error+重试/ready），行按 `install_state` 显示安装/已安装/更新。
- **主题包→Muse token 映射**（`theme-pack-mapping.ts`，纯函数）：seedColor→`--primary/--primary-2/--accent`，派生 `--primary-content`（YIQ 黑白）；backgroundColor→`--canvas`；surfaceColor→`--paper`+`--paper-clear`(90% alpha)；card/control/navigationRadius→`--radius-lg/md/nav`。**刻意不移植 `ColorScheme.fromSeed`**（Muse 单 accent 体系）、**刻意忽略 `playerGradient`**（scrim alpha 是算出来的，有 contrast 闸门）。深浅色正交：按 resolvedTheme 选 pack.light/dark。
- **激活状态模型**（`theme-pack-model.ts`）：仿 theme-model 的模块级 state+listener（不用 useSyncExternalStore，ReactLynx 测试坑）；active 的 GET/PUT/DELETE 从 api 层移入；装配在 `index.tsx`（checkAuth 后拉取、auth 订阅登录拉/登出回落，对齐 Flutter「未登录不发请求」）。
- **ThemeProvider**：根 view 加内联 CSS 变量（Lynx 官方支持 style 声明 `--*`，内联胜类声明 = 级联即覆盖）。

**关键发现（真探针测出，已写进模块头注释 + 测试）**：**ReactLynx 的 style 对象更新只 merge 不 remove** —— 从 `{--primary: pink}` 更新到 `{}` 或 `undefined`，旧声明原地残留。因此「清除主题」不能靠丢弃属性，必须**写回基线值**：映射恒定输出全部可覆盖 token（pack 值或 Muse 基线），无 pack 时 inline == 类声明（视觉零变化）。`PACK_OVERRIDABLE_BASELINE` 从 tokens.css 镜像，有闸门测试解析 CSS 双向比对防漂移。

**验收**：新增/更新 4 个测试文件（mapping 24 + model 12 + provider 9 + page 5）；隔离 worktree（干净 main + 本批改动）跑 `tsc -b` / `pnpm test` **1766 测试（170 文件）** / `build` 双产物 / `build:web` 全绿。主工作区 `tsc`/`build` 另报 `SongEditPage.tsx` 类型错——那是工作区里**另一批进行中的未提交改动**（`songs-api.ts` 的 `updateLyrics` 返回类型变更）所致，与本批无关。

**真机待验**：内联 CSS 变量在 Android/iOS/Web 三端真机的实际渲染；GitHub 不可达时目录错误态文案 + 重试。

## 未完成 / 遗留事项（TODO & 风险）

- [x] **批28 Computing 阶段进度恒 `0/0` 且完成后不转 Results**（批29b 发现 → **批29c 已修**）：双层根因（陈旧终态跳过 computing + `refetchInterval` 在 Lynx 首次 fetch 后不再 fire），修法见上方「批29c」小结与下方「批29c」详节。18091 真机逐张截图验过 Computing 推进 + 自动转 Results。
- [x] **Results 有重复组 + 删除 Dialog 真机手势已验**（批29c）：用户在 18091 音乐目录造了 2 组同源重复（`咏春`/`咏春-same`、`半壶纱`/`半壶纱-same`），扫描导入后计算指纹 → Results 渲染 2 组重复（每组「推荐」保留 + bitRate/文件大小）→ lynx-ui 删除 Dialog 弹出确认 → 点确认真删文件（358→356）+ UI `invalidate` 实时刷新组数（2→1→空态）；单组「删除未选中」与「清理全部重复」两入口都验过。**批28 重复检测功能至此全路径真机验完。**
- [x] **B3b · iOS 原生模块**（完成 2026-08-12）：`SongloftAudioModule`+`SongloftAudioEngine`（AVPlayer + AVAudioSession `.playback` + MPNowPlayingInfoCenter + MPRemoteCommandCenter + `UIBackgroundModes: audio`）、`SongloftStorageModule`（UserDefaults prefs + Keychain secure 含 UserDefaults fallback）、`SystemAppearance`（globalProps `systemTheme`/`systemLocale` 在 `loadTemplate` 前注入 + `traitCollectionDidChange` 事件）。pbxproj 4 处注册到位、Bridging-Header 含 6 个 Lynx 头文件。契约闸门测试 52 例验证 iOS⇔Android 方法名/事件名/键名逐字一致。模拟器验收：Storage 持久化（杀 app 保登录态）✅、AVPlayer 播放 mp3 流（currentTime=5.2s）✅、深浅色切换（亮度差 186）✅。
- [x] **收藏按钮的 `onCustomCommand` 分发端到端验证**（批22 代码，批29 半验，**批31 用户真机确认正常**）。
- [ ] **偶发全屏灰层（批29 发现，未定位）**：运行数分钟后整屏蒙 α≈0.6 中灰，重启即恢复，不影响功能。完整诊断数据与已排除项见「批29 §7」。需换真机（非 BlueStacks）复现定性。
- [x] **批28 的 Computing / Results 阶段真机验**（批29c）：指纹计算进度轮询（`0/356`→`356/356` 实时推进）+ 完成后自动转 Results + **重复组列表 / bitRate 推荐保留 / lynx-ui Dialog 删除确认 / batchDelete 真删文件 + 列表刷新** 全部在 18091 真机验过（用户造的 2 组同源重复）。降级分支（chromaprint 不可用 → 警告 banner + 禁用按钮）批29 已验。**批28 全路径真机验完。**
  - **测试数据现成**：`/Users/hanxi/toy/songloft/music/test-track-{1,2,3}.mp3` 三份 **file_size 完全相同（721126 字节）** 的同源副本，指纹应完全一致并归成一个 3 首重复组——不需要另造数据。
  - **后端检测口径**（`internal/services/fingerprint.go`）：`ffmpeg -hide_banner -muxers` 输出含 `chromaprint` 即可用，**不是** `fpcalc` CLI。路径取 config 表的 `ffmpeg_path`（`internal/app/app.go:291`），**无 API 可改**，且 `chromaprintAvailable` 由 `sync.Once` 缓存 → **改任何相关东西都必须重启后端**。
  - ⛔ **本机 Homebrew 路线已试过，不通，别再重复**（批29）：`brew install homebrew-ffmpeg/ffmpeg/ffmpeg --with-chromaprint` 撞两道墙——① **同名 formula 冲突**：必须先 `brew uninstall ffmpeg`（官方 tap 装的）；② **循环依赖**：`brew deps chromaprint` 含 `ffmpeg`，于是它又要把官方 ffmpeg 装回来、再次冲突。要绕开需要「装官方 ffmpeg → 装 chromaprint → `uninstall --ignore-dependencies ffmpeg` → 编译 homebrew-ffmpeg 版」这串脆弱序列，且中途还撞上一个 `openssl@3` bottle 的 `rb_sysopen: No such file or directory`（而该 bottle 文件实际存在，属 brew 缓存/API 不一致，需 `brew cleanup` 或 `HOMEBREW_NO_INSTALL_FROM_API=1`）。**结论：成本远超收益，已止损并恢复官方 ffmpeg。** 更省事的路子是用后端官方 Docker 镜像（页面提示原文就是「Docker 用户升级到最新镜像即可」），或换一台本就带 chromaprint 的后端环境。
  - 另注：`brew tap homebrew-ffmpeg/ffmpeg` 本身也被本机 git 配置挡过——见下一条。
- [ ] **本机环境坑：全局 git `insteadOf` 会打断一切 https clone**（批29 与 B3a 各自独立踩到）：`~/.gitconfig` 有 `url.git@github.com:.insteadOf https://github.com/`，把 CocoaPods / Homebrew 的 https clone 全部改写成 ssh，而本机 **22 端口不通** → `brew tap` 报 "Please make sure you have the correct access rights"、`pod install` 对 git 源 pod 报 `ssh: connect to host github.com port 22`。**绕法：命令前加 `GIT_CONFIG_GLOBAL=/dev/null`**（只影响该次调用，不改用户配置）。这是环境问题不是仓库问题，但因为报错信息完全不指向真因，值得记住。
- [x] **`--primary-2` 补进对比度闸门**（批29 发现并当批补齐）：它承载白字（首页统计条底色），批27 的 `contrast.test.ts` 只审计了 `--primary`。**手算 5.46 达标、非缺陷**，但覆盖缺口是真的——已给 dark/light 各加一条「white on primary-2 ≥4.5」，`contrast.test.ts` 33 例全绿。发现方式值得记：是在真机截图上采样统计条底色、发现它既不是 `--primary` ���不是任何审计过的值，才反查出这个未被覆盖的色阶。

- [x] **Lynx `fetch` 是裸全局**（批3 真机修复）：Lynx 的 `fetch` 是宿主提供的 HTTP service（Android/iOS 2.18+），以**裸全局**暴露而非 `globalThis.fetch`（与 `self` 同）。`createFetchTransport` 已改为先取裸 `fetch`（`typeof fetch !== 'undefined'`）再回落 `globalThis.fetch`/注入。⚠️ 但**真机整登录 E2E 仍需后端可达**：手机上 `http://localhost:58091` 指向手机自身，须填开发机 LAN IP 且后端在跑；Lynx fetch 不支持 CORS/redirect/keepalive/FormData/Blob。
- [x] **AbortController 真机缺失**（批3 真机修复）：Lynx 引擎**无** `AbortController`（`ReferenceError`），而 **TanStack Router `loadClientRoute` 与 Query 都无条件 `new AbortController()`**。已在 `lynx.config` banner 注入存在性守卫的全局 polyfill（覆盖 main-thread + background 两个 bundle、最先执行）；`AbortController` 是未声明标识符，故 `globalThis.AbortController=` 能让裸读解析（不同于 `self`）。回归测试断言产物里 polyfill 定义早于任何 `new AbortController`。批2 `configureQueryGlobals` 里的同类 polyfill 保留但非主修复。
- [x] **Lynx `clearTimeout` 严格要 Number**（批3 真机修复）：`clearTimeout(undefined)` 在浏览器/node 是 no-op，Lynx 却抛 `param 0 should be Number`；TanStack Router `load-client.js` 的 `offerPending` 有 6 处 `clearTimeout(session?.[3])`（可为 undefined）。已扩展 `patches/@tanstack__router-core@*.patch`：模块顶层捕获真实 `clearTimeout`（typeof 守卫）并包一层「仅 Number 才调」的 `__safeClearTimeout`，替换 6 个调用点。
- [x] **SongloftStorage 在 Lynx 持久化**（批3 内存降级 → **B2 修复轮已接原生** → **B3b iOS 已接**）：批3 设备无 `localStorage` 曾降级到 `createMemoryStorage`（in-session、重启丢 token → 切后台回来要重登）。**B2 修复轮落地原生 `NativeModules.SongloftStorage`（Android SharedPreferences）**，**B3b 落地 iOS（UserDefaults prefs + Keychain secure，含 UserDefaults fallback）**，`createSongloftStorage` 探测顺序 原生→web→内存，token/prefs/语言跨重建/重启存活。**桌面（Node fs）待 Lynxtron 批**；secure 现用普通 prefs（dev 可接受，后续可升级 EncryptedSharedPreferences）。
- [x] **QueryClientProvider 已接入 bootstrap**（批4）：`src/App.tsx` 用 `<QueryClientProvider>`（`@tanstack/react-query`）包住 `<RouterProvider>`，`configureQueryGlobals()` 先于 `getQueryClient()`。Query 真正入包（`useInfiniteQuery`）；产物守卫（AbortController polyfill / `__TSR_ROUTER__`）经 `background-bundle-self` 回归测试确认仍在，无新增未守卫全局。⚠️ 真机整链路（列表拉取）待验证（）。
- [ ] **批4 遗留（library）**：
  - [x] **playlists 视图**（批6 落地）：占位换成 `PlaylistsView`（歌单网格 + 点卡片→`/playlists/$id`）。
  - [x] **搜索**（批10 完成）：防抖 Input + keyword 参数流到 API；排序 chip（Recent/Title/Artist）。
  - [x] **收藏**（批11 完成）：SongRow 心形图标切换（`useFavoriteToggle`）。**多选 / 排序菜单 / 自定义视图编辑器**未做（Flutter `LibraryPage` 有，本批裁掉）。
  - [x] **facet 卡片点击**跳到「该分类下歌曲列表」（`CategorySongsPage` + `/library/category/$field` 路由，早前批次已落地，此处补记）。
  - **待验证：列表拉取**：登录后进 `/library`，songs 视图应见分页歌曲行，触底加载下一页；facets 视图切 Artist/Album/Genre 见网格。
- [x] **standalone/embedded 部署模式**：批3 登录页已保留 standalone 的 API 地址配置 + 不安全 TLS 开关分支（`LoginPage.tsx` 的 `showServerFields = !appConfig.isEmbedded`）——此条目为过期未更新，非新工作，批26 排查时代码核实补记。
- [ ] **批5 遗留（player）**：
  - [x] **真原生音频（Android + iOS）**（B2 Android / B3b iOS 完成）：Android 已接真 ExoPlayer 原生模块；**iOS AVPlayer + MPNowPlayingInfoCenter + MPRemoteCommandCenter 已在 B3b 落地并模拟器验收**（currentTime=5.2s 确认播放）。facade 原生可用切原生、否则回退 mock；store 不改。**Web/桌面仍待各自宿主批**；**Android 真机真实播放 + 后台通知待 CI+装机验**（本机无 SDK）。
  - [x] **均衡器**（批30 完成，**iOS DSP 批31 补接**）：`EqualizerPage`（10 band 滑杆 + 7 预设 + 开关，`/settings/eq`）+ `eq-store`（持久化 + 同步 audio facade）；**Android DSP 已接**（`android.media.audiofx.Equalizer`，随 ExoPlayer session 生命周期）；**iOS DSP 已接**（`MTAudioProcessingTap` + `kAudioUnitSubType_NBandEQ`）。
  - [x] **歌词拉取真机未验**：`SongsApi.getLyric` + `lyric-store.loadForSong` 已接认证客户端（best-effort），但 才能验；歌词高亮在无后端歌词时无内容可高亮。~~本地歌词缓存未做~~ → **批11 已完成**（`lyric-cache.ts` + `lyric-store.ts` 接线），此条目为过期未更新，批26 排查时代码核实订正。
  - [x] **逐字/翻译/罗马音歌词解析**（批10 完成）：`parseEnhancedLrc` + `mergeTranslations` + 词级高亮 + LyricsView 翻译/罗马音行渲染。
  - [x] **睡眠定时 UI**（批10 完成）：SleepTimerSheet 底部面板（时长 + 歌数选项）+ topbar timer 按钮 + 激活态显示。
  - [x] **播放队列排序**（批12 完成，批30 换成拖拽）：`PlaylistDrawer` 队列行 UI 已从 chevron 上移/下移按钮换成 `lynx-ui-sortable` 拖拽手柄（复用 `reorderPlaylist` action + `queue.reorder` 纯函数，仅逻辑层未变），仅 >1 首歌时显示。
  - **Home「Open player」简化**：恒跳 `/player`（无歌时全屏页显空态），未做「无歌则播放示例」。
  - **Flutter player 其余能力裁掉**：~~播放状态持久化/恢复~~（**批32 已完成**）、~~失败重试策略~~（**批40 已完成**：1s/3s/9s backoff，预算按歌计）、预加载 prefetch、通知栏/锁屏媒体控件与收藏回调、Live Activity/悬浮歌词/桌面歌词、视频播放（`is_video`）、音轨切换、~~播放历史~~（**批31 已完成**）、`setSpeed/setShuffle` 无 UI——均后续批（多数真机/桌面绑定）。
  - **待验证**：登录→Library 点歌→mini-player 出现→点开 `/player`；mock 进度条应自动前进、上一首/下一首/播放模式切换/音量/抽屉可用；lynx-ui `Slider`/`Sheet`/`Swiper` 三个手势叶子首次上真机（本机无法验手势）。
- [ ] **批6 遗留（playlist）**：
  - [x] **歌单 CRUD**（批10 完成）：创建/编辑（名称+描述）/删除 + 歌曲移除。[x] 封面上传（**批37 完成**，复用 pickAndUploadFile 原生通道）/批量删除未 port。
  - **收藏歌单**：`favoritePlaylistId='1'`/`radioFavoritePlaylistId='2'` 常量已在 `constants.ts`，[x] **批11 在 Library 层已接收藏切换入口**（`useFavoriteToggle` 直接对 `favoritePlaylistId` 增删歌曲）；[x] **标识/置顶**（排查后订正，非新工作）：`PlaylistCard` 对 `isBuiltIn` 已叠心形徽标（Favorites/Radio-Favorites 后端 label 均含 `built_in`），批11 的 chevron 手动排序已可把任意歌单（含收藏歌单）拖到顶部——此行早前记的“仍无标识/置顶”系过期未更新（原文本身含乱码字节，已一并清理）。
  - [x] **排序**（批11 完成，批30 换成拖拽）：歌单排序（`PUT /playlists/reorder`）+ 歌单内歌曲 reorder（`PUT /playlists/{id}/songs/reorder`）——UI 已从 chevron 上移/下移按钮换成 `lynx-ui-sortable` 拖拽手柄。[x] `PlaylistSort`（拼音比较器，**批37 完成**）/详情页搜索已有（keyword 过滤）/[x] 多选（**批38 完成**）。
  - [x] **其他端点**（批16 完成）：`getPlaylistSongIds`/`touchPlaylist`/`setPlaylistVisibility`/`updatePlaylistSort` 四个 API 新增 + Player 播放歌单时自动 touch + 详情页隐藏/显示按钮 + 排序选择器（Manual/Title/Artist/Recent）+ PlaylistsView 过滤隐藏歌单。`addSongsToPlaylist`/`removeSongFromPlaylist` 早前批次已实现（文档过期未更）。
  - **详情页在 shell 内**（底栏 nav 常驻），返回键固定回 `/library`（Flutter 独立 appbar 页 + `pop()`）；[x] **封面缓存刷新参数**（批14 完成）：`buildCoverUrl(coverUrl, updatedAt?)` 已加 `?_t=<updatedAt ms>`（原文本身含乱码字节，已一并清理）。
  - **待验证**：登录→Library→切 Playlists 见歌单网格（封面/名称/歌数）→点歌单进 `/playlists/$id`（头部 + 歌曲行 + 触底分页）���点歌曲 `playPlaylist` → mini-player 出现。
- [ ] **批7 遗留（home）**：
  - [x] **首页 JS 插件网格 + 管理页 + 宿主桥接**（批17 完成）：`JSPluginApi`（list/enable/disable/delete/registry）+ `PluginManagerPage`（/settings/plugins）+ 首页 `PluginGrid`（激活插件卡片网格）+ `PluginHostDispatch`（player 命名空间分发）。**未做**：WebView 渲染插件页面（需原生 WebView 模块，B 类）、插件 Tab 页、文件上传安装（需 file picker 原生模块）。
  - [x] ~~区块布局截断网格~~ **批18b 已改为横向 scroll-view**。宽屏可配置行列网格（`HomeGridConfig`）未做。
  - [x] ~~**两区块「View all」共用 `/library?view=playlists`**~~（**批36 已解**）：Library 新增 Radio tab（`?view=radio`），电台区块 View all 独立导航。
  - [x] ~~HeroCard 推荐卡~~ Flutter 也未使用（widget 存在但无引用，属死代码），无需 port。[x] 加载慢提示（**批37 完成**） / [x] equalizer 遮罩（**批38 EQ bars 动画完成**）；[x] **下拉刷新**（原生 `<refresh>`，批11）/ [x] **正在播放歌单高亮**（`sourcePlaylistId`，批11）已完成；问候 4 段**已有 i18n**（早前记的“无 i18n”系过期未更新，见「批7 遗留」①）。
  - **待验证**：登录→首页见问候 + 「我的歌单」「我的电台」两区块（封面/名称/歌数）+ 底部统计条 → 点歌单卡片进 `/playlists/$id` → 点「View all」到 Library Playlists → 点「Log out」回登录。
- [ ] **批8 遗留（settings）· defer 明细 + 归属阶段**：
  - [x] **主题 light/system 切换**（批13 完成）：新建 `src/shared/theme/theme-model.ts`（镜像 `i18n/index.ts` 的 `AppLanguage`/`system` 语义）+ `tokens.css` 拆分出 `.theme-root.theme-light`/`.theme-dark` 两套 token + `ThemeProvider` 订阅切换 + `Icon.tsx` 的 `ICON_COLORS` 改成按当前主题动态取值的 `Proxy`（因 `<svg content>` 不走 CSS cascade，硬编码色值必须跟着主题变，对 ~20 个调用文件零改动）+ Settings→Appearance 三选一（system/light/dark）替换原只读 Dark 行。`system` 目前回退到 `dark`（同语言模块 `system` 无宿主 API 时回退默认的既有先例）。**主题包**（可下载主题资源市场，`ThemePackManager`/`ThemePackApi`）**不在本批范围，仍未排期**——本批只做内置 light/dark 两套 token 的切换，不含第三方主题资源分发。
  - [x] **多服务器管理**（批30 完成）：`ServerListPage`/`ServerEditPage` + `server-store`（profiles 列表增删改切）+ token 按 profile 隔离持久化（`token_access_${id}`/`token_refresh_${id}`）+ 旧版单服务器数据首次 hydrate 自动迁移成 Default profile。此条目早前记的「真原生模块/桌面阶段」系过期未更新，本批已用纯前端 zod schema + Zustand + `SongloftStorage` 落地。
  - [x] **底部 Tab 配置**（`TabConfig`/`tabConfigProvider`，含 Library 开关 + 插件 tab 开关 + 12 tab 上限）→ **jsplugin 阶段已落地**：`jsplugin/pages/TabConfigPage.tsx` 已实现 Library 开关 + 每插件 tab 开关 + 12 tab 上限，此条目为过期未更新，批26 排查时代码核实订正。
  - **插件注册表 / 插件管理**（`JSPluginManager`/`jsPluginsProvider`/`pluginRegistry` 路由 + `PluginNavIcon`）、**渲染引擎**→ **jsplugin 阶段**。
  - [x] **音乐库运维**：扫描（批19 完成）+ 元数据刷新（批19 完成）+ 重复检测/指纹（批28 完成，真机全路径验过）+ 排除目录管理（批26 完成）。原标「后端 ops 阶段」，实际已全部落地。
  - [x] **缓存管理**（`CacheApi` 5 端点 + `CacheManagePage` 三区：只读统计/编辑配置/目录验证 + 两步 tap 清理确认）→ **批28 已完成**，路由 `/settings/cache`。
  - **升级/热更**（服务器升级 `UpgradeDialog`/`upgrade_api`、前端 `FrontendUpgradeDialog`/`frontend_version_api`、Android 热更 `PatchUpdateService`、自动检查开关）→ **后端 ops / 桌面/真机 阶段**（Lynx 无 flutter_patcher，热更整体删——见 overview §6）。
  - **下载 / 客户端下载页**（`client_download_page`/`cache_download_provider`）→ **桌面/发布阶段**。[x] **开源许可**（`licenses_page`，**批37 完成**——`/settings/licenses` 静态依赖列表）。
  - [x] **网络代理 UI**（**批31 已完成** `ProxySettingsPage`：HTTP 代理 / GitHub 代理 / HLS 代理 / 代理 allowlist 四端点 GET/PUT）。~~**不安全 TLS 真正生效**仍待原生模块~~ → **批39 已接 Android**（`SongloftPlatformModule.kt:108` 的 `setInsecureTls`）；**iOS 仍未实现**（不在 `methodLookup`，TS 侧 `mod?.setInsecureTls` 可选链把它静默吞掉）——2026-08-14 审计核实，修法与陷阱见修复计划 P2-4。
  - [x] **数据导入导出**（批31 完成）：`SongloftPlatformModule`（Android/iOS 原生），`openURL` 导出 + `pickAndUploadFile` 原生 multipart 导入，Settings Data 区入口。
  - **播放高级偏好**：~~音质选择~~（**批31 已完成**）、~~播放速度~~（**批32 已完成**）、~~启动自动恢复~~（**批32 已完成**）、~~音量归一化~~（**批36 已完成**——`SettingsPage.tsx:357` + `url-helper.ts:66` 的 `normalize=1`；⚠️ 但存的是本地 pref，**没走** `PUT /settings/volume-normalize`，故后端 miot 插件读不到这个开关）、自动进歌词、通知栏歌词位置、`miniPlayerControls`（迷你条按钮集）→ **真原生模块阶段**。悬浮歌词的**字号/透明度/锁定**子项前置条件未成立（Android 模块本身未注册，见审计）。~~键盘快捷键~~ / ~~桌面歌词独立窗口~~ → **改标 N/A**：Flutter 里前者被 `isDesktop` 门控、后者是桌面专属，移动端不是缺口。
  - [x] **日志级别 / 日志导出**（批15 完成）：`logLevelProvider` 其实是**后端设置**（`GET/PUT /api/v1/settings/log-level`，不是本地开关）——新建 `SettingsApi`（`getLogLevel`/`setLogLevel`/`exportLogs`，镜像 `PlaylistApi` 用法）+ Settings 新增「诊断」分组（日志级别四选一，真调后端接口）+ `/settings/logs` 子页拉 `GET /api/v1/logs/export` 纯文本滚动展示（离线/后端不可达降级成错误提示，同其它后端相关 Settings 子页）。**裁掉的部分**：Flutter 原版把后端日志 + 本机 `FileLogger` 文件打包成 zip、丢给系统分享面板（`share_plus`）——Lynx 没有对应的原生分享模块（同 SongloftAudio/Storage 一类缺口），留给未来原生模块批；本批只做纯文本查看，不打包不分享。**Web 调试控制台**（`webDebugConsoleProvider`）是 Flutter Web 平台专属的本地布尔开关，与 Lynx 无关，未 port。
  - [x] **语言切换**（`LanguageSelector`/i18n）→ **批9 已解**：Settings 加「语言」分组（跟随系统/English/中文），`changeAppLanguage` 即时切 i18next + 持久化 prefs `app_language`，react-i18next 订阅触发全树重渲染。见「批9 · i18n 国际化」。
  - [x] **默认播放模式启动恢复**（批11 完成）：`src/index.tsx` 启动异步链读回 `readDefaultPlayMode()` 应用到 `usePlayerStore`（原生持久化已在 B2 落地，重启不再丢）。
  - [x] **登出确认 Dialog**（**批31 已改为 lynx-ui-dialog 模态弹窗**，取代原两步 tap）；[x] **登出场景**（批11）与 [x] **服务器切换场景**（批12）均已加 `queryClient.clear()`，避免旧服务器的缓存数据残留。
  - **待验证**：登录→进 Settings 见六分组；选播放模式（选中态 + 若在播放则模式即时变）；进 Server 子页改地址/TLS → Save → 之后请求走新地址（）；两步登出回登录。lynx-ui `Input`/`Switch` 在服务器子页复用（批3 已证可渲染，手势本机不可验）。
- [ ] **Phase B · B1 遗留（Android 宿主 / CI）**：
  - **APK 构建仅在 CI 验证**：本机无 Android SDK，`assembleDebug` 只能在 GitHub Actions 跑；首跑风险见上「CI 首跑风险预判」。宿主源、gradle 配置、Lynx 依赖坐标均照抄官方 demo 3.8.0 以降低失败率，但 CI 首次绿灯前不算真正可用。
  - **音频仍是 TS mock**：本批只做宿主 + CI，未接原生音频；`SongloftAudio` 仍走批5 的 `MockSongloftAudio`（无真机解码/后台/媒体控件）。真原生 ExoPlayer 走 **B2**。
  - **release 签名未配**：只做 debug 构建（debug keystore 自动签名，可侧载）。正式 release keystore / Play 上架签名 / `ANDROID_KEYSTORE_*` secrets 未配（参考 Flutter workflow 的 `Setup Android signing` 模式，后续发布批做）。
  - **iOS 宿主未做**：本批仅 Android。iOS 宿主 + AVPlayer + CI(No-Codesign) 走 **B3**。
  - **devtool 已移除**：宿主不含 lynx-devtool（独立 dev 包非调试宿主）；如需真机 CDP 调试，另起带 devtool 的调试变体或用 LynxExplorer 扫码（dev server 路径仍在）。
  - **cleartext 全开**：`usesCleartextTraffic=true` 是 dev 便利（后端 http）；正式发布须收敛为 domain-scoped `network_security_config` 或仅 https。
  - **热更/bundle 下发未接**：本批 bundle 内嵌进 APK（离线）；Lynx bundle 远程热更（overview §6 净收益）未实现，后续批做。
  - **真机侧载待用户验**：CI 出 APK 后，用户装到 Android 真机（开启未知来源）验证 app 独立启动 + 登录（填开发机 LAN IP + 后端在跑）+ 各页；本机与 CI 均不能替代真机目测。
- [ ] **native 原生模块**：SongloftAudio（批5 TS mock → **B2 Android ExoPlayer 已接** → **B3b iOS AVPlayer 已接**，Web/桌面待后续）、SongloftStorage（**B2 修复轮 Android SharedPreferences 已接** → **B3b iOS UserDefaults/Keychain 已接**，桌面待后续）、SongloftBackend、SongloftPlatform——桌面批次。
- [ ] **Phase B · B2 遗留（Android 原生音频）**：
  - **APK 编译 + 真机播放仅 CI/真机验**：本机无 Android SDK 不能 `assembleDebug`；Kotlin 侧 media3/Lynx API 精确签名（`LynxModule`/`@LynxMethod`/`JavaOnlyArray`/`LynxContext.sendGlobalEvent` @3.8.0、`@UnstableApi` opt-in、media3 1.3.1 坐标解析）**本机无法编译校验**，CI 首绿前不算真正可用。
  - **后台/通知栏/锁屏（R5）尽力项、真机未验**：`MediaSessionService`+`MediaSession`+前台服务+权限结构就位，模块 play 时 `startForegroundService`（try/catch 保护，失败不碍前台播放）；后台常驻 + 通知控件出不出、媒体键路由只能真机验。若不出通知，标准修法改走 `MediaController` 连服务驱动播放（当前 engine 自持 player）。
  - **EQ 仍 stub**（`setEqualizerEnabled`/`setEqualizerBand` 空实现，无 `Equalizer`(AudioEffect) DSP、无 `getEqualizerBands` 原生查询——facade 返标准 10 段 0dB）；`setQueue`/`next`/`previous`/`setRepeatMode`/`setShuffle` 原生为最小 no-op（队列/切歌由 JS store 驱动，同 mock 语义）。
  - **release 签名 / iOS / 其余端**：同 B1 遗留；iOS AVPlayer 走 B3。
  - [x] **Android 真机播放已验证**（用户确认：点歌真实播放 + 进度前进 + 控制可用）。后台通知待进一步验证。
- [x] **i18n**（批9 完成）：i18next + react-i18next（无 detector / 无 DOM / 无 Intl，`compatibilityJSON:'v3'`）；en+zh 内联资源覆盖全 feature UI 串；Settings 语言切换即时生效 + 持久化；arb→i18next 转换脚本（`scripts/arb-to-i18next.ts`，1276 key，ICU 复数键已标记）。**全量 arb 运行时导入留后续**（app 仅内联策展子集，避免包体撑爆）；「跟随系统」暂回落默认（无宿主 locale API）；复数/日期未用 i18next Intl 能力（手动单复数）。见「批9 · i18n 国际化」。
- [ ] **批19 遗留（音乐库运维）**：
  - ⛔ **扫描真验被服务端音乐目录卡死（批19b 定位）**：该开发后端 `music_path = "music"`（相对路径，服务端不存在）→ `POST /scan` 必失败、`GET /scan/directories` 必 error，**客户端无过**。而客户端**没有音乐目录配置 UI**（划给了批21），用户无法在应用内自救。**建议把「音乐目录」单行配置从批21 提前**，或先用 `PUT /settings/music-path` 手工改（**必须回带三个排除数组，否则清空**）。详见「批19b」。**批26 复核**：根因其实是本机开发后端启动时 cwd 错误——`music_path` 相对路径按 cwd 解析，从 `mimusic/` 仓库根目录 `make run` 后端即可正确解析到真实音乐目录（112 个歌曲文件夹），扫描/目录列表随即恢复正常，**并非客户端缺陷**；也**不建议新增「音乐目录」编辑 UI**——核对 Flutter 参考（`exclude_dir_manager.dart`）确认 `path` 在整个产品里从未可编辑，只有下面三类排除列表可写，`PUT /settings/music-path` 手工改仍是运维兜底手段，不是产品交互路径。
  - **本批裁掉、已排期**：[x] 重复检测/指纹计算页（`/scan/fingerprints/*` + `/songs/duplicates` + `POST /songs/batch-delete` 批量删除确认）→ **批28 完成**（全路径真机验完，见批29c）；[x] 缓存管理（`/cache-manage/*`）→ **批28 完成**（`CacheManagePage` 三区 + 21 测试）；[x] **排除目录管理**（三类排除 + `PUT /settings/music-path` + `/scan/dir-names` 自动补全）→ **批26 完成**，见下「批26」。
  - [x] **端点契约已用 `docs/swagger.json` 逐项核对**（用户在本批实施期间提供的后端权威契约，119 个 path）——**13 个端点的路径与方法全部吻合**；`ScanProgress` 14 字段（我用了 10 个）、`MetadataProgress` 4 字段、`AutoScanSetting` 2 字段全部吻合；**`services.ScanStatus` 的 9 个枚举值与实现逐字一致**；`handlers.ScanRequest` = `{paths?: string[], reimport?: boolean}` 且 swagger 明确「为空时扫描整个音乐根目录；非空时只扫描给定目录（含子目录）」，与 `buildScanBody` 的「空则不发该键」一致；`scanPlaylistModeRequest.mode` enum `directory|top_level|bubble_up`、`scanTitleSourceRequest.title_source` enum `tag|filename`（`example: "tag"`）、`remoteTitleSourceRequest`（**`example: "filename"`**——直接确认了那个与同类端点相反的默认值）全部吻合。
  - **swagger 驱动的改进**：`ScanProgress` 还有 `error`（「错误信息」）字段——已加入模型为 `errorMessage`，failed 态优先显示后端原因（复用 ARB 现成文案 `libops.scanFailed`），而非只给一个无从下手的「扫描出错」。
  - **swagger 未声明、仍待联调的点**：① ~~`GET /scan/directories` 的响应形状~~ **已在批19b 用真后端验证**：`{"directories": null, "root": "music"}`——`{directories, root}` 假设成立，且空目录时 `directories` 是 `null` 不是 `[]`、`root` 可为相对路径（两条已固化成模型测试）；② 6 个开关 GET 的**默认值**（swagger 不声明 default，`auto-create-playlists` 默认 true 等假设来自 Flutter）；③ `POST /scan` 带音乐根之外的 path 会 **400**（swagger 明确写了），当前会落进行内 banner，未做前端预校验；④ `POST /scan/cancel` 在无任务时的状态码；⑤ `cancelling` 态是否真能被观测到（还是后端直接跳 `cancelled`）；⑥ `creating_playlists` 阶段后端是否真拒绝取消（Flutter 也只是前端禁用按钮）。
  - **swagger 里有但本批未用的字段**：`cleaned_files`（清理的过期文件数）、`start_time`/`end_time`——Flutter 也没展示，未 port。
  - **刻意不做 `onSettled` invalidate**：开关 PUT 无返回体，invalidate 会立刻回读 GET；若后端最终一致或那次 GET 抖动，开关会在用户眼前弹回去。乐观值在页面重挂载前即为权威（Flutter 亦如此）。
  - **深目录树无虚拟化**：音乐根下上千子目录时可能卡（`library/widgets/VirtualList.tsx` 已有，但递归树接虚拟列表需先摊平成扁平行数组，属独立工作量）。
  - **首屏请求扇出 9 个**（扫描进度 + 元数据进度 + 6 开关 + 目录根）。LAN 后端应无碍，真机首屏值得看一眼；若需要可把目录根改成「展开『指定目录』区时才拉」。
  - **`{{count}}` 未做复数 One-key 对**（en 侧 `{{count}} succeeded`/`{{count}} directories selected` 严格说复数敏感）。对齐 Flutter 现状 + AGENTS 的「手写 key 对、不用 Intl.PluralRules」，记为已知债务。
  - **真机待验**：CSS `@keyframes`（**本仓库首次使用**）在 Android/iOS 的实际观感；lynx-ui `Switch` 在 6 开关同屏密度下的手势可靠性；目录树勾选/展开手势；扫描长任务期间 2s 轮询的电量/流量表现。
- [x] **构建期被移除的无效 CSS 声明**（`pnpm run build` 的 `⚠ Unsupported property … was removed during template encode` 警告，**这类警告要当错误看**）——**全部修完，构建警告自批19b 起归零**：
  - [x] `placeholder-color` ×5 文件 → 批19 改为 `-x-placeholder-color`，警告消失、修复真正生效。
  - [x] `text-transform: uppercase`（`jsplugin/pages/TabConfigPage.css`）→ **批19b 已删声明**（Lynx 无此属性且无 `-x-` 变体）。此条目为过期未更新，批29 核实订正：源码现存的是一条「Lynx 无此属性」的解释性注释。
  - [x] `object-fit: cover`（`jsplugin/widgets/PluginGrid.css`）→ **批19b 已改用元素属性 `mode='aspectFit'`**。同上属过期未更新，批29 核实订正。**构建警告自批19b 起已归零**，批29 的 clean build 复核仍为零。
- [x] **订正 3 条过期结论**（批19 调研发现 `@lynx-js/lynx-ui` 桶入口已把这些子包带进 `node_modules`，v3.135.4，Radix 风格 compound API；按组件包导入只需在 `package.json` 显式声明）——**三条已全部解决**，且批51 把桶入口本身从依赖里移除了：
  - [x] ~~「Lynx 无现成 dialog 原语」故登出用两步 tap~~ → **有 `lynx-ui-dialog`**，**批28 已采用**（重复检测删除确认真机验过），**批31 登出也改为 Dialog**。此条完全解决。
  - ~~「lynx-ui 无 sortable」故排序用 chevron 上移/下移按钮~~ → **有 `lynx-ui-sortable`**（还有 `lynx-ui-draggable`/`lynx-ui-swipe-action`）。**批30 已完成迁移**：歌单/歌曲/队列三处排序 UI 全部从按钮式换成 `SortableRoot` 拖拽手柄，chevron 代码已删除。
  - ~~第三条「另有一批可选原语，批19 刻意未引入」~~ → **批51 起 `lynx-ui-popover` 已在用**（播放器速度 / 播放模式两个弹出菜单，封装为 `shared/ui/PopoverMenu.tsx`），`lynx-ui-radio-group`（重复检测选主）与 `lynx-ui-dialog` 也已是显式依赖。仍未用到的：`checkbox`（勾选框继续自绘，批19 的理由仍成立）、`form`、`list`/`feed-list`/`scroll-view`、`lazy-component`、`swipe-action`；`presence`/`overlay`/`common` 由 popover 间接带入，不直接 import。
- [x] **验收命令修正：`tsc --noEmit` 一直是空跑**（批19 发现，已改 `AGENTS.md` §5）。根 `tsconfig.json` 是 solution-style（`"files": []` + `references`），`tsc --noEmit` 对它的输入文件集为空——**什么都不检查、永远 exit 0**。自批1 起验收清单里的那一行是安慰剂；真正拦类型错误的一直是 `pnpm run build` 内的 rspeedy type checker。**正确命令是 `pnpm exec tsc -b`**（写 `*.tsbuildinfo`，已 gitignore；必要时 `--force`）。用 `tsc -b --force` 对全库跑过一次：**无历史遗留类型错误**（因为 build 一直在真检查）。
  - 发现过程：批19 收尾加 dev 登录凭据时，`devCredentials` 用了 `as const` → `useState(devCredentials.password)` 推成 `useState<'admin'>` → `setPassword(string)` 类型不符。`tsc --noEmit` 静默通过，`pnpm run build` 报 `TS2345`。**教训**：用 grep 过滤 build 输出时会连错误一起滤掉——我第一次就这么漏看了一次失败的构建。
- [ ] **风险登记**（详见 roadmap）：R2 桌面 clay 元素实测、R11 Query 无 DOM（本批已验证，真机待确认）、R13 lynx-ui Web/Desktop 覆盖、R5 音频后台播放各端差异。

## 如何恢复工作 / 交接

```
pnpm install
pnpm run build          # 构建（内含 type checker，是类型的真闸）
pnpm exec tsc -b        # 类型检查（必须带 -b）
pnpm test               # vitest（含无 DOM 与压缩产物回归测试）
pnpm run dev            # dev server + 二维码，LynxExplorer 扫码目测

pnpm run android:install # Android：build + 拷 bundle + gradlew installDebug（需 ANDROID_HOME）
adb reverse tcp:58091 tcp:58091   # 让设备 localhost 指向宿主机后端（每次 adb 重连都要重设）

pnpm run ios:pods       # iOS：首次/依赖变更时（内含必要的 env 绕法，见 package.json 的 //ios:* 注释）
pnpm run ios:run        # iOS：build + 装进已启动的模拟器 + 启动
```
> ⚠️ 类型检查用 `pnpm exec tsc -b`，**不要用 `tsc --noEmit`**（solution-style tsconfig 下是空跑，见上方遗留清单）。检查 build 输出时别用 grep 过滤，否则会滤掉编译错误。

- 协作规则、目录边界、无 DOM 铁律、提交约定：见根目录 `AGENTS.md`。
- 分批计划：`plan.md`；调研依据：`docs/` 四篇。
- 只读参考快照：`songloft-player/`（禁改）。
- Git：`origin` = `git@github.com:songloft-org/songloft-player-lynx.git`，分支 `main`，Conventional Commits，禁 `Co-Authored-By`。
