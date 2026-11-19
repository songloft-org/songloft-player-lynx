# Windows/macOS 桌面完整实现记录

[English](../en/project/desktop-implementation.md) · [构建与契约](../../desktop/README.md) · [早期探针证据](desktop-phase1.md)

## 范围与验收顺序

2026-11-17 用户明确说明 Mac 已解锁，允许先完成全部实现，最后统一验收。本轮因此继续实现第二至六批；旧探针记录中“不推进后续批次”的停点是历史约定。源码覆盖不等于设备验收通过，兼容清单仍为 `candidate-unverified`。

## 2026-11-19 · 共享发布流水线已验证

- Lynx 提交 `12cd2483b81287e75cd72438263bcdf2519cdc94` 已推送，主仓库指针由 `d6a354d` 更新。桌面修复提交包含 Windows SDK、CEF 和后端资源归档的盘符路径兼容，未提交的其他 Lynx 功能改动没有混入。
- GitHub Actions 运行 `44524421456` 已完整成功。Windows x64、macOS arm64、macOS x64、Android、iOS、HarmonyOS 和 Web 均完成构建，发布作业成功上传共享 `dev` Release。
- `dev` Release 已包含 Windows NSIS、macOS arm64/x64 DMG 与更新 ZIP、三份 Ed25519 桌面清单以及其他平台产物。SDK 归档托管在独立的 `desktop-sdk-0.0.31` prerelease，三种目标的索引 URL 和摘要变量已配置到 Lynx 仓库。
- 本轮实际发布使用无 Windows Authenticode、无 Apple Developer ID 和无公证构建。macOS 包采用 ad hoc 签名，更新清单和完整安装包仍执行 Ed25519/SHA-256 校验。CI 的包内后端集成、原生构建、CEF helper、安装器检查和共享发布均通过。
- 共享发布、干净环境完整安装、人工听音、精确音画同步、实体 Intel Mac、Mac Remote Command、正式签名/公证及一小时资源趋势仍需统一实机验收，不能由 CI 构建成功替代。

客户端以 `b952231c253aad1938d3020ee74157b100a11291` 开始，期间其他会话推进 main；最终对象用未提交工作树摘要绑定。后端以 `4e73b078d86472e0c3409d24a87a6aca2b82380a` 开始，实际 Mac 后端开发构建基于 `2b3807f0f7098a67a56f1767d3aaa69051f0d78e` 加本轮修改。其他任务的源码和提交保留，没有桌面提交、推送、发布或父指针更新授权。

构建时客户端 HEAD `575c77e3f5ebf4dc204fbd28c7ff7f3b4f90a742` + dirty；收尾时其他会话推进到 `f624965610b21fab03d8aec33b08d34cb90a1cba`，实际源码摘要仍相同：`39e6f49c5b86321dac14719429688d9689bae0abd547d4ede544526c93eee0c4`。工作树清单 `/tmp/songloft-desktop-complete-worktree.json` 记录最终状态。业务 bundle 摘要与源码摘要见 `dist/desktop-build.json` 和安装包内 `build-info.json`，不是将旧 SHA 当作已提交桌面实现。

## 2026-11-18 · 独立 Bundle 打包复核

- 客户端 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8` + dirty，桌面源码 SHA-256 `6fb21007dcb7dcc8eba1eb63e3741ca54c4840f281247279caa2f08390603d76`。Linux 运行 `pnpm desktop:build`、95 项发布测试和 19 项桌面宿主检查，均通过。Mac 上的隔离工作树核对了同一源码摘要。
- macOS 26.6.2 / AppleClang 21 使用 CMake 分别构建 arm64 和 x64 扩展。x64 为交叉编译。Windows DPAPI 头文件包含顺序修正后，MinGW 生成 x64 COFF 对象。Windows SDK 的 WinRT 媒体控制编译与链接为 Not run。
- Mac arm64 测试签名 DMG/ZIP 构建与 `codesign --verify --deep --strict` 通过。包内后端为 `5f5b48609dcf4159adb19ed4092bd44d6e466105` 加开发改动，内置 FFmpeg 生成曲库夹具。用 `node desktop/tests/backend-integration.mjs` 验证中文和空格目录路径、扫描、HTTP Range 206、重启保留曲库及停止后端。证据位于 Mac 的 `/tmp/songloft-desktop-candidate.CFZeEB`。初次扫描的夹具刚写完，被服务端十秒稳定性门限跳过，调整夹具时间后通过。
- 当前包的窗口、Keychain 交互、真实听音、CEF 插件与安装升级为 Not run。三目标正式发行仍待验证。桌面 CI 需要可公开检出的含 `-parent-watch-stdin` 提交，现有开发基线不含该参数。

### 继续验证签名、升级和发行

- macOS 13 基线检查拒绝了使用 SDK 默认值构建的原生模块。用 `-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0` 重编两架构后，两个测试签名 DMG/ZIP 均生成并通过严格签名校验。包内后端分别完成扫描、Range 206、重启保留曲库和退出。Mac 日志在 `/tmp/songloft-desktop-candidate.CFZeEB`，见 `resources-macos13-*.log` 和 `backend-macos13-*.log`。
- arm64 真实应用副本在同一版本的 dev 通道从 `575c77e3f5eb4dc204fbd28c7ff7f3b4f90a742` 更新到 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`。旧包内更新辅助程序验签、验证完整 ZIP、替换应用并保留旧应用。校验了新包签名和安装记录。证据为同一 Mac 目录下的 `real-upgrade.snceRR/install.log`。此轮升级的应用启动确认和真实曲库迁移为 Not run。
- 桌面流水线接入独立 `desktop-dev` 和 `desktop-stable` Release，仅在手动选择 `publish` 后上传。安装包名含内容摘要，分平台清单由独立 Ed25519 密钥签名。新增回归验证了五项安装资产、三份清单和拒绝降级。GitHub 发布及生产签名为 Not run。

### Mac arm64 真实数据库迁移及恢复

- 两个测试签名 dev 包均为 2.13.12。旧客户端 `575c77e3f5ebf4dc204fbd28c7ff7f3b4f90a742`、后端 `2b3807f0f7098a67a56f1767d3aaa69051f0d78e` 加开发改动。新客户端 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`、后端 `5f5b48609dcf4159adb19ed4092bd44d6e466105` 加开发改动。macOS 26.6.2 中，用包内 FFmpeg 生成测试 FLAC，再用旧包后端真实扫描。旧包 Go helper 验证完整 ZIP 后安装，旧后端停机时保存的备份留存。
- 新包后端运行 Goose 迁移 0044，使用原有凭据登录并返回原歌曲 ID。先用恢复流程确认旧包重新读取 schema 43、保留 schema 44 数据副本，再重复升级。匹配客户端和后端 SHA 且本地健康检查通过后，确认记录归档、旧应用副本清理。错误客户端 SHA、错误后端 SHA及首次进入远程会话均未删除旧应用。
- 隔离曲库另通过测试触发器让 Goose 写入 0044 的版本记录时失败。新包未通过健康检查，旧包恢复后数据库 SHA-256 与迁移前备份相同，歌曲可读取，失败现场保留。Mac 证据目录位于 `/tmp/songloft-desktop-candidate.CFZeEB/` 下的 `real-library-upgrade.vRXjYV` 和 `real-migration-failure.pI3Gjq`，各含 `install.log`。使用的是已打包的辅助程序和后端二进制，更新确认采用本轮桌面宿主模块。图形入口、Keychain 跨更新及 Windows、macOS x64 端到端升级为 Not run。
- 修复后的 Mac arm64/x64 均以客户端 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8` 加未提交源码 `efb1b58b2e5ba1b2c6ec32a97e339539454abb12fc736aa1ec93877f4cc4227f` 构建 DMG/ZIP。两包均通过 `codesign --verify --deep --strict`，四个变动的宿主模块与 ASAR 内文件逐字节核对，原生模块最低目标为 13.0。后续宿主 README 改动后的 Linux 源码摘要为 `57547016650e8b022765a5a95d9ff1a5f85dc146ad4f500d1b37779e37d01a90`，`node desktop/scripts/build.mjs` 产生 Lynx/Web/探针，`pnpm exec tsc -b` 通过。24 项宿主与 95 项发布工具测试通过。全量 Vitest 3865 项通过，1 项无障碍源码扫描在并行构建期间超时，单独重跑该文件的 3 项均通过。安装日志、曲库读回和包校验另存于本地 `/tmp/songloft-desktop-migration-evidence/`。

## 实现覆盖

### 上传前验证实际安装产物

- Windows 流水线在临时带空格路径执行按用户 NSIS 安装，并核对装出的业务 bundle、版本元数据、libmpv、CEF 和更新辅助程序。发布或 stable 任务还检查安装后应用签名。macOS 流水线要求同时有 DMG、ZIP，用解压后的应用验证签名和包内内容。
- 三目标共用包内后端集成检查。FFmpeg 生成中文和空格文件名的合成 FLAC，ffprobe 读到 FLAC 音轨。后端真实扫描、登录、Range 206、停机和重启后读取同一歌曲 ID。首轮生成后立即扫描复现文件稳定性保护，曲库返回零首。夹具设置已稳定的修改时间后，从两种 macOS 2.13.12 dev 更新 ZIP 解压的真实应用资源通过。证据 `/tmp/songloft-windows-package.p7uZmv/mac-packaged-backend-retry.log`。
- Windows 的真实打包对照发现 Lynxtron builder 把 `extraResources` 写到安装根目录，用原配置生成了 `songloft/build-info.json`。Windows 配置改为从安装根目录显式复制到 `resources/songloft`，使主进程与更新程序使用同一路径。重打后的实际布局通过核对。证据见同目录 `windows-layout-before.log`、`windows-builder-fixed.log`。
- Linux x64 使用 Lynxtron builder 和隔离 Wine 环境生成 unsigned 2.13.12 dev NSIS，大小 299,153,139 字节。应用使用固定的 Lynxtron 0.0.31、CEF 0.0.31、libmpv 0.41.0 和 FFmpeg 8.0.1，GO 后端为主仓库 `3184a8b745a4e834c4607ba34bc13caa45601aee` 加开发改动。开发包及 SHA-256 在 `/home/hanxi/work/songloft-review/lynx-desktop-20261118-windows/`。
- 新装的离线 Windows 11 24H2 x64 虚拟机（26100.1742）执行了 CI PowerShell 静默安装脚本。带空格的按用户安装目录校验通过。包内工具生成合成曲目，后端完成扫描、登录、HTTP 206 和重启后曲库读取。安装后的应用启动并从现有登录页发出存储 RPC。Windows Go 安装辅助程序的单元/故障注入回归也在虚拟机运行通过。见同目录 `vm/guest-serial.log` 和下载目录的 `validation.log`。
- 客户端基线 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，工作树源码 `61637c09807ea8a255cc79b271a75accd1b95f75551580728d10b92ce991815d`。Linux 26 项桌面宿主、95 项发布测试、桌面业务/探针构建及 actionlint 1.7.12 通过。GitHub Actions 三目标同 SHA、Windows 签名升级、Windows 10、实机播放和插件交互、macOS 正式签名与公证为 Not run。

### 数据库回滚配对与中途失败

- 客户端 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8` 加未提交源码 `145a4782009162846213246d8bdd1b8ff43adc5925fb663bedcf9cb108ffffb3`。辅助程序在安装前核对当前安装和备份身份，在恢复前核对旧应用身份和备份完整性。移动文件失败时撤销已执行的移动。如果数据库无法撤销，两个应用副本都留在原启动路径之外。
- macOS 26.6.2 的 arm64 和 Rosetta x64 使用完整应用资源、独立测试签名和隔离启动探针。两个架构都拒绝了数据库字节正确但后端 SHA 错误的备份，安装前和恢复前均保留当前状态。旧 arm64 辅助程序在对照中实际接受了错误备份。正确备份恢复时，arm64 的 schema 44 回到 43，x64 保持 44。旧后端可继续使用原管理员凭据、读取相同歌曲 ID，偏好保留。失败应用和迁移后数据库均保留，后者摘要与恢复前一致。
- Linux `go test -race -count=1 ./...`、`go vet ./...` 和三目标测试程序交叉编译通过。两个 macOS 测试程序实际通过。新增测试覆盖错误备份身份、损坏 WAL、恢复文件中途消失和旧应用更名失败。25 项桌面宿主与 95 项发布测试通过。命令脚本及结果见 `/tmp/songloft-updater-recovery.cEcseE/` 的 `verify.mjs`、`mac-{arm64,x64}.log` 和 `mac-go-tests.log`。图形恢复入口、Keychain、实体 Intel 及 Windows 安装/恢复为 Not run。
- 同一桌面源码构建了 2.13.12 dev arm64/x64 DMG 和 ZIP，后端为 `5f5b48609dcf4159adb19ed4092bd44d6e466105` 加开发改动。包内 Go helper 的 build ID 与对应构建一致，DMG 校验、ZIP 解压后的严格签名校验和本地四个文件的 SHA-256 比对均通过。arm64 DMG/ZIP 为 231,392,164 / 223,384,530 字节，解包后占用 574,928 KiB。x64 为 255,331,575 / 246,911,812 字节，解包后占用 617,840 KiB。工件在 `/home/hanxi/work/songloft-review/lynx-desktop-20261118-recovery/`，供手动验收。
- 同一构建产出的业务应用使用独立数据目录启动，到首个存储 RPC 为 arm64 5.300 秒、Rosetta x64 默认环境重试 8.531 秒。x64 首次运行在 40 秒内未观测到该 RPC。Mac 当时处于锁屏状态，冷启动基线、空闲/播放内存、一小时趋势及可见界面操作为 Not run。详见 `smoke-*.log`。Linux 类型检查、Lynx/Web/探针构建及 370 个测试文件的 3,868 项 Vitest 回归通过。主仓库文档站 `VITE_GITHUB_ISSUES_TOKEN= npm run docs:build` 通过。

### 更新包身份和 Mac 双架构升级

- 在发布工具、桌面宿主和 Go 安装器三个入口阻止 dev 版本降级。同版本滚动仍校验源码 SHA 与发布时间。使用旧逻辑对照，三个入口均复现了接受发布时间更晚的旧版本。
- macOS 安装器在替换前核对签名清单与包内 `build-info.json`，再检查实际启动程序的 Mach-O 架构。Windows 安装器在签名 NSIS 返回后、重启前核对包内元数据与 PE 架构，失败时还原旧应用。Windows x64 Go helper 已交叉构建，Windows NSIS 实际执行和回退为 Not run。
- 在 macOS 26.6.2 上用现有 arm64、x64 完整开发包制作隔离测试副本。对 Mac 两种架构，正确签名且文件摘要正确的元数据不匹配包和错架构包均在替换前被拒绝，原应用与数据库字节保持一致。未改动的两个实际开发包也通过了新的签名、元数据与架构检查。
- 用当前源码构建的安装器、独立 Ed25519 测试密钥及完整包资源验证 2.13.12 → 2.13.13。测试版使用独立启动探针确认 LaunchServices 重启，x64 在 Rosetta 运行。安装等待父进程退出，本地库保持 schema 44。两轮均用原管理员凭据重新登录实际包内 Go 后端，原歌曲 ID、深色偏好和本地模式保留。新后端就绪前旧包保留，就绪后确认记录归档。
- 测试机处于锁屏状态。隔离 Keychain 探针写入合成凭据时报 `-25308`。客户端 Keychain 登录态、GUI 点击“重启安装”和实体 Intel 为 Not run。
- 客户端基线 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，未提交源码摘要 `6c7178c0aadd8cbeb8d84e4d174e19266f317f88bc7ee7ef3a84333facd12c92`。证据位于 `/tmp/songloft-updater-identity.pkz9M0/`，见 `macos-update-retry.log`、`macos-unmodified-packages.log`、`keychain.log` 及 `baseline-*.log`。Linux `go test ./...`、`go vet ./...`、三目标交叉编译、25 项宿主测试和 95 项发布工具检查通过。

### 自动更新代理补验

- 客户端 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8` 加未提交源码 `070df06cdd22125c7b56bc8297f140eb8edc1b5f134f83875baa0496dc0e6c27`。登录状态就绪后，业务 bundle 启动宿主更新定时器。每次检查由宿主请求当前会话的 GitHub 代理，清单与对应资产使用同一个代理。账号退出或切服前发出的迟到响应不会为新会话选择代理。
- macOS 26.6.2 的 Lynxtron 0.0.31 arm64 和 x64（Rosetta）均加载本轮业务 bundle。隔离 HTTP 服务在反代子路径校验测试令牌并返回代理，宿主收到了真实 RPC 回调，签名清单和安装包请求均使用该代理地址。发布端用受控签名夹具，真实 GitHub 发布和点击安装为 Not run。日志为 `/tmp/songloft-desktop-auto-proxy-mac.log` 和 `/tmp/songloft-desktop-auto-proxy-mac-x64.log`。
- `node --test desktop/tests/*.node-test.mjs` 25 项通过，旧宿主对照因自动更新直连而失败。Linux 的 `pnpm test --maxWorkers=4` 通过 370 文件、3868 项，发布工具 95 项、类型和 Lynx/Web/探针构建通过。

