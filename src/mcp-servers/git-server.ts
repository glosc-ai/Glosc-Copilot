/**
 * MCP Git 操作服务器
 * 提供 Git 版本控制相关工具
 * 类似 Claude Code 的 Git 集成能力
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

interface GitConfig {
  workspaceRoot?: string;
}

class GitServer {
  private server: Server;
  private config: GitConfig;

  constructor(config: GitConfig = {}) {
    this.config = {
      workspaceRoot: config.workspaceRoot || process.cwd(),
    };

    this.server = new Server(
      {
        name: 'git-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.handleToolCall(request.params.name, request.params.arguments);
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'git_status',
        description: '查看 Git 仓库状态。显示修改的文件、暂存区状态等。',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'git_diff',
        description: '查看文件变更差异。可以查看特定文件或所有变更。',
        inputSchema: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: '要查看差异的文件路径（可选，不指定则显示所有差异）',
            },
            staged: {
              type: 'boolean',
              description: '是否查看暂存区的差异',
              default: false,
            },
          },
        },
      },
      {
        name: 'git_log',
        description: '查看提交历史。显示最近的提交记录。',
        inputSchema: {
          type: 'object',
          properties: {
            count: {
              type: 'number',
              description: '显示的提交数量',
              default: 10,
            },
            oneline: {
              type: 'boolean',
              description: '是否使用简洁的单行格式',
              default: true,
            },
          },
        },
      },
      {
        name: 'git_branch',
        description: '查看或管理分支。列出所有分支或切换分支。',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'current', 'create', 'checkout', 'delete'],
              description: '要执行的操作',
              default: 'list',
            },
            name: {
              type: 'string',
              description: '分支名称（用于 create、checkout、delete 操作）',
            },
          },
        },
      },
      {
        name: 'git_add',
        description: '将文件添加到暂存区。',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: '要添加的文件路径列表，使用 ["."] 添加所有文件',
            },
          },
          required: ['files'],
        },
      },
      {
        name: 'git_commit',
        description: '提交暂存区的更改。',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: '提交信息',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'git_show',
        description: '显示提交的详细信息和变更内容。',
        inputSchema: {
          type: 'object',
          properties: {
            commit: {
              type: 'string',
              description: '提交哈希或引用（如 HEAD, HEAD~1）',
              default: 'HEAD',
            },
          },
        },
      },
      {
        name: 'git_remote',
        description: '查看或管理远程仓库。',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'get-url'],
              description: '要执行的操作',
              default: 'list',
            },
            name: {
              type: 'string',
              description: '远程仓库名称（用于 get-url）',
              default: 'origin',
            },
          },
        },
      },
    ];
  }

  private async execGit(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.config.workspaceRoot,
        encoding: 'utf-8',
      });
      return stdout || stderr || '';
    } catch (error: any) {
      if (error.stdout) return error.stdout;
      throw new Error(error.stderr || error.message);
    }
  }

  private async handleToolCall(name: string, args: any): Promise<any> {
    try {
      switch (name) {
        case 'git_status':
          return await this.gitStatus();
        case 'git_diff':
          return await this.gitDiff(args.file, args.staged || false);
        case 'git_log':
          return await this.gitLog(args.count || 10, args.oneline !== false);
        case 'git_branch':
          return await this.gitBranch(args.action || 'list', args.name);
        case 'git_add':
          return await this.gitAdd(args.files);
        case 'git_commit':
          return await this.gitCommit(args.message);
        case 'git_show':
          return await this.gitShow(args.commit || 'HEAD');
        case 'git_remote':
          return await this.gitRemote(args.action || 'list', args.name || 'origin');
        default:
          throw new Error(`未知的工具: ${name}`);
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `错误: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async gitStatus(): Promise<any> {
    const output = await this.execGit('git status --porcelain');
    const detailedOutput = await this.execGit('git status');
    
    return {
      content: [
        {
          type: 'text',
          text: `Git 状态:\n\n${detailedOutput}\n\n简洁格式:\n${output || '没有变更'}`,
        },
      ],
    };
  }

  private async gitDiff(file?: string, staged: boolean = false): Promise<any> {
    let command = 'git diff';
    if (staged) command += ' --staged';
    if (file) command += ` -- ${file}`;

    const output = await this.execGit(command);

    return {
      content: [
        {
          type: 'text',
          text: output || '没有差异',
        },
      ],
    };
  }

  private async gitLog(count: number, oneline: boolean): Promise<any> {
    let command = `git log -${count}`;
    if (oneline) {
      command += ' --oneline --decorate';
    } else {
      command += ' --pretty=format:"%H%n作者: %an <%ae>%n日期: %ad%n%n%s%n%b%n"';
    }

    const output = await this.execGit(command);

    return {
      content: [
        {
          type: 'text',
          text: output || '没有提交历史',
        },
      ],
    };
  }

  private async gitBranch(action: string, name?: string): Promise<any> {
    let output: string;

    switch (action) {
      case 'list':
        output = await this.execGit('git branch -a');
        break;
      case 'current':
        output = await this.execGit('git branch --show-current');
        break;
      case 'create':
        if (!name) throw new Error('分支名称是必需的');
        output = await this.execGit(`git branch ${name}`);
        output = `已创建分支: ${name}`;
        break;
      case 'checkout':
        if (!name) throw new Error('分支名称是必需的');
        output = await this.execGit(`git checkout ${name}`);
        break;
      case 'delete':
        if (!name) throw new Error('分支名称是必需的');
        output = await this.execGit(`git branch -d ${name}`);
        break;
      default:
        throw new Error(`未知的分支操作: ${action}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  private async gitAdd(files: string[]): Promise<any> {
    const fileList = files.join(' ');
    const output = await this.execGit(`git add ${fileList}`);

    return {
      content: [
        {
          type: 'text',
          text: `已添加到暂存区: ${files.join(', ')}\n${output}`,
        },
      ],
    };
  }

  private async gitCommit(message: string): Promise<any> {
    // 转义双引号
    const escapedMessage = message.replace(/"/g, '\\"');
    const output = await this.execGit(`git commit -m "${escapedMessage}"`);

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  private async gitShow(commit: string): Promise<any> {
    const output = await this.execGit(`git show ${commit}`);

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  }

  private async gitRemote(action: string, name: string): Promise<any> {
    let output: string;

    switch (action) {
      case 'list':
        output = await this.execGit('git remote -v');
        break;
      case 'get-url':
        output = await this.execGit(`git remote get-url ${name}`);
        break;
      default:
        throw new Error(`未知的远程仓库操作: ${action}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: output || '没有远程仓库',
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Git MCP 服务器已启动');
  }
}

// 启动服务器
const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
const server = new GitServer({ workspaceRoot });
server.run().catch(console.error);
