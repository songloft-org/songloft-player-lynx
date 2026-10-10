## 安装说明（中文）

本客户端需要连接已运行的 [Songloft 服务器](https://github.com/songloft-org/songloft)。安装后填写服务器地址并登录；客户端不包含本地后端。

在本页 **Assets** 中选择对应平台的文件：

| 平台 | 下载文件 | 安装 / 部署方式 |
| --- | --- | --- |
| Android | `songloft-lynx-android.apk` | 下载并打开 APK，按系统提示允许安装。安装包使用维护者的发布签名。 |
| iOS | `songloft-lynx-ios-nosign.ipa` | 未签名的设备包，需使用自己的开发者证书和适用于目标设备的 provisioning profile 重签，再按签名工具的流程安装。 |
| HarmonyOS | `songloft-lynx-harmony.hap` | 已签名 HAP，使用 DevEco Studio 或 `hdc install songloft-lynx-harmony.hap` 安装；目标设备须在签名 profile 的授权范围内。 |
| Web（独立部署） | `songloft-lynx-web-standalone.tar.gz` | 解压并部署到静态服务器，打开站点后填写 Songloft API 地址。 |
| Web（同源部署） | `songloft-lynx-web-embedded.tar.gz` | 解压并配置同源静态资源服务，使用同源后端；此包不会自动替换服务器现有的内嵌前端。 |

Web 部署需 HTTPS（localhost 除外），并设置 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp` 响应头；具体配置见 [Web 部署指南](https://github.com/songloft-org/songloft-player-lynx/blob/main/docs/guides/web-deployment.md)。

**下载校验：** 将安装包与 `checksums.txt` 放在同一目录，Linux 可运行 `sha256sum -c checksums.txt --ignore-missing`；macOS 使用 `shasum -a 256 <文件名>`，Windows 使用 PowerShell `Get-FileHash <文件名> -Algorithm SHA256`，对照清单中的 SHA-256。`version.json` 提供版本、提交、构建时间和包信息。

更多平台要求与连接步骤见 [安装指南](https://github.com/songloft-org/songloft-player-lynx/blob/main/docs/guides/installation.md)。

## Installation (English)

This client connects to a running [Songloft server](https://github.com/songloft-org/songloft). Enter the server address and sign in after installation. The client does not include a local backend.

Choose the file for your platform under **Assets** on this page:

| Platform | Download | Installation / deployment |
| --- | --- | --- |
| Android | `songloft-lynx-android.apk` | Download and open the APK, then allow installation when prompted. The package uses the maintainer's release signature. |
| iOS | `songloft-lynx-ios-nosign.ipa` | Unsigned device build. Re-sign with your developer certificate and a provisioning profile for your device, then follow your signing tool's installation process. |
| HarmonyOS | `songloft-lynx-harmony.hap` | Signed HAP. Install with DevEco Studio or `hdc install songloft-lynx-harmony.hap`. The signing profile must authorize your device. |
| Web (standalone) | `songloft-lynx-web-standalone.tar.gz` | Extract and deploy to a static server, then open the site and enter the Songloft API address. |
| Web (embedded) | `songloft-lynx-web-embedded.tar.gz` | Extract and configure same-origin static hosting with the same-origin backend. This package does not automatically replace the server's existing embedded frontend. |

Web hosting requires HTTPS (except localhost) and the response headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. See the [Web deployment guide](https://github.com/songloft-org/songloft-player-lynx/blob/main/docs/en/guides/web-deployment.md) for configuration.

**Verify downloads:** Keep your packages and `checksums.txt` in the same directory. On Linux, run `sha256sum -c checksums.txt --ignore-missing`. On macOS, use `shasum -a 256 <filename>`; on Windows, use PowerShell `Get-FileHash <filename> -Algorithm SHA256`. Compare the result with the listed SHA-256. `version.json` contains the version, commit, build time, and package information.

See the [installation guide](https://github.com/songloft-org/songloft-player-lynx/blob/main/docs/en/guides/installation.md) for platform requirements and connection steps.
