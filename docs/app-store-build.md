# macOS App Store 打包说明

本文档说明当前项目如何生成可上传到 App Store Connect 的 macOS 安装产物。

## 当前已完成的项目配置

- App Store 专用配置文件为 src-tauri/tauri.appstore.conf.json。
- App Store 构建会自动关闭内置 updater，避免和商店更新机制冲突。
- App Sandbox entitlement 已启用，并补充了网络访问、用户选中文件读写、书签持久化能力。
- App Store 打包会自动嵌入 src-tauri/Glosc_Copilot.provisionprofile。

## 提交前准备

1. 在 Apple Developer 中创建与 com.gloscai.copilot 完全一致的 App ID。
2. 为该 App ID 创建 Mac App Store Connect 类型的 provisioning profile。
3. 将 profile 文件保存为 src-tauri/Glosc_Copilot.provisionprofile。
4. 准备 Apple Distribution 证书，用于 .app 签名。
5. 准备 Mac Installer Distribution 证书，用于 .pkg 签名。

## 构建 .app

默认生成 Universal 包：

```sh
export APPLE_SIGNING_IDENTITY="Apple Distribution: Your Company"
yarn tauri:build:appstore
```

如果只在 Apple Silicon 机器上构建单架构包，可先设置目标架构：

```sh
TAURI_APPLE_TARGET=aarch64-apple-darwin yarn tauri:build:appstore
```

常用签名环境变量：

```sh
export APPLE_SIGNING_IDENTITY="Apple Distribution: Your Company"
```

如果未提供 APPLE_SIGNING_IDENTITY，也可以改为使用 CI 证书变量：

```sh
export APPLE_CERTIFICATE="..."
export APPLE_CERTIFICATE_PASSWORD="..."
```

脚本会在构建前强制检查 APPLE_SIGNING_IDENTITY 或 APPLE_CERTIFICATE，避免误生成 ad-hoc 签名的 .app。

## 生成上传用 .pkg

```sh
export APPLE_INSTALLER_SIGNING_IDENTITY="3rd Party Mac Developer Installer: Your Company"
yarn appstore:pkg
```

生成后的 PKG 默认位于：

- src-tauri/target/universal-apple-darwin/release/bundle/app-store/
- 或者 src-tauri/target/aarch64-apple-darwin/release/bundle/app-store/

## 上传到 App Store Connect

准备好 App Store Connect API Key 后，可使用：

```sh
xcrun altool --upload-app --type macos --file "src-tauri/target/universal-apple-darwin/release/bundle/app-store/Glosc Copilot.pkg" --apiKey "$APPLE_API_KEY_ID" --apiIssuer "$APPLE_API_ISSUER"
```

私钥文件需按 Apple 要求保存为：

- private_keys/AuthKey_<APPLE_API_KEY_ID>.p8
- 或 ~/.private_keys/AuthKey_<APPLE_API_KEY_ID>.p8
- 或 ~/.appstoreconnect/private_keys/AuthKey_<APPLE_API_KEY_ID>.p8

## 重要注意事项

- App Store 版本已经禁用自更新；后续发布应完全通过 App Store Connect 分发。
- 当前应用仍然包含 shell 执行、sidecar 进程、工作区全盘读写等高级能力。它们能否通过苹果审核，不取决于 Tauri 配置本身，而取决于你最终提交的功能形态是否满足沙盒和审核规则。
- 提交前必须实际在沙盒环境中完整回归一次工作区、MCP、插件安装、文件选择和网络访问流程。