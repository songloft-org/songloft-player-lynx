# 客户端更新协议

[English](../en/reference/client-updates.md) · [发版指南](../guides/releasing.md)

**当前交付为 P2a 发布契约和兼容模型。原生下载器、加载/回退和更新界面属于 P2b/P2c，尚不能从客户端执行热更新。** 桌面和 Bundle 本地后端不在本轮范围。

## 身份与发布资产

版本源仍为 `package.json` 与共享 `.build/version.json`。`prepare-build.mjs` 另生成 `.build/native-host.json`，含安装壳身份、协议、桥接/本地 schema、三端引擎版本、必需能力与受信公钥；随同一次构建分发。原生壳资源接入在 P2b 完成，热更新包不得覆盖该文件。

`updates/native-contract.json` 是兼容契约的源文件：Android 引擎 `4.0.0`，iOS/HarmonyOS `4.0.1`；当前桥接版本 `1`、本地 schema `1`、最低壳版本 `0.1.0`。`audio.sourceLoad.v1` 和 `updater.v1` 表示完整安装壳必须提供的能力。新增原生能力、SDK 变化或不兼容本地数据读写时，先调整契约并升级安装包。

完整安装/部署包仍为五种原有资产。配置有效签名密钥后，另提供：

| 文件 | 含义 |
|---|---|
| `songloft-lynx-main.lynx.bundle` | 三端共用的原生模板，最大 32 MiB |
| `version.json` | 同一版本身份、六种资产的大小/SHA-256，以及 `bundle_update` 兼容声明，最大 128 KiB |
| `version.json.sig` | 对原始 `version.json` 字节的独立签名，JSON 信封 |
| `checksums.txt` | 五种完整包、bundle、清单和签名文件的 SHA-256 |

未配置私钥时仅生成完整包，`bundle_update` 为 `null`，清理同目录残留的 bundle/签名，不发布未签名更新。私钥已配置但公钥缺失、不匹配或与 prepare 阶段的壳公钥不同，发布失败。不得临时从更新清单采纳新受信公钥。

## 签名与编码

签名算法为 **RSA PKCS#1 v1.5 + SHA-256**，密钥为 2048/3072/4096 位。公钥以 SPKI PEM 配置，构建时生成 Java/ArkTS 使用的 SPKI DER 和 iOS SecKey 使用的 PKCS#1 DER（两者均 Base64），保留 `key_bits`。`key_id` 为 SPKI DER 的 SHA-256 前 16 个十六进制字符，无需另配。原生实现需对原始 UTF-8 字节验签，不能 parse 后重新序列化再验。

信封字段为 `{protocol: 1, key_id, algorithm: "rsa-pkcs1v15-sha256", signature}`，其中 `signature` 是标准 Base64。未知协议/算法/keyId、篡改原始字节或无效签名均拒绝热更新。`checksums.txt` 用于下载校验，不能替代签名。

`updates/fixtures/signature-v1.json` 是三端共用的公开正反验证向量，包含原始清单、签名、公钥和带中文的测试 payload；生成它的临时私钥已丢弃，不能用于真实发布。Node/Java 验证通过；iOS/HarmonyOS 尚需 P2b 的宿主编译及实际向量验证。

算法映射依据：[Java Signature](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/security/Signature.html)、[Apple SecKeyAlgorithm](https://developer.apple.com/documentation/security/seckeyalgorithm/rsasignaturemessagepkcs1v15sha256)、[HarmonyOS RSA PKCS1 验签](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V13/crypto-rsa-sign-sig-verify-pkcs1-by-segment-V13)。

## 兼容与资源约束

`bundle_update` 包含协议、`bundle_id`、资产名/大小/hash、本地 schema 和 `targets`。bundle 身份为 `<channel>-<build_number>-<git_commit>`。每个 target 包含平台、准确引擎版本、最低壳版本、桥接版本的上下界和必需能力；不兼容时提供本通道完整包。

TS 的 `bundleCompatibility()` 仅用于界面展示，**不能授权加载**。原生 prepare 必须重新验签、校验兼容和下载 hash，保持壳通道、身份与信任列表独立于 JS bundle。P2c 只允许 dev 查询 `/releases/tags/dev`，正式版查询 `/releases/latest`；preview 不混入这两个通道。

当前原生构建目录只有 `main.lynx.bundle`，Web 产物在独立 `web/` 子目录；图标使用内联 SVG，没有原生外部构建资源。发布时发现其他原生拆包/资源文件即拒绝热更新包，必须先把它们加入受签名保护的资源协议。业务服务器图片/插件数据不是客户端构建资产。首版不下载/解压资源归档；资产名不允许路径分隔符，固定 bundle 文件名。

## 当前验证与开放项

协议回归覆盖五包齐全、签名/key 匹配、原始字节篡改、大小限制、外部文件遗漏、调试包拒绝、旧发布无签名降级、不可变壳信息一致性及平台/引擎/桥接/schema/能力不匹配。正式发布密钥尚未配置，未执行任何 push 或发布。

P2b 将安装壳资源、三端模块、下载进度/取消、冷启动 pending 试运行/确认/回退接入同一协议；P2c 补本通道检查、安装包链接与 Web 部署更新入口。在这些调用链完成前，本文件描述协议准备状态。
