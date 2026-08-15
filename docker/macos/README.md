# macOS Docker 编译环境

在非 Mac 机器上（Linux）通过 Docker 运行 macOS 虚拟机，用于编译 Lynx iOS 包。

基于 [dockur/macos](https://github.com/dockur/macos)，使用 KVM 硬件加速运行完整 macOS 系统。

## 前提条件

- Linux 宿主机，CPU 支持虚拟化（Intel VT-x / AMD-V）
- KVM 已启用：`ls /dev/kvm` 存在
- Docker + Docker Compose 已安装
- 足够的磁盘空间（macOS + Xcode 约需 60GB+）

## 启动

```bash
cd songloft-player-lynx/docker/macos
docker compose up -d
```

## 访问

- **Web 控制台（noVNC）**: http://localhost:8006
- **VNC 客户端**: vnc://localhost:5900

## 首次配置

macOS 安装完成后，需要手动完成以下步骤：

1. **安装 Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```

2. **安装 Xcode**（从 App Store 或手动下载）
   - 需要 Apple ID 登录
   - 安装完成后接受 License：`sudo xcodebuild -license accept`

3. **安装 CocoaPods**
   ```bash
   sudo gem install cocoapods
   ```

4. **安装 Node.js + pnpm**
   ```bash
   # 推荐使用 fnm
   curl -fsSL https://fnm.vercel.app/install | bash
   fnm install 22
   npm install -g pnpm
   ```

5. **将项目源码传入虚拟机**（通过 scp、共享文件夹或 git clone）

## 编译 iOS 包

```bash
cd songloft-player-lynx

# 安装依赖
pnpm install

# 安装 Pods
pnpm run ios:pods

# 构建 iOS bundle + 编译
pnpm run ios:build
```

## 配置说明

| 参数 | 值 | 说明 |
|------|------|------|
| VERSION | `"15"` | macOS Sequoia；可改 `"14"`(Sonoma) 或 `"13"`(Ventura，性能最佳) |
| RAM_SIZE | `"16G"` | Xcode 编译需要充足内存 |
| CPU_CORES | `"8"` | 加速编译，按宿主机核数调整 |
| DISK_SIZE | `"256G"` | Xcode + iOS SDK + 项目源码 + 编译缓存 |

## 停止 / 重启

```bash
# 停止（保留数据）
docker compose stop

# 重新启动
docker compose start

# 销毁（删除所有数据）
docker compose down -v
```

## 注意事项

- 首次启动会自动下载 macOS 恢复镜像并安装，耗时较长（约 20-40 分钟）
- 虚拟机数据持久化在 `macos-storage` Docker volume 中，stop/start 不会丢失
- 编译性能取决于宿主机 CPU 性能和分配的核心数
- 如遇性能问题，建议将 VERSION 改为 `"13"`（Ventura），资源占用更低
