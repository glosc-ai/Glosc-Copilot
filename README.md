# Glosc Copilot

<div align="center">

[![License](https://img.shields.io/github/license/glosc-ai/Glosc-Copilot
)](LICENSE) [![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](https://github.com/glosc-ai/Glosc-Copilot) ![GitHub version](https://img.shields.io/github/package-json/v/Glosc-ai/Glosc-Copilot) ![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/glosc-ai/glosc-copilot) [![GitHub Repo stars](https://img.shields.io/github/stars/Glosc-ai/Glosc-Copilot)](https://github.com/glosc-ai/Glosc-Copilot)






</div>

### 简介

Glosc Copilot 是一款跨平台的 AI 智能助手，目前有聊天模式、会议模式、工作区模式，支持通过用户自定义 AI 服务商接入模型，适配 MCP 工具、Agent Skills / ClawHub 兼容技能包，以及 Glosc Store 的高级功能。

### AI 接入方式

- AI 调用采用离线优先设计：应用会直接连接你在本地配置的 AI 服务商，不再依赖 Glosc 在线 AI 中转服务。
- 登录只用于账号与 Glosc Store；聊天、会议、工作区模式不再要求登录后才能使用。
- 当前支持 OpenAI 兼容接口，可用于接入 OpenAI 官方、各类兼容云服务，以及本地 Ollama、LM Studio 等服务。
- 自定义服务商配置与 API Key 会加密存储在本地，模型列表通过服务商自己的 `GET {baseUrl}/models` 接口拉取。

### 软件界面

| 暗色                                                                        | 亮色                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| <img src="docs\images\dark\Home.png" alt="首页" height="200"/>              | <img src="docs\images\light\Home.png" alt="首页" height="200"/>              |
| <img src="docs\images\dark\MCP_Tools.png" alt="MCP工具使用" height="200"/>  | <img src="docs\images\light\MCP_Tools.png" alt="MCP工具使用" height="200"/>  |
| <img src="docs\images\dark\Add_Tools.png" alt="添加工具" height="200"/>     | <img src="docs\images\light\Add_Tools.png" alt="添加工具" height="200"/>     |
| <img src="docs\images\dark\Meeting_Model.png" alt="会议模式" height="200"/> | <img src="docs\images\light\Meeting_Model.png" alt="会议模式" height="200"/> |
| <img src="docs\images\dark\Meeting_Room.png" alt="会议室" height="200"/>    | <img src="docs\images\light\Meeting_Room.png" alt="会议室" height="200"/>    |
| <img src="docs\images\dark\Work_Area.png" alt="工作区" height="200"/>       | <img src="docs\images\light\Work_Area.png" alt="工作区" height="200"/>       |


### 开始使用

从 [Releases 页面](https://github.com/glosc-ai/Glosc-Copilot/releases)下载最新版本的安装包，支持 Windows、macOS 和 Linux。

运行安装包，然后安装完成后，打开应用程序即可开始使用。


### 功能特色
- 多种 AI 模型支持：通过自定义 OpenAI 兼容服务商接入云端或本地模型。
- 聊天模式：与 AI 进行自然语言对话，支持上下文记忆和多轮交流。
- 会议模式：模拟多人会议场景，AI 角色根据设定的人设进行发言和互动。
- 工作区模式：创建专属工作区，集中管理任务和项目。
- MCP 工具集成：支持多种工具调用，增强 AI 的功能和实用性。
- Skills 兼容导入：支持导入 Agent Skills 标准目录 / `SKILL.md` / zip，以及 ClawHub/OpenClaw 页面 URL，并自动提取可用的 Skill 指令与 bundled MCP 配置。
- 本地服务商预设：内置 Ollama、LM Studio、OpenAI 官方等快捷配置入口。
- 跨平台支持：适用于 Windows、macOS 和 Linux 操作系统。

### Skills / ClawHub 兼容说明

- 可通过顶部菜单“选项 → Skills”导入本地目录、本地压缩包、`SKILL.md` 文件，或 ClawHub / OpenClaw 页面 URL。
- 导入后的 Skill 可全局启用/停用，启用后会自动拼接到聊天与工作区会话的系统提示词中。
- 若包内包含可识别的 MCP 配置（如 `mcpServers` / `servers` / 兼容 JSON/YAML 文件），会同步导入到工具管理。
- 当前兼容层以 **Skill 指令复用 + bundled MCP 发现** 为主；**不等同于完整支持 OpenClaw gateway plugin 生命周期**。
