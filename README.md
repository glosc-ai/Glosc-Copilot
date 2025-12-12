# Gloss Copilot

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/GlossMod/GlossCopilot)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/GlossMod/GlossCopilot/releases)

</div>

## 📖 简介

Gloss Copilot 是一款跨平台的 AI 智能助手，灵感来源于钢铁侠中的贾维斯（J.A.R.V.I.S.），旨在通过自然语言交互帮助用户直接操作系统级任务，显著提高工作效率。支持 Windows、macOS 和 Linux 系统，集成了先进的语音识别、情感分析和虚拟形象技术。

## ✨ 核心特性

### 🎯 系统操作
- **应用管理**：智能打开、关闭和切换应用程序
- **文件管理**：创建、移动、复制、删除文件和文件夹
- **命令执行**：执行系统级命令和脚本
- **自动化任务**：批处理操作和任务调度

### 🗣️ 智能交互
- **语音对话**：自然流畅的语音识别和语音合成
- **情感识别**：实时分析用户情绪并做出相应反应
- **表情识别**：通过摄像头识别用户面部表情
- **上下文理解**：智能记忆对话历史，提供连贯的交互体验

### 🎨 虚拟形象
- **Live2D 集成**：可自定义的虚拟助手形象
- **动态表情**：根据对话内容和情感展示不同表情
- **个性化定制**：支持更换角色模型和皮肤

### 🔔 生活助手
- **提醒闹钟**：设置单次或重复提醒
- **天气预报**：实时天气查询和预警
- **新闻资讯**：定制化新闻推送
- **日程管理**：智能日历和待办事项

### 🛠️ 高级功能
- **自定义唤醒词**：个性化语音激活命令
- **自定义语音模型**：支持多种语音音色
- **插件系统**：可扩展的功能模块
- **多语言支持**：中文、英文等多语言界面


## 🔌 插件开发

Gloss Copilot 支持第三方插件扩展功能。

## 🧩 MCP（Stdio）里的 Python / uvx

当前 Stdio MCP 服务器由前端通过 `TauriStdioTransport` 启动；已支持以下命令策略：

- `node` / `npx`：优先使用内置 node sidecar（已内置）。
- `python` / `python3` / `py`：优先尝试 `binaries/python` sidecar；找不到则回退系统 Python。并会自动注入 `-u`（避免 stdio 缓冲导致 MCP 卡住）。
- `uv`：优先尝试 `binaries/uv` sidecar；找不到则回退系统 `uv`。
- `uvx`：优先尝试用 `binaries/uv x ...`；找不到则回退系统 `uvx`。

### 例子

- 直接用系统 Python：
	- `command`: `python`
	- `args`: `-m your_mcp_server`

- 用 uvx 运行（推荐，便于隔离依赖）：
	- `command`: `uvx`
	- `args`: `your-mcp-package --stdio`

### 如何“内置” uv / python（可选）

如果你希望在没有系统 Python/uv 的机器上也能跑：

- 把可执行文件放入 `src-tauri/binaries/`（例如 `uv-<target>.exe`、`python-<target>.exe`）。
- 然后在 `src-tauri/tauri.conf.json` 的 `bundle.externalBin` 增加对应条目（例如 `binaries/uv`、`binaries/python`）。

注意：一旦写进 `externalBin`，构建时就要求该二进制真实存在；因此建议你在准备好二进制之后再改配置。


