# 工作交接（2026-09-11 · 批69 视频播放体验档 A）

> 本文件是**给接手 AI 的交接说明**，只回答三件事：现在在哪、还剩什么、怎么验证。
>
> **读文档顺序**：① [AGENTS.md](../../AGENTS.md) §4–§6（铁律，必读）→ ② 本文 §3「剩余工作」→ ③ [pitfalls.md](pitfalls.md)（踩坑实录：每条铁律背后的证据）。细节按需查 [progress.md](progress.md)（逐批交付）与 [bugs.md](bugs.md)（逐条缺陷根因）。
>
> **未提交（工作树，批69）**：**视频播放体验「档 A」（纯 JS）** —— 用户报「看看视频播放是不是可以优化一下…看 MV 更方便一点」，先出方案再按档分批（档 A 纯 JS / 档 B iOS 原生生命周期 / 档 C Android 控件与 HLS 等待 / 档 D 待定取舍），本批是档 A。**① 三个改动**：**(A1)** `player-store.ts` 新增 `currentSong` 订阅，换歌/清空队列即 `close()` 视频面——真根因是全屏视频面借给**播放器**而不是某首歌（宿主把 surface 挂在正在跑的引擎上），auto-advance 后仍画上一首，而 JS **从不调 `close()`**（全仓唯一调用点在 `e2e-bridge.ts`）；判据取「上一首是否可能被观看」而非无条件调用（`close()` 是一次过桥往返）。**(A3)** 曲库歌曲菜单新增「观看 MV」+ 新的 `video` 图标（`buildSongMenuItems` 加第三个参数 `SongMenuOptions.canWatchVideo`，由调用方算、保持该模块纯函数）；从列表进 MV 从 3 步降到 2 步。**(A4/A5)** `enterVideoSource()` 改为返回 `'skipped' | 'switched' | 'failed'`（原为 `Promise<void>`，失败只写进 `errorMessage`，而**该字段全仓无渲染消费者**），失败提示改「视频转码失败」；`'MV'` 走 i18n。**② 入口判据收到一处**（`features/player/data/video-open.ts` 的 `canWatchVideo` / `openCurrentSongVideo`）：封面徽标与菜单项共用，因为**这个判据写错过两次且都是静默的**（Web、无宿主模块的包里都是可点但什么都不发生的胶囊，外观与可用态一模一样）。**③ 反向验证 2 项全咬**。**④ iOS 模拟器实测（「黑屏」问题已消失）**：App 当时指向用户的远端隧道 18091，**改用宿主 HTTP 直接喂流**（`file://` 会被 `buildResourceUrl` 加基址前缀而失效），因此**没有碰任何登录态**（收工 `auth=authenticated`、`base=http://localhost:18091` 原样）；实测 `open()`/`isOpen()` 由 **true** 在换歌后变 **false**，6s MV 播完 auto-advance 同结论、整屏均值 (32,33,32) → (210,215,221)（黑屏 → App UI），菜单项 `.global-menu__items` 高 **324 vs 280**（差值 44 = 一行，只视频歌才有）。**⑤ 设备上顺带查出并入库 1 条新缺陷**：`format: mkv`（iOS 判 `hls`）实测 `enterVideoSource()` 返回 **`'switched'`** 而远端实际 404 ⇒ **失败的转码请求不一定 reject `load()`**（错误由 `audio.on('error')` 异步送），A4 只覆盖了「load 真的抛」那类，404 这类仍回落「该文件没有视频轨」——修法需要宿主分开回答「item 加载失败 / ready 但无视频轨」，**已排入档 B**，见 [bugs.md](bugs.md)。**⑥ 验收**：`tsc -b` 绿 / **2564 vitest 全绿（239 文件，新增 16 条）** / `pnpm run build` 双产物 / `pnpm run build:web` 绿。**未验**：Android 与 HarmonyOS（本批只在 iOS 模拟器量）；档 B 的 P0-2（iOS Done 关闭不复位 `presentedVC`，**推断未实测**）。细节见 [progress.md](progress.md) 批69 条目。
>
> **上一代码批次（批68 · 已提交 `b0f09ec` + `00dde50`）**：清理两处「写了没接线」的残留。**① 孤儿样式表**：脚本扫 `src` 86 个 CSS × 全部 `import '*.css'`，恰好 **2 个从未被加载**（`src/shared/ui/buttons.css` 48 行、`src/routes/pages.css` 104 行）—— 未 import 的样式表不可能失败/告警/出现在任何测量里，所以它们能一直藏着；已删，并把 `LoginPage.tsx` 根元素残留的 `page page--centered` 一起摘掉（它们的规则**只活在被删的文件里**，删后全库已无任何被加载的 CSS 定义这两个类 ⇒ 登录页外观不可能变化；竖居中是两个 `<view style={{flex:1}}/>` spacer 做的，不是 `justify-content: center`）。新增闸门 `src/__tests__/orphan-css.test.ts` 2 条（CSS 必须被 import；import 必须指向存在的文件），反向验证 2/2 全咬。**② `--shadow-focus` 删除**：零消费者，且四端都没有 tab 顺序与按键处理 ⇒ 焦点环不可达；`box-shadow` 本身四端支持，所以不是能力问题而是没有触发者。`tokens-hig.test.ts` 的断言**反向**为「必须没有」（再出现时它在问「消费者在哪」），另两处注释与 `bugs.md` 嫌疑清单同步。**刻意不做**「令牌必须有消费者」的总闸门：117 个令牌里 26 个零消费，多数是刻意调色板/语义档位，会造 25 条假阳性。**③ 验收**：`tsc -b` 绿 / **2548 vitest 全绿（237 文件）** / `pnpm run build` 双产物 / `pnpm run build:web` 绿；iOS 新 bundle 实测 `/player` 无障碍树仍 **TOTAL=16**、`/library` **87**（字号复位后同屏多几行）。**未验**：登录页设备端 A/B（已登录态被守卫重定向，改用构造性证明）。**④ 评审清单在此收尾**：D1（按压态）/ D3（对比度开关）/ D4（图标阻尼）/ D5（无障碍名称）/ D6（只报不改的 spike）/ 本批（`--shadow-focus` + 孤儿样式表）均已落地；**D2（曲库视图默认可见集）经用户 2026-09-11 明确决定「不做」，不要再提**——它需要改父仓库 `internal/handlers/library_browse_setting.go` 的默认集，用户的判断是这个改动不值得。细节见 [progress.md](progress.md) 批68 条目。
>
> **上一代码批次（批67 · D5 · 已提交 `d71c431`）**：图标按钮接通 Lynx 无障碍名称。**① 这是「写了没接线」的第三次**（前两次：批64 `:active`、批65 `.increase-contrast`），而且这次属性名本身就是假的——全仓 12 处 `aria-label` **在 Lynx 里不存在**（`@lynx-js/types` 只认 `accessibility-label`）。**② 只有 label 还不够**：iOS 上 `<view>` 默认不是无障碍元素（`LynxUIView -enableAccessibilityByDefault` = NO、只有 `LynxUIText` = YES），label 挂在 VoiceOver 永不聚焦的 view 上等于没写；**`accessibility-element` 才是开关**。lldb 实测改动前 `/player` 无障碍树 **TOTAL=10 全是 `LynxTextView`**，心形按钮带着死 `aria-label` 完全缺席。**③ 范围按用途反推、无手写名单**：只补「可点（`bindtap|catchtap`）+ body 含 `<Icon>` + body 无 `<text>`」的元素（新按钮出现时手名单必过期，而这正是闸门的价值）。新增 `src/shared/testing/jsx-elements.ts` + 闸门 `a11y-label.test.ts`（`src/` 内禁 `aria-*=`、`accessibility-label` 必须配 `accessibility-element`、可点图标元素必须两者齐备）。**④ 19 个 `common.*` 标签走 i18n**，命名动作不命名状态。**⑤ 禁用态补 `accessibility-traits`**（`canX ? 'button' : 'disabled'`）——D1 的「禁用 = 摘 handler」会留下可聚焦但无动作的哑元素；**不铺 `'button'`**（改变朗读语义，超出目标），也**不写 `'button,disabled'`**（iOS 转换器接受逗号列表，但 TS 的 `CommonAccessibilityTraits` 是单 token 联合类型）。**⑥ 真机验收（lldb 读无障碍树）**：`/player` **10 → 16**（新增 6 个 `UILynxView`：上一首/播放/下一首/加入收藏/播放队列/收起；上一首与下一首 `tr=1` = Button），`/library` 整页 **82** 个元素、每个歌曲行都带出 `收藏`/`更多操作`（改动前是 `ael=0` 的缺席项）。**⑦ 验收**：`tsc -b` 绿 / **2546 vitest 全绿（237 文件）** / `pnpm run build` 双产物 / `pnpm run build:web` 绿 / 闸门反向验证全咬。**⑧ 未验**：Android 与 HarmonyOS（属性矩阵三端都有声明，本轮只在 iOS 读树）；未做全量 a11y（焦点顺序、动态文案；`--shadow-focus` 仍是同一模式的未修项）。**⑨ 本批自己踩的坑（别的闸门咬住的）**：解释写在 JSX **开标签内部**的行注释里，`Lynx's` 的撇号翻转了共享扫描器 `openingTags` 的引号状态、把 `MiniPlayer.tsx` 后半段吞成一个标签，`a11y-tap-target` 因此把 36px 的 `.mini-player__play` 读成可点元素（红 2 条）。已把散文移出标签，并**删掉 `openingTags` 那条 `depth > 0` 守卫**（其「属性位置不会有 `//`」的前提被本批推翻），反例固化为 `jsx-classes.test.ts` 第 12 条（放回守卫即转红），`pitfalls.md` §6 相应订正。**⑩ 顺带**：批66 留的设备字号档位已复位（删 app 容器 `songloft_prefs.plist` 的 `font_scale` 键 ⇒ thumb `left` 回到 139.67）。细节见 [progress.md](progress.md) 批67 条目。
>
> **上一代码批次（批66 · D4 · 已提交 `3f03f15`）**：`Icon` 改为按字号**阻尼**缩放 —— `Icon.tsx` 内 `1 + (getFontScaleNumber() - 1) * 0.5`（新导出 `ICON_SCALE_DAMPING` / `iconScaleFactor()`）并 `Math.round` 到整 px；**默认档因子恰为 1 且取整恒等**，所以默认观感与既有截图逐像素不变。新增反向开关 `scale={false}`，本批 pin 住四处：`ShellLayout` 两处内建字形、`MoreTabsSheet`、`PluginTabIcon` 的回退字形 —— **理由是同一条栏里的一致性**（插件 tab 的字形是 CSS 尺寸的 `<svg content>`/`<image>`，吃的是 `--nav-icon-size`，fontScale 够不到它；只放内建字形会让同一条底栏显示两种尺寸），胶囊 `--nav-pill-height` 锁死是第二重理由。闸门新增 `src/shared/ui/__tests__/icon-scale.test.tsx` **6 条**（阻尼表含 0.5 常数本身、默认档 9 个尺寸恒等、xlarge/small 必须取整、`scale={false}` 钉住、**三个 nav 面的每个 `<Icon>` 结构上必须 pin**、**`--nav-icon-size` 必须等于内建字形的字面量 24** —— tokens.css 注释一直声称这条共用盒不变式而此前无人耦合），反向验证 5/5 全咬。`tsc -b` 绿 / **2542 vitest 全绿（236 文件）** / `pnpm run build` 双产物 / `pnpm run build:web` 绿。**iOS 真机实测通过**（默认档 vs xlarge：内容图标盒 20→23 = `Math.round(20×1.15)`、同字形 ink 1.149×、底栏字形 24→24 且 ink 两档逐像素一致、胶囊 52 不变、label 12→15.67 且 label 底 822 < 胶囊底 826 不裁切）。**未验**：Android / HarmonyOS（纯 JS、同一份 `Icon`、无原生改动）；**xlarge 的视觉观感**（本会话无读图能力，只用数值证明不裁切、不重叠，「好不好看」仍需人眼）。**接手要补的**：设备当前被留在 **xlarge** 档切不回去（macOS 屏幕已锁，`CGSSessionScreenIsLocked` 会让 cliclick 的合成点击静默失效而 `screencapture`/TestBridge 照常），下次开工先复位字号档位再量。刻意与 Flutter 参考分歧：参考走 `MediaQuery.textScaler`，只缩文字、图标固定。细节见 [progress.md](progress.md) 批66 条目。
>
> **上一代码批次（批65 · 已提交 `f311705`）**：`.increase-contrast` 接线 + App 内设置开关，含真机上查出并当批修掉的一个优先级缺陷。新增 `shared/theme/increase-contrast-model.ts`、`ThemeProvider` 拼第三个根类并订阅、`index.tsx` 启动回放、外观页新增「辅助功能」分组的 `SwitchRow`。**accent 不在这个类里**：它和 `ThemeProvider` 写在同一个元素上的内联 baseline 撞车、而 inline 必然赢，所以移进了内联通道（`theme-pack-mapping.ts` 的 `CONTRAST_ACCENT`，在展开 baseline 之后、应用 pack 字段之前写入 ⇒ 开关生效且**主题包仍赢**）；`tokens.css` 里那两行已删。闸门 +25（`increase-contrast-model.test.ts` 17 + `increase-contrast-wiring.test.ts` 7 + provider 1），反向验证 8/8 + 4/4 全咬。`tsc -b` 绿 / **2536 vitest 全绿（235 文件）** / `pnpm run build` 双产物 / `pnpm run build:web` 绿。**iOS 真机实测通过**（整屏 37089 px 换色、可逆到逐像素、重启后仍生效；accent 同一像素 ON `#1e6ef4` → OFF `#0088ff` → 再 ON `#1e6ef4`）。**新增不变式**：一个对比度 token 只许活在「class」与「内联」两条通道中的一条（键集不相交，闸门钉住）。**未验**：Android / HarmonyOS、暗色主题、带主题包的设备取色（pack 赢目前只有单测）。细节见 [progress.md](progress.md) 批65 条目。
>
> **上一代码批次（批64 · 已提交 `4fff54c`）**：`feat(ui): 全仓铺开按压态反馈，禁用控件摘除 handler 并补底栏选中过渡`。全仓 86 个 CSS 此前只有 1 处 `:active`；本批 token 化 `--press-opacity` / `--press-scale` 并落到 5 个活样式表，**列表行只用 `opacity` 绝不用 `transform`**（虚拟 `<list>` 的合成层坐标会丢父容器滚动偏移）；顺带修掉 `PlayControls` / `MiniPlayer` 四处「禁用只降透明度但 handler 照旧绑着」的真缺陷。同批做了只报不改的 D6 spike（Lynx CSS 伪类/属性支持结论）。iOS 实测：按压为元素级（变化行精确落在矩形内）、反解不透明度 0.690 vs 声明 0.7、禁用键同页 A/B 为 0.00 而相邻可用键 42.78。
>
> **最新代码批次（2026-09-08 · 本提交）**：宽屏设置三级页 pane 切换 —— 用户报「服务器添加页面在宽屏把设置左侧 tab 覆盖了」。根因：服务器添加/编辑是最后一个只有路由入口的三级页，`navigate` 离开 `/settings` 即卸载整个 master–detail 双栏；其余四个三级页（主题商店/重复检测/插件商店/开源许可）早已走「有回调切 pane、无回调退回路由」。修复：`ServerListPage.onOpenServerForm(id?)` + `ServerEditPage.editId/onBack`，pane 新增 `server-form` 分支。同类缺陷一并修：pane 返回键此前在任何三级页直接跳回「外观」，改为回各自父页；父级信息不开第二张表 —— `route-back.ts` 抽 `explicitParentOf()`，新 `domain/sub-page-nav.ts` 只维护子页→路由一张总表，父子关系派生（AGENTS §3.4）。闸门 +35、反向验证 4/4 全咬；`tsc -b` 绿 / **2423 vitest 全绿（225 文件）** / build 双产物（lynx 2269.3 kB、web 2364.1 kB）。**接手要补的**：宽屏浏览器/真机界面实测（用户手动验证中）——服务器「+」/「编辑」左栏应保留、pane 内返回键应回服务器列表、窄屏应无变化。细节见 [progress.md](progress.md) 最新条目。只报不改的 2 个既有缺陷（`onSave` 在 store 未 hydrate 时把编辑静默变新增；`persistProfiles` fire-and-forget 与 `hydrate` 覆盖的竞态窗口）也记在该条目 ⑧。
>
> **上一代码批次（`b08ae1a`、`54233ac`、`40e7cf9`）**：HarmonyOS 三个 P1 已完成代码修复：音量删除二次 `/ 100`；删除恒失败的 `SongloftVideo` 占位注册，让能力位诚实返回 `false`；DLNA 持久保存发现结果、解析 AVTransport `controlUrl` 并按设备 id 控制。相关 209 项 Vitest、`tsc -b`、Lynx/Web 双环境 build 均通过。本机无 hvigor/DevEco，发包前必须补 HarmonyOS HAP 编译；音量与 DLNA 仍需真机验证。全套测试的剩余失败由既有 Android CRLF 工作树改动与 `/mnt/d` 默认超时造成，证据见 [progress.md](progress.md) 最新条目。
>
> **未提交的工作树改动（Issue #7 · 冷启动没有正常进入歌词界面）**：偏好「打开后自动进入歌词」此前只被 `FullPlayerPage` 消费（挂载后 auto-swipe `swipeTo(1)`），而该页仅**手动**打开全屏播放器才挂载，冷启动落首页时那段代码永不执行——移植遗漏了 Flutter `shell_layout.dart` `_scheduleAutoEnterLyrics()` 的「启动后主动导航进全屏播放器」这一步。新增 `src/features/player/data/auto-enter-lyrics.ts`（`navigateAutoEnterLyricsIfNeeded()`：有恢复歌曲 + 偏好开 → `router.navigate({ to: '/player' })`），接入 `src/index.tsx` 启动链路 authenticated 分支（紧跟 `navigateFromNotificationIfNeeded()`，此时 `restorePlaybackState()` 已 await、auth 已解析）。落到 `/player` 后复用既有逻辑：窄屏 FullPlayerPage auto-swipe 落歌词、宽屏分栏天然同屏；无恢复歌曲刻意不导航（避免落进空态页）；auto-resume 关闭时仍导航（与 Flutter 一致，只要求有恢复歌曲不要求正在播放）。共 2 个新文件（含测试）+ 1 处 `index.tsx` 改动 + 3 个项目文档。已过 `tsc -b --force`、`pnpm test` **2299 全绿（213 文件，新增 `auto-enter-lyrics.test.ts` 3 条，反向验证 3/3 全咬）**、`pnpm run build` 双产物（lynx 2255.6 kB、web 2348.4 kB）、`git diff --check` 与 U+FFFD 干净。**接手要补的**：三端真机冷启动实测（本机无设备）——纯 JS 启动导航、无原生改动，验证「开偏好 + 有上次歌曲」冷启动是否直接落歌词页。上一批 Issue #4（队列抽屉虚拟化）已提交为 `1b410ee`；Issue #3（导出日志下移原生）已提交为 `1cf992f`。
>
> **一句话现状**：Apple HIG 重构全部 11 阶段已提交；玻璃材质优化三批（批B 播放器页背景层 / 批C 伪玻璃精致化 / 批A `<blur-view>` 真背景模糊）已全部完成并提交，另有批A-fix 修掉 Web 上 `blur-view` 标签映射缺失导致的静默无效、批A-fix2 补齐批A 漏掉的 6 个弹窗并给 popover / 底部导航胶囊 / mini-player 加上面板模式模糊、批A-fix3 修掉全应用最后一个仍是不透明 `--paper` 的浮层（全局菜单），并把面板模式清单改为从表面反推而非手写。最新一批按用户决定把 **HIG 44px 触控目标全量落地**（24 个控件直接放大 + 5 个圆片用 `__*-hit` 包裹层只撑命中盒不改绘制），同步修掉 `CARD_CHROME_PX` 与弹窗按钮高度的耦合（AGENTS.md 警告的「卡片钳制与 body 钳制不自洽」），并把 `a11y-tap-target.test.ts` 从手写模式改为按用法反推。随后按用户报障修掉**玻璃面板里的列表行背景**（`.song-row` 的 `background-color: var(--canvas)` 在播放历史面板上盖掉整片玻璃，顺带盖掉歌单详情的整行选中高亮），并把「面板内可达元素不许有无界不透明填充」写成从用法反推的闸门（复查确认播放列表面板无此问题）。接着按用户决定（「符合 Apple HIG 设计规范就行」）修掉**玻璃上的行状态填充**：`.drawer__row--active` / `.popover-menu__item--selected` 的满幅不透明板改为 accent wash `--primary-faint`，两个看不见的多选高亮（`--paper` 叠 `--canvas`，比值 1.04/1.07）同改；新增中性通道 `--fill-faint` 收走插件弹窗 6 处内嵌块与 mini-player 进度槽（后者此前用分隔线令牌 `--line` 当背景）；并把 wash 在暗色下提亮表面带来的三级文字缺口一起付掉（被 wash 行的元数据抬到 `--content-2`，light `--content-2` 加深到 `#67676f`）。**JS 侧闸门**：`tsc -b` 绿 / **2201 vitest 全绿（198 文件）** / build:web 绿 / Docker Chrome 运行时验证通过。近期重点：后台播放稳定性、Lynx 原生渲染插件、自定义标签、记住密码、HarmonyOS 宿主修复、文件夹浏览视图、**Apple HIG 重构（11 阶段）**。

