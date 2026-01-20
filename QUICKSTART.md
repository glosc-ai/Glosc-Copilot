# 快速开始指南：工作区编程助手

## 5 分钟快速设置

### 步骤 1: 构建 MCP 服务器

打开终端，运行：

```bash
cd src/mcp-servers
yarn install
yarn build
```

### 步骤 2: 配置文件系统服务器

1. 启动 Glosc Copilot
2. 进入 **MCP 配置**页面
3. 点击**添加服务器**
4. 填写以下配置：

| 字段 | 值 |
|------|------|
| 名称 | 文件系统 |
| 类型 | stdio |
| 命令 | node |
| 参数 | `<项目绝对路径>/src/mcp-servers/dist/filesystem-server.js` |
| 环境变量 | `WORKSPACE_ROOT`: `<你的工作区路径>` |
| 启用 | ✅ |

**示例配置 (Windows):**
```json
{
  "name": "文件系统",
  "type": "stdio",
  "command": "node",
  "args": ["C:/Projects/Glosc-Copilot/src/mcp-servers/dist/filesystem-server.js"],
  "env": {
    "WORKSPACE_ROOT": "C:/Projects/MyProject"
  }
}
```

**示例配置 (macOS/Linux):**
```json
{
  "name": "文件系统",
  "type": "stdio",
  "command": "node",
  "args": ["/Users/username/Glosc-Copilot/src/mcp-servers/dist/filesystem-server.js"],
  "env": {
    "WORKSPACE_ROOT": "/Users/username/Projects/MyProject"
  }
}
```

### 步骤 3: 配置 Git 服务器（可选）

如果需要 Git 集成，添加另一个服务器：

```json
{
  "name": "Git",
  "type": "stdio",
  "command": "node",
  "args": ["<项目绝对路径>/src/mcp-servers/dist/git-server.js"],
  "env": {
    "WORKSPACE_ROOT": "<你的工作区路径>"
  }
}
```

### 步骤 4: 启动服务器

在 MCP 配置页面：
1. 找到刚添加的服务器
2. 点击**启动**按钮
3. 等待状态变为"运行中"

### 步骤 5: 创建工作区会话

1. 进入**工作区**页面
2. 点击**打开文件夹**，选择你的项目目录
3. 点击**新建会话**
4. 在会话设置中：
   - 勾选"文件系统" MCP 服务器
   - 勾选"Git" MCP 服务器（如果已配置）
   - 选择文件上下文模式（推荐"列表"或"完整"）
5. 保存设置

## 开始使用

### 示例 1: 创建新组件

```
你: 帮我创建一个 Vue 3 组件 UserProfile.vue，包含基本的用户信息展示
```

AI 会：
1. 分析项目结构
2. 创建 `src/components/UserProfile.vue`
3. 生成符合项目风格的代码

### 示例 2: 批量重构

```
你: 把 src 目录下所有的 var 改成 const 或 let
```

AI 会：
1. 搜索所有使用 var 的文件
2. 分析每个使用场景
3. 逐个替换为 const 或 let
4. 报告修改结果

### 示例 3: Git 操作

```
你: 查看当前有哪些修改，然后提交所有更改，提交信息是 "Update components"
```

AI 会：
1. 执行 `git_status` 查看状态
2. 显示修改的文件列表
3. 执行 `git_add ["."]` 暂存所有文件
4. 执行 `git_commit` 提交更改

### 示例 4: 代码搜索

```
你: 在项目中找出所有使用了 localStorage 的地方
```

AI 会：
1. 使用 `grep_files` 搜索 "localStorage"
2. 列出所有匹配的文件和行号
3. 提供相关上下文

## 常见问题

### Q: 服务器无法启动？

**A:** 检查以下几点：
1. Node.js 版本是否 >= 18
2. 是否执行了 `yarn build`
3. 路径是否使用绝对路径
4. 工作区目录是否存在且有权限

### Q: AI 说找不到工具？

**A:** 确认：
1. MCP 服务器已启动
2. 在会话设置中已勾选对应的服务器
3. 尝试重新创建会话

### Q: 文件操作失败？

**A:** 可能原因：
1. 路径超出工作区范围
2. 文件权限问题
3. 文件被其他程序占用
4. 文件大小超过 10MB 限制

### Q: Git 命令失败？

**A:** 检查：
1. 工作区是否是 Git 仓库
2. Git 是否已安装并在 PATH 中
3. 是否有未完成的 merge/rebase

## 进阶技巧

### 技巧 1: 使用项目上下文

启用"完整"文件上下文模式，AI 可以更好地理解项目结构：

```
你: 根据现有的代码风格，创建一个新的 API 服务模块
```

### 技巧 2: 分步执行复杂任务

对于大型重构，分步提问：

```
1. "先分析一下项目的目录结构"
2. "好的，现在重构 utils 目录，使用 TypeScript"
3. "更新所有导入这些工具的文件"
```

### 技巧 3: 验证修改

让 AI 展示修改内容：

```
你: 显示刚才修改的 App.vue 的内容
```

### 技巧 4: 使用 Git 版本控制

重要修改前提交：

```
你: 先帮我查看 Git 状态，提交当前所有更改
```

## 限制和注意事项

### 安全限制

- ✅ 所有操作限制在工作区目录内
- ✅ 不能访问系统敏感目录
- ✅ 文件大小限制 10MB
- ✅ 搜索结果限制 100 条

### 功能限制

当前版本不支持：
- ❌ Git push/pull（需手动执行）
- ❌ Git merge/rebase
- ❌ 二进制文件编辑
- ❌ 实时文件监控

### 最佳实践

1. **使用版本控制**: 重要修改前先提交
2. **明确描述**: 清楚地说明要做什么
3. **验证结果**: 修改后检查代码
4. **备份重要文件**: AI 可能出错
5. **逐步操作**: 复杂任务分步执行

## 获取帮助

- 📖 完整文档: [WORKSPACE_FEATURES.md](./WORKSPACE_FEATURES.md)
- 🐛 报告问题: [GitHub Issues](https://github.com/glosc-ai/Glosc-Copilot/issues)
- 💬 讨论交流: [GitHub Discussions](https://github.com/glosc-ai/Glosc-Copilot/discussions)

## 下一步

探索更多功能：
- 尝试多文件重构
- 使用 AI 生成测试
- 让 AI 帮你写文档
- 探索代码优化建议

祝你使用愉快！ 🎉
