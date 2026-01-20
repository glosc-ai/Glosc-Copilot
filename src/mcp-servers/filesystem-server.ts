/**
 * MCP 文件系统服务器
 * 提供文件读写、搜索、目录操作等工具
 * 类似 Claude Code 的文件操作能力
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

interface FileSystemConfig {
  workspaceRoot?: string;
  maxFileSize?: number;
  allowedExtensions?: string[];
}

class FileSystemServer {
  private server: Server;
  private config: FileSystemConfig;

  constructor(config: FileSystemConfig = {}) {
    this.config = {
      maxFileSize: config.maxFileSize || 1024 * 1024 * 10, // 10MB
      workspaceRoot: config.workspaceRoot || process.cwd(),
      allowedExtensions: config.allowedExtensions || [],
    };

    this.server = new Server(
      {
        name: 'filesystem-server',
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
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    // 执行工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.handleToolCall(request.params.name, request.params.arguments);
    });
  }

  private getTools(): Tool[] {
    return [
      {
        name: 'read_file',
        description: '读取文件内容。返回指定路径的文件文本内容。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '相对于工作区根目录的文件路径',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: '写入或创建文件。如果文件存在则覆盖，不存在则创建。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '相对于工作区根目录的文件路径',
            },
            content: {
              type: 'string',
              description: '要写入的文件内容',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'edit_file',
        description: '编辑文件的特定部分。使用查找和替换的方式修改文件内容。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '相对于工作区根目录的文件路径',
            },
            search: {
              type: 'string',
              description: '要查找的文本内容（必须完全匹配）',
            },
            replace: {
              type: 'string',
              description: '替换后的文本内容',
            },
          },
          required: ['path', 'search', 'replace'],
        },
      },
      {
        name: 'list_directory',
        description: '列出目录内容。返回指定目录下的文件和子目录列表。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '相对于工作区根目录的目录路径（空字符串表示根目录）',
              default: '',
            },
            recursive: {
              type: 'boolean',
              description: '是否递归列出子目录',
              default: false,
            },
          },
        },
      },
      {
        name: 'create_directory',
        description: '创建目录。如果父目录不存在会自动创建。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '相对于工作区根目录的目录路径',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'delete_file',
        description: '删除文件或目录。目录必须为空才能删除。',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '相对于工作区根目录的文件或目录路径',
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'search_files',
        description: '在工作区中搜索文件。支持 glob 模式匹配文件名。',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Glob 模式，例如 "**/*.ts" 搜索所有 TypeScript 文件',
            },
            includeContent: {
              type: 'boolean',
              description: '是否在结果中包含文件内容摘要',
              default: false,
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'grep_files',
        description: '在文件内容中搜索文本。在工作区文件中搜索匹配的文本内容。',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: '要搜索的文本或正则表达式',
            },
            filePattern: {
              type: 'string',
              description: '限制搜索的文件 glob 模式，例如 "**/*.ts"',
              default: '**/*',
            },
            caseSensitive: {
              type: 'boolean',
              description: '是否区分大小写',
              default: false,
            },
            maxResults: {
              type: 'number',
              description: '最大返回结果数',
              default: 100,
            },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'move_file',
        description: '移动或重命名文件/目录',
        inputSchema: {
          type: 'object',
          properties: {
            from: {
              type: 'string',
              description: '源路径（相对于工作区根目录）',
            },
            to: {
              type: 'string',
              description: '目标路径（相对于工作区根目录）',
            },
          },
          required: ['from', 'to'],
        },
      },
    ];
  }

  private resolvePath(relativePath: string): string {
    const resolved = path.resolve(this.config.workspaceRoot!, relativePath);
    // 安全检查：确保路径在工作区内
    if (!resolved.startsWith(this.config.workspaceRoot!)) {
      throw new Error('路径必须在工作区范围内');
    }
    return resolved;
  }

  private async handleToolCall(name: string, args: any): Promise<any> {
    try {
      switch (name) {
        case 'read_file':
          return await this.readFile(args.path);
        case 'write_file':
          return await this.writeFile(args.path, args.content);
        case 'edit_file':
          return await this.editFile(args.path, args.search, args.replace);
        case 'list_directory':
          return await this.listDirectory(args.path || '', args.recursive || false);
        case 'create_directory':
          return await this.createDirectory(args.path);
        case 'delete_file':
          return await this.deleteFile(args.path);
        case 'search_files':
          return await this.searchFiles(args.pattern, args.includeContent || false);
        case 'grep_files':
          return await this.grepFiles(
            args.pattern,
            args.filePattern || '**/*',
            args.caseSensitive || false,
            args.maxResults || 100
          );
        case 'move_file':
          return await this.moveFile(args.from, args.to);
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

  private async readFile(relativePath: string): Promise<any> {
    const fullPath = this.resolvePath(relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const stats = await fs.stat(fullPath);

    return {
      content: [
        {
          type: 'text',
          text: `文件: ${relativePath}\n大小: ${stats.size} bytes\n\n${content}`,
        },
      ],
    };
  }

  private async writeFile(relativePath: string, content: string): Promise<any> {
    const fullPath = this.resolvePath(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');

    return {
      content: [
        {
          type: 'text',
          text: `成功写入文件: ${relativePath} (${content.length} 字符)`,
        },
      ],
    };
  }

  private async editFile(
    relativePath: string,
    search: string,
    replace: string
  ): Promise<any> {
    const fullPath = this.resolvePath(relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');

    if (!content.includes(search)) {
      throw new Error(`在文件中未找到要替换的内容: "${search}"`);
    }

    const newContent = content.replace(search, replace);
    await fs.writeFile(fullPath, newContent, 'utf-8');

    return {
      content: [
        {
          type: 'text',
          text: `成功编辑文件: ${relativePath}\n已替换: ${search.substring(0, 50)}...\n替换为: ${replace.substring(0, 50)}...`,
        },
      ],
    };
  }

  private async listDirectory(relativePath: string, recursive: boolean): Promise<any> {
    const fullPath = this.resolvePath(relativePath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const items = await Promise.all(
      entries.map(async (entry) => {
        const itemPath = path.join(relativePath, entry.name);
        const fullItemPath = path.join(fullPath, entry.name);
        const stats = await fs.stat(fullItemPath);

        const item: any = {
          name: entry.name,
          path: itemPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats.size,
        };

        if (recursive && entry.isDirectory()) {
          item.children = await this.listDirectory(itemPath, true);
        }

        return item;
      })
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              path: relativePath,
              items: items,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async createDirectory(relativePath: string): Promise<any> {
    const fullPath = this.resolvePath(relativePath);
    await fs.mkdir(fullPath, { recursive: true });

    return {
      content: [
        {
          type: 'text',
          text: `成功创建目录: ${relativePath}`,
        },
      ],
    };
  }

  private async deleteFile(relativePath: string): Promise<any> {
    const fullPath = this.resolvePath(relativePath);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      await fs.rmdir(fullPath);
    } else {
      await fs.unlink(fullPath);
    }

    return {
      content: [
        {
          type: 'text',
          text: `成功删除: ${relativePath}`,
        },
      ],
    };
  }

  private async searchFiles(pattern: string, includeContent: boolean): Promise<any> {
    const files = await glob(pattern, {
      cwd: this.config.workspaceRoot,
      nodir: true,
    });

    const results = await Promise.all(
      files.slice(0, 100).map(async (file) => {
        const result: any = { path: file };

        if (includeContent) {
          try {
            const fullPath = path.join(this.config.workspaceRoot!, file);
            const stats = await fs.stat(fullPath);
            if (stats.size < this.config.maxFileSize!) {
              const content = await fs.readFile(fullPath, 'utf-8');
              result.preview = content.substring(0, 200);
            }
          } catch {
            // 忽略读取错误
          }
        }

        return result;
      })
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              pattern: pattern,
              count: results.length,
              results: results,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async grepFiles(
    pattern: string,
    filePattern: string,
    caseSensitive: boolean,
    maxResults: number
  ): Promise<any> {
    const files = await glob(filePattern, {
      cwd: this.config.workspaceRoot,
      nodir: true,
    });

    const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    const results: any[] = [];

    for (const file of files) {
      if (results.length >= maxResults) break;

      try {
        const fullPath = path.join(this.config.workspaceRoot!, file);
        const stats = await fs.stat(fullPath);
        
        if (stats.size > this.config.maxFileSize!) continue;

        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({
              file: file,
              line: i + 1,
              content: lines[i].trim(),
            });

            if (results.length >= maxResults) break;
          }
        }
      } catch {
        // 忽略读取错误
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              pattern: pattern,
              filePattern: filePattern,
              count: results.length,
              results: results,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async moveFile(from: string, to: string): Promise<any> {
    const fromPath = this.resolvePath(from);
    const toPath = this.resolvePath(to);

    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);

    return {
      content: [
        {
          type: 'text',
          text: `成功移动: ${from} -> ${to}`,
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('文件系统 MCP 服务器已启动');
  }
}

// 启动服务器
const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
const server = new FileSystemServer({ workspaceRoot });
server.run().catch(console.error);