### Windows x64 原生交叉编译和链接

- 使用 Windows SDK 10.0.26100.4204 的官方头文件及导入库、AppleClang 21 和 LLD 19.1.7。旧稿在 WinRT 系统头与 C++/WinRT 投影都声明 `Windows` 时产生歧义，C++17 环境也会让 Clang 进入 MSVC STL 的实验性协程分支。明确限定类型并启用 Windows 目标的 C++20 后，12 个原生源文件全部生成 x64 COFF。
- 使用已核对的 Lynxtron 0.0.31 Windows 导入库和独立 mpv 0.41.0 链接夹具生成 `songloft_mpv.node`。PE 为 x64，导出 `napi_register_module_v1`，并列出 WinRT、D3D11、Lynxtron 与 mpv 导入。模块 SHA-256 为 `89f2c8380fe9c79750655fe54148664f52aebb7dc37a139beb410bd5b721fd0e`。原生源码摘要与命令保留在 `/tmp/songloft-desktop-windows-cross-*`，完整 PE 检查及 SDK 来源见同目录证据。夹具来自 [binaries-mpv 26.10.1](https://github.com/vegidio/binaries-mpv/releases/tag/26.10.1)。固定的发行 SDK、Windows 原生加载、NSIS 签名与设备交互为 Not run。
- 实际 DLL 导出表包含模块所需的 165 项 Lynxtron 导入和 19 项 mpv 导入。最终工作树源码摘要 `07d421a879c708a8f3f5d10a48a29145e5f7b86f05e68a4c0c8aebb91f8d6863` 的 Lynx、Web 和探针均重建通过。

### Mac 视频缓冲与 CEF 窗口测试

- 客户端 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8` 加未提交源码 `ac5fba8ffd75fd035a0fbf787b71489a0c4b10128486d49034fee23ea33d28d2`。在解锁的 macOS 26.6.2 上，原双缓冲 arm64 运行在第 2 帧附近发生两次超时后恢复。单缓冲借用 IOSurface 时 arm64 未超时，Rosetta x64 仍在第 2 和第 56 帧附近发生两次超时。最终 macOS 视频元素用独立 IOSurface 与 `PresentSurface` 提交，Lynx 接受后自行持有该表面。缓冲满时当前绘制让出，播放仍由原 mpv 处理。[Lynx 原生呈现实现](https://github.com/lynx-family/lynx/blob/0264af38be0644ab4e6a62d5059b180b58f486e5/clay/lynx_adaptor/native_platform_view.cc)
- 两架构使用同一 30 秒合成含音轨视频和 CEF HTTP 夹具，探针运行 26 秒，两次改变窗口尺寸。arm64/x64 均采样到第 560 个已提交画面，画面像素分别有 60/59 个不同摘要，出现 `744x471` 和 `612x411` 两种尺寸。暂停时位置分别稳定在 1.875/2.166667 秒，恢复后前进至 22.875/23.208333 秒，音频后端为 CoreAudio。最终两轮均未观察到缓冲等待超时。日志和断言结果在 `/tmp/songloft-desktop-visible-evidence/`。
- 最终两轮 CEF 各回传 41 次脚本心跳。早先 arm64 单缓冲对照的页面额外回传 `isTrusted: true` 的系统鼠标事件。Rosetta x64 鼠标命中和完整插件桥写入仍待验。屏幕采集权限在测试会话不可用。人工听音、音画同步和一小时趋势为 Not run。
- Windows 侧重编 12 个源文件并用同一 mpv 链接夹具生成 x64 PE `songloft_mpv_surface.node`，SHA-256 `c8a025541a9348dffa35aa0c718dbe18c0e5f0c1ccc23db780245c105e3defc0`。可打开本地 KVM 设备，既有远端环境未提供可用 Windows 会话。NSIS 签名安装和运行仍为 Not run。Linux 最新 Lynx/Web/探针构建与 25 项宿主检查通过。
- 同一源码摘要重新生成两个 Mac 架构的测试签名 DMG/ZIP。两份 DMG 均通过 `hdiutil verify`，挂载后的应用通过 `codesign --verify --deep --strict`，原生模块的最低目标为 13.0。已复制并复验本地文件摘要，安装包、`SHA256SUMS` 与日志在 `/home/hanxi/work/songloft-review/lynx-desktop-20261118-surface/`。

### Mac 两类插件读写与播放

- 客户端基线 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，未提交设备构建源码摘要 `42038d7deee9d40dbf2b45ebc789ccb7e17931a93aa8baf3059f8ffdc35cbcde`。Mac 环境为 macOS 26.6.2 arm64，另通过 Rosetta 运行 x64。使用应用打包的 Go 后端、固定 Lynxtron 0.0.31 及现有生产插件组件。每轮使用隔离后台、样本歌曲、插件文件和会话。
- 改前 Lynx 子帧首次就绪事件同步回调时等待路由锁，窗口销毁也被阻塞。当前由 UI 线程投递目标 runtime 事件，发送前释放锁。改前 HTML 插件开始执行时没有 `LynxWebViewBridge`。配套 CEF helper 现在在主文档执行 JS 之前注册桥，沿用已有服务端 SDK。编译下载固定 CEF 142 minimal SDK 并校验 SHA-256。
- 在两个架构上分别运行两种已上传启用的插件，每种都覆盖直连 Bundle 和反向代理 `/fixtures/songloft`。八轮均写入插件存储与收藏，再通过宿主桥加载歌曲。mpv 位置约从 0.6–0.7 秒前进到 1.2–1.4 秒。重启后端后通过 API 读回同一收藏及插件存储。HTML 四轮另通过 CEF Cookie 读取和带 `00 7f 80 ff` 的 multipart 文件上传。x64 早期测试复用了测试代理的失效连接，关闭连接复用后复测通过。
- 夹具命令、日志及失败对照在 `/tmp/songloft-plugin-runtime.bDdDGL/`。arm64 查看 `*-arm64-*-final.log`，x64 查看 `*-x64-bundle-long.log`、`*-x64-proxy-retry.log`。Mac 两种原生扩展和 CEF helper 均构建。Windows 使用官方 SDK、固定 CEF 导入库和 LLD 交叉链接两份 PE，证据为该目录的 `win-cross-full.log` 和 `win-objects/`。
- Linux TypeScript、3868 项共享测试、25 项桌面宿主检查、95 项发布工具检查及 Lynx/Web/探针构建通过。Windows 原生加载、实体 Intel、第三方插件实际操作、真实远程 HTTPS、系统文件选择器和长时间运行均为 Not run。
- 开发包最终工作树摘要 `51f864db87518fdffb650c1ccc6ba4836f0509d0b2d746f63ebdde658292140d`。两架构 DMG 均通过 `hdiutil verify`，两个更新 ZIP 的解压应用均通过 `codesign --verify --deep --strict`。逐包核对新 CEF helper、官方 CEF 许可证与业务 bundle。安装包、校验和及证据在 `/home/hanxi/work/songloft-review/lynx-desktop-20261118-plugin/`。使用开发签名，正式公证和真实安装升级为 Not run。

### Windows 共享纹理与三架构装包播放

- 2026-11-19，客户端基线 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，桌面工作树源码 SHA-256 `ad0b2fffbdc4a8034e6a9b96689fb31ef77cb46dd7b508d6eeeedc5ae3efcdb8`。Windows 11 24H2 x64 离线虚拟机使用前一轮实际安装的 dev 包。FLAC 暂停位置为 2.500 秒、定位到 8 秒；有声 H.264 打开的视频轨到达 320×180，但旧驱动调用 `OpenSharedResource` 报 `E_INVALIDARG`，播放位置归零。
- Lynxtron 0.0.31 内置的 Lynx 提交 `0264af38be0644ab4e6a62d5059b180b58f486e5` 在 Clay D3D11 使用 NT 共享句柄和键控互斥锁。宿主优先用 `OpenSharedResource1`，保留旧句柄导入，按 Clay 的 key 0 同步写入。纹理仍被读端占用时跳过本次绘制并重试。Windows SDK 10.0.26100.4204、LLVM 19 交叉编译 12 个扩展源文件并链接 x64 PE。原生模块 SHA-256 为 `98830ce777492a53725d74ab9f1b403bfd6bebb7e1a2d4307a19b2e786786e2a`。
- 在同一虚拟机更换扩展后，画面采样显示时间条和测试色块连续变化。虚拟 HDA 音轨取得 FLAC 和视频的两种测试频率。C++ 播放器从 3 秒进入全屏并退出，关闭视频前为 17.375 秒，关闭后音轨推进到 18 秒，播放代次不变。HTTP 服务收到 Range 和自定义媒体请求头，CEF 页面执行脚本并访问验证路径。未进行人工听音、音画同步精度或实体 GPU 验收。
- 使用 Lynxtron builder 0.0.30、`--win --x64 --prepackaged … --publish never` 和 Wine 重新生成未签名的 2.13.12 dev NSIS，大小 299,154,141 字节，未压缩构建目录为 1,085,619,735 字节（表观大小）。在同一虚拟机全新安装后核对扩展、业务 bundle 和构建元数据摘要，验证登录页存储 RPC、包内后端扫描、Range 206、重启曲库保留、退出停止后端，随后重跑合成媒体和 CEF。安装包、摘要和对照结果位于 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-windows-video/`。Linux 上 TypeScript、Lynx/Web/探针构建、26 项宿主、95 项发布及原生 libmpv 控制回归通过。
- 同一播放夹具在此前测试签名的 macOS arm64 和 Rosetta x64 包通过 FLAC 定位和暂停、H.264 视频轨推进、画面关闭后音轨继续、Range/媒体请求头与 CEF 脚本回调。锁屏下轮询全屏状态，arm64 成功往返，Rosetta x64 在 5 秒内未报告进入全屏。解锁后的 Rosetta 和实体 Intel 为 Not run。命令与日志见 `/tmp/songloft-windows-package.p7uZmv/` 下的 `surface-fixed/compile.sh`、`vm/guest-serial-resumed.log`、`windows-verified-video/`、`mac-playback-sample.log` 和 `mac-fullscreen-retry.log`。

### Windows 签名更新清单校验

- 2026-11-19，客户端基线 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，固定后端 `3184a8b745a4e834c4607ba34bc13caa45601aee` 加开发改动。Windows 11 24H2 x64 虚拟机使用发布工具为 `win32-x64` 签出的 Ed25519 清单。原 Go 辅助程序用 `GOOS=windows` 校验，实际返回 `invalid update target`。修复版沿用发布清单中的 `win32`，并继续校验架构、通道、版本和摘要。
- Windows 交叉测试程序用相同的公开格式签名并读取清单。以 Go overlay 替换为旧比较条件时目标用例失败，修复版全套通过。Linux `go test -race -count=1 ./...` 和 `go vet ./...` 通过。macOS arm64 与 Rosetta x64 执行交叉编译的辅助程序测试全部通过。
- 使用独立 Authenticode 测试根证书签署完整安装包和一个返回 17 的 NSIS 夹具。Windows 辅助程序拒绝了错误架构、无效清单签名和截断安装包。测试签名的故障安装器实际执行，安装失败后恢复了原应用目录。证书仅导入离线虚拟机的当前用户证书库。原始命令和证据见 `/tmp/songloft-windows-package.p7uZmv/` 下的 `windows-update-lab/` 与 `vm/guest-serial-resumed.log`。
- 从安装目录启动实际 dev 宿主，包内后端完成登录与扫描，宿主自动下载、验签并在等待点击时保持运行。点击后旧宿主退出，辅助程序继承工作目录导致 Windows 拒绝重命名旧应用。辅助程序现在切换到更新目录。使用测试签名的小安装器，旧版在相同启动目录复现失败，修复版执行安装并在预期的 17 退出码后恢复旧目录。对应证据为 `WORKING_DIRECTORY_REGRESSION_PASS`。
- 使用修复后的辅助程序，Windows 11 24H2 x64 虚拟机从 2.13.12 下载并校验完整 2.13.13 测试签名 NSIS，点击诊断页的“重启安装”后完成安装和进程重启。包大小 299,173,504 字节，SHA-256 `812d33e5dcecde65fe2499d502a41e1c3b955b2a9a0a6d78fa2a6ab405e75496`，客户端工作树摘要 `7e996a12d0a2f08bb5543c55fca8aa1e4a79d10b7b8af761ca2ea0dbb566d0ab`。新版后端健康接口返回 200，但旧启动确认使用 Lynxtron 的 ASAR 虚拟文件系统清理旧包，实际在 `app.asar` 遇到 `EBUSY` 并显示恢复提示。
- 启动确认现在先记录新版后端已健康，再通过 `original-fs` 清理旧包。文件仍被占用时记录错误，后续同一新版健康启动可重试清理。使用实际 Lynxtron 0.0.31 和两个独立 ASAR 夹具，旧实现复现 `EBUSY`，修复版移除归档并完成确认。宿主单元测试模拟清理失败，验证确认记录仍保留，错误身份不清理，匹配身份可重试。
- 用独立 Lynxtron 探针执行修复后的确认模块，基于同一真实升级实例的后端 HTTP 200 核对并归档待确认记录。第一轮旧进程缓存的 ASAR 仍占用旧包，重启后用相同确认记录清理成功。关闭旧实现弹出的提示后，已安装的新版实测原歌曲 ID、本地登录、深色偏好、DPAPI 文件时间和备份摘要均保留。原始日志标记 `SIGNED_WINDOWS_UPGRADE_WITH_ASAR_CONFIRMATION_PROBE`。
- 合入三处修复的 2.13.14 完整 NSIS 使用客户端工作树摘要 `c482aa21fa6fc67f8d4851527996b358161881305c588fce3b5e841c0f3df637`，大小 299,173,184 字节，SHA-256 `2c76661a532e8929df4f040be6ef88321a235fb975b46808c35ca6c35576b04d`。Windows 虚拟机从已安装的 2.13.13 使用包内原辅助程序完成自动下载、点击、安装、重启与启动确认。核对了实际签名、旧应用清理、原歌曲 ID、本地登录、DPAPI 文件摘要、偏好和数据库备份摘要，同一后端版本重启后的曲库保留。证据标记 `SIGNED_WINDOWS_UPGRADE_WITH_INTEGRATED_ASAR_FIX`，摘录在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-windows-upgrade/`。使用诊断页和独立测试证书，正式设置页交互、Windows 实体设备、正式签名与数据库跨 schema 迁移为 Not run。

### macOS arm64 与 Rosetta x64 一小时播放采样

- 2026-11-19，macOS 26.6.2 arm64，2.13.12 测试签名包，客户端工作树摘要 `145a4782009162846213246d8bdd1b8ff43adc5925fb663bedcf9cb108ffffb3`，内置后端基线 `5f5b48609dcf4159adb19ed4092bd44d6e466105` 加开发改动。用本机 HTTP 夹具提供 62 分钟合成 MP3，音量设为零。每 10 秒读取 libmpv 位置，保持同一代次并推进到 3605.029 秒，采集 257 组进程树数据。
- 新建应用数据目录后首次存储 RPC 为 2.096 秒。最后三组空闲 RSS 中位数 359.6 MiB，播放期中位数 160.9 MiB，最后五分钟中位数 151.0 MiB，全程峰值 510.2 MiB。RSS 为应用及子进程求和，含共享页。系统为已运行的 Mac，冷机启动、人工听音和音画同步为 Not run。原始运行见 Mac 的 `/tmp/songloft-windows-package.p7uZmv/endurance-check/`，arm64 样本和汇总见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-endurance/`。
- Rosetta x64 首次运行在 50 秒内未完成首个存储 RPC。用 `arch -x86_64` 重试，96.248 秒后收到首个 RPC。启动采样显示主线程在 `dlopen` 加载原生依赖，栈位于 dyld 和 Rosetta。重试完成单一音源代次的 3608.711 秒解码播放。共 416 个采样点，空闲进程树 RSS 中位数 436.6 MiB，播放中位数 137.0 MiB，前／后五分钟分别 545.0／81.0 MiB，峰值 567.8 MiB。数据和启动样本与 arm64 记录保存在同一证据目录。使用静音合成 HTTP 音源。实体 Intel、冷开机和人工听音均为 Not run。

### Windows 业务界面切换本地和远程模式

- 2026-11-19，Windows 11 24H2 x64 隔离虚拟机。实际安装的测试签名 dev 2.13.14 直接打开业务登录页。取消系统目录选择后旧版仍在等待自动登录。再次选目录可自动登录。通过设置扫描导入 1 首 FLAC，虚拟 HDA 输出测得约 996 Hz 的测试音。旧版从设置切回远程时，表单显示已停止的本地地址、旧模式按钮和掩码后的本地管理员密码。
- 同一测试安装替换宿主 ASAR 的 `host/session.mjs`，并通过 `SONGLOFT_DESKTOP_TEST_BUNDLE` 加载正式业务入口的构建产物。客户端基线 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，工作树源码摘要 `d96b228257a21e1288552e38bb035855f04df38078ee1d4470f7fd95ed4e6613`，bundle 摘要 `f963b69b08f5ca25e9f45113fb97b4c3994b74161f6c353e5271a88b172af3de`。取消目录选择后立即恢复可点击入口。选目录后进入首页。从设置切回远程后，表单恢复默认远程地址、空密码和“使用本地音乐”入口；随后使用独立运行的 Go 后端完成远程登录。
- Linux 同一工作树 `pnpm desktop:build`（Lynx、Web、探针和类型检查）、`pnpm test --maxWorkers=4`（371 个文件、3,873 项）、`pnpm desktop:test`（26 项）、`pnpm run test:release`（95 项）通过。截图和日志在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-business-ui/`。本轮新安装包及跨设备复验为 Not run。

- 远程登录后，在设置选择“使用本地音乐”会复用所选目录，以新端口启动本地后端并自动登录。再次切回远程后，表单恢复独立服务器的地址和之前保存的密码。

### Windows 关窗后继续播放并从托盘恢复

- 同一 Windows 11 24H2 x64 虚拟机，用旧候选点击标题栏关闭按钮后，托盘无 Songloft，`Get-Process SongloftDev` 确认进程已退出。固定版本的 Windows `Close()` 直接走原生窗口销毁，可取消的关闭回调在另一条路径上。[Lynxtron Windows 源码](https://github.com/lynx-family/lynxtron/blob/f7b6d62c8e818c26baefb503007dfed81e03c49d/src/shell/api/native_window_win.cc#L187)
- 宿主在有托盘时拦截 Windows 的 `WM_CLOSE` 和 `SC_CLOSE`，交由宿主隐藏当前窗口。退出撤销拦截，随后走原有应用退出流程。源码摘要 `44d419b62279c4f60249804495395b32db5b2dc589f0ebf40b7efea4bdf106ae`，Windows x64 以 Windows SDK 10.0.26100、Clang/LLD 19 与已打包的 libmpv 链接。PE 扩展 `058d8b726fc218d8678a80e452de113848ff246afaaff15da58f0a88e58ab235` 和宿主 ASAR `2c9d64d598c5a253e1c95c49076d5acd1b217fbf929668f45dc05f6474d52afe` 覆盖同一旧 dev 安装，业务 bundle 沿用本节前述版本。
- 实际扫描并播放同一首 FLAC，点击关闭后仍可从托盘恢复原窗口。隐藏期间的虚拟 HDA PCM 中，连续 25 个 250 ms 窗口均有测试音，频率中位值 996 Hz。选择托盘“Quit Songloft”后 `Get-Process songloft*` 无结果。Linux 同一工作树的桌面构建和 26 项宿主检查通过。改动涉及的两份 Mac 键盘源通过 arm64/x64 语法检查。新安装包、Mac 设备交互和 Windows URL 输入框的 Ctrl+A 复验为 Not run，截图、PCM 检查与构建日志在业务界面证据目录。

### Windows 系统媒体控制

- 2026-11-19，在 Windows 11 24H2 x64 虚拟机用前节测试安装和新版 ASAR／原生扩展打开实际业务界面，扫描两首 30 秒和 60 秒的 FLAC。按标题排序并播放后，用 Windows SDK 10.0.26100 与 Clang/LLD 19 编译的 `verify-smtc.exe` 从 Windows 系统媒体会话读取曲名、状态、时长和位置，并向同一会话发出控制请求。[Windows Media Control 接口](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession?view=winrt-26100)
- 暂停时系统位置为 1791 ms，等待 1.2 秒后保持稳定。定位到 8000 ms 后读到 7999 ms，继续播放后前进到 9229 ms。下一首显示正确的 60 秒曲目，上一首恢复 30 秒曲目。用 Win32 `SendInput` 发送播放／暂停媒体键后，系统报告已暂停。系统 Stop 请求返回已停止。证据和夹具源码在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-media-controls/`。实体媒体键和 macOS Remote Command 此轮为 Not run。

### Windows 内置后端异常退出后恢复

- 同一 Windows 11 24H2 x64 虚拟机和工作树候选中，`verify-recovery.ps1` 按宿主 PID、父进程监听参数和隔离数据库路径选定内置 Go 子进程，确认健康后强制结束该子进程。宿主另起 PID 1296，系统分配了与旧 PID 1784 不同的监听端口。新的健康检查与自动登录均返回 HTTP 200。业务首页重新显示原测试曲库中的 2 首歌曲。夹具和截图保存在媒体控制证据目录。音轨停止时间的独立采样为 Not run。

### Windows 完整测试签名安装包 2.13.15

- 2026-11-19，测试签名的 Windows x64 dev NSIS 由 `lynxtron-builder --win --x64 --publish never` 在本地生成。客户端工作树摘要 `44d419b62279c4f60249804495395b32db5b2dc589f0ebf40b7efea4bdf106ae`。内置后端为 `3184a8b745a4e834c4607ba34bc13caa45601aee` 加开发改动，摘要 `02d6b32b533b1fc712d30d829ae8fd6c4d27197d728f843cb936bc7c3c4aa292`。安装包 299,174,824 字节，SHA-256 `7f89aab701eb13444a5631ab318fef195f3b5af2d5a2e7e79258a3c07b261831`。安装目录表观大小 1,085,642,274 字节。
- 离线 Windows 11 24H2 x64 虚拟机用新安装目录和新数据目录执行 `fresh-install.ps1`。核对测试签名及安装后的 ASAR、业务 bundle、原生扩展、Go 后端和 ffmpeg 摘要，随后直接运行包内业务页。重新启动后，正常登录界面取消目录选择立即恢复。再次选目录后自动登录，真实扫描导入两首 FLAC。虚拟 HDA 采集的连续 23 个 250 ms 窗口含 996 Hz 测试音。关闭窗口后托盘仍在。选择本地音乐后 Windows 弹出网络访问许可，测试中取消许可，局域网访问为 Not run。
- 安装包、`SHA256SUMS`、测试签名核验、构建元数据、截图和 PCM 检查在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-windows-integrated/`。正式签名、最低 Windows 版本、由此候选升级和实体机操作为 Not run。
- 实际安装包的“关于与更新”原先显示 `dev` 和 `unknown`。宿主现把包内版本、客户端 SHA 和打包时间作为根页面属性，关于页使用与桌面更新服务相同的包内身份。工作树摘要 `279aa63167d66b4806a71b65d3ebb46da603268bbcc5c5574c607c0737d625d4`。在测试安装替换 ASAR 和业务 bundle 后，实际设置页显示 2.13.15、正确 SHA 和时间。本次 Lynx/Web/探针构建、13 项关于页和 26 项宿主测试通过。包含这处版本显示修复的完整新包为 Not run。
- 在同一测试安装与更新后的 ASAR／bundle 上，第二次启动退出成功并恢复最小化前的原设置窗口，主进程 PID 5976 保持不变。随后强制结束该隔离主进程，内置 Go 子进程 PID 1488 在 594 ms 内退出。脚本和截图在安装包证据目录。最初的客户端进程在采集过程中结束，事件日志未找到应用崩溃报告，重新启动后执行上述安装包检查。

### 2.13.16 Windows 设置页签名升级与 Mac 安装包

- 2026-11-19，客户端基线 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，工作树摘要 `279aa63167d66b4806a71b65d3ebb46da603268bbcc5c5574c607c0737d625d4`，业务 bundle 摘要 `bf02833a2d50ebf1b470e3d52efbeb6675d615efde4950012b5550da336360a6`。三种开发包都来自这份客户端构建，后端基线为 `3184a8b745a4e834c4607ba34bc13caa45601aee` 加开发改动。各包的后端源码摘要见各自的 `build-info.json`。
- 在 Windows 11 24H2 x64 离线虚拟机中，用实际安装的 2.13.15 和实际打包的 2.13.16 升级。旧包恢复原 ASAR 和原业务 bundle，仅将测试安装的清单地址指向本机 HTTPS 服务器。Authenticode 测试证书和独立 Ed25519 清单分别验签。新的 NSIS 为 299,174,216 字节，SHA-256 为 `9271130a1b0b1521512b87f619945c816a35d967cd43f4d4201d2090074eee57`。
- 实际“关于与更新”页面自动发现版本并开始下载。手动取消发生在首批数据写入之前。第一次手动重试时服务端在约 8 MiB 处断开，页面显示失败并保留重试入口。再次重试显示 48% 和 74% 进度，下载并验签后停在“重启安装”。点击后旧客户端退出，辅助程序安装新包并重启。新版关于页显示 2.13.16 及实际 SHA。
- `verify-gui-update.ps1` 核对旧宿主退出、启动确认完成、旧包清理、新签名及包内文件摘要、本地模式和音乐目录、原 DPAPI 管理员凭据，以及活动库和升级前备份的两首歌曲 ID 和标题。初版核验脚本把 PowerShell 5.1 的数组包装误作曲目，按字段比较后核对通过。新版首次业务播放的虚拟 HDA 采集有 28 个 250 ms 窗口包含 996 Hz 测试音。证据、脚本和测试包保存在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-windows-gui-update/`。正式分发和 Windows 跨 schema 迁移均为 Not run。
- 在 macOS 26.6.2 生成 arm64／x64 的 2.13.16 开发 DMG 和 ZIP，使用 ad hoc 开发签名。两种 DMG 的 `hdiutil verify`、两种 ZIP 解压应用的严格 `codesign` 核验，以及四个本地文件摘要均通过。两份包内 Go 后端分别通过真实扫描、Range 206、重启读回与退出，x64 在 Apple Silicon 上通过 Rosetta 执行。后端工作树摘要为 `fcdf66ebf78e4d225ab0ebb6deeabc94a356079656acf1a0a6941630b5551ff9`。安装包、日志和摘要在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-macos-integrated/`。这批 Mac 整包的 GUI 升级、正式 Developer ID 签名和公证均为 Not run。
- 从同一批打包目录独立启动两个 Mac 应用，使用新数据目录和原生业务 bundle。首个存储 RPC 在 arm64 上实测 2.025 秒，Rosetta x64 为 95.672 秒。Rosetta 再次出现约 96 秒的启动等待。记录见 `staged-app-smoke.log`。该检查覆盖业务渲染器到宿主的启动路径，实体 Intel 和冷开机为 Not run。
- 在同一台 macOS 26.6.2 上复制这批应用，只在两个副本的 ASAR 中加入计时点，重新 ad hoc 签名并通过 `codesign --verify --deep --strict`。运行 `measure-startup.py` 后，arm64 的 libmpv 扩展加载、CEF 扩展加载和 CEF 初始化分别用时 0.150、0.005、0.230 秒，首个存储 RPC 为 5.671 秒。Rosetta x64 对应为 19.337、0.150、30.892 秒，首个存储 RPC 为 71.852 秒。测试时 Mac 锁屏，计时结果受 Rosetta、签名副本及当时系统状态影响。脚本和原始计时见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-rossetta-startup/`。实体 Intel 和解锁后的启动基线为 Not run。

### Windows 完整业务页插件验证

- 在 Windows 11 24H2 x64 虚拟机，从上节实际升级后的 2.13.16 安装验证 ASAR、业务 bundle、原生扩展、Go 后端和 FFmpeg 摘要。用新客户端数据目录、包内 Go 后端和隔离的代理子路径 `/fixtures/songloft` 扫描合成 FLAC，上传两个夹具插件。通过正常登录页和首页／插件管理入口操作，独立核对服务端插件存储、收藏、播放队列结果和 HTML 的 Cookie 读回及 4 字节文件上传。虚拟 HDA 上两次分别采到 114 和 238 个 250 ms 窗口含 700 Hz 测试音。
- 初版界面复现三处问题。两个插件的 `host.getInfo` 读到了共享 bundle 的 `dev` 版本。Lynx 子窗口覆盖侧栏和返回入口，固定版本的 [Windows Lynx 渲染器](https://github.com/lynx-family/lynx/blob/0264af38be0644ab4e6a62d5059b180b58f486e5/platform/windows/common/lynx_ui_renderer_win.cc) 将子窗口放在原点。CEF 在虚拟显卡的离屏渲染路径中完成桥接，页面仍为空白。前后对照脚本、截图和日志位于 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-windows-plugins/`。
- 修复后，插件桥报告包内版本 2.13.16。Lynx 子窗口按 DPI 和内容区位置摆放，隐藏时保留原尺寸，恢复时等渲染器完成布局再请求 Win32 重绘。Windows HTML 插件采用 CEF 原生子窗口，由宿主在显示后请求重绘。100 ms 的 CEF 重绘尝试仍能复现，使用上游恢复窗口的 250 ms 延迟后通过三次返回重开及窗口贴靠缩放。重开前后，Lynx 和 HTML 各自的插件完成计数均为 1。结果见 `delayed-repaint-reentry.jsonl` 和 `backend-final-reentry.jsonl`。[上游 CEF 窗口恢复路径](https://github.com/lynx-family/lynx/blob/0264af38be0644ab4e6a62d5059b180b58f486e5/platform/embedder/plugin/cef/src/win/cef_webview_win.cc)。
- 修复实测沿用上节签名安装包，临时替换 ASAR、业务 bundle 与原生扩展，逐文件摘要见 `overrides.json`。候选客户端为 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8` 加工作树摘要 `cd5d2e7e89186da986a568ebe39c7ee4294e203eb6b205f773c9e56074954540`。Lynx、Web、类型检查及桌面探针构建通过，23 个文件的 275 项相关测试、26 项宿主测试通过。全量测试曾有两项超时，单 worker 原条件重跑均通过。Windows x64 使用 SDK 10.0.26100 和 Clang/LLD 19 交叉编译并实际运行，macOS arm64／x64 的 C++ 语法检查通过。含本轮修复的全新安装包、macOS 解锁后的交互和 Windows 其余插件部署场景为 Not run。

### 2.13.17 完整开发包

- 开发包客户端基线为 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，打包工作树摘要为 `cd5d2e7e89186da986a568ebe39c7ee4294e203eb6b205f773c9e56074954540`。三个目标均使用后端基线 `3184a8b745a4e834c4607ba34bc13caa45601aee` 及记录的开发改动。文件及验证证据在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-2.13.17/`。
- macOS 的两个 DMG 通过 `hdiutil verify`，两个更新 ZIP 解出的应用均通过 `codesign --verify --deep --strict`。arm64 DMG/ZIP 分别为 231,389,844 / 223,387,344 字节，x64 为 255,325,985 / 246,916,165 字节。Apple Silicon 主机从新数据目录启动到首个业务存储 RPC 分别耗时 1.039 秒和 43.844 秒，后者使用 Rosetta。两种包内 Go 后端均通过扫描、Range 206、重启读回和关闭。Mac 锁屏下，钥匙串交互和真实设置页升级为 Not run。
- Windows x64 的测试签名 NSIS 在 Windows 11 24H2 虚拟机按用户安装。验证 Authenticode、ASAR、业务 bundle、原生模块、CEF 辅助程序、FFmpeg、更新辅助程序和 Go 后端摘要，安装文件总计 1,085,733,255 字节。包内后端使用真实 FLAC 验证扫描、Range 206、重启读回和关闭。
- 默认首次启动在仅有 Microsoft Basic Display Adapter 的虚拟机上出现 CEF GPU 子进程崩溃（`0xc0000005`），宿主退出。原安装文件加 `--disable-gpu` 重启后进入真实登录页和远程代理子路径。Lynx 和 HTML 各通过三次返回重开，后端确认两者均只初始化一次，HTML 窗口贴靠缩放通过，虚拟 HDA 采到 374 个 250 ms 窗口含 700 Hz 测试音。软件模式下首次测量在 2 秒时仍遇到一次空白，稍后恢复，重跑的 RGB 检查见 `installed-software-cef-reentry-retry.jsonl`。

### 2.13.18 完整开发包

- 三个目标的客户端基线为 `baef0f9bb30bc67527da3ce08c4ba6e3ec98d2b8`，打包工作树 SHA-256 为 `451fbe317f555f5d98d2fa36a4a0b1c8b3db882b2505d171aa0cb58bf15efb8e`，业务 bundle SHA-256 为 `b3040d3c50f2826de404b2ae16d924d00a8570783a477a3c40da0904d0b54046`。各平台的实际后端工作树摘要见包内 `build-info.json`。在 Linux 执行 `pnpm desktop:build`（Lynx、Web、类型和探针）、26 项 `pnpm desktop:test` 及 95 项发布工具测试，均通过。证据目录为 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-2.13.18/`。
- Windows 宿主从 DXGI 枚举适配器，跳过软件适配器与 Microsoft Basic Display Adapter。没有可用硬件适配器时，在获取单实例锁和初始化 CEF 前，用原启动参数附加 `--disable-gpu` 重启一次。该开关通过系统命令行传给 CEF。在 Windows 11 24H2 虚拟机中，2.13.17 安装目录中替换宿主 ASAR 与原生扩展的对照成功进入登录页，重复启动唤醒同一个窗口。
- macOS arm64 的 DMG/ZIP 分别为 231,389,792 / 223,387,467 字节，x64 为 255,326,369 / 246,916,287 字节。两个 DMG 通过 `hdiutil verify`，从两个更新 ZIP 解出的应用通过 `codesign --verify --deep --strict`。两个完整包的 Go 后端均通过真实扫描、Range 206、重启读回和关闭。macOS 26.6.2 在锁屏的 Apple Silicon 主机上运行，arm64 和 Rosetta x64 的首个业务存储 RPC 分别用时 1.286 和 110.021 秒。使用 ad hoc 开发签名。实体 Intel、macOS 13、锁屏期间无法完成的钥匙串和设置页交互升级为 Not run。
- Windows 的测试签名 NSIS 为 299,176,576 字节。在 Windows 11 24H2 x64 虚拟机通过按用户安装、Authenticode 和八个包内文件摘要的核对。安装耗时 122.780 秒，安装文件共 1,085,734,054 字节。包内后端通过真实 FLAC 扫描、Range 206、重启读回和关闭。第一次测试启动附加了 PowerShell 文件重定向，未观察到新窗口。保留原安装，通过无附加参数及无文件重定向的启动进入登录页，核对实际进程已带软件渲染开关。重复启动仍为同一窗口。
- Windows 的原安装通过真实登录连接反代子路径 `/fixtures/songloft`，两类插件均写入存储、更新收藏并开始播放，HTML 另通过 Cookie 读回和 4 字节文件上传。每类插件各完成三次返回重开，后端验证每类完成计数仍为 1，HTML 通过窗口贴靠缩放。九个显示像素检查与 248 个含 700 Hz 测试音的 250 ms 虚拟 HDA 采样窗保存在 Windows 证据目录。实体 GPU、Windows 10 和人工听音为 Not run。
- 在同一 Windows 11 24H2 虚拟机重新安装原始 2.13.16 测试签名包，保留原本地曲库和凭据。设置页自动下载完整 2.13.18，点击“重启安装”后通过验签、安装、重启及启动确认。核对原安装位置的新应用签名及资源摘要，原来的两首歌、音乐目录、DPAPI 管理员凭据与本地模式均保留。升级前备份的数据库校验和及两首歌也通过核对。证据见 `windows/package-2.13.18-upgrade-verifier-result.png`。
- 构建主仓库 VitePress 后，在 Docker Chrome 上分别打开中文和英文主页的 Bundle 分类、快速开始页和 Bundle 模式页。六处实际链接都指向 Flutter 和 Lynx 各自的 Releases。构建和链接断言见 `docs-build.log`、`docs-bundle-links.log`。

### 桌面包后端版本标识

- 2.13.18 包内的后端文件能运行，`-version` 仍显示未注入的默认信息。桌面资源构建现将锁定版本、实际后端 SHA、构建时间与 lite 类型写入 Go 二进制，并把后端版本写入 `build-info.json`。开发工作树构建将后端版本标记为 `dev`。发行准备程序核对三个目标使用一致的后端和客户端版本。CI 发布前执行包内后端的 `-version`，逐项对照元数据。
- 客户端工作树 SHA-256 `cdd45340facdb49964ed5b4409391440e686e0574fbde707480ac8511daff24c`。Linux 的 `pnpm desktop:build`、26 项宿主测试、95 项发布工具测试和 actionlint 1.7.12 均通过。宿主测试确认一端后端版本与另两端不符时停止发布准备。
- macOS 26.6.2 上用正式资源构建入口为两个目标生成 2.13.19 开发资源。两种原生后端均通过版本、SHA、构建时间、构建类型比对，以及真实扫描、Range 206、重启持久化和关闭。故意修改对照元数据中的后端版本，检查按预期失败。Rosetta x64 新资源中的 FFmpeg 首次启动超过现有 30 秒时限，之后独立版本探测耗时 17.824 秒，同一集成检查重跑通过。证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/`。
- 2.13.19 的 arm64／x64 DMG 通过 `hdiutil verify`。两个 ZIP 解出的应用通过严格 `codesign` 核验，并以解包出的实际后端重跑同一套版本及扫描、Range、重启和结束检查。macOS 安装包使用 ad hoc 开发签名。Mac 钥匙串和通过设置安装更新、正式签名和最低系统版本为 Not run。

### Windows 2.13.19 安装与局域网验证

- 使用同一客户端和后端工作树摘要，从 Linux 交叉编译 Windows x64 后端及更新辅助程序，复用已验证的 Windows 开发 SDK 二进制和原生扩展，并以 Lynxtron builder 生成测试签名 NSIS。首次尝试因 Wine 初始化占满磁盘空间失败，重建时将 Wine 的临时前缀移入独立的内存文件系统。最终安装包为 299,176,200 字节，SHA-256 为 `797aac20e92a1c1b59464707d5ade7656dd7aa4742bf848868017c057bc2ab00`。
- Windows 11 24H2 x64 虚拟机按用户安装到带空格路径，耗时 135.067 秒，安装文件共 1,085,733,707 字节。核对安装包及应用 Authenticode 和 11 个安装资源的 SHA-256。包内 Go 后端通过与元数据的版本、提交、构建时间、lite 类型比对，以及用包内 FFmpeg／ffprobe 执行的真实扫描、Range 206、重启读回和关闭。
- 测试脚本修改从光盘复制的只读夹具时间失败。保留同一安装，待原文件稳定后按普通路径启动，登录页显示本地模式入口。通过目录选择器选带空格的目录，自动登录，从设置扫描导入一首只读 FLAC。首页播放后，虚拟 HDA 录到 198 个含 700 Hz 测试音的 250 ms 窗口。
- 本地模式的设置页显示虚拟网卡的实际地址，管理员密码默认隐藏。隔离虚拟网络外侧经虚拟网卡访问实际桌面服务，健康接口返回 200，未登录读曲库返回 401。对使用同一安装后端的独立实例，错误凭据返回 401，临时测试凭据登录返回 200，并能扫描、读回一首歌和取得 1,024 字节的 Range 206。虚拟机系统防火墙已为这次测试放行。临时端口转发在每次测试后移除。命令、摘要、终端与窗口证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/windows/`。实体局域网为 Not run。
- 强制结束已登录的桌面宿主后，实际包内后端在 20 秒验收时限内退出。再次从普通入口启动，Go 后端分配新端口并恢复健康，应用自动回到原曲库，核对本地模式、音乐目录、DPAPI 凭据及歌曲不变。设置页切换到远程模式后，确认桌面宿主的 Go 子进程退出，曲库文件仍保留，界面回到远程登录表单。
- Microsoft Basic Display Adapter 上的普通启动自动使用软件 CEF。重复启动保持同一个窗口。从远程登录表单返回本地模式时复用已选目录，自动登录并显示同一首歌。托盘显式退出后确认安装路径下无残留宿主或子进程，曲库仍可读，普通宿主日志不含本地服务器地址。Windows 10 22H2、实体显卡和人工听音为 Not run。

### Windows 设置页升级 2.13.18 → 2.13.19

- 同一 Windows 11 24H2 x64 虚拟机通过原始测试签名 NSIS 重装 2.13.18，核对安装资源后，仅将旧版安装目录的更新清单地址指向隔离的 HTTPS 夹具。旧版以 `--disable-gpu` 启动，在设置里切换深色主题。签名清单和更新资产通过自动下载送达。设置页显示 2.13.19 已可安装时，`snapshot.ps1` 确认仍运行原来的 2.13.18 进程。
- 点击“重启安装”后，旧宿主退出，实际安装的 2.13.19 通过启动确认并清理旧应用副本。`verify.ps1` 核对了升级后应用的 Authenticode 签名、11 个包内资源的摘要以及实际 Go 后端的版本、提交、构建时间和 lite 类型。已自动登录本地模式，原音乐目录、DPAPI 凭据、深色主题和两首歌的 ID 与标题都保留。升级前数据库备份的 SHA-256 和两首歌也通过核对。
- 升级后从原歌单开始播放，虚拟 HDA 采集的 204 个非静音 250 ms 采样窗分别匹配 996 Hz（120 个）和 700 Hz（84 个）。设置截图、测试清单、核验输出和 PCM 摘要见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/windows/update/`。虚拟机隔离网络下，新包指向的正式更新源不可达。正式发布签名和 Windows 跨 schema 升级为 Not run。

### macOS 2.13.19 编解码与媒体网络验证

- 在 macOS 26.6.2 上直接运行 arm64 与 Rosetta x64 打包应用。`lipo -archs` 核对实际可执行文件，两个包的客户端工作树 SHA-256 均为 `cdd45340facdb49964ed5b4409391440e686e0574fbde707480ac8511daff24c`。以独立数据目录和开发诊断 bundle 调用现有音频 facade 与包内 libmpv，并将音量设为零。`SONGLOFT_DESKTOP_PROBE=true ./node_modules/.bin/rspeedy build` 在隔离构建目录通过 Lynx、Web 和类型检查。
- 每个架构完成八项验证。MP3、FLAC、AAC/M4A、Ogg Opus 均在 `sourceReady` 时定位到约 1,200 ms，暂停位置稳定，恢复后引擎位置继续前进。MP3 定位到 4,400 ms，启用 EQ 后引擎按约 1.69 倍速继续播放。HLS 进入播放并定位到约 6,600 ms。快速切歌只收到有效新源的就绪事件，新源从约 6,400 ms 开始。
- 两种架构都先拒绝自签名 HTTPS，再按临时测试 TLS 设置解码同一音源。回环 HTTP 代理收到带测试请求头和 Cookie 的实际媒体请求。首轮代理夹具误拒带默认端口 `:80` 的绝对 URI，修正夹具后同一包通过。arm64／Rosetta x64 分别收到 29／30 个 Range 206 响应，其中 9／10 个从非零字节开始。两种架构均请求 HLS 播放列表及 7 个分段，服务逐个核对请求头与显式 Cookie。
- 补验了由 CEF 自动传递 HttpOnly Cookie 的受保护 FLAC。两个架构首次请求都返回 403。在 CEF 加载页面并接收 `Set-Cookie` 后，音频 facade 未显式提供 Cookie，libmpv 的四次 Range 请求均携带对应 Cookie 并返回 206，另一条路径的 Cookie 未发送。Rosetta 首次启动在测试开始前触发寄存器状态断言并退出，同一包在新测试目录重跑通过九项检查。
- 测试 bundle 源、运行命令、原生结果和服务请求日志见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/codec-matrix/`。人工听音、EQ 频响、实体 Intel 和本轮视频同步为 Not run。

### macOS 2.13.19 断流恢复

- 同一 arm64／Rosetta x64 包使用独立诊断 bundle 直接运行现有 `usePlayerStore`、音频 facade 和包内 libmpv。MP3 电台的第一路连接结束后，服务器对两次请求返回 503，第四次恢复 200。两种架构均恢复同一电台，新源代次由 1 变为 4，队列优先项和睡眠计数 2 保留。恢复流再次结束时手动暂停，超过 10 秒重试上限后仍无第五次请求。
- 对 40 秒远程 MP3，服务器在播放已推进到约 900 ms 后主动关闭正在传输的套接字。两种架构都在同一 libmpv 源代次上请求 `bytes=64000-`，原曲继续越过 8,200 ms，队列位置仍为 0。另一次运行先对两个续传请求返回 503，第三次返回 206，两种架构仍在同一源代次继续播放。
- `SONGLOFT_DESKTOP_PROBE=true ./node_modules/.bin/rspeedy build` 通过类型、Lynx 和 Web 构建。两次运行均使用合成音源并设为静音。状态事件、请求日志和夹具源码见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/reconnect/`。实际跨设备断网为 Not run。[Windows 补验](#windows-21319-媒体格式均衡器断流与离线缓存)

### macOS 2.13.19 单曲缓存和离线播放

- arm64 和 Rosetta x64 均通过现有缓存 V2 facade 与宿主，以回环 HTTP 下载一份 320,493 字节的 MP3。总容量上限拒绝第二首。第三首下载到 4,096 字节时，验收脚本看到磁盘上仅有 `.part` 文件，缓存接口仍查不到该曲。切断实际下载连接后，临时文件清除，首曲的文件摘要和索引保持正确，另一个账号命名空间读取不到该缓存。
- 关闭测试 HTTP 服务后，用原数据目录重启同一打包应用。启动清理了预置的孤立 `.part` 文件，保留的缓存文件 SHA-256 与源文件一致。libmpv 从缓存 `file://` 读取，在约 1,200 ms 发出 `sourceReady` 并继续推进超过 1,900 ms。该测试使用合成音源和静音输出。
- 夹具、Lynx/Web 构建日志、网络请求和离线播放证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/device-cache/`。人工听音为 Not run。[Windows 补验](#windows-21319-媒体格式均衡器断流与离线缓存)

### macOS 2.13.18 到 2.13.19 下载与验签

- arm64 和 Rosetta x64 启动打包的 2.13.18 宿主。在临时资源目录指向原包文件，并为测试清单配置独立 Ed25519 公钥和回环 HTTPS 地址。诊断页面通过和设置页相同的桥调用更新服务，使用两个真实 2.13.19 更新 ZIP，分别为 223,388,202 和 246,917,230 字节。
- 两种架构均拒绝错误架构、错误通道和无效签名，服务端在这些阶段没有收到资产请求。自动下载有进度后取消，重试在 8 MiB 处真实断开。再试时发送等长的变异 ZIP，两种架构都返回 `update_digest_mismatch`。最后重试保存正确 ZIP，SHA-256 与候选一致，旧进程继续运行，下载目录无 `.part` 或已启动的辅助程序。
- 命令、事件和请求日志见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/update-gates/`。测试签名用于下载及宿主安装资格检查。通过设置页实际点击安装和正式发行签名为 Not run。

### Windows 2.13.19 长时播放部分采样

- 在 Windows 11 24H2 x64 虚拟机使用通过设置页升级的完整 2.13.19，从真实曲库播放 840 Hz 的 FLAC。已取得 222 个播放样本。首尾样本间隔 2,251.170 秒，最后一次播放器位置为 2,231.661 秒。虚拟 HDA 中共有 2,211.25 秒的 250 ms 采样窗匹配测试音。
- 应用进程树的空闲工作集和播放工作集中位数分别为 621.57 MiB 和 678.89 MiB，播放私有内存中位数 548.96 MiB。采样途中 Windows 触发自动关机，User32 1074 显示 `wlms.exe` 发起关机并报告评估许可过期。上述数值只覆盖已留存样本，完整一小时为 Not run。
- 关机日志截图、原始采样和计算结果见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/windows/endurance/`。

### macOS arm64 图形会话的钥匙串和本地登录

- `SONGLOFT_DESKTOP_DATA_ROOT` 现在同时隔离开发版的 Mac 钥匙串服务名。以旧的默认服务名对照时，回归测试在临时目录读到默认目录的测试凭据而失败。Linux 的 27 项宿主测试和变更文件的 Prettier 检查通过。实际 Mac 测试复制了已打包的 2.13.19 arm64，在 ASAR 中只替换三个宿主模块，并重新临时签名及通过 `codesign --verify --deep --strict`。
- SSH 启动的副本在钥匙串调用处返回 `-25308`。用户解锁后用 Launch Services 打开隔离副本，在图形会话中处理了 Chromium 弹出的钥匙串授权。先确认系统目录选择器可打开，然后在隔离偏好中预设位于用户 Music 目录的合成曲库。由原生菜单进入本地模式，实际内置后端健康检查返回 200，并写入该隔离服务的管理员凭据和本地会话令牌。
- 用原生菜单退出后，宿主与后端均结束。同一个 app 副本及 CDHash 通过 Launch Services 重启，17 秒启动观察期内没有新的钥匙串提示。自动登录恢复本地模式，新的后端健康检查返回 200，管理员条目元数据保持一致，刷新令牌条目已更新。默认开发版的已有条目仍可查到。仅记录 Keychain 元数据，全程未读取凭据正文用于核验。脚本和证据位于 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/macos-console/`。正式签名、实体 Intel 和新签名安装包的设置页升级为 Not run。

### Windows 2.13.19 曲库 MV 与全屏

- Windows 11 24H2 x64 虚拟机从曲库菜单播放一段由内置后端扫描入库的 32 秒 H.264/AAC 视频。原安装包停在曲库页，虚拟声卡录到音轨，306 次屏幕采样均无视频画面。两个桌面入口现在进入共享视频页，并等待当前 `sourceId` 的 `sourceReady` 后打开和测量画面。快速换源或返回后，旧请求无法重新打开表面。
- 保留 2.13.19 测试签名宿主及内置后端，通过 `SONGLOFT_DESKTOP_TEST_BUNDLE` 加载修正后的生产业务 bundle。普通窗口中 16 段画面和对应音频全部按顺序出现，15 次切换的绝对输出时差中位数为 139 ms、最大为 269 ms。第二次播放中用视频控件进入和退出全屏，位置由 0:01 推进至 0:03 和 0:06。音画段落保持原顺序，时差中位数为 131 ms、最大为 407 ms，测量包括虚拟显示、音频缓冲和抓帧。
- 小屏默认窗口的底部按钮曾被裁掉，画面上的鼠标事件也不能稳定唤回隐藏的控制条。宿主初始尺寸现在按屏幕工作区限制，桌面控件保留在画面边缘。在 1280×800 的虚拟屏幕测试最终构建，默认窗口可直接进出全屏，位置从 0:04 到 0:07 和 0:09，16 段音画顺序保持，时差中位数为 159 ms、最大为 434 ms。从已暂停的播放器封面徽标也能打开画面，恢复播放后退出视频页，原曲继续播放。
- `pnpm run desktop:build`、`pnpm exec tsc -b`、`pnpm test` 3,882 项、`pnpm run desktop:test` 27 项和 `pnpm run test:release` 95 项通过。最终轮使用开发工作树 `64692b84`，源码摘要 `8994430f5be40da26cc353f81828b5686eb0f779449d52f8754526eb288796be`，JS 和 ASAR 替换仅用于独立测试安装。构建摘要、采样、分析脚本和截图见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-backend-identity/windows/av-sync/`。Mac 上修正后的 MV 操作、人工听音和含本次修复的新安装包为 Not run。

### macOS 更新重启保留开发数据目录

- macOS 26.6.2 上的独立 Launch Services 夹具证实，辅助程序只调用 `open -a` 时，应用收到的 `SONGLOFT_DESKTOP_DATA_ROOT` 中文段可能变成乱码。宿主启动助手前传入已解析的绝对目录，开发通道的助手再用 `open --env` 显式传入。测试目录同时包含中文、空格和等号。
- 2.13.21 arm64 包的真实 Go 辅助程序通过 `node desktop/tests/updater-integration.mjs` 完成小型签名应用的升级、自动重启和配套恢复。候选和恢复版本都在同一目录写出启动回执，失败现场保留。只恢复旧的 `open -a` 行为后，相同夹具安装成功但收不到正确目录的启动回执。另用实际 2.13.21 ZIP 通过 Go 展开及严格验签。
- 工作树 `64692b84`、源码摘要 `cf9a1c1766d9f2637615a5727d473883f10f45965df1e1f4d99073805b208811` 生成 2.13.20 和 2.13.21 arm64 DMG/ZIP。2.13.20 的 DMG 通过校验及拷贝安装，应用保持完整签名，测试更新地址在打包前指向独立的回环 HTTPS 服务。2.13.21 内置 Go 后端及 FFmpeg 工具通过版本、扫描、Range 206、重启保留和退出检查。
- 同一 HEAD 加源码摘要 `948d7c1faf7618ecfee84d7b6c73611e3a87fbd7fb73c361a9fa1810123cbc51` 生成两个 x64 版本，2.13.21 DMG 及 ZIP 严格校验通过，实际 x64 安装助手在 Rosetta 下通过相同的升级、自动重启和配套恢复夹具。x64 包内 Go 后端和媒体工具通过版本、真实扫描、Range 206、重启保留及退出检查。Linux Go 测试、Windows x64 Go 测试二进制交叉编译、Mac Go 测试、Lynx/Web 与探针构建、宿主 27 项及发行工具 95 项通过。
- 安装后的 2.13.20 在系统授权窗口等待。检查时 Mac 已锁屏，实际设置页点击、应用和钥匙串中的本地登录跨版本恢复为 Not run。产物和证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-mac-relaunch/`。
- 复查同一待授权进程时，主线程仍在 Chromium Embedded Framework 对 `SecItemCopyMatching` 的调用中等待。2.13.20 和 2.13.21 arm64 都使用 `org.songloft.lynx.desktop.dev` 和 ad hoc 签名，CDHash 分别为 `72d52eca83530f6e8575d604c20d3d00dda97820` 和 `8c5c9a2a34a59ca27a2455e3598a082832f3f191`。签名身份随构建变化可解释换测试包时重新授权。同一 2.13.19 副本此前获准后，重启没有重复提示。当前提示的具体钥匙串条目和稳定签名下的行为均为 Not run。
- 2026-11-19 解锁后复查隔离安装。2.13.20 正在本地模式运行，使用附加布局日志的业务 bundle。后端健康检查返回 200，隔离 Keychain 管理员条目存在。2.13.21 更新清单通过测试密钥验签，缓存的 223,389,569 字节 ZIP 与清单匹配。测试目录含一首合成音频，数据库尚未扫描，歌曲数为 0。通过 Launch Services 启动的检查器确认图形会话已解锁，屏幕录制、辅助功能和输入事件权限均未授予。设置页点击与升级后恢复为 Not run。证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-desktop241/mac-settings-*`。

### Windows 2.13.19 媒体格式、均衡器、断流与离线缓存

- 在 Windows 11 24H2 x64 虚拟机，使用 Authenticode 有效的开发版安装和独立数据目录。通过 `SONGLOFT_DESKTOP_TEST_BUNDLE` 加载诊断页面，调用共享音频 facade、实际 CEF 和包内 libmpv。安装包客户端 SHA 为 `baef0f9b`，源码摘要为 `cdd45340facdb49964ed5b4409391440e686e0574fbde707480ac8511daff24c`。
- Windows 串口收到了九项媒体通过结果和 47 次带夹具请求头与 Cookie 的媒体请求。MP3、FLAC、AAC/M4A、Ogg Opus 在约 1,200 ms 就绪且暂停位置稳定。MP3 seek 到 4,400 ms，按约 1.7 倍速度前进。HLS 请求七个分段并定位到约 6,600 ms。快速换源只报告新源在 6,400 ms 就绪。代理使用实际 HTTP 请求，CEF 接到 HttpOnly Cookie 后，受保护的 FLAC 从 403 变为 206。
- 首轮 Windows 能确认 TLS 源报错，但 HTTPS 服务没有收到 macOS 夹具期望的 TLS 警报。修正夹具后按模式记录连接和请求。严格模式有 TCP 连接、无媒体 GET，播放器拒绝同一自签名源。启用临时测试 TLS 设置后，同一来源返回 206 并实际解码。主程序源码无需调整。
- 均衡器使用虚拟 HDA 的实际 PCM 输出。相对 4 kHz 参考音，1 kHz 档的 +8 dB 和 −8 dB 分别测得 +7.703 dB 和 −7.704 dB，关闭均衡器回到基线。四段各有 20–21 个半秒测量窗。相同增益的负对照会使测量失败。
- 电台请求依次收到 200、503、503、200，恢复后队列优先项和睡眠计数 2 保留。普通 MP3 播放中主动断开连接，前两次从字节 64,000 续传收到 503，第三次返回 206。播放器在同一源代次、同一队列位置继续用原曲播放超过 8,200 ms。
- 原曲缓存为 320,493 字节。第二首触发容量上限，第三首仅写入 4,096 字节时仍不可读。Windows 检查器使用可读取长路径的 Node 文件 API，独立核对临时文件和源内容的前 4,096 字节。断开该下载后没有残留临时文件，首曲摘要与账号命名空间保持正确。关停服务器，再启动时清除孤立 `.part` 并从同一缓存文件在约 1,200 ms 就绪，继续播放到 1,911 ms。
- 命令、源码、实际网络事件、签名身份、PCM 与测量结果见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-win-codecs/`。人工听音、最低系统、实体显卡和真实跨设备断网为 Not run。

### Windows 2.13.21 设置页整包升级

- 使用 Lynxtron builder 0.0.30 和隔离 Wine 环境生成 299,178,448 字节的按用户安装 NSIS。客户端 `64692b84` 的开发源码摘要为 `948d7c1faf7618ecfee84d7b6c73611e3a87fbd7fb73c361a9fa1810123cbc51`，业务 bundle 摘要为 `1359e1db267ee0d1fa37d83b1532e26a8a121b7489cb64e9abfed497b943b79c`。包内后端来自主仓库 `3184a8b7` 加开发改动。测试 Authenticode 使用独立测试根验签，安装包同时通过 SHA-256 校验。
- 在 Windows 11 24H2 x64 虚拟机，从已安装 2.13.19 的设置页下载经测试密钥签名的更新，实际点击“重启安装”。旧包仅将更新地址指向本机 HTTPS 夹具。新包使用安装自带的业务 bundle，未启用诊断 bundle。新进程确认启动后移除旧应用目录，四首合成歌曲的 ID 和标题、本地模式、音乐目录、主题与 DPAPI 管理员凭据均通过比较。更新前备份的文件摘要和歌曲数据通过校验，安装后的应用 Authenticode、打包资源摘要及实际内置后端的 `-version` 结果均匹配。
- 从升级后的曲库选择“Watch MV”，可见 H.264 夹具持续更换颜色。默认窗口、全屏和返回窗口的截图分别显示 0:00、0:07 和 0:11，控件均可用。安装包、构建、签名日志和设置页及升级后验证截图在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-win-codecs/`。

### 安装失败后重启已恢复的应用

- Windows 11 24H2 x64 通过设置页下载测试签名清单。清单宣称 2.13.22，指向摘要和 Authenticode 均有效的 2.13.21 NSIS。原安装器执行 NSIS 后拒绝包内版本，恢复原应用并保留失败副本，四首合成歌曲的 ID 与标题仍可读取。旧进程已退出，原版没有重新打开，错误只出现在 `install.log`。
- 修复后的安装器在候选应用启动前出错时，核对旧应用是否已回到原路径，并校验签名及应用身份。通过后重启旧版。主进程提示查看安装日志。数据库迁移失败继续使用明确确认的应用与备份恢复流程。
- Windows 对照使用 2.13.21 的同一按用户安装，仅替换隔离副本的主进程 ASAR 与更新辅助程序。再次从真实设置页点击安装后，旧版自动打开并显示原曲库和错误提示。点击「查看安装日志」后，文件资源管理器选中 `install.log`。校验通过原程序签名、包内资源、四首歌的 ID 和标题、新进程、失败副本，以及关闭提示后清除通知标记。
- macOS 26.6.2 原生 arm64 与 Rosetta x64 使用编译后的真实辅助程序执行 `node desktop/tests/updater-integration.mjs`。两个小型签名夹具均拒绝版本不符的候选包、重启旧应用并保留数据库。有效升级和配套恢复仍通过。原 arm64 辅助程序在同一回归中没有留下通知标记。Windows 与 Mac 的证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-installer-failure/`。
- 客户端 HEAD `64692b84e5f36a6f2f3ceeede77904771c2904d6` 加未提交源码摘要 `37833d94be280b0cf80a9fded4852bdfd1ee2eb822e535f4b740277acb8b0c2c`。上述证据保存了实测 ASAR、主进程和三个辅助程序的单独摘要。Go `test -race` 与 `vet`、27 项宿主、95 项发布工具、3,882 项共享测试、Lynx/Web 和桌面探针构建通过。
- 同一源码生成 2.13.22 的测试签名 Windows x64 NSIS 和临时签名的两种 macOS DMG/ZIP。NSIS 和解包后的 Windows 程序通过 Authenticode 验证。两个 DMG 通过 `hdiutil verify`，两个 ZIP 解出的应用通过严格签名校验。两种 Mac 包内后端通过扫描、Range 206、重启读回和退出。三份包内主进程文件与本轮源码逐字节相同，构建元数据中的客户端 SHA、源码摘要和 bundle 摘要一致。校验后清理展开目录。两个 Mac 包的图形升级和图形失败提示为 Not run。
- 直接从两个 2.13.22 更新 ZIP 取出实际签名辅助程序，严格验签后重跑相同签名夹具。arm64 与 Rosetta x64 均通过拒绝错版、重启旧应用、有效安装、配套恢复以及含中文的开发目录持久化。日志为证据目录内的 `mac/{arm64,x64}-packaged-updater.log`。

### Windows 2.13.22 设置页升级与锁屏播放

- Windows 11 24H2 x64 虚拟机从原始签名包恢复上轮隔离安装的 2.13.21 ASAR、辅助程序和元数据，核对 11 项包内资源，再仅将旧包的更新地址指向本机 HTTPS 夹具。光盘拷贝的只读属性曾阻止测试脚本写入地址，清除拷贝上的属性后成功。设置页从自动下载进度进入「重启安装」，由鼠标实际触发升级和重启。
- 2.13.22 的实际 NSIS 完成安装。新版用包内业务 bundle 启动，测试脚本校验新进程、Authenticode、11 项资源摘要和实际 Go 后端版本。四首合成歌曲的 ID 与标题、本地模式、音乐目录、主题与原 DPAPI 管理员凭据均保留。配套数据库备份通过摘要和曲目核对，旧应用在确认后清理。该阶段的截图和脚本在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-installer-failure/windows/2.13.22-evidence/`。
- Windows 实际锁屏后，系统媒体面板显示当前合成曲。虚拟 HDA 的首段 22.013 秒 PCM 中，88 个 250 ms 窗口均检出预期的 840 Hz。在锁屏媒体面板暂停后，后续 7 秒未输出音频帧。同一面板恢复播放后，16.997 秒内的 67 个完整窗口均检出 840 Hz。解锁回到同一曲目，界面位置继续前进。系统休眠恢复和人工听音为 Not run。
- 播放时终止内置 Go 后端的隔离子进程。仍是升级后同一宿主 PID 1408。新后端换用动态端口，2.39 秒内通过 HTTP 200 健康检查。原音轨停止，客户端回到本地曲库并显示四首歌。从列表重新选择原曲，首段采样的 68 个窗中有 67 个检出 840 Hz，另一个落在相邻频段。复测的 26.006 秒中，104 个窗均检出 840 Hz。两次测量结果均留存。首轮健康探针只接受 IPv4 监听地址且超时较短，扩大回环探测范围并延长超时后通过。
- 从托盘菜单显式退出后，检查安装路径下无宿主或后端进程。隔离环境清理两个失败副本和五份缓存安装包，释放 3,658,862,592 字节，保留活动数据库及安装日志。测试光盘、原始音频缓存和临时截图在证据入档及虚拟机关机后回收。
- 装包和图形验收绑定上述 2.13.22 源码快照。验收期间主分支推进到 `debad6e80f422c9ed092fa3a5e4af21d34426a83`，当前工作树源码摘要 `e8472f3794b53f6138ac7f4c72b8b5b236a7849fea0ee6874399cf7a909c33c1`。新提交的 4 项 Web 音频测试、Lynx/Web 和探针构建通过。当前快照的重新装包和设备验收为 Not run。

### 音乐目录不可用时保留本地会话

- Windows 11 24H2 x64 虚拟机中，临时移走已升级的 2.13.22 隔离曲库目录。旧包提示内置后端无法启动，但随后因已保存的令牌进入无法加载的主页。
- 修复后，在同一隔离安装中替换宿主的四个模块与生产 Lynx bundle。目录不可用时，初始登录留在本地模式。小窗首屏提供重试、另选目录和连接服务器。实际打开目录选择器并取消，目录仍不可用时再次重试。确认没有 Go 子进程，四首歌曲的 ID 与标题、音乐路径、主题和 DPAPI 管理员凭据保持一致。
- 归还原目录后在同一窗口点击重试，客户端通过健康检查并自动登录。原四首歌和同一管理员凭据复核通过。选一首原曲播放，虚拟 HDA 的 26.006 秒中 104 个采样窗均检出 840 Hz。另选目录成功后才写入偏好的契约通过宿主测试，实际选择另一目录后的完整曲库扫描为 Not run。
- 从 macOS 2.13.22 arm64 和 x64 ZIP 提取包内后端。分别以普通用户在原生 arm64 和 Rosetta x64 验证只读音乐目录与只读合成 FLAC。两个架构各扫描一首，Range 206、重启读回和停机通过。源音频摘要和目录只读属性未变。两轮夹具均清理。
- 客户端 `debad6e80f422c9ed092fa3a5e4af21d34426a83`，工作树摘要 `e865fbc88e1a9ff6850797b1876d281f924ee4ebc79610507514301c0e9a411b`。证据位于 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-library-unavailable/`。完整装包见下节。
- 29 项宿主测试、分片执行的 3,887 项共享测试、95 项发布测试、Lynx/Web/桌面探针构建及主仓库文档站构建通过。Windows 隔离安装恢复原 ASAR 和原目录，测试光盘、原始音频和截图缓存已清理。

### 2.13.23 完整开发包

- Windows x64 用 `build-resources` 和 Lynxtron builder 生成测试 Authenticode 签名的 NSIS 安装包。独立提取包内 ASAR，核对 `main.mjs`、`host/backend.mjs`、`host/session.mjs` 和 `host/rpc.mjs` 与音乐目录修复的工作树逐字节一致，并校验业务 bundle 摘要。安装包为 299,181,776 字节。
- Windows 11 24H2 x64 在 2.13.22 设置页自动下载 2.13.23 后点击重启安装。旧宿主和后端退出后，测试脚本临时移走隔离曲库。NSIS 安装完成后虚拟机关机，重启虚拟机后显式打开包内应用。新版停在本地登录页，旧版、数据库备份和待确认记录同时保留，确认版本仍为 2.13.22，且无 Go 子进程。归还目录后，在同一个窗口点击重试并自动登录。确认版本推进到 2.13.23，四首歌的 ID 和标题、模式、主题、目录、DPAPI 管理员凭据以及升级前备份均通过独立校验，旧应用随后清理。包内 Go 可执行文件的版本也与构建元数据一致。
- 从恢复后的曲库播放原合成曲。虚拟 HDA 首段 25.008 秒中，100 个窗口的主频为 98 个 840 Hz、2 个相邻的 844 Hz。复测 26.006 秒的 104 个窗口均检出 840 Hz。两次采样的摘要均保留，人工听音为 Not run。
- 从托盘显式退出后，核对隔离宿主和后端均已停止。清理 299,181,776 字节的测试下载缓存，保留归还后的曲库、数据库备份和安装日志。
- macOS arm64 从固定锁文件离线安装后，CEF 框架链接被展开。原打包在 `codesign` 阶段因框架结构不明确而失败。暂存步骤现在复制 `Versions/A` 并重建相对链接。新增回归后 30 项宿主测试和 Lynx/Web/探针构建通过。
- 两种 Mac 架构的 `build-resources`、`package`、DMG 校验和解开 ZIP 后的 `codesign --verify --deep --strict` 均通过。对比业务 bundle 字节，并从各自 ZIP 运行 `desktop/tests/backend-integration.mjs`。两次均扫描并保留一首合成曲、返回 Range 206、正常停机。x64 在 Apple Silicon 上交叉打包，包内后端通过 Rosetta 执行。新版图形安装、设置页升级、Developer ID 签名和公证为 Not run。
- arm64 DMG 与 ZIP 分别为 231,395,923 和 223,392,753 字节。x64 DMG 与 ZIP 分别为 255,328,900 和 246,922,411 字节。安装后体积和 2.13.23 冷启动与一小时资源趋势为 Not run。
- 两种 Mac 工件使用同一客户端提交，工作树摘要 `4ef57c772c5b3404026c9be024c0bc07568ee3de8ae6ca99f98b6582e94001f8`，含 CEF 暂存修复。Windows 工件使用上节工作树摘要。三种工件的后端提交均为 `3184a8b745a4e834c4607ba34bc13caa45601aee`。各自的元数据和 SHA-256 校验清单存于 `lynx-desktop-20261119-library-unavailable/2.13.23/`，测试包未发布。

### 桌面发行预检

- 发布工具回归使用三个相同客户端 SHA 的工件，并只替换其中一个 `clientSourceSha256`。旧脚本成功签署清单。修复后，三份工件须在复制或签名之前通过源码摘要、客户端版本、后端身份和更新公钥核对。测试确认拒绝后没有输出目录。
- 流水线固定 Git checkout 换行配置。Windows 使用独立的 Authenticode 凭据，macOS 使用 Apple Developer ID 和公证凭据。stable 包校验新增公证票据检查。stable 构建和发布任务缺少已配置的 Ed25519 更新公钥时提前失败，普通 dev 工件仍可使用一次性测试公钥。实际签名和 GitHub Actions 运行均为 Not run。
- Linux 上使用 `actionlint` 1.7.12 校验 workflow，31 项桌面 Node 测试、95 项发布测试、Lynx/Web/探针构建和 Go 更新辅助程序测试通过。Web 发布夹具补充了实际 MPEG-TS 分发文件和许可证。客户端 `debad6e80f422c9ed092fa3a5e4af21d34426a83`，工作树摘要 `dfb7be90a4e75b2d0f11fa634b2278d48654cc61b042bdc16106a19f37a390c0`。证据目录为 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-mac-relaunch/`。
- `build-resources` 使用同目录的独立暂存目录，完成后移动到目标路径，避免同时保留两套新资源。macOS arm64 与 Rosetta x64 都成功替换旧夹具，保留目录权限，扫描并保留一首合成曲，返回 Range 206，并正常退出。x64 首次运行 FFmpeg 超过原 30 秒时限。复测冷启动用时 61.034 秒，预热后的完整后端检查通过。两种架构的展开资源及临时依赖随后清理。本轮重新生成完整安装包为 Not run。

### 交接前后验证更新包

- 增加宿主回归，在下载进入可安装状态后，用等长的损坏内容替换隔离 ZIP。旧实现先调用停止播放，随后进入备份。修复后，安装操作先验证磁盘文件，损坏时提供重新下载，并保留当前会话。回归核对停止和备份均未触发，重新下载恢复有效文件。
- Windows 11 24H2 x64 虚拟机用新辅助程序和实际已安装的测试签名 2.13.23 验证交接后的失败。临时父进程结束后，辅助程序拒绝等长损坏资产并写入 `install.log`。已安装可执行文件摘要保持一致，仍使用原路径。原宿主启动新进程，内置 Go 后端恢复，主页显示原四首歌，既有数据库与备份文件仍在原路径。
- 在 macOS 26.6.2 Apple Silicon 上分别运行 arm64 和 Rosetta x64 辅助程序。两个架构都拒绝损坏资产并通过 Launch Services 重启签名有效的旧版夹具。arm64 另验证无效数据库备份也会恢复旧版。旧版可执行文件摘要保持一致，无待确认记录。Mac 业务客户端通过设置页实际触发安装为 Not run。
- 客户端 `debad6e80f422c9ed092fa3a5e4af21d34426a83`，工作树摘要 `358939e3bc18e2e0fa22944dd056ce40976c7fc2452485f7c048f666c1089de7`。31 项宿主测试、95 项发布测试、Lynx/Web/探针双构建、Go 辅助程序测试与三架构辅助程序构建通过。证据位于 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-update-handoff/`。基于此快照重新生成正式签名安装包为 Not run。

### 确认升级后回收安装缓存

- 旧版本在确认启动后仅清除旧应用，按摘要命名的安装包继续占用空间。备份复制遇错时还会留下部分数据库副本。新增回归在旧实现上复现了两处残留。
- 有本地备份的更新继续等待后端健康。写入确认记录后，宿主删除该记录对应的下载和旧应用，保留数据库备份、失败记录及其它下载。备份复制失败时仅回收本次未完成的目录。
- 使用相同宿主模块在 macOS APFS 和 Windows 11 24H2 x64 虚拟机上运行隔离文件夹夹具。待确认时保持 2 MiB 安装文件。Windows 使用禁止删除共享的真实文件句柄复现 `EBUSY`。确认仍成功，释放句柄后再次确认删除缓存。两平台均确认保留原数据库和恢复记录，以及失败备份可以重试。
- 客户端 `debad6e80f422c9ed092fa3a5e4af21d34426a83`，工作树摘要 `491f1b4bb507194cfa56a644c937993b6785b8ca40444f27d0ccd64f48a6d31c`。32 项宿主测试、95 项发布测试及 Lynx/Web/探针构建通过。证据在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-update-disk-cleanup/`。从新签名安装包触发这次清理为 Not run。

### 2.13.24 三架构同源开发包

- 三架构使用客户端 `debad6e80f422c9ed092fa3a5e4af21d34426a83` 和同一工作树摘要 `96b92461039564fc63059ba0c2d5554d872f0605ce49660db27eda43ea3c347f`。业务 bundle 摘要为 `cb6403d74a71044e198cccf522a62d055fcd0d2319e76f81aed3b6e093b977dc`。Go 后端基于 `3184a8b745a4e834c4607ba34bc13caa45601aee`，叠加相同开发源码快照，摘要 `e1bdc403580e7e6ac7e1b2bfdc1218c1d8f01fa6e3652e1dbf3886752631878c`。
- Windows x64 的完整 NSIS 和解包可执行文件均通过测试 Authenticode 验签。两个 Mac DMG 通过 `hdiutil verify`，两个 ZIP 解出后通过 `codesign --verify --deep --strict`。各架构核对六个 ASAR 模块及业务 bundle，包括更新校验与缓存回收模块。Mac arm64 和 Rosetta x64 的包内 Go 后端均扫描并保留一首合成曲、返回 Range 206 并正常退出。
- Windows NSIS 为 299,192,048 字节。Mac arm64 DMG / ZIP 为 231,380,976 / 223,399,437 字节，x64 为 255,348,140 / 246,933,230 字节。工件和校验记录在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-desktop241/`。两个 Mac 目标共用本地测试更新密钥，Windows 继续使用已有 Windows 更新夹具的测试密钥。实际发行签名、Mac 设置页完整升级和实体 Intel 为 Not run。

- Windows 11 24H2 x64 虚拟机从 2.13.23 的设置页自动下载签名清单和完整 2.13.24 NSIS。点击重启安装后看到安装已完成、旧版仍保留的待确认状态，随后新版自动打开同一曲库。原四首歌的 ID 与标题、模式、主题、音乐目录、DPAPI 管理员凭据和升级前数据库备份通过核对。包内资源摘要和 Go 可执行文件的版本匹配。确认后应用自动回收 299,192,048 字节的安装下载及旧应用副本。新版恢复播放时，虚拟 HDA 的 26.006 秒中 104 个采样窗口均检出 840 Hz。人工听音为 Not run。
- 打包快照的 Lynx/Web/探针和 32 项宿主测试通过。主仓库 `CGO_ENABLED=0 go test -tags lite ./internal/parentwatch ./internal/app ./internal/config ./internal/handlers ./internal/services` 通过。
- Linux x86_64 隔离回归从上述打包摘要恢复源码，移动端原生文件和测试配置取自同一 Git 基线。Node 22.17.1 下 `tsc -b`、`pnpm run build` 和 95 项发布工具测试通过。双构建完成后，Vitest 3.2.7 以 `--maxWorkers=4 --shard=1/2` 和 `--maxWorkers=4 --shard=2/2` 跑完 374 个测试文件、3,890 项，两个分片退出码均为 0。测试前后打包源码摘要一致，三个目标的归档校验也再次通过。命令、日志和摘要见证据目录中的 `exact-shared-*`。

### macOS 换源保留同尺寸视频

- 2.13.24 arm64 的 MP4 到 HEVC/AAC MKV 切换可稳定复现。新源在 2,267 ms 播放并持续收到绘制回执，宿主却返回 0×0。libmpv 可以省略与前一源相同的属性值。重置缓存会丢失未再次上报的视频尺寸和时长。修复后保留观察值，收到不可用通知时清除，且只在当前源就绪后向宿主公开。
- Linux 上用 `SONGLOFT_MPV_ROOT=<libmpv SDK> node scripts/test-native.mjs` 验证。同一新用例在原实现上报 `replacement lost unchanged video dimensions`，修复后通过，32 项宿主测试通过。
- 基于 2.13.24 ZIP 的隔离副本均通过严格验签。两个副本只替换补丁编译的原生扩展，使用独立临时 bundle ID 和诊断画面。macOS 26.6.2 的原生 arm64 与 Rosetta x64 实际连播 MP4（H.264/AAC）、MKV（HEVC/AAC）、WebM（VP9/Opus）和 FLV（H.264/AAC）。四段均报告 320×180、完成 Range 206 并收到绘制回执。Core Audio 确认每段均有输出流，暂停 450 ms 后位置保持不变。移除 FLV 画面后同源继续前进 600 ms。整包重建、人工听音、实际像素对比和音画同步为 Not run。
- 同一 Mac 上运行两个开发版副本时，开发数据目录不同仍可能命中同一 CEF 单实例锁。2.13.24 原始副本复现该行为，CEF 目录的锁由正在运行的设置页夹具持有。诊断副本使用独立 bundle ID 后可同时启动。命令和证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-macos-video-formats/`。

### 2.13.25 固定源码开发包

- Windows x64、macOS arm64 和 macOS x64 以客户端 `5f2d856f664c6bac20a00a0754533cc6b4076554`、后端 `35b1e33d8a1f8466530973a2b7b5d1115f39a395` 构建。这次使用已提交的固定源码，三个包的后端版本均为 2.13.12，业务 bundle SHA-256 均为 `76cd90f620cd8e65031aa5fdad3a1bf8997898e6413be3f9148f6cd3721998eb`。客户端类型、双构建、374 个文件的 3,892 项共享测试、95 项发布工具测试和 Go 更新辅助程序测试通过。
- Windows 按用户 NSIS 与解包应用通过测试 Authenticode 验签，两个 Mac DMG 通过 `hdiutil verify`，解出的 ZIP 均通过 `codesign --verify --deep --strict`。核对业务 bundle 和六个 ASAR 模块，Windows 另核对新编译的原生扩展。Mac 两个架构的包内后端均扫描并保留一首合成曲、返回 Range 206 并正常退出。
- 两个 Mac 应用的最低系统声明为 13.0。各 ZIP 检查了 100 个 Mach-O 文件，目标架构正确，最低系统版本均不高于 13.0。macOS 13 实机、实体 Intel、正式签名和公证为 Not run。
- Windows 11 24H2 x64 虚拟机从 2.13.24 的设置页下载测试签名更新，点击重启安装后进入新版。同一四首歌的 ID 与标题、模式、主题、DPAPI 凭据和升级前数据库备份均通过读回，包内 Go 版本与构建元数据一致。应用确认升级后回收下载安装包，托盘显式退出后无应用或 Go 后端残留。见 `windows-about.png`、`windows-result.png` 和 `windows-clean.png`。
- 产物、校验和、命令与原始日志在 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-desktop25/`。

### 2.13.25 macOS 安装体积与签名更新

- 在 macOS 26.6.2 上从两个已核对 SHA-256 的 DMG 各复制一份 app，用 `codesign --verify --deep --strict` 验签。arm64 安装体普通文件合计 574,219,385 字节，APFS 文件块 575,275,008 字节。x64 分别为 631,646,927 字节和 632,717,312 字节。两者均统计 359 个文件，排除符号链接并对硬链接去重。
- 在原生 arm64 与 Rosetta x64 上使用 2.13.24 和 2.13.25 的原始 ZIP。旧包自带的 Go 辅助程序拒绝了签名有效但架构错误的清单。正确清单通过双重验签后替换 app，并保留旧包和由旧后端生成的曲库备份。直接启动新版包内后端后以原凭据登录，读回同一歌曲 ID 和标题，请求音频返回 Range 206。调用宿主确认模块后保留数据库备份并回收旧包与下载文件。
- 新的后端选取流程用干净客户端 `6929fc8` 和本地后端 `35b1e33` 在 macOS arm64 验证。资源构建拒绝不匹配的 SHA，正确提交生成 `2.13.12` 和完整后端 SHA，包内二进制的 `-version` 与元数据完全一致。首轮 `ffmpeg -version` 超过 30 秒，后续进程采样停在 dyld 加载签名动态库。验收脚本给每次工具调用 120 秒，重建的 arm64 资源及 Rosetta x64 已验签 ZIP 均通过扫描、Range 206、重启读回和停止检查。x64 首次启动耗时 29.322 秒。GitHub Actions 为 Not run。
- 本轮以测试脚本调用包内辅助程序和宿主确认模块。设置页点击、正式签名与公证、实体 Intel 和 macOS 13 设备为 Not run。证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-win10-baseline/` 下的 `macos-installed-size.jsonl`、`macos-helper-arm64.jsonl` 和 `macos-helper-x64.jsonl`。两组安装和升级临时副本已清理。

### Windows 10 22H2 干净环境

- 在隔离 KVM 虚拟机中从微软评估 ISO 全新安装 Windows 10 22H2 x64。ISO SHA-256 与微软公布的值一致，来宾报告 `10.0.19045`，系统 PATH 无 Go、Git、FFmpeg、Node.js。2.13.25 的按用户 NSIS 安装成功，安装器与主程序通过测试 Authenticode 验签，核对了 11 个包内资源摘要。安装目录 444 个文件合计 1,085,780,359 字节。[微软镜像校验值](https://download.microsoft.com/download/c/1/1/c11d2ca5-967c-45c0-bc7d-2d9ca3f1fe07/Windows10Enterprise22H2HashValues.pdf)
- 默认启动在虚拟显卡上自动切到软件渲染，打开原版登录页。从登录页选择含中文和空格的目录，设置中的真实扫描导入 1 首 FLAC。虚拟 HDA 捕获的 286.25 秒音频中，有 282.75 秒检出 840 Hz 测试音。点击关闭后，同一进程继续播放，隐藏期间截取的 10.25 秒均检出测试音。托盘恢复原窗口。显式退出后核对桌面和后端进程均已停止，重新启动自动恢复曲库、播放队列与已保存的 283.611 秒位置。
- 重新启动到第一个窗口用时 3.070 秒，包含软件渲染重启。应用进程树空闲／播放工作集中位数为 681.58／889.58 MiB，播放私有内存中位数 674.52 MiB。首次启动计时探针把软件渲染重启当成退出。后续采样跟踪实际接替的进程，并使用 UTF-8 读取中文曲库路径。上述数据来自首次会话的短时采样。干净系统首次冷启动时延为 Not run。命令、截图、串口和 PCM 分析见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-win10-baseline/` 的 `windows-offline-summary.json` 等。

- 评估版经微软正常激活后重新断网，在同一系统重启后测到首个窗口用时 5.714 秒。随后从界面播放同一曲库 FLAC，跟踪同一宿主进程 3,604.492 秒，357 组播放样本的首尾位置相差 3,610.511 秒。显示器自动熄屏期间播放仍推进。虚拟 HDA 共捕获 3,624.25 秒，其中 3,593.25 秒落在 840 Hz 频率格，3,623.50 秒落在 840 ± 8 Hz 区间，未出现低电平采样窗。暂停后间隔 7 秒两次读回均为 3,622.002 秒。随后从托盘退出，读回确认宿主和包内 Go 后端均已停止。人工听音为 Not run。
- 一小时采样的应用进程树工作集中位数为 642.92 MiB（空闲）、770.72 MiB（播放），前后五分钟分别为 762.45 和 775.20 MiB，峰值 848.92 MiB。播放私有内存中位数 636.60 MiB，前后五分钟为 587.35 和 648.34 MiB。原始位置与进程样本、PCM 分析及暂停截图见 `windows-long-samples.log`、`windows-resource-summary.json`、`windows-pause-stable.png`。

### Windows 实体 Intel GPU 与 Bundle 曲库

- `ssh win` 连接 Intel NUC8i7BEH，Windows 10 IoT Enterprise LTSC x64 `19044.5371`，Iris Plus Graphics 655 驱动 `31.0.101.2121`。验证从测试签名 2.13.25 NSIS 提取的原始应用，宿主和 11 项资源摘要与原安装包一致。客户端 `5f2d856f664c6bac20a00a0754533cc6b4076554`，后端 `35b1e33d8a1f8466530973a2b7b5d1115f39a395`。使用隔离目录和交互登录会话，正式支持下限仍是 Windows 10 22H2。
- 登录页冷启动首次窗口用时 18.004 秒，主进程未加 `--disable-gpu`。关窗隐藏，重复启动唤回同一进程。另在隔离偏好预置带空格的中文合成曲库后，包内 Go 健康检查返回 200，应用用随机 DPAPI 凭据自动登录。设置页实际扫描两首曲目，客户端和 API 均读到了相同曲目。
- 曲库启动 FLAC 后 Windows 音频会话有 38 次连续非零峰值采样。界面暂停后两次读取均为 21.950 秒，36 次采样均为零。曲库「观看 MV」显示 H.264/AAC 画面，收集到该应用的非零音频输出。全屏播放时在 2560×1080 采样到两帧不同画面，退出全屏后恢复到 1280×820，画面仍随进度更新，保存位置读回为 22.000 秒。这一轮在原视频结束后进入全屏并开始播放。
- 测试中分别结束内置后端和宿主。后端异常退出后宿主启动新后端，可以重新登录并读取原曲库。结束宿主后原后端随 stdin 管道关闭而退出。再打开同一配置后，业务页恢复，两首曲的 ID 和标题保留。真机安装、进入全屏时的同源连续性、音画同步精度、实体 CEF 插件、人工听音为 Not run。测试进程和目录已清理，证据位于 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-windows-physical/`。

### Windows 实体 CEF 子进程崩溃与修复

- 重测使用精确的 `合成曲库 QA` 路径。Linux 机器通过局域网登录 Windows 包内 Go 后端并读回两首曲。通过业务界面播放 MV 时进入 2560×1080 全屏，再退出到 1280×820，连续采样取得不同画面，原曲的进度读回为 21.900 秒。
- 原版 2.13.25 在同一 Iris Plus 655 上打开 HTML 插件两次均终止宿主，后端随即退出。第二次 CEF 日志记录六次 GPU 子进程退出，最后报 `GPU process isn't usable`。首次退出前 Cookie 桥、四字节上传和持久化写入已产生副作用。加系统命令行 `--disable-gpu` 后同包完成插件流程。
- Windows 宿主固定使用 CEF 软件渲染。自定义开发数据目录派生独立 AppUserModelID，CEF 配置随之隔离。将这两项宿主改动写入签名测试包的隔离 ASAR 副本，保持业务 bundle、媒体库与其他二进制字节一致。无手动开关启动后，CEF 使用新的独立配置。原插件再次通过 Cookie、上传、收藏和播放桥，后台读回持久化记录，系统音频会话取得非零峰值。底层视频输出另外复测。
- 33 项 Node 桌面宿主检查通过，Windows SDK 10.0.26100 与 LLVM 19 交叉编译改动后的系统模块成功。原安装包 SHA、修改后的 ASAR SHA 及证据见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-windows-physical/`。重新构建并正式签名的安装包、Mac 设置页升级、音画同步精度及人工听音为 Not run。

### Windows 2.13.26 真机安装

- 在 Windows 10 IoT Enterprise LTSC 19044.5371 x64 上运行按用户的 NSIS 安装与卸载。测试签名包大小为 299,204,112 字节，安装文件为 1,085,792,190 字节。包内客户端为 `f9a4177`，后端为公开主仓库 `7a3718f`。已核对宿主可执行文件和 12 项资源。
- 正常启动时，CEF 自动进入软件渲染并使用独立配置目录。两类插件完成实际后端读写和收藏操作，HTML 另完成 Cookie 读取和四字节文件上传。宿主恢复异常退出的后端，宿主退出后旧后端也退出。重启后两类插件的持久化记录仍在，已完成测试安装的卸载和清理。
- MV 窗口完成全屏往返，保存的播放位置从 1.767 秒推进至 11.967 秒。本次窗口抓图的内容区为纯色，Core Audio 未取得默认输出端点。本包的画面和听音为 Not run。证据位于 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-desktop26/`。

### 合并客户端发布流程

- 桌面三架构接入移动端和 Web 共用的 Build and Release。使用同一份业务 bundle 与公开后端提交。五份桌面安装资产和三个按架构签名的更新清单进入同一个 dev 或正式 Release。旧版独立桌面发布流程已移除。
- 发布前校验三端源码和 bundle 摘要，核对后端 SHA 与目标 tag。dev 更新读取共享 `dev`，正式版从最新正式 Release 发现桌面清单，资产链接固定到该版本。
- 本地动作语法、签名与发布流程夹具、桌面宿主和发布工具检查以及中英文文档站构建通过。测试签名夹具没有上传。GitHub Actions 运行 `44524421456` 已完成三架构构建并将桌面资产和清单发布到共享 `dev` Release。

### 无平台证书构建与更新

- 参考 Flutter 桌面发布流程，dev 与正式版均移除 Windows Authenticode 和 macOS Developer ID／公证配置。macOS 应用采用 ad hoc 签名，包内验证仍使用严格的 codesign 检查。Windows 按用户安装验证与更新清单验签继续执行。
- 在 Windows 真机用 Ed25519 签名的清单更新未签名 NSIS 夹具。修改一个字节后安装助手拒绝包并重启旧版。还原资产后完成 1.0.0 到 1.0.1 更新，迁移回滚恢复 1.0.0 和配套数据库。另在真机验证已核对的 Windows 安装器文件运行期间阻止写入和重命名。
- macOS 原生 arm64 和 Rosetta x64 均通过 Go 安装辅助程序测试。ad hoc 签名应用解压后通过严格校验，修改 Info.plist 后被拒绝。
- 三种架构的 SDK 候选归档通过 HTTPS 下载、索引摘要和逐文件校验。Windows SDK 新增由 libmpv DLL 的导出表生成的 MSVC 导入库及头文件，交叉链接现有扩展并在 Windows 真机初始化 libmpv 软件渲染。两种 macOS SDK 的媒体工具实际生成并检查 FLAC。归档与记录见 `/home/hanxi/work/songloft-review/lynx-desktop-20261119-sdk/`。SDK 已公开托管在 `desktop-sdk-0.0.31` prerelease，GitHub 三目标打包和共享 Release 发布已由运行 `44524421456` 验证，完整业务客户端的新一轮升级仍待验收。

### 模块覆盖矩阵

| 批次 | 主要实现 | 统一验收边界 |
| --- | --- | --- |
| 技术组合 | 独立桌面锁、兼容矩阵、C++ libmpv render API、IOSurface/D3D11、CEF、隔离探针 | Mac arm64、Rosetta x64 和 Windows 11 x64 虚拟机有原生运行及 CEF 证据。干净 Windows 10 22H2 x64 虚拟机通过安装和本地播放。实体 Intel Iris Plus 655 验证了业务页视频与 CEF 软件渲染。实体 Intel Mac 和 macOS 13 实机待验 |
| 宿主 | 应用/通道隔离、系统 Keychain/DPAPI、原子偏好、OS 单实例锁、菜单/托盘、关窗保留、窗口快捷键、SMTC/Now Playing、系统偏好及日志 | Windows 虚拟机通过托盘、显式退出、锁屏系统媒体面板及 WinRT 媒体键输入事件。Mac arm64 图形会话通过隔离 Keychain 与本地自动登录。Mac Remote Command、实体媒体键、输入法和余下平台生命周期待验 |
| 播放 | 一个 mpv、Callback/事件适配、sourceId/初始 seek/快速换源、实际格式探测、请求头/Cookie/TLS/代理、倍速/EQ、共享视频/全屏、V2 原子缓存 | Windows、Mac arm64、Rosetta x64 均有格式与媒体请求、断流恢复、断网后缓存播放证据。Windows 验证实际 EQ 输出、曲库 MV 和全屏 H.264/AAC 音画切换。两种 Mac 架构和 Windows 10 22H2 虚拟机均完成一小时采样。Mac 业务页同步、其它视频容器及人工听音待验 |
| Bundle | 固定后端/Go gitlink、动态端口+健康检查、随机凭据、绝对分离路径、有限重启、换服清理、父 EOF 与宽限结束 | 两种 Mac 架构的包内后端通过只读目录扫描、206、重启保留和停止。Windows 完整包通过本地登录、扫描、播放、虚拟局域网验证、升级保留和后端异常恢复。修复后的 Windows 隔离安装通过音乐目录恢复。更多设备和实体局域网待验 |
| 插件 | 原生子 LynxView/资源加载/身份桥、CEF 既有宿主协议与 Cookie/外链/上传/返回、隐藏暂停及释放/socket 清理 | Mac 两架构的 Bundle 和反代子路径已验证安装后的插件读写、播放和后端重启读回。Windows 完整业务页在远程代理子路径通过两种插件的独立后端读写、播放、画面缩放及保留实例核对。第三方插件、其余设备和部署场景待验 |
| 安装/更新 | 三架构 CI 源码、每用户 NSIS、Mac DMG/ZIP、嵌套签名、原始字节 Ed25519 清单、自动下载、用户安装、独立 Go 验签/等待/安装、备份配套恢复 | Windows 实际设置页签名升级通过。Mac arm64 迁移及恢复通过，两个 Mac 架构通过下载取消、断开重试和验签检查。Mac 设置页升级、最低系统和发行签名／公证待验 |

Linux、Windows ARM、DLNA、悬浮歌词、系统外快捷键、JS 热替换、Flutter 数据迁移未加入。桌面实施沿用现有移动 SDK。各客户端仓库独立构建 Bundle 的流程见[发布指南](../guides/releasing.md)。

## 真实构建发现及修复

1. **混合 Node-API ABI 崩溃**：完整业务页在 Lynx_JS 中地址 0 崩溃，栈含 `lynx_napi_report_and_clear_exception`。除 C API weak/strong 区分外，须用 `NAPI_CPP_CUSTOM_NAMESPACE` 隔离两套 C++ inline 包装。修复后真实登录页、存储/网络/快捷键 RPC 运行通过，截图 `/tmp/songloft-desktop-business-arm64.jpeg`；原始崩溃 `.ips` 保留在 Mac。
2. **后端本地 Go 替代模块漏归档**：`git archive` 不含 `pkg/tag` 的 gitlink，原资源构建实际失败。现在读取固定后端树的 gitlink 并归档该精确提交；CI 只初始化必要模块。开发构建元数据记录这个 SHA。
3. **打包范围与下载 API**：外部 bundle 先复制到桌面 staging；开发运行时下载缓存不进入应用。pnpm 使用官方补丁的固定副本。app-builder-lib 26.13.0 实际需要 `@electron/get` 的 CacheMode，3.0.0 导致 DMG 失败；固定 3.1.0 后 DMG/ZIP 生成。
4. **签名 ZIP 的 AppleDouble**：Go 通用解压将 `._*` 元数据写成文件，实际 codesign 严格校验报新增资源。辅助程序在有界路径检查后忽略这些 sidecar 和 `__MACOSX`，仍拒绝越界路径/链接；真实签名夹具与完整 ZIP 校验单独运行。
5. **Windows 安装路径**：按 NSIS [官方参数要求](https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.1) 直接组装 CreateProcess 参数，`/D=` 最后且不加引号，支持空格路径；不经过命令 shell。Windows 实际安装仍 Not run。
6. **框架链接及输入状态**：解压检查须先规范化 macOS `/var`/`/tmp` 别名，否则完整 CEF 包的合法 framework symlink 会被误拒；完整签名 ZIP 解压后严格验签现已通过。`NSTextInputClient` 也不等于输入已激活，固定 embedder 的 active flag 检查通过实际 AppKit 回归，仍需最终输入法/快捷键验收。
7. **锁屏与构建身份**：宿主结合屏幕和窗口状态控制画面与插件暂停；锁屏/休眠继续由同一播放器处理音轨。源码变化会阻止 `desktop:build` 发布新身份，已有实际拒绝日志 `/tmp/songloft-desktop-source-change-rejected.log`，稳定工作树重建后通过。
8. **远程启动后的迁移确认**：复查发现更新后若先进入远程模式，启动时不会运行本地数据库迁移；原确认逻辑也没有在用户之后切换到本地时再次执行。现在本地后端健康检查通过后才确认新应用，并在后续本地启动迁移失败时提供恢复旧应用与对应数据库备份的入口。该分支尚未做升级实机验收。
9. **父进程退出启动竞态**：Go 父管道现在在应用初始化前开始监听；新增服务就绪回调在 `http.Server` 注册 listener 并进入 `Accept` 后触发。父进程在初始化或绑定期间退出时，后端不会在 Server 创建前清理数据库后又继续监听。新改动已 gofmt；本轮未运行 Go 测试或跨平台构建，留待最后统一验收。
10. **Lynx 子帧桥接时序**：子 runtime 若早于宿主登记 frame identity 执行就绪回调，桥接扩展现在会在首次子帧调用时从绑定表补取身份，避免空身份永久拒绝插件调用。代码已 clang-format；本轮未构建原生扩展或实测插件写入。
11. **更新目录创建失败**：更新下载先创建目录再进入原收尾块，会令目录权限/磁盘错误留下 `downloading` 状态及活动超时器。现在目录创建也走同一错误、取消和清理分支，可正常报告失败并重试；本轮未执行更新器测试。
12. **安装后启动确认写入失败**：应用替换成功后若启动记录无法写入，新版本尚未启动，旧版仍保留在 `.previous`。现在确认记录经同目录临时文件同步后原子发布；写入失败时安装器恢复并重启旧版，避免落在“新版已替换但没有恢复记录”的状态。更新器测试与跨平台安装仍 Not run。
13. **会话切换取消宿主上传**：服务器切换和 Bundle 异常退出原先只取消通用网络、缓存及插件任务，文件选择器发起的上传有独立 AbortController，可能继续访问旧会话。现在本地/远程切换及 Bundle 异常退出也调用平台任务清理，上传和其他平台网络任务会立即中止；本轮未执行运行时测试。

## 首轮环境与历史验证证据

本节保留首轮的结果及当时的未验证项。后续结果按架构记录在模块覆盖矩阵和对应测试章节。

本地为 Linux、Node 22.17.1 / pnpm 11.15.1 / Go 1.26，Node 小版本低于桌面宿主要求，仅用于共享检查；实际 Lynxtron 嵌入 Node 22.18.0。Mac 是 macOS 26.6.2 arm64、AppleClang 21 / SDK 26.5、Node 26.4.0；x64 通过交叉编译与 Rosetta，不代替实体 Intel 或 macOS 13。

Mac 隔离目录 `/tmp/songloft-lynx-desktop-20261117-173fa14/`；SDK 整理实际收集 84 个分发文件，目录 `distribution-sdk-arm64`，清单 SHA-256 `b186c8c73c9552d8fd1d878ab292f43f6ad622586cf6f0c6dac22f19ce51d1db`。源依赖的原始摘要及早期失败见探针记录；此处为开发候选，正式 SDK 来源/许可证及签名仍需审核。

| 命令/场景 | 结果与日志 |
| --- | --- |
| TypeScript、全量 Vitest、Lynx/Web/探针 | 最终 369 文件/3860 项通过；Lynx/Web 和 96.7 kB 探针通过，见 `/tmp/songloft-desktop-final-{types,vitest,build}.log` |
| 发布工具 | 95 项通过，`/tmp/songloft-desktop-final-release.log` |
| 桌面宿主 Node 检查 | 18 项通过，`/tmp/songloft-desktop-final-node.log` |
| CEF 隐藏定时器、外链及插件保留 | 7 项通过，`/tmp/songloft-desktop-cef-lifecycle-tests.log`；其他相关 32 项通过 |
| 原生构建 | Mac 两架构编译/链接通过，最终表面/输入保护补验 `/tmp/songloft-desktop-final-native-surfaces.log`、`/tmp/songloft-desktop-keyboard-focus-mac.log`；Windows C++/SMTC 编译和执行 Not run |
| 真实 mpv 控制 | 两架构当前播放器初始 3 秒、暂停稳定、恢复前进、快速替换到 7 秒通过，`/tmp/songloft-desktop-final-player-{arm64,x64}.log` |
| Go 宿主清理 | `go test ./internal/parentwatch ./internal/app ./internal/config` 通过；Linux 实际动态端口/health/EOF 退出 0，`/tmp/songloft-desktop-parentwatch-process.json` |
| Bundle 二进制 | Mac 实际扫描 2 首、206、重启 2 首保留并停止，`/tmp/songloft-desktop-backend-mac-integration.log` |
| 更新辅助程序 | Go 测试、三目标交叉构建；Mac 签名应用解压与真实安装/配套恢复通过，`/tmp/songloft-desktop-{signed-extraction,helper-mac-integration}.log` |
| 安装包 | arm64 dev 资源构建与 DMG/ZIP 通过，`/tmp/songloft-desktop-package-arm64.log`；正式 Developer ID/公证及 Windows NSIS 实际构建 Not run |

Keychain 在当前 Mac 测试会话曾返回 `-25308`，完整本地模式自动登录没有因此标为通过，也没有回退明文。收尾检查确认 Mac 已再次自动锁屏，独立探针仍停在两次表面提交；新签名安装体的启动采样停在 CEF 的 `SecItemCopyMatching` 等待，不能当作已通过首次启动。测试进程已清理。安装辅助测试使用独立测试密钥和微型签名应用，数据库为测试夹具；它证明文件/签名/恢复流程，不代表已完成真实客户端旧包升级或后端数据库迁移验收。完整 CEF ZIP 的解压后 codesign 严格验证通过，见 `/tmp/songloft-desktop-complete-zip-verification.log`。

2026-11-18 继续 Mac 启动排查：桌面凭据原生调用现改为 `Napi::AsyncWorker`，Mac arm64 原生扩展编译成功；当前源码的 Lynx/Web/探针 bundle 通过源码指纹校验，新的 arm64 dev DMG/ZIP 生成成功。隔离数据目录启动的新包仍停在 macOS `SecurityAgent` 授权提示。进程采样 `/tmp/songloft-lynx-desktop-20261117-173fa14/async-keychain-current.txt` 显示同步 `SecItemCopyMatching` 调用来自 CEF `CefInitialize`，发生在客户端窗口、Songloft 凭据异步读取及 Bundle 后端启动之前。因此本地模式凭据、自动登录和完整首次启动仍待最终设备验收；该等待不是异步凭据模块卡住的证据，也未记为通过。

开发包体、安装体积及后续截图/源码摘要保留在证据目录；冷启动、空闲/播放内存和一小时趋势尚未建立，均为 Not run。Windows 实机、实体 Intel、最低系统、人工听音、视频同步、插件实际 API 写入、干净环境和真实升级矩阵统一在末尾验收。正式包要求公开主仓库 `main` 包含所需 Bundle 能力，以及匹配 SDK 和独立桌面更新签名密钥。

2026-11-18 源码复查后续：更新成功确认已移至本地后端健康检查之后；远程模式启动的更新会在稍后切换本地时完成确认，迁移失败可触发配套恢复提示。Bundle 父管道/HTTP Server 就绪竞态、Lynx 子帧桥接身份时序、下载目录创建失败收尾、安装后确认记录写入失败回滚和切服上传任务清理已修复。相关运行时测试、Go 测试、原生构建和新 SHA 构建均为 Not run，加入最终验收。

Mac 启动状态后续：用户确认解锁后已能看到桌面界面。此前 SecurityAgent 授权提示和进程采样是历史排查记录；本次没有独立截图、运行日志或播放/本地模式操作证据，因此只记为界面可见，不将完整启动、Keychain 自动登录、播放、插件或更新验收标记为通过。

arm64 开发 DMG、更新 ZIP 与 `complete-desktop-evidence.json` 已复制到本地 `/home/hanxi/work/songloft-review/lynx-desktop-20261117/`，可直接审核；测试密钥未复制。安装体积按 Mac `du` 实测为 575,012,864 字节，属于首个开发基线，不代表正式包或其他架构。
