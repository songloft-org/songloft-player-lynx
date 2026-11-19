# Windows/macOS 桌面第一批验证记录

> 历史记录。用户已明确要求先实现全部能力、最后统一验收；当前源码、验证与开放项见[完整实现记录](desktop-implementation.md)。下文阶段停点、锁屏状态和“后续未开始”仅代表当时状态。

[English](../en/project/desktop-phase1.md) · [构建与接口指南](../../desktop/README.md)

## 2026-11-17 补验：系统音频输出与 x64 实际 Callback

客户端基线仍为 `173fa140c70ba80998cb8f49960619306986ef86`，本轮父仓库基线为 `caf3729128ff85dbd5280b861ea9eace439b0efa`，均叠加未提交桌面工作树。工作树快照 `/tmp/songloft-desktop-ao-worktree.json`，证据目录 `/tmp/songloft-desktop-ao-evidence/`。本轮仍在第一批；Mac 的锁屏状态复查为 `1`，未绕过锁屏或修改系统权限。

新增 `current-ao` 异步属性观察，状态通过 `audioOutput` 报告真实后端，未知时为 `null`。按固定 0.41.0 `client.h` 的 `MPV_FORMAT_STRING` 约定读取 `char**`，立即复制事件字符串；API double 覆盖未知、不可用、事件失效后的所有权和换源保留。没有增加同步属性读取或改变生产音频默认值。

将已有真实解码检查扩展到 macOS：Linux 仍使用测试内 GNU wrapper 的空音频输出，macOS 直接使用生产 Engine 和默认系统音频，拒绝 `null` / `pcm`。同一合成 MPEG4/AAC 视频的实际结果如下：

| 执行环境 | 已观察音频后端 | 软件帧 / 不同摘要 | 暂停位置 → 恢复位置 |
| --- | --- | --- | --- |
| macOS arm64 原生 | `coreaudio` | 30 / 28 | 0.750 → 1.125 秒 |
| macOS x64 / Rosetta | `coreaudio` | 33 / 31 | 0.791667 → 1.250 秒 |
| Ubuntu / 原隔离容器 | `null`（仅测试） | 24 / 22 | 0.541667 → 0.916667 秒 |

三次均实际核对暂停 600 ms 期间的位置稳定及恢复后的前进。Mac 的结果证明系统音频后端和解码器可运行，不代表人工已听到声音、音画同步或 Lynx 原生窗口连续呈现。软件帧计数不是 `submittedFrames`；后者在锁屏窗口里仍停在 2。

