# Windows/macOS 桌面客户端

[English](README.en.md) · [实施与验证记录](../docs/project/desktop-implementation.md) · [历史技术探针](../docs/project/desktop-phase1.md)

桌面支持共享音视频桥接、标准版与 Bundle、两类插件、安装及整包更新。标准版在 Lynx 仓库发布，Bundle 在后端仓库发布。平台签名、公证和最终设备验收见[实施与验证记录](../docs/project/desktop-implementation.md)。

目标为 Windows x64（Windows 10 22H2 / Windows 11）、macOS arm64/x64（macOS 13+）。Linux、Windows ARM、DLNA、悬浮歌词、系统外快捷键、JS 热更新和 Flutter 数据迁移不在本版范围。Flutter 与移动 SDK 保持原版本。

## 固定组合

以 [compatibility.json](compatibility.json)、桌面独立 pnpm 锁和根锁文件为准：Lynxtron / CEF / headers 0.0.31，builder **0.0.30**，libmpv 0.41.0，FFmpeg/ffprobe 8.0.1。4.2 是 API 基准；两种 Mac 运行时实际报告 Lynx **4.4**，不将所有包版本改成 4.2。

标准版 CI 单次解析后端 `main` 供兼容性检查。后端 Bundle CI 固定本轮发布的后端提交、Lynx 子模块提交及 FFmpeg 资产，三个桌面目标复用同一业务 bundle。手动构建使用 `SONGLOFT_BACKEND_SOURCE` 所指 checkout 的 HEAD，默认是主仓库工作区。资源构建检查该提交是否支持 `parent-watch-stdin`。开发通道设置 `SONGLOFT_DESKTOP_ALLOW_DIRTY=1` 时，记录实际 HEAD 与源码摘要，版本标为 `dev`。

## 构建与运行

`desktop:build` 同时生成 `dist/desktop-build.json`，绑定真实客户端 SHA、源码摘要和业务 bundle 摘要；源码在构建期间变化会失败。正式资源构建拒绝脏客户端或不匹配的旧 bundle。builder 的下载器另固定为 `@electron/get` 3.1.0。dev/stable 的应用文件名、标识与数据分别隔离。

需要匹配目标架构的 Node 22.18+/24/26、pnpm 11.15.1、CMake 3.21+、Go 1.26。Windows 使用 VS 2022 的 C++20 工具集和 Windows SDK，libmpv SDK 须有 MSVC 导入库。Mac 使用 Xcode CLT。

```bash
pnpm install --frozen-lockfile
pnpm --dir desktop install --frozen-lockfile
pnpm desktop:build
pnpm desktop:test
# 绝对路径；匹配当前 Node 的 OS/架构
export SONGLOFT_MPV_ROOT=/absolute/mpv-sdk
pnpm --dir desktop build:native
pnpm --dir desktop start
```

开发启动没有内置后端资源时，仅提供连接服务器。开发数据可用 `SONGLOFT_DESKTOP_DATA_ROOT=/absolute/isolated-parent` 隔离。macOS 为自定义目录使用独立的 Keychain 服务名，Windows 的 DPAPI 文件位于所选目录。安装更新或恢复旧版本后，自动重启继续使用安装前的数据目录，包括含中文或空格的路径。stable 使用默认应用数据目录与凭据身份。

CEF 0.0.31 用 macOS bundle ID 或 Windows AppUserModelID 选择浏览器配置目录。Windows 的自定义开发数据目录使用独立的 AppUserModelID 以隔离 CEF 配置。并行运行有 HTML 插件的 macOS 夹具时，需要分别签名的测试应用标识。

SDK 整理使用明确输入，递归收集动态库闭包、输出每文件摘要及独立的构建头文件/导入库：

```bash
export SONGLOFT_FFMPEG_ROOT=/absolute/ffmpeg-prefix
export SONGLOFT_FFMPEG_COMMIT=894da5ca7d742e4429ffb2af534fcda0103ef593
export SONGLOFT_SDK_LIBRARY_DIRS=/absolute/other-dependency-prefix
export SONGLOFT_DESKTOP_SDK=/absolute/output-sdk
node desktop/scripts/prepare-sdk.mjs
# 保存输出的 SDK manifest SHA-256；正式构建必须提供。
export SONGLOFT_DESKTOP_SDK_SHA256=<sdk.json-sha256>
export SONGLOFT_BACKEND_SOURCE=/absolute/backend-checkout
export SONGLOFT_DESKTOP_CHANNEL=dev
export SONGLOFT_DESKTOP_UPDATE_PUBLIC_KEY=/absolute/desktop-update-public.pem
pnpm --dir desktop build:resources
pnpm --dir desktop package
```

Windows PowerShell 用 `$env:NAME = 'value'` 设置同名变量；多个 SDK 依赖目录用分号分隔。Mac 用冒号分隔。SDK 来源须保留构建元数据、依赖清单和对应许可证，正式交付前一并审核。

