# 构建与发版

[English](../en/guides/releasing.md)

## 触发与产物

统一入口是 `.github/workflows/build-and-release.yml`，替代三个独立的手动 dev workflow。

| 触发                    | 行为                                                       |
| ----------------------- | ---------------------------------------------------------- |
| 代码 push 到 `main`     | 自动验证与四平台打包，成功后更新 `dev` prerelease          |
| push `vX.Y.Z`           | 校验 tag 与 package.json 一致，发布正式版本                |
| push `vX.Y.Z-beta.N` 等 | 发布带版本号的 prerelease，不成为 latest                   |
| Actions → Run workflow  | 选择 main 重建 dev，或选择 v\* tag 构建对应版本            |
| Pull request            | 验证和打包，Android 用 debug 签名/HarmonyOS 不签名，不发布 |

文档/许可证修改不自动触发构建。手动构建其他分支只生成 artifacts。正式和 dev 发布均要求 Android、iOS、HarmonyOS、Web 两种模式全部成功，失败时保留各自 artifacts，不更新 Release。

产物名见[安装指南](installation.md)。`version.json` 和 `checksums.txt` 随 Release 发布。新流程移除旧的独立 `dev-harmony` 入口；历史 Release 不自动删除。

dev、preview 和正式 Release 的正文使用 `.github/release-notes.md` 中的中英双语安装说明，列出五种包的安装/部署方式、服务器连接要求和 SHA-256 校验步骤，并按 Flutter 客户端的方式生成 Conventional Commits 分类记录（含提交链接）。比较范围为当前提交与已合并的最近一个 `v*` tag，跳过指向当前提交的 tag；没有历史版本 tag 时回退到首个提交。仅包含 Flutter 流程同样支持的提交类型；无可列出的变更时只保留安装说明。

版本 tag 的 Release 发布成功后，独立 job 从最新 `main` 更新根目录的中文 `CHANGELOG.md`，将生成器的分类标题和作者标记本地化并提交回仓库。不同版本的日志更新串行执行。dev 不写入该文件，日志提交也不会触发新的构建；按项目要求不另设英文 CHANGELOG。

上传先写 draft，全部资产成功后才公开，避免下载到部分包。dev 替换期间暂时隐藏；上传失败会留 draft 供维护者检查和重跑。正式/preview 的已有 Release（包括 draft）仍拒绝覆盖；先人工确认失败 draft 的状态再决定删除或发布。dev 会清理同一 Release 内的旧资产名称。

## iOS 原生构建缓存

iOS 发布 job 从 `ios/release/Podfile.lock` 安装运行时依赖，依赖版本与本地 Debug 共用 `ios/pods.rb` 中的声明。`ios/Podfile` 保留 Devtool，供本地模拟器与 Inspector 使用；Release 的独立安装图不包含 LynxDevtool、BaseDevtool、DebugRouter、SocketRocket 及 PrimJS 的调试 subspec。CocoaPods 不支持将同一 Pod 的不同 subspec 分配到不同构建配置，因此两种入口分别维护锁文件，修改依赖时需同步更新。

工作流启用 Xcode 26 的内容寻址编译缓存，保存 `.build/ios-compilation-cache`，同时缓存 CocoaPods 下载和 specs。缓存按 runner OS/架构、macOS build、Xcode build、iPhoneOS SDK build、依赖声明/Release 锁文件和 Xcode 工程隔离；同一组输入恢复上次成功的缓存，每次成功构建保存新的条目。PR 可以恢复缓存，不写入缓存。

缓存不包含安装包、bundle 或旧构建元数据；每次仍构建并检查当前版本的 IPA。首次构建或更换工具链/依赖后的构建需要预热，不承诺具体提速比例。日志输出编译缓存命中诊断和 `Build Timing Summary`，应对照后续冷/热缓存 job 的原生编译耗时评估效果。

本地重现 CI 的依赖安装入口：

```bash
cd ios/release
pod _1.16.2_ install --deployment
```

它仍生成 `ios/SongloftLynx.xcworkspace`，两种入口共用 `ios/Pods` 路径，避免切换时已有 xcconfig 引用失效。返回本地 Debug/Inspector 开发时，重新运行 `pnpm run ios:pods`，恢复 Debug 依赖和对应的锁文件检查。

## 一次性配置

仓库 Actions 需要允许运行工作流及 Release job 的 `contents: write`。配置 Repository Secrets：

| Secret                           | 用途                               |
| -------------------------------- | ---------------------------------- |
| `ANDROID_KEYSTORE_BASE64`        | Android release keystore 的 Base64 |
| `ANDROID_KEYSTORE_PASSWORD`      | keystore 密码                      |
| `ANDROID_KEY_ALIAS`              | 签名 alias                         |
| `ANDROID_KEY_PASSWORD`           | 私钥密码                           |
| `HARMONY_SIGNING_KEY_BASE64`     | `.p12` 私钥容器 Base64             |
| `HARMONY_SIGNING_PROFILE_BASE64` | `.p7b` profile Base64              |
| `HARMONY_SIGNING_CERT_BASE64`    | 证书链 Base64                      |
| `HARMONY_KEYSTORE_PASSWORD`      | 容器密码                           |
| `HARMONY_SIGNING_KEY_PASSWORD`   | 私钥密码                           |
| `HARMONY_KEY_ALIAS`              | 可选，默认 `songloft`              |

