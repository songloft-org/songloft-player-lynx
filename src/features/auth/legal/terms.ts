const termsZh = `# 用户协议与隐私政策

> 最后更新：2026-11-17

欢迎使用 Songloft。请在使用本软件前仔细阅读以下协议。使用本软件即表示你已阅读、理解并同意受本协议约束。

## 1. 服务说明

Songloft 是一款开源的自托管本地音乐服务器软件，基于 Apache-2.0 许可证发布。本软件允许用户在自有设备上部署音乐管理与播放服务。

- **自托管模式**：用户自行部署服务端，数据完全存储在用户自己的设备上。
- **本地模式（Bundle）**：Go 后端嵌入客户端运行，所有数据保存在本机。

## 2. 用户行为规范

使用本软件时，你同意：

- **合法使用**：仅用于管理和播放你合法拥有或获得授权的音乐内容。
- **尊重版权**：不得利用本软件下载、分发或传播未经授权的受版权保护内容。
- **自行负责**：对通过本软件存储、管理的所有内容承担法律责任。
- **不得滥用**：不得利用本软件进行任何违反当地法律法规的活动。

## 3. 隐私政策

### 3.1 数据收集

Songloft **不收集任何用户个人数据**。所有数据保存在你自己的部署环境内。

### 3.2 遥测与监控

预编译版本集成了 Tracely 监控 SDK，上报内容仅包括：

- 崩溃时的 panic 堆栈信息
- 首次安装事件、版本升级事件
- 定时活跃心跳

**不含**用户数据、音乐文件、账号信息或任何个人身份信息。自行编译的版本不启用任何遥测。

### 3.3 主动出站请求

| 场景 | 目标 | 内容 |
|------|------|------|
| 崩溃上报（预编译版） | 维护者 Tracely 服务 | 错误堆栈、版本号、平台信息 |
| 检查更新 | GitHub | HTTP GET version.json，不带用户标识 |
| JS 插件网络请求 | 由插件决定 | 由插件实现决定 |

### 3.4 数据存储

| 数据 | 位置 | 说明 |
|------|------|------|
| 账号/密码 | 本地 SQLite 数据库 | bcrypt 哈希，不存明文 |
| JWT Token | 客户端本地存储 | 服务端仅保存 refresh token 哈希 |
| 音乐/封面/歌词 | 本地数据库 + 缓存目录 | 仅本地，不上传 |
| 播放记录/收藏 | 本地 SQLite 数据库 | 仅本地 |

### 3.5 第三方插件

JS 插件可能通过宿主网络请求能力访问外部服务。第三方插件的数据收集行为由插件本身决定，与 Songloft 主项目无关。安装第三方插件前，请确认其网络请求范围。

## 4. 知识产权

- Songloft 软件本身基于 Apache-2.0 许可证开源。
- 你通过本软件管理的音乐内容的版权归原始版权持有者所有。
- 本软件不对用户存储内容的合法性作任何保证。

## 5. 免责声明

- 本软件按"现状"提供，不附带任何明示或暗示的保证。
- 开发者不对因使用本软件而导致的任何直接或间接损失负责。
- 若你将本软件部署给他人使用，你即成为数据处理者，需自行承担相关法律责任（包括但不限于《个人信息保护法》《GDPR》等法规的合规义务）。

## 6. 协议变更

本协议可能随软件更新而修订。重大变更将在版本更新日志中说明。继续使用本软件即视为接受修订后的协议。

## 7. 联系方式

如对本协议有疑问，请通过 [GitHub Issues](https://github.com/songloft-org/songloft/issues) 反馈。
`

const termsEn = `# Terms of Service & Privacy Policy

> Last updated: 2026-11-17

Welcome to Songloft. Please read the following agreement carefully before using this software. By using this software, you acknowledge that you have read, understood, and agreed to be bound by this agreement.

## 1. Service Description

Songloft is an open-source, self-hosted local music server software released under the Apache-2.0 license. It allows users to deploy a music management and playback service on their own devices.

- **Self-hosted mode**: Users deploy the server themselves; all data is stored entirely on the user's own devices.
- **Local mode (Bundle)**: The Go backend runs embedded within the client; all data is stored locally.

## 2. User Conduct

By using this software, you agree to:

- **Lawful use**: Only use it to manage and play music content that you legally own or have authorization to use.
- **Respect copyrights**: Do not use this software to download, distribute, or disseminate unauthorized copyrighted content.
- **Personal responsibility**: You bear legal responsibility for all content stored and managed through this software.
- **No misuse**: Do not use this software for any activity that violates applicable laws and regulations.

## 3. Privacy Policy

### 3.1 Data Collection

Songloft **does not collect any personal user data**. All data is stored within your own deployment environment.

### 3.2 Telemetry & Monitoring

Pre-compiled releases include the Tracely monitoring SDK. Reported data includes only:

- Panic stack traces on crashes
- First installation events and version upgrade events
- Periodic activity heartbeats

This **does not include** user data, music files, account information, or any personally identifiable information. Self-compiled builds do not enable any telemetry.

### 3.3 Outbound Requests

| Scenario | Target | Content |
|----------|--------|---------|
| Crash reports (pre-compiled) | Maintainer's Tracely service | Error stack, version, platform info |
| Update checks | GitHub | HTTP GET version.json, no user identifiers |
| JS plugin network requests | Determined by plugin | Determined by plugin implementation |

### 3.4 Data Storage

| Data | Location | Notes |
|------|----------|-------|
| Account/Password | Local SQLite database | bcrypt hashed, no plaintext |
| JWT Token | Client local storage | Server only stores refresh token hash |
| Music/Covers/Lyrics | Local database + cache directory | Local only, never uploaded |
| Play history/Favorites | Local SQLite database | Local only |

### 3.5 Third-Party Plugins

JS plugins may access external services through host network capabilities. Data collection by third-party plugins is determined by the plugins themselves and is unrelated to the Songloft project. Please verify the network scope of any third-party plugin before installation.

## 4. Intellectual Property

- The Songloft software itself is open-sourced under the Apache-2.0 license.
- Copyright of music content managed through this software belongs to the original copyright holders.
- This software makes no guarantees regarding the legality of user-stored content.

## 5. Disclaimer

- This software is provided "as is" without any express or implied warranties.
- The developers are not liable for any direct or indirect damages arising from the use of this software.
- If you deploy this software for others to use, you become the data controller and must assume relevant legal responsibilities (including but not limited to compliance obligations under PIPL, GDPR, and other applicable regulations).

## 6. Changes to This Agreement

This agreement may be revised with software updates. Significant changes will be noted in the version changelog. Continued use of this software constitutes acceptance of the revised agreement.

## 7. Contact

If you have questions about this agreement, please provide feedback via [GitHub Issues](https://github.com/songloft-org/songloft/issues).
`

// Match Flutter: Chinese locales use Chinese; other locales fall back to English.
export function getTermsContent(language: string): string {
  return language.toLowerCase().split(/[-_]/)[0] === 'zh' ? termsZh : termsEn
}