---

## 1. 现在在哪、做到哪了

### 已提交

**文件夹浏览视图已推送**（`908448e` feat + `5c481c3` fix，2026-09-01）。

**批63 后提交**按主题组织（含文件夹浏览视图）：

| 交付线 | 关键提交 | 说明 |
|---|---|---|
| **文件夹浏览视图** | `908448e`、`5c481c3` | 曲库新增文件夹浏览视图（songloft#430）：目录层级下钻、网格/列表切换、搜索、播放全部、根目录文件夹+歌曲混合显示 |
| **后台播放稳定性** | `6e67cb9`、`1edd44b`、`5cd5687` | Android 后台切歌 AudioFocus 竞争修复 · 自动连播拦截系统 MEDIA_BUTTON stop intent · 通知栏点击打开播放器页面 |
| **后台播放诊断** | `1089235`、`693ea24` | `ClientFileLog` 追踪 ExoPlayer/MediaSession/AudioFocus 事件；media3 升级 1.6.0 |
| **Lynx 原生渲染插件** | `4f0060b` | JS 插件 `renderEngine: "lynx"` 选项，`<frame>` 子页面原生渲染。父子通信走 `SongloftPluginBridge`（三端）。`demo-frame-plugin/` 演示工程 |
| **自定义标签** | `11f37da`、`116bb60` | 标签管理 CRUD + 歌曲关联。歌单转标签迁移至 tagger 插件 |
| **记住密码** | `a78d023`、`e51801a`、`28c821e` | secure 存储 + 登出停播 + 密码框不预填 dev 默认 |
| **悬浮歌词改进** | `da889ec` | 首次授权返回后立即显示，无需关-开 |
| **通知栏修复** | `49a66de`、`72e8d0f` | FGS 占位通知顶掉播放器控件 · 歌词链路诊断 + 残留修复 |
| **歌词滚动** | `a1665e0` | 改用命令式 `invoke('scrollIntoView')` 统一两端（属性式在 Web 上 no-op） |
| **诊断日志全平台** | `81be80d` | iOS/鸿蒙 `ClientFileLog` 补齐 + 鸿蒙日志导出 |
| **底部面板高度** | `6e79ea5` | 播放队列/睡眠定时器面板改固定高度（修 shrink-to-fit 塌陷） |
| **HarmonyOS 修复** | `ddc6339`、`8fce004` | ArkTS 编译错误 + 图片/SVG 资源渲染 |
| **Android 自动连播** | `06c9233` | 歌曲播完后 ExoPlayer 未推进到下一首 |