Bundle 发布从 `hanxi/ffmpeg-builder` 的具体 `dev` 或稳定 Release 解析桌面 ABI 资产。把解析器输出的 `ffmpeg-resolution.json` 和对应压缩包通过 `SONGLOFT_FFMPEG_RESOLUTION`、`SONGLOFT_FFMPEG_ASSET` 传给 `desktop/scripts/fetch-sdk.mjs`，脚本会再次校验摘要并更新 SDK manifest。不要在桌面 job 中直接下载滚动 `latest` 文件。

打包输出按通道、variant 和目标独立：standard 不含本地 Go 后端，bundled 内嵌本地 Go 后端；Windows 使用按用户 NSIS，Mac 每架构输出 DMG 和用于更新的应用 ZIP。CEF 由官方 builder 的固定补丁收集、签嵌套组件后签外层；pnpm 原生 patch 固定官方补丁，不依赖上游不兼容 pnpm 隔离布局的 postinstall。不发布资产。

`build:native` 和 `package` 会从 [compatibility.json](compatibility.json) 固定的 CEF SDK 构建配套 renderer helper。首次从 CEF 官方 CDN 下载对应架构的 minimal SDK，校验 SHA-256 后缓存在 `desktop/.build/cef-sdk/`。官方 CEF 扩展负责窗口、渲染和 cookie。配套 helper 在插件页面运行脚本前安装既有桥，远程服务器可以继续使用已有插件 SDK。macOS 在暂存时为改过的 helper 重新封签，随后按安装包配置签名。

Windows 启动通过系统命令行传递 `--disable-gpu`，让 CEF 使用软件渲染。Iris Plus 655 实机上的 CEF GPU 子进程曾连续崩溃并终止宿主。libmpv 视频仍通过独立的 Lynx 原生表面输出。

## 宿主与模块契约

- `main.mjs` 是真实业务入口，`--probe` 使用独立探针。宿主拥有一个 libmpv、后端子进程和系统媒体控制；JS store 决定队列、循环与随机。
- `src/desktop` 适配已有 Callback / SongloftAudio 事件。只有当前 `sourceId` 的源准备及初始定位完成才发 `sourceReady`；缺失原生库显式失败，不使用 Mock。
- 视频元素仅提交当前实例的画面；全屏和页面重建不加载新媒体，隐藏窗口/销毁画面继续音频。控制在渲染锁内只异步调用 mpv。
- Node N-API 与 Lynx weak N-API 的 C++ 包装使用独立命名空间，避免链接器合并不同 ABI 的 inline 符号。
- Root RPC 采用每次启动随机 token 和方法白名单。子 frame 的身份由原生父视图绑定；插件不获取 root token、Node 文件系统、进程、安装接口。
- Lynx 插件桥按目标 runtime 排队，由 UI 线程投递事件。路由锁在 SDK 事件发送前释放。销毁 runtime 时清除待投递事件。
- Lynx 插件使用自研原生子 LynxView（本候选没有桌面 frame）；HTML 插件使用官方 CEF 和既有 host/player/cookies/favorite 分发器。隐藏保留实例并暂停轮询；停用、换服、退出释放 frame、请求及 socket。
- 普通状态按应用与 dev/stable 隔离并原子写入；凭据用 Keychain/DPAPI。单实例采用系统锁加激活 socket/pipe。窗口关闭隐藏并继续播放，显式退出按页面清理→播放/网络/插件→后端顺序结束。
- Bundle 首次选择绝对音乐目录，数据库/插件/缓存与曲库分离。后端 `-port 0` 的实际端口通过日志和健康检查确认；管理员随机密码保存在系统凭据库，仅本地会话展示/自动登录。普通日志清理 URL 和凭据。
- 后端继承 stdin 管道；宿主崩溃使 EOF 触发正常关闭，20 秒超时才强制结束。异常退出停止播放、清理请求并有限重启；远程模式停止内置服务但保留数据。动态端口不参与缓存/播放身份。

## 更新和恢复

自动检查并下载，用户点击“重启安装”才停止业务。独立桌面清单使用 Ed25519 签原始 JSON 字节，绑定通道、OS、架构、客户端/后端 SHA、资产大小和 SHA-256。下载完成与独立 Go helper 都重新验证；helper 等全部应用进程退出后安装。

点击安装时，宿主先重新核对磁盘上的安装包。文件缺失或损坏时，设置页提供重新下载，当前播放和本地后端继续运行。交接后辅助程序等待宿主退出并再次校验。Windows 在安装期间保持安装包只读并禁止替换。校验失败时记录日志，核对原路径的旧版身份及平台校验结果后重新启动旧版。

helper 在 macOS 替换应用前，核对 ZIP 内的应用身份、版本、通道、客户端/后端 SHA 和启动程序的 Mach-O 架构。Windows 在 NSIS 完成后、重启前核对同样的元数据和 PE 架构，失败时保留失败副本并恢复旧应用。

