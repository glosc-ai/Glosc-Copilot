# Glosc Copilot MCP 服务器

这个目录包含 Glosc Copilot 工作区使用的 MCP (Model Context Protocol) 服务器。

## 文件系统服务器 (filesystem-server)

提供完整的文件系统操作能力，使 AI 能够：

### 功能特性

- **文件读写**: 读取和写入文件内容
- **文件编辑**: 使用查找替换方式编辑文件
- **目录操作**: 创建、列表、删除目录
- **文件搜索**: 使用 glob 模式搜索文件
- **内容搜索**: 在文件内容中搜索文本 (grep)
- **文件移动**: 移动或重命名文件/目录

### 可用工具

1. **read_file** - 读取文件内容
2. **write_file** - 写入或创建文件
3. **edit_file** - 编辑文件特定部分
4. **list_directory** - 列出目录内容
5. **create_directory** - 创建目录
6. **delete_file** - 删除文件或目录
7. **search_files** - 搜索文件（文件名匹配）
8. **grep_files** - 搜索文件内容
9. **move_file** - 移动或重命名文件

### 安装

```bash
cd src/mcp-servers
yarn install
yarn build
```

### 使用

在 Glosc Copilot 的 MCP 配置页面添加服务器：

```json
{
  "name": "文件系统",
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/src/mcp-servers/dist/filesystem-server.js"],
  "env": {
    "WORKSPACE_ROOT": "/path/to/your/workspace"
  }
}
```

或者使用 npx (如果已发布):

```json
{
  "name": "文件系统",
  "type": "stdio",
  "command": "npx",
  "args": ["glosc-filesystem-mcp"],
  "env": {
    "WORKSPACE_ROOT": "/path/to/your/workspace"
  }
}
```

### 安全性

- 所有文件操作都限制在配置的工作区根目录内
- 默认限制文件大小为 10MB
- 搜索结果默认限制为 100 条

### 示例

AI 可以使用以下方式操作文件：

```
用户：请帮我创建一个 README.md 文件，内容包含项目介绍。

AI 会调用：
1. write_file(path="README.md", content="# 项目介绍\n...")

用户：在 src 目录下找所有 TypeScript 文件

AI 会调用：
1. search_files(pattern="src/**/*.ts")

用户：将所有 console.log 改为 logger.log

AI 会调用：
1. grep_files(pattern="console.log", filePattern="**/*.ts")
2. edit_file(path="...", search="console.log", replace="logger.log")
   （对每个匹配的文件）
```