> handoff 之后另有 2 个 docs 提交（`1f02383` 文档全量更新、`92c67cb` docs 目录整理），代码无变更。

历史交付线（批41–63）见 [`progress.md`](progress.md)。

### 闸门快照

| 闸门 | 结果 | 何时验的 |
|---|---|---|
| `pnpm test` | **2564 全绿 / 239 文件** | ✅ **2026-09-11**（批69 视频档 A；新增 16 条，此前 2548 为批68。**注意**批68 条目里写的「237 文件」偏旧，实际当时已是 238） |
| `pnpm exec tsc -b` | 绿 | 2026-09-11（批69） |
| `pnpm run build` | 绿（main.lynx.bundle 2334.6 kB） | 2026-09-11（批69，lynx + web 双产物均列出） |
| `pnpm run build:web` | 绿 | 2026-09-11（批69） |
| 新增 `tokens-hig.test.ts` | 6/6 绿 | 2026-09-02 |
| `gradlew assembleDebug` | 绿 | ✅ **2026-09-06**（Issue #3，`compileDebugKotlin` 实际执行） |
| `xcodebuild` / hvigor（HAP） | **可跑但未跑** | **订正（2026-09-11 实测）**：此前这里写「本机是 Linux，无 Xcode、无 DevEco」——**已过期**。当前机器是 macOS（Darwin 25.6.0 arm64），`xcodebuild` 为 **Xcode 26.6 (17F113)**，`hvigorw` 在 PATH 上，`xcrun simctl` 有已启动的 iPhone 17 Pro (iOS 26.5) 模拟器，`adb devices` 有 `emulator-5554`。故 `ios:build` 与 HAP 编译**本机可跑**，只是本批（纯 CSS/TSX）按 AGENTS §5.2 不触发该闸门 |
| `ios:build` | `BUILD SUCCEEDED` | **批49 时代** |
| HarmonyOS CI | GitHub Actions `dev-build-harmony.yml` | 有流水线；本地需 DevEco Studio |
| HarmonyOS 本批定向契约 | 相关 209 项 Vitest 全绿 | 2026-09-04；HAP / 真机待验 |
| Android e2e | 112 passed / 8 skipped (120) | **批49 时代（2026-08-16）** |
| iOS e2e | 110 passed / 10 skipped (120) | **批49 时代（2026-08-16）** |

