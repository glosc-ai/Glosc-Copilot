# Glosc Copilot MCP 服务器

这个目录包含 Glosc Copilot 工作区使用的 MCP (Model Context Protocol) 服务器。

## 可用服务器

### 1. 文件系统服务器 (filesystem-server)

提供完整的文件系统操作能力，使 AI 能够：

#### 功能特性

- **文件读写**: 读取和写入文件内容
- **文件编辑**: 使用查找替换方式编辑文件
- **目录操作**: 创建、列表、删除目录
- **文件搜索**: 使用 glob 模式搜索文件
- **内容搜索**: 在文件内容中搜索文本 (grep)
- **文件移动**: 移动或重命名文件/目录

#### 可用工具

1. **read_file** - 读取文件内容
2. **write_file** - 写入或创建文件
3. **edit_file** - 编辑文件特定部分
4. **list_directory** - 列出目录内容
5. **create_directory** - 创建目录
6. **delete_file** - 删除文件或目录
7. **search_files** - 搜索文件（文件名匹配）
8. **grep_files** - 搜索文件内容
9. **move_file** - 移动或重命名文件

### 2. Git 服务器 (git-server)

提供 Git 版本控制操作，使 AI 能够：

#### 功能特性

- **仓库状态**: 查看工作区和暂存区状态
- **差异查看**: 查看文件变更
- **提交历史**: 浏览提交记录
- **分支管理**: 创建、切换、删除分支
- **暂存文件**: 添加文件到暂存区
- **提交变更**: 创建提交
- **远程仓库**: 查看远程仓库信息

#### 可用工具

1. **git_status** - 查看仓库状态
2. **git_diff** - 查看文件差异
3. **git_log** - 查看提交历史
4. **git_branch** - 管理分支
5. **git_add** - 添加到暂存区
6. **git_commit** - 提交更改
7. **git_show** - 显示提交详情
8. **git_remote** - 管理远程仓库

## 安装

```bash
cd src/mcp-servers
yarn install
yarn build
```

## 使用

### 配置文件系统服务器

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

### 配置 Git 服务器

```json
{
  "name": "Git",
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/src/mcp-servers/dist/git-server.js"],
  "env": {
    "WORKSPACE_ROOT": "/path/to/your/workspace"
  }
}
```

## 安全性

### 文件系统服务器

- 所有文件操作都限制在配置的工作区根目录内
- 默认限制文件大小为 10MB
- 搜索结果默认限制为 100 条

### Git 服务器

- 只能操作配置的工作区 Git 仓库
- 不执行危险操作（如 force push、rebase）
- 所有命令都在本地执行

## 使用示例

### 文件系统操作

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

### Git 操作

```
用户：查看当前的修改状态

AI 会调用：
1. git_status()

用户：查看 src/App.vue 的修改内容

AI 会调用：
1. git_diff(file="src/App.vue")

用户：提交所有更改，提交信息是 "Add new feature"

AI 会调用：
1. git_add(files=["."])
2. git_commit(message="Add new feature")

用户：切换到 develop 分支

AI 会调用：
1. git_branch(action="checkout", name="develop")

用户：查看最近 5 次提交

AI 会调用：
1. git_log(count=5)
```

## 开发

### 添加新工具

1. 在相应的服务器文件中添加工具定义
2. 实现工具处理逻辑
3. 更新文档
4. 重新构建: `yarn build`

### 测试

可以使用 MCP Inspector 测试服务器：

```bash
npx @modelcontextprotocol/inspector node dist/filesystem-server.js
```

## 故障排除

### 服务器无法启动

1. 确认 Node.js 版本 >= 18
2. 检查构建是否成功: `yarn build`
3. 验证路径配置正确
4. 查看工作区目录权限

### Git 命令失败

1. 确认工作区是 Git 仓库
2. 检查 Git 是否已安装
3. 验证 Git 配置正确
4. 确保没有正在进行的 merge/rebase

## 许可

MIT