候选应用启动前安装失败时，helper 在确认旧应用已回到原路径并通过身份与平台校验后重启旧版。宿主下次启动会提示查看更新目录中的 `install.log`。若新后端已经启动并可能修改了数据库，则由用户选择恢复对应备份。

两个通道均拒绝版本降级。dev 同版本滚动要求源码变化且发布日期晚于当前构建。自动和手动检查均从当前会话读取 GitHub 代理，清单与对应的安装包下载使用同一次读取的配置。登录前或设置暂时不可用时直连。签名清单可用以下命令生成。

```bash
export SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY=/absolute/private-key.pem
node desktop/scripts/sign-update.mjs build-info.json application.zip https://host/application.zip desktop-darwin-arm64.json
```

更新前等待当前模式切换完成，停止后端并备份数据库及残留 WAL/SHM。备份期间暂停新的本地和远程会话切换。安装前将备份的版本和后端 SHA 与当前已安装应用核对。存在待确认的安装时，应用会保留旧版和现有备份。确认须核对版本、客户端 SHA 和后端 SHA。有备份的更新在本地后端健康检查通过后确认。

待确认时保留已下载的安装包。新版启动确认后回收这份下载和旧应用副本，保留数据库备份与失败记录。安装包被系统占用时，下一次启动确认可重试清理。备份复制失败时回收本次未完成的副本。

需要配套恢复时，辅助程序先核对旧应用身份、备份版本、后端 SHA 和每个数据库文件的摘要，再移动应用和数据库。文件移动中途出错时会尝试恢复操作前的应用和数据库。恢复成功时保留失败版本的应用、数据库和残留 WAL/SHM。

Windows standard 和 bundled 都发布 NSIS 安装包，macOS 两个 variant 都发布 DMG 和更新 ZIP。dev 和正式版均可在没有 Windows 证书、Apple Developer ID 和公证的情况下构建。首次手动安装时，系统可能显示发布者或应用来源提示。应用内更新按 variant 使用独立 Ed25519 清单并验证整包 SHA-256，macOS 额外校验 app 的代码签名。

## CI 与验收

[Build and Release](../.github/workflows/build-and-release.yml) 共用同一次客户端构建与后端检出，打包 Windows x64、macOS arm64 和 macOS x64。在仓库 Actions Variables 配置 `DESKTOP_SDK_INDEX_URL` 与 `DESKTOP_SDK_INDEX_SHA256` 以启用桌面构建。HTTPS SDK 索引包含三个目标，每项为 `{url, sha256, manifestSha256}`。归档根目录包含 sdk.json、native、tools 和 build。

客户端仓库构建桌面标准版，后端仓库构建桌面 Bundle。Windows 标准版 CI 执行按用户 NSIS 安装，核对业务 bundle、构建元数据以及 mpv、CEF 和更新辅助程序。macOS 标准版 CI 验证 DMG、更新 ZIP 及包内元数据。bundled 目标执行包内后端的 `-version`，核对版本、提交 SHA、构建时间和 lite 构建类型，并测试本地后端的启动、扫描、Range 读取和重启持久化；standard 目标确认包内没有后端。

公开文件名为 `songloft-lynx-standard-<target>.<ext>` 或 `songloft-lynx-bundled-<target>.<ext>`，不含通道名。Windows x64 为 `.exe`，macOS arm64 和 x64 均有 `.dmg` 和 `.zip`。后端仓库没有桌面签名密钥时，dev 构建只提供 Actions 安装包附件。

dev 和正式发布都要求 Actions Secrets 中配置 `DESKTOP_UPDATE_PUBLIC_KEY` 与 `DESKTOP_UPDATE_PRIVATE_KEY`。Windows 验证按用户安装后包内的版本、业务 bundle 和媒体组件。macOS 对更新 ZIP 解出的应用运行 `codesign --verify --deep --strict`。

配置 SDK 后，标准版发布到客户端仓库的 `dev` Release，Bundle 发布到后端仓库的 `dev` Release，正式 `vX.Y.Z` 构建将资产上传至对应版本 Release。桌面更新分别从 `dev` 和最新正式 Release 获取独立的按架构清单。正式清单指向该版本的固定资产 URL。`vX.Y.Z-beta.N` 等预发布沿用移动与 Web 构建。发布作业核对三个架构的客户端源码、业务 bundle、后端身份、版本和更新公钥，用 `DESKTOP_UPDATE_PRIVATE_KEY` 签署清单。安装包、签名清单与其他平台资产均上传到同一个 draft，全部成功后公开。旧 dev 清单引用的安装资产仍可下载。

验证源码、SHA/工作树、命令、环境、失败和 Not run 记录在[本轮记录](../docs/project/desktop-implementation.md)。人工听音、音画同步、设备生命周期、干净环境安装、旧包升级及一小时资源趋势需要统一实机验收；源码或编译成功不代替这些结果。