> ⚠️ ~~14 个 failing test 全在 `full-player-responsive.test.tsx`~~ —— **已修复**（2026-09-01 复跑 2039/2039 全绿，含文件夹浏览视图新增测试）。详见 [bugs.md](bugs.md)。
>
> ⚠️ **e2e 与原生构建自批49 之后没有全量跑过**。**接手后若要改原生或发包，先补跑一遍**——vitest 读不到 Xcode 工程、Gradle、hvigor 或真机行为。

## 2. 铁律在哪

完整论述在 [AGENTS.md](../../AGENTS.md) §4（Lynx 约束：平台判断 / Web 平台 / 锚定弹出层 / 全局覆盖层 / 底部导航胶囊 / 返回导航）、§5（原生模块调用约定）、§6（测试与闸门原则）；**每条铁律背后的真实案例与实测数据在 [pitfalls.md](pitfalls.md)**。最致命的五条一句话版：

1. DOM 探测不是平台判断（Web 业务代码跑在 Worker 里，已踩三次）。
2. 原生方法不返回 Promise，强转即开屏崩。
3. 闸门只证明它真正读过的东西——「build 绿」不等于「能出包」。
4. 全局覆盖层必须挂在 root route 的 `ThemeProvider` 内。
5. 弹出层用自研 `PopoverMenu`/`PopoverPanel`，不要装回 `lynx-ui-popover`。