两种 Mac 扩展重新编译/链接、原生 API double 和 x64 模块加载检查通过。MinGW 重编译三个 COFF 对象通过，`/tmp/songloft-cross-tools/compile-evidence-audio-output.json` 绑定最新头文件/源码；Windows 链接/运行仍 Not run。查询了 [mpv 0.41.0 发布元数据](https://github.com/mpv-player/mpv/releases/tag/v0.41.0) 和固定源码的 [Windows 打包脚本](https://github.com/mpv-player/mpv/blob/41f6a645068483470267271e1d09966ca3b9f413/ci/build-mingw64.sh)，其播放器发布包未被当作 libmpv SDK。下载超时的部分文件没有用于链接或验证；尚缺可验证 SDK 和 Windows 测试环境，已请求用户提供既有连接。

x64 已完成真实 Lynxtron → BTS → `SongloftDesktopProbe` → libmpv → Callback 往返，观察到 `audioOutput=coreaudio`、Lynx 4.4、实际暂停/恢复、CEF `load` 和视频首帧；DevTool 截图显示视频与诊断文本。第一、二次采集分别过早查询宿主/页面而失败，第三次改为轮询实际页面会话，首次就绪为 9.633 秒；该值包含测试与 Rosetta 环境开销，不是冷启动基线。首次完整采集的总进程预算又未覆盖初始化后才启动的 50 秒退出计时，控制器超时后清理了进程；保留失败日志。改用 20 秒探针窗口后，采集和正常退出通过。arm64 同样取得新的 `audioOutput` Callback 与截图，正常退出通过。所有旧失败与最终结果均保留，不能以早期 `No available clients/sessions` 推断目标不兼容。

本轮检查：类型、5 项桌面相关 Vitest、6 项 Node 检查、默认 Lynx/Web 双构建和 95.6 kB 探针构建通过；日志 `/tmp/songloft-desktop-ao-{types,focused,node,build}.log`。本批未修改共享业务源码，全量 368 文件/3847 项沿用上一轮记录，本轮没有重复跑全量。新中英文[模块/平台契约](../reference/desktop-probe.md)已纳入文档索引；原生模块/平台旧中文参考页按既有索引的语言例外只添加入口，英文完整说明在新配对页。

收尾时另一个会话修改了 HarmonyOS 插件宿主、共享 `LynxPluginFrame.tsx` 及相应声明/测试。它们不是本批桌面修改，未纳入上述类型/双构建结果；最终工作树快照保留它们，未覆盖或提交。其构建也清理了共享 `dist/`，本轮已验证的业务/探针 bundle 单独保存在证据目录 `artifacts/`，按采集时的摘要核对，不回写共享构建目录。桌面原生源码与独立探针源码的验证摘要仍匹配。

第一批仍未通过：Mac 锁屏下的表面缓冲超时和 CEF 可见交互待解锁核验；人工听音、音画同步、实体 Intel/最低系统和 Windows 实机仍待验。第二至第六批未开始，未提交、推送、更新父指针或发布。

## 2026-11-17 后续：真实 macOS 构建与运行

本轮客户端基线 `173fa140c70ba80998cb8f49960619306986ef86`、父仓库 `b9d4a3a162ce65205775570a1336a0c4a410955a` 加未提交桌面工作树。新的工作树标识为 `/tmp/songloft-desktop-mac-worktree.json`。以下覆盖此前“没有 macOS 环境”的判断；旧检查和旧 Not run 表保留为历史，不能当作当前矩阵。

通过已有受信任 SSH 别名 `mac` 连接 macOS 26.6.2 arm64，使用 Xcode CLT / AppleClang 21、SDK 26.5、CMake 4.4.4、Node 26.4.0。全部依赖和构建置于 `/tmp/songloft-lynx-desktop-20261117-173fa14/`，未更改系统包或现有源码目录。x64 产物在同一机器通过交叉构建与 Rosetta 验证，**不等于实体 Intel Mac 或 macOS 13 验收**。

| 检查 | 实际结果 |
| --- | --- |
| macOS arm64 | CMake 编译/链接通过，真实 Lynxtron 加载扩展和探针，NativeModules Callback 返回实际引擎状态；实际 Lynx SDK **4.4** |
| macOS x64 | x86_64 Mach-O 扩展与 libmpv 编译/链接通过；真实 x64 Lynxtron 在 Rosetta 下加载扩展，报告 `nativeExtensionLoaded=true, arch=x64, node=22.18.0` |
| 控制契约 | arm64 与 x64 原生编译/执行 API double 通过；实际 arm64 引擎暂停时位置连续保持 `2.0416666667` 秒，恢复后继续递增 |
| 视频与 CEF | DevTool 截图包含实际解码并提交的彩色视频；CEF 发出 `load` 回调。**连续画面与 CEF 显示/交互未通过**：锁屏下帧计数停在 2，并有 `shared_image_sink.cc: timeout to wait back available` |
| 窗口与环境 | 原生窗口已创建；`CGSSessionScreenIsLocked=1`。系统窗口截图失败，应用 DevTool 截图成功；未修改录屏权限、未解锁系统。已请求用户解锁后继续核验 |
| Windows x64 | 更新 Engine 后重编译三个 COFF 对象通过，证据 `/tmp/songloft-cross-tools/compile-evidence-mac-followup.json`；VS 构建、链接、实际运行仍 Not run |

### SDK 构建与失败证据

预编译 conda-forge mpv 0.41.0 SDK 首先因 `_av_dict_copy`，固定 FFmpeg 8.0.1 后因 `_cfstr_from_cstr` 动态加载失败。它曾允许扩展链接，不能当作可用 SDK。保留 `/tmp/songloft-mac-sdk-load.log` 等失败记录，转为构建未打发行版补丁的上游 0.41.0 源码。

原始源码包 SHA-256 `4f900c91f9fdb36bc6442968775910aa8c0f67dade72a3d51a4b0c2b39af02da`，与 Ubuntu `.dsc` 的 orig 源码摘要一致；包内头文件与固定提交 `41f6a645068483470267271e1d09966ca3b9f413` 相同。使用隔离 micromamba 2.10.0 环境供给 FFmpeg **8.0.1**、libass **0.17.4**、libplacebo **7.351.0** 等依赖，隔离 Python venv 安装 Meson **1.9.1** / Ninja **1.13.0**。初始包清单和变更保留在远端 `sdk-arm64-*.json` / `sdk-x64-create.json`，它们是开发依赖，不是最终发行组合。

关键命令（`root` 为上述临时根目录，`mpv-src` 为已核对原始包的解压目录）：

```bash
export PATH="$root/build-tools/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PKG_CONFIG_LIBDIR="$root/sdk-arm64/lib/pkgconfig"
export MACOSX_DEPLOYMENT_TARGET=13.0
meson setup "$root/mpv-build-arm64" "$root/mpv-src" \
  --prefix "$root/mpv-sdk-arm64" -Dlibmpv=true -Dcplayer=false \
  -Dcocoa=enabled -Dswift-build=enabled -Dgl=disabled -Dvulkan=disabled \
  '-Dswift-flags=-target arm64-apple-macosx13.0' \
  "-Dobjc_link_args=-Wl,-rpath,$root/sdk-arm64/lib"
meson compile -C "$root/mpv-build-arm64" -j 6
meson install -C "$root/mpv-build-arm64"
SONGLOFT_MPV_ROOT="$root/mpv-sdk-arm64" node scripts/build-native.mjs
```

上游关闭 Swift 时缺少 `osdep/mac/swift.h`；启用后，隔离依赖的 `include/unctrl.h` 与 Apple SDK 的 curses 头冲突。只将这个临时环境中的头文件移到 `build-disabled-headers/` 保留，使 Apple 头按正常搜索路径解析；未改上游源码。显式 Swift target 避免默认按 macOS 26 编译。初次安装还丢失依赖 rpath，arm64 开发 dylib 通过 `install_name_tool -add_rpath "$root/sdk-arm64/lib" ...` 及 ad-hoc 重签修复；x64 使用上方显式 `objc_link_args` 后直接加载通过。日志分别为远端 `mpv-source-arm64-{no-swift-failed,conda-header-failed,swift-target-default,no-rpath-failed}.log` 及最终构建日志。

x64 的 `mpv-macos-x64.ini` 指定 C/C++/ObjC 编译器 `clang -arch x86_64`、host `darwin/x86_64/little` 和 `needs_exe_wrapper=false`，切换到 `sdk-x64`，使用 `--cross-file` 与 Swift target `x86_64-apple-macosx13.0`。扩展使用相同头文件、`-DCMAKE_OSX_ARCHITECTURES=x86_64`、`-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0`、独立 `.build/darwin-x64`。官方 x64 运行时 npm 包的 SHA-512 与桌面锁一致；解压后直接使用其内嵌 Node，未依赖全局 x64 Node。

### 实播发现与修复

- 真实运行暴露 `app.getLocale` 在本候选运行时不存在；宿主改为方法探测，后备使用 Node `Intl.DateTimeFormat().resolvedOptions().locale`，未据类型声明假定方法可用。
- 原先错误地把完成回调传给 `SelectorQuery.exec()`，实际调用只绘制一帧。现将单请求门控放入有类型的 `createProbeDrawer`，只由 `invoke` success/fail 回调清理，覆盖成功续绘、禁止重叠、失败重试、同步异常和销毁后的回调。4 项回归通过，日志 `/tmp/songloft-mac-draw-tests.log`。修复后锁屏环境仍只消费两帧，不能宣称连续画面已修复。
- 换源保留已观察的全局暂停属性，仅清空来源位置与帧计数，避免 mpv 不重发未变化属性时长期显示未知。最终 arm64 真实控制复测初始 `paused=false`，暂停稳定在 2.042 秒、恢复继续前进，日志 `devtool-console-arm64-final-control-2.txt`。正向检查 `/tmp/songloft-mac-engine-test.log`；隔离恢复旧重置后测试编译成功、执行退出 1，`/tmp/songloft-mac-pause-negative/result.log`。
- 新增仅探针可用的媒体/CEF URL、状态日志、暂停恢复时间线和自动退出参数，以及离线 CEF 计数/点击夹具。6 项桌面 Node 检查通过。不得把 `CEF loaded` 当作网页显示/点击已通过，也不把合成音轨默认输出当作人工听音证据。

远端日志和二进制摘要汇总复制到 `/tmp/songloft-desktop-mac-evidence/`；DevTool 首帧/修复后截图另见 `/tmp/songloft-mac-probe-arm64{,-draw-fixed}.jpeg`。最终 368 文件/3847 项共享测试、6 项 Node 检查、类型、默认 Lynx/Web 双构建和 95.4 kB 探针构建均通过，日志 `/tmp/songloft-mac-final-{shared-tests,node,types,build,format}.log`。更新 Engine 后的 Linux 真实解码补验仍为 24 帧/22 种摘要、暂停稳定、恢复前进，音频为 null：`/tmp/songloft-desktop-real-mpv/integration-mac-followup.log`；临时容器已停止。未执行正式签名、公证、安装包或升级。

**当前闸门：第一批未完成。** 等待解锁 Mac 核验连续画面、CEF 交互、字体/输入法/列表/弹层/缩放、人工听音及音画同步；x64 真实 UI、实体 Intel Mac、最低系统和 Windows 实机仍 Not run。第二至第六批保持未开始；未提交、推送、更新父指针或发布。

## 2026-11-17 后续：控制线程约束与 Windows 对象编译

第一批继续推进，尚未通过三架构实机闸门。本轮基线为客户端 `173fa140c70ba80998cb8f49960619306986ef86`、父仓库 `8177b2f` 加桌面未提交工作树；新的快照为 `/tmp/songloft-desktop-followup-worktree.json`，下方首轮记录作为历史保留。

- 修复原生控制与绘制的锁依赖：将 Engine 独立为可执行回归的头文件，活跃播放器使用异步暂停与属性观察，零超时读取事件，未知位置/暂停保持 `null`。不能在持有绘制所需锁时同步等待核心，依据固定版本 [render.h Threading](https://github.com/mpv-player/mpv/blob/41f6a645068483470267271e1d09966ca3b9f413/include/mpv/render.h)。
- `SONGLOFT_MPV_ROOT=/tmp/songloft-mpv-sdk node desktop/scripts/test-native.mjs` 通过，日志 `/tmp/songloft-desktop-engine-test-final.log`。API double 实现真实头文件声明，执行生产 Engine；检查未知态、异步命令尚未应用、属性通知、异步失败、换源清理和 render 先于 core 释放。隔离恢复同步暂停和状态读取后，两次编译成功，执行均退出 1，并分别报告 `synchronous pause holds the render lock` / `synchronous status read holds the render lock`；隔离目录 `/tmp/songloft-desktop-engine-negative/`。此证据不代表真实 mpv 解码或实播死锁复现。
- 使用临时解包的 Debian MinGW G++ 12.2 交叉编译 `surface.cc`、`probe.cc`、`addon.cc`，三个真实 Windows x64 COFF 对象均生成。完整 argv、源码摘要和结果为 `/tmp/songloft-cross-tools/compile-evidence.json`。只证明 Windows 目标代码编译，**没有链接 libmpv/Lynxtron、没有执行 Windows 应用**；Visual Studio 编译、两种 macOS 编译和三端实播仍为 Not run。未修改系统安装或安装 Windows 运行环境。
- `pnpm exec tsc -b --force`、367 文件 / 3843 项共享测试、3 项桌面 Node 检查、Lynx/Web 双构建及 94.2 kB 探针构建通过。日志 `/tmp/songloft-desktop-followup-{types,tests,node,build}.log`。3839 项之后新增的并行歌单测试已在本轮包含，不归为本批功能修改。
- 官方 Windows 0.0.31 运行库压缩包通过已锁定 SHA-512 校验；扩展所需的 70 个 Lynx/N-API 符号同时存在于导入库和真实 `lynxtron.dll` 的导出表。DLL/导入库摘要及完整符号记录在 `/tmp/songloft-cross-tools/runtime/abi-evidence.json`。这不证明模块可以在目标系统加载或执行。
- Ubuntu 26.04 隔离容器中执行生产 Engine 的真实 libmpv 集成检查通过：libmpv `0.41.0-2ubuntu4`、FFmpeg `8.0.1-3ubuntu2`、G++ 15.2，基础镜像 digest 为 `sha256:d66b366dac61b575bee2aef07e9c26e8070096fbe84a3d4d3eb0da069b5d76db`。合成的含音轨视频使用中文/空格路径，实际渲染 24 帧、22 个不同帧摘要；暂停 600 ms 期间位置稳定，恢复后从 `0.541667` 秒前进到 `0.916667` 秒。日志 `/tmp/songloft-desktop-real-mpv/integration.log`，夹具与二进制同目录。**使用空音频输出，没有实际发声，没有 Lynx/CEF 或 GPU 表面**，不能替代三架构实机闸门，也不增加 Linux 产品支持。
- 验证环境依赖获取的早期 HTTP/HTTPS 尝试分别存在下载缓慢和默认 CA 路径缺失，旧日志保留；显式 CA 校验成功后，使用 APT 已验证的发行方索引，宿主并行缓存 254 个包并逐个核对 SHA-256，再由 APT 离线安装。证据 `/tmp/songloft-desktop-real-mpv/{install-offline.log,apt-package-metadata.txt,debs/download-evidence.json}`；未关闭证书、签名或包完整性校验。只修改本任务的临时容器，未修改宿主机系统包。

第二至第六批仍未开始；没有新增提交、推送、发布或父指针更新。

## 首轮范围与代码

当前交付为第一批候选工程，**第一批验收尚未完成**。第二至第六批未开始；没有 Bundle、系统媒体、插件桥、安装包或自动更新的完成声明。

- 仓库：`songloft-org/songloft-player-lynx`。
- 初始基线：`888f5b88c842ea932a1f1f0b810a7f82a876f6fc`；并行会话提交登录/署名修复后，最终验证基线为 `6df678d10c078dcbe495ac47720ce86eab38825a` 加本批未提交工作树。
- 主仓库当前为 `d57b42ba45c565bc48cd2d8f3f70f5b68d32859a`；本批只改 Lynx 子模块源码，未修改后端/Flutter，也未提交、推送、发布或更新父指针。
- 最终工作树快照：`/tmp/songloft-desktop-final-worktree.json`（交付时生成，含 tracked/untracked 摘要）。不把其他会话的提交算作本批操作。
- 环境：Debian Linux x86_64、Node 22.17.1、pnpm 11.15.1、G++ 12、clang-format 19.1.7、Prettier 3.6.2。共享 JS 工具链允许该 Node；桌面运行时要求 Node 22.18+，本机没有 Windows/macOS 原生工具链、libmpv SDK 或对应桌面会话。

## 实现

独立桌面包和锁文件固定 Lynxtron/官方 CEF/扩展头文件 0.0.31，记录内置 Lynx 提交及 libmpv 0.41.0 源码 SHA。宿主支持现有业务 bundle 和独立音视频/CEF 探针两个入口。扩展共享一个 libmpv 引擎，Callback 提供命令和实际状态；Lynx 原生视频元素通过 render API、IOSurface/D3D11 和 SwapBack 提交软件 BGRA 帧。Node 入口与 Lynx `_weak` N-API 分文件编译。业务页尚未接桌面音频，显式失败，不模拟进度。

## 检查记录

| 检查 | 结果与证据 |
| --- | --- |
| `node --test desktop/tests/*.node-test.mjs` | 3 项通过，解析 YAML 验证版本、目标 OS/CPU、可选依赖关联及 SHA-512 摘要；`/tmp/songloft-desktop-node-final.log` |
| 类型检查 `pnpm exec tsc -b --force` | 当前基线通过；`/tmp/songloft-desktop-types-current.log` |
| 共享测试 `pnpm test --maxWorkers=2` | 366 文件 / 3839 项通过；`/tmp/songloft-desktop-tests-current.log` |
| `pnpm run desktop:build` | 当前基线通过：Lynx 4304.1 kB、Web 4260.0 kB、独立探针 94.1 kB；`/tmp/songloft-desktop-build-current.log`。这些是 JS bundle 大小，不是安装包体积。保留既有 `touch-action` 编码告警 |
| `pnpm run test:release` | 89 项通过；`/tmp/songloft-desktop-release.log`。后续本批改动不涉及发布工具或更新契约 |
| C++ 语法检查 | 使用真实 0.0.31 头文件和固定 mpv 提交的 `client.h/render.h`，分别按 `USE_WEAK_SUFFIX_NAPI=1` 检查 `probe.cc`、按普通 Node ABI 检查 `addon.cc`；Linux G++ 通过。未编译 `surface.cc`，未链接目标平台库 |
| ABI 符号检查 | `g++ -c` 后 `nm -u` 确认 `napi_create_object_weak`、`napi_create_string_utf8_weak`、`napi_get_cb_info_weak`；`/tmp/songloft-desktop-napi-symbols.log` |
| 格式/差异 | 新增代码经 Prettier / clang-format 格式化，`git diff --check` 通过 |

首次全量检查失败：Node 测试误用 `.test.mjs` 被 Vitest 收集；已改为仓库惯例 `.node-test.mjs`，仍由 Node 独立运行。同期并行中的许可证覆盖测试失败，登录测试还曾在类型检查时出现中间态错误；未改动这些文件，后由并行会话提交 `6df678d`。原始日志 `/tmp/songloft-desktop-tests.log`、`/tmp/songloft-desktop-types-final.log` 保留为失败记录。尝试隔离初始基线测试时一次 pnpm 拒绝非 TTY 的模块重建，另一次 Vitest worker 超时，均不能作为基线通过或失败结论。

依赖反向检查：镜像遗漏 Apple Silicon 可选运行时，安装成功但矩阵测试失败（`/tmp/songloft-desktop-lock-before.log`）。官方 registry 加新 store 重新解析后，三项通过（`/tmp/songloft-desktop-lock-fixed.log`）。此检查只证明元数据完整，不证明安装或运行。

验证期间存在并行工作。上述全量结果绑定当次运行的工作树；收尾时其他会话新建的 `src/features/playlist/__tests__/playlist-play-next.test.tsx` 不属于本批，不纳入 3839 项通过的声明。最终快照保留它的存在，不修改或提交它。

## Not run 与闸门

| 目标 | 原生编译/链接 | 真实业务 UI | 有声视频/缩放/暂停 | CEF 同时交互 |
| --- | --- | --- | --- | --- |
| Windows x64 | Not run | Not run | Not run | Not run |
| macOS arm64 | Not run | Not run | Not run | Not run |
| macOS x64 | Not run | Not run | Not run | Not run |

原因：当前仅有 Linux 环境，三种目标环境未连接。Linux 语法检查不能替代 Visual Studio/Xcode 编译；提交帧计数和引擎时间不能替代连续画面、人工听音或音画同步。视频元素、CEF、中文输入法、字体/SVG、列表/弹层/拖动、GPU 兼容和关闭释放均须在目标系统按指南运行。

Not run：完整桌面应用安装、干净机器、安装/包体积、冷启动、空闲/播放内存、一小时资源趋势、Bundle 扫描/局域网/进程回收、两类插件真实副作用、签名安装与升级。当前无安装包，后三类能力属于尚未开始的后续批次。三架构第一批全部通过前不继续叠加业务，不改成 Web 桌面壳。