dev 与正式版必须长期共用同一 Android 签名身份；换 key 会破坏覆盖升级。HarmonyOS 的 profile 决定可安装设备范围。发布用的签名材料缺失直接失败，不回退 debug/unsigned；PR 的未签名产物仅用于编译验证。

iOS 只构建设备 Release，明确标为 `nosign`。目前没有 iOS 分发证书导入或 App Store 上传流程。

bundle 热更新另使用独立 RSA 签名身份，配置 Repository Variable `LYNX_UPDATE_PUBLIC_KEY`（SPKI PEM 公钥）与 Secret `LYNX_UPDATE_PRIVATE_KEY`（PKCS#8 PEM 私钥）。私钥只供 release job 签名，不进入 JS、安装包、artifact 或日志；prepare job 将公钥写入同次构建的不可变壳信息。keyId 由公钥摘要生成，无需另配。详细格式见 [客户端更新协议](../reference/client-updates.md)。

缺少私钥时继续生成五种完整包，不发布未签名热更新资产；私钥存在而公钥缺失/不匹配，或 prepare/release 两阶段公钥变化，发布失败。首次热更新须安装 P2b 接入更新器和受信公钥的新壳；当前 P2a 尚未实现客户端更新入口。轮换公钥也须先安装信任新公钥的壳，不能仅替换远程清单。

## 手动发版脚本

```bash
pnpm run release patch --dry-run
pnpm run release patch
pnpm run release minor
pnpm run release major
pnpm run release 0.2.0-beta.1
pnpm run release release       # 去掉当前版本的 prerelease 后缀
```

`--dry-run` 打印版本与命令，不改文件、不提交、不联网或推送；可以在 dirty 工作树中预览。实际发布要求：`main`、干净工作树、新版本高于当前版本、tag 本地及远程都不存在、本地 main 包含远程 main。脚本先检查这些前提，再询问确认。

实际操作依次为：同步 `package.json` 与 iOS/HarmonyOS 原生版本 → 创建中文 Conventional Commit → 创建 annotated `v*` tag → 用 `git push --atomic` 一次推送 main 与该 tag。tag 推送触发 CI。Android 默认值从 package.json/构建元数据读取，不维护第五份版本常量。

可用 `--yes` 跳过脚本自己的交互确认，`--no-push` 只创建本地 commit/tag。网络预检仍会执行。已发布版本不覆盖；失败后保留本地结果供检查，不会删除 tag、reset 或自动回滚。

```bash
pnpm run release minor --no-push
# 检查后自行发布已生成的确切 tag：
git push --atomic origin HEAD:refs/heads/main refs/tags/v0.2.0
```

不要重复运行 bump 脚本来重试同一个版本：它会计算下一个版本。构建失败时在 Actions 重跑对应 tag；已有正式/preview Release 时重跑会拒绝覆盖。

## 统一版本与构建号

`package.json.version` 是基础语义版本的唯一来源。CI prepare job 只生成一次 `.build/version.json`，把元数据与 Lynx/Web bundle 一起分发给平台 job。

- dev 的显示版本为 `dev`，正式/preview 为 tag 去掉 `v`。
- iOS `MARKETING_VERSION` 使用基础 `X.Y.Z`，不带 prerelease；JS 显示完整版本。
- Android/HarmonyOS/iOS 使用同一 `build_number`：UTC 构建秒数减去 `2020-01-01T00:00:00Z`。它跨 dev/正式通道增长，不依赖某个 workflow 的运行序号，也不受 rerun 编号重置影响。
- 关于页显示客户端版本、commit 与 UTC 构建时间。
- `SONGLOFT_BUILD_METADATA` 指向元数据文件，构建时校验与 package.json 一致；损坏或混用的元数据会失败。

本地模拟 CI 元数据注入：

```bash
node scripts/prepare-build.mjs
SONGLOFT_BUILD_METADATA="$PWD/.build/version.json" pnpm run build
```

这生成 dev 元数据；普通本地 build 也默认显示 dev，不携带 Release 的源码证明。客户端内检查更新尚未实现；`version.json` 为后续接入保留准确来源。

## 发布闸门

prepare job 运行类型检查、生产双产物构建、完整 JS 测试与发版工具回归。平台 job 编译宿主，再检查实际包内 bundle、原生版本/构建号、Lynx 动态库、签名与 Web 静态引用。release job 要求五个非空包齐全，生成逐包 SHA-256 和包含包清单的 version.json。

配置更新密钥时，release job 同时验证 prepare 阶段壳信息、生产 bundle 和自包含资源约束，发布原生 bundle、`bundle_update` 兼容声明和 `version.json.sig`。签名覆盖原始清单字节，checksum 同时覆盖清单与签名。发布工具回归中的 Java 验签需要 JDK；无 JDK 时该项明确 skip，其余 Node 协议测试仍执行。

正式 JS 构建默认替换掉 devtools/E2E 入口。原生测试桥只能在 Debug 注册/启动，监听 `127.0.0.1:9230`；dev 下载包同样为 Release，不能用于 TestBridge E2E。测试构建方法见[测试指南](testing.md)。

CI 通过证明构建和包检查通过。后台播放、系统权限、DLNA、视频与 HarmonyOS 仍需要对应设备验收。首次切换新工作流后，要核对 Release 的五个包、版本信息、签名身份，并实际安装验证覆盖升级。