## 3. 剩余工作

**A. 开发**

1. **Apple HIG UI 重构（11 阶段）** —— 按 `docs/project/plans/apple-hig-redesign.md` 分批推进。**Apple HIG 11 阶段全部完成并提交**（设计令牌/标准材质/导航/共享组件/播放器/曲库/歌单/设置/首页+杂项/动效/无障碍）。其后按用户反馈「玻璃材质和 Apple 官方应用差很多」做了三批玻璃材质优化（批B/批C/批A + 批A-fix + 批A-fix2 + 批A-fix3 + 全局复查，见 `progress.md`），随后按用户决定把 §11.2 的 44px 触控目标全量落地（31 个欠尺寸控件），随后修掉玻璃面板里的不透明列表行，最新一批按 HIG 修掉**玻璃上的行状态填充**并新增中性填充通道 `--fill-faint`（见 `progress.md` 最新一批）。**JS 侧闸门**：`tsc -b` 绿 / **2201 vitest 全绿（198 文件）** / build:web 绿 / Docker Chrome 运行时验证通过。
2. ~~**build 工具链修复**~~ —— **已修复**（`270f347`）。根因：`lyric-store.ts` 的 dynamic `import()` 改变 chunk 图导致 template-webpack-plugin 空 manifest 解构失败，改静态 import 解决。
3. **Lynxtron 桌面** —— P3 唯一未开始项，剩余最大单块能力（迁移调研里的桌面验收清单在 [`../archive/migration/lynx_migration_roadmap.md`](../archive/migration/lynx_migration_roadmap.md) L47–74，可直接拿来用）。
2. ~~**修复 14 个 failing test**（`full-player-responsive.test.tsx`，2026-08-31 复跑确认仍 14 失败）—— 近期 UI 改动导致断言不匹配。详见 [bugs.md](bugs.md)「待修复」。~~ —— **已修复**（2026-09-01 复跑全绿）。

