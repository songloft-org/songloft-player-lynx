# 安装与连接服务器

[English](../en/guides/installation.md)

## 选择版本

从[正式 Release](https://github.com/songloft-org/songloft-player-lynx/releases/latest)或滚动 [dev Release](https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev)下载。dev 为预览构建，代码推送到 `main` 后自动打包；纯文档修改不触发构建。启用桌面发布后，Windows 和 macOS 安装包也会放在这两个下载入口。

| 文件                                  | 用途                                     |
| ------------------------------------- | ---------------------------------------- |
| `songloft-lynx-android.apk`           | Android，release 签名，内嵌 Go 后端       |
| `songloft-lynx-ios-nosign.ipa`        | iOS，未签名，需自行重签，内嵌 Go 后端     |
| `songloft-lynx-harmony.hap`           | HarmonyOS，签名 HAP                      |
| `songloft-lynx-web-standalone.tar.gz` | 独立静态站，用户填写 API 地址            |
| `songloft-lynx-web-embedded.tar.gz`   | 同源服务器部署的静态资源                 |
| `version.json` / `checksums.txt`      | 构建版本、commit、时间、包清单与 SHA-256 |

Windows 10 22H2 以上选固定名 `songloft-lynx-{channel}-win32-x64.exe` 的 NSIS 安装包。macOS 13 以上用固定名 `songloft-lynx-{channel}-darwin-arm64.dmg` 或 `songloft-lynx-{channel}-darwin-x64.dmg` 安装，Apple 芯片选 arm64，Intel 芯片选 x64。macOS 对应的 `.zip` 用于应用内更新。安装后在登录页或设置页选择连接服务器或本地音乐。

## 校验下载

将下载包与 `checksums.txt` 放在同一目录。Linux 使用 `sha256sum -c checksums.txt --ignore-missing`；macOS 可用 `shasum -a 256 <包名>`，Windows 可用 PowerShell `Get-FileHash <包名> -Algorithm SHA256` 对照校验值。

## Android

含 Bundle 后端的 APK 最低需要 Android 6.0（API 23）。允许安装来自所选浏览器/文件管理器的应用，打开 APK 安装。也可运行：

```bash
adb install -r songloft-lynx-android.apk
```

应用 ID 为 `org.songloft.lynx`。dev 与正式版共用应用 ID 和维护者 release 签名，较新的构建号可覆盖安装并保留数据。自己用 debug 签名编译的包不能覆盖维护者签名的包；切换签名需处理旧安装和备份。不能把旧包当作更新覆盖新包。

通知与后台播放需要系统授权；悬浮歌词另外需要悬浮窗权限。厂商后台限制可在应用设置的保活引导中检查。

## iOS

最低 iOS 15；Live Activity 需 iOS 16.2+。IPA 是 **未签名的设备构建**，不能直接在普通设备安装。用自己的开发者身份和适用于目标设备的 provisioning profile 重签后，按所用签名工具的安装流程操作。此仓库目前不发布 App Store/TestFlight 版本。

## HarmonyOS

需 HarmonyOS NEXT / API 13+。可用 DevEco Studio 或：

```bash
hdc install songloft-lynx-harmony.hap
```

签名 HAP 能否在目标设备安装，还取决于维护者使用的证书与 profile 是否授权该设备。CI 签名成功不代表 profile 可用于任意设备。HarmonyOS 当前为实验性支持，全屏视频未实现，其余欠账见[交接页](../project/handoff.md)。

## Web

解压 standalone 包到静态服务根目录，打开站点并填写后端地址。服务器需提供 JS modules、Worker、WASM 的正确 MIME；当前核心流程不强制 SAB 或隔离头，普通 HTTP 可用，HTTPS 用于剪贴板和常亮等安全上下文能力。跨源后端需允许 API 请求；宿主主动启用 COEP 时还需兼容 CORP 资源加载。先在常青浏览器中验证。

embedded 包隐藏 API 地址输入，使用同源后端。它是静态资源包，不会自动替换 Songloft 后端的 Flutter 内嵌资源；要使用它，需要明确配置后端构建嵌入路径或反向代理的静态目录。当前宿主中含根路径资源 URL，**子路径部署尚未完成验证**。

embedded 同样需要以上响应头，不能仅替换 Go 内嵌资源就假设部署完成。具体部署方式见[Web 部署](web-deployment.md)。

## 本地模式与远程模式

Android 和 iOS 安装包都包含由本仓库 CI 从打包启动时主仓库 `main` 的最新提交编译的 Go 后端。同一安装包可在本地模式和远程服务器间切换，入口位于登录页和设置页；首次启动没有额外的模式选择弹窗。

- **Android**：首次启用本地模式时通过系统文件夹选择器选音乐目录并授予读取权限。后端启动后自动选择端口，客户端完成健康检查并使用本地生成的管理员凭据登录。
- **iOS**：首次启用本地模式时使用应用 Documents 目录，不显示外部目录选择器；可通过系统“文件”应用把音乐放入该目录。
- **HarmonyOS 与 Web**：安装包不含本地后端，需连接远程服务器。

远程模式填写完整服务器 URL、用户名和密码。后端默认端口为 `58091`；新安装后端的初始账号为 `admin/admin`。手机上的 `localhost` 指手机本身，连接开发机需用其可达地址；Android 开发调试可用 `adb reverse tcp:58091 tcp:58091`。

切换到远程模式会停止本地后端但保留本地曲库数据。关于页的版本包含客户端构建信息和服务器版本。「后端更新」升级远程服务器；客户端更新目前通过重新下载安装包完成。