**B. 验证欠账（不写代码，但欠着）**

**待用户确认的后续批次（视频优化，2026-09-11 批69 出方案时用户选了「按建议分批执行分批提交」）**：**档 B**（iOS 原生：`presentedVC` 生命周期——Done 按钮关闭要走复位 + `detachVideoOutput` + 发 `closed`；外加 bugs.md 新条目「宿主分开回答 item 加载失败 / ready 但无视频轨」）；**档 C**（Android 视频面加最小控件层——注意这与 §5「Android 侧只有裸 surface 没有原生控件」的刻意边界冲突，要用户重新拍板；以及 `hls` 等待的「转码中 + 可取消」，真进度条需**后端仓库**把转码异步化）；**档 D**（视频歌蜂窝下默认仍带视频轨、点视频歌直接全屏）。档 A 已做：换歌关视频面 / 曲库「观看 MV」/ 失败提示分因 / `'MV'` 走 i18n。

3. **e2e + `gradlew assembleDebug` + `ios:build` 自批49 后没跑过**，中间大量提交、e2e 场景 33 个。见 §1 闸门快照的警示。
4. **近期原生改动的真机目视待验**：后台播放稳定性（AudioFocus / MEDIA_BUTTON / 通知栏点击）、悬浮歌词首次授权即显、HarmonyOS 图片/SVG 渲染、**Issue #2 的通知看护**（HyperOS 连播到无歌词曲目，见 §4「Issue #2」）。

## 4. 已知缺陷

开放缺陷（HLS 绝对 https URI 自签名缺口）已迁入 [`bugs.md`](bugs.md)「待修复」。下两条已于 2026-08-26 核实关闭，留此备查：

- **Android 上 HLS 电台落到 `ProgressiveMediaSource`** — 已修：`isHlsPlaylistPath()` 剥 query 看扩展名，Android/Web 同修，另修跨协议重定向被拒。
- **偶发全屏灰层** — 仅批29 那次偶发，此后再未复现，按「无法复现」关闭（重开指引在 [`bugs.md`](bugs.md)）。

### Issue #1：后台自动连播 stop intent（2026-08-31）

最新 Issue 附件 `songloft-logs-20260831-203401.zip` 的关键顺序：

`20:32:38.695 ENDED` → `20:32:38.793 load next` → `20:32:39.272 READY + playWhenReady=true` → `20:32:39.304 ACTION_MEDIA_BUTTON` → `20:32:39.312 IDLE`。

前一版 `1edd44b` 只在 `BUFFERING + playWhenReady` 时拦截，因此 stop intent 到达时已经漏掉。当前工作树的修复在 `ENDED -> load` 过渡上设置 2 秒单次 guard；服务解析 `EXTRA_KEY_EVENT`，只拦截 `KEYCODE_MEDIA_STOP` 且 guard 有效的 intent，其他媒体按键不受影响。guard 在显式 `stop()` / `release()` 清理。

已验证：`./gradlew --no-daemon compileDebugKotlin`、定向 Vitest 2/2、`pnpm exec tsc -b --force`。尚未验证：新 APK 真机后台连续播放。验收日志应包含 `mediaButtonKey=86`、`suppressed stale MEDIA_STOP during auto-advance`，且该事件后不能有 `playback state changed state=IDLE`。

### 共享 JSX 扫描器吞标签（2026-09-06 已修）

`shared/testing/jsx-classes.ts` 的 `openingTags` 跟踪引号状态却不认 JSX 注释：标签属性之间的 `/* … */` 里只要有一个撇号（`SongInfoDialog.tsx` 的 `the stylesheet's calc/vh`），引号状态就翻转，后面整片标签被吞进同一个「开标签」。全库 187 个 TSX 里 **45 个的标签边界是错的**。

已改为注释感知，并且把注释段从返回的标签文本里**抹掉**（否则注释里写的类名与 `bindtap` 会被当成真实用法——`BackdropBlur.tsx` 就有一个这样的幽灵类）。新增 `src/shared/testing/__tests__/jsx-classes.test.ts` 10 条（这个解析器此前没有任何直接单测），6 个变异反向验证会红；`text-clamp` 那段本地剥注释已删，改读共享实现。

**订正一条我先前写错并已推送的判断**：那时写成「a11y 44px 与玻璃面板两个闸门同样失明」。量化后不是——`fileClasses` 整文件求并集、a11y 的 `direct` 判定跑在合并后的 blob 上，两者都丢不掉类；实测 `handler` 桶 255 → 211、`viaProp` 31 → 35、**修复后零新增**，即它们此前是清单过宽/归属错（偏严），没有被这个通道藏住的真实缺陷。真正失明的是按标签元素类型过滤的 `text-clamp`。详见 pitfalls §6。

### Issue #2：后台播放通知栏偶现消失（2026-09-06）

Issue 附件 `songloft-logs-20260903-083706.zip` 的关键顺序：

`08:34:28.351 ENDED` → `.412 released the foreground slot` → `.519 placeholder foreground started` → `.545 owns the foreground slot`（真卡片重发）→ `08:34:29.181 mediaButtonKey=86` + `suppressed stale MEDIA_STOP`。

media3 通知的 deleteIntent 只在通知真的离开通知栏时才发，而它晚于 `.545` ⇒ 被 HyperOS 清掉的是刚重发的那张卡片。守卫保住了播放，但 `mediaNotificationOwnsSlot` 与 media3 的 `startedInForeground` 都还记着「已发出」，此前没有任何一处校验通知是否还在 ⇒ 无人重发；下一首无歌词、不产生 metadata 变化，通知栏空了 77 秒。

当前工作树的修复：`SongloftPlaybackService` 通知看护——`getActiveNotifications()` 读 id 1001 + channel 作判据，播放中每 10 秒一拍、抑制 stale MEDIA_STOP 时另排 400ms 快检查，缺失则 `onUpdateNotification(session, true)` 经 media3 漏斗重发；判据不可用报「在」，连续 3 次盲发熔断，只在 `isPlaying` 为真时动作。

已验证：`pnpm test` 2243 项、`./gradlew --no-daemon assembleDebug`、闸门 14 条 + 变异 9/9。尚未验证：HyperOS 真机。验收日志应出现 `media notification missing from the shade (reason=...)` 且通知栏在 0.4–10 秒内恢复；旁证 `dumpsys notification` 的 `channel=default_channel_id`。

## 5. 明确不做（避免被当成缺陷重开）

键盘快捷键、HomeGridConfig、/configs KV 编辑器、完整 GPL 全文许可页、升级的版本选择/手动上传/回退、客户端下载页、Web 调试控制台、热更、桌面歌词独立窗口、深目录树虚拟化、Settings 主从九分类 IA、黑胶唱片环动画、「清空浏览器缓存」（部署层已根治，见 [Web 部署](../guides/web-deployment.md)）。

视频播放的刻意边界：画面不在 Lynx 布局里（无法与歌词混排 / mini 小窗）、Android 侧只有裸 surface 没有原生控件、PiP 两端都不做、`avi/flv/mpg` 依赖服务端转码、mkv 里的 AC-3/DTS 音轨在很多 Android 设备上无授权。

## 6. 常用命令与验证

```bash
pnpm run build        # 必须同时列出 File (lynx) 与 File (web) 两个产物
pnpm exec tsc -b      # 类型检查（必须 -b，--noEmit 是空跑）
pnpm test             # vitest
pnpm run ios:build    # 改 ios/ 后验工程真能编译（需 macOS）
pnpm run build:web    # 改 web/ 后验产物，且要真的用浏览器打开

cd android && ./gradlew --no-daemon assembleDebug   # 改 android/ 后真编译（环境见 build-and-run.md）
# HarmonyOS: DevEco Studio 中 Build > Build Hap(s)/APP(s)   # 改 harmony/ 后真编译
```

**「build 绿」不等于「能出包 / 能跑」**——批41 三条 P0 全是「闸门全绿而产物是坏的」（pitfalls §4）。改 `ios/`/`web/`/`android/`/`harmony/` 务必跑对应那条。

E2E 运行方式、跑前四件环境检查、store 把手清单 → [测试指南](../guides/testing.md)；真机 logcat / 无头浏览器实测方法 → [调试指南](../guides/debugging.md)。

## 7. 文档地图

| 文件 | 用途 |
|---|---|
| [`../../AGENTS.md`](../../AGENTS.md) | 开发规范 + 铁律（接手先读 §4–§6） |
| [`../README.md`](../README.md) | 文档索引 + 项目指标 + 平台可用性 + P3 分解 |
| [`pitfalls.md`](pitfalls.md) | **踩坑实录**：按主题组织的根因案例 + 操作性参考（SDK 源码 / 自签名环境 / 视频素材） |
| [`progress.md`](progress.md) | 分批进展（批1–63+）。**每批验收后必须更新** |
| [`bugs.md`](bugs.md) | 缺陷清单。新问题另起条目 |
| [`../audit/Report.md`](../audit/Report.md) | 2026-09-01 基线的历史代码审计快照；结论需结合后续提交重新核验 |
| [`plans/upstream-issues.md`](plans/upstream-issues.md) | 已提交给 Lynx 官方的 issue；修复合入后移除 `patches/` 下对应 patch（当前 2 个） |
| [`../reference/back-navigation.md`](../reference/back-navigation.md) | 返回导航三层模型 + `consumable` 契约 |
| [`../reference/native-modules.md`](../reference/native-modules.md) | 原生模块契约速查（以契约闸门为准的可读版） |
| [`../archive/`](../archive/) | 归档：审计修复计划、Web 支持原始计划、迁移调研 + 订正表 |
