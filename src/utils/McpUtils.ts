import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import type { McpServer } from "@/utils/interface";
import { TauriStdioTransport } from "@/utils/TauriStdioTransport";

// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class McpUtils {
    private static activeServers: Map<string, { client: any; transport: any }> =
        new Map();

    private static startingServers: Map<string, Promise<any>> = new Map();

    private static async createClientAndTransport(server: McpServer) {
        let transport;
        let mcpClient;
        if (server.type === "stdio") {
            console.log(server);
            transport = new TauriStdioTransport({
                command: server.command,
                args: server.args,
                env: server.env,
                cwd: server.cwd,
            });
            mcpClient = await createMCPClient({
                transport: transport,
            });
        } else {
            mcpClient = await createMCPClient({
                transport: {
                    type: "http",
                    url: server.url,
                    headers: server.headers,
                },
            }).catch((error) => {
                ElMessage.error(`Failed to create HTTP MCP client: ${error}`);
            });
        }

        return { client: mcpClient, transport };
    }

    private static async fetchCapabilities(mcpClient: any) {
        const tools = await mcpClient.tools();
        const resources = await McpUtils.listResources(mcpClient);
        const templates = await McpUtils.listResourceTemplates(mcpClient);
        const prompts = await McpUtils.listPrompts(mcpClient);
        return { tools, resources, templates, prompts };
    }

    /**
     * 启动 MCP 服务器
     */
    public static async startServer(server: McpServer) {
        if (this.activeServers.has(server.id)) {
            return this.activeServers.get(server.id)!.client;
        }

        const inflight = this.startingServers.get(server.id);
        if (inflight) return inflight;

        console.log(`Starting MCP server: ${server.name}`);

        const startPromise = (async () => {
            const { client, transport } =
                await this.createClientAndTransport(server);
            this.activeServers.set(server.id, { client, transport });
            return client;
        })().finally(() => {
            this.startingServers.delete(server.id);
        });

        this.startingServers.set(server.id, startPromise);
        return startPromise;
    }

    /**
     * 停止 MCP 服务器
     */
    public static async stopServer(serverId: string) {
        const inflight = this.startingServers.get(serverId);
        if (inflight) {
            try {
                await inflight;
            } catch (e) {
                // ignore start error; proceed to cleanup
                ElMessage.error(`Failed to start MCP server during stop: ${e}`);
            }
        }

        const session = this.activeServers.get(serverId);
        if (session) {
            console.log(`Stopping MCP server: ${serverId}`);
            if (session.client && typeof session.client.close === "function") {
                await session.client.close();
            } else if (
                session.transport &&
                typeof session.transport.close === "function"
            ) {
                await session.transport.close();
            }
            this.activeServers.delete(serverId);
        }
    }

    public static async getTools(
        servers: McpServer[],
        options: { skipStopDisabled?: boolean } = {},
    ) {
        const tools: any = {};

        for (const server of servers) {
            if (!server.enabled) {
                // 默认行为：禁用即停。
                // workspace 会话会在不影响全局连接的情况下做“仅过滤工具”，因此允许跳过 stop。
                if (!options.skipStopDisabled) {
                    if (this.activeServers.has(server.id)) {
                        await this.stopServer(server.id);
                    }
                }
                continue;
            }

            try {
                const client = await McpUtils.startServer(server);
                const serverTools = await client.tools();
                Object.assign(tools, serverTools);
            } catch (error) {
                console.log(
                    `Failed to initialize MCP server ${server.name}:`,
                    error,
                );
            }
        }

        return tools;
    }

    public static async getActiveCapabilities(server: McpServer) {
        const client = await McpUtils.startServer(server);
        const caps = await McpUtils.fetchCapabilities(client);
        return { success: true, ...caps };
    }

    private static async listResources(mcpClient: any) {
        try {
            if (!mcpClient || typeof mcpClient.listResources !== "function") {
                return { resources: [] };
            }
            return await mcpClient.listResources();
        } catch (error) {
            console.log("Error fetching resources from MCP client:", error);
            return { resources: [] };
        }
    }

    private static async listResourceTemplates(mcpClient: any) {
        try {
            if (
                !mcpClient ||
                typeof mcpClient.listResourceTemplates !== "function"
            ) {
                return { resourceTemplates: [] };
            }
            return await mcpClient.listResourceTemplates();
        } catch (error) {
            console.log(
                "Error fetching resource templates from MCP client:",
                error,
            );
            return { resourceTemplates: [] };
        }
    }

    private static async listPrompts(mcpClient: any) {
        try {
            if (!mcpClient || typeof mcpClient.listPrompts !== "function") {
                return { prompts: [] };
            }
            return await mcpClient.listPrompts();
        } catch (error) {
            console.log("Error fetching prompts from MCP client:", error);
            return { prompts: [] };
        }
    }

    private static async readResourceInternal(mcpClient: any, uri: string) {
        try {
            if (!mcpClient) return null;
            if (typeof mcpClient.readResource === "function") {
                // Common MCP shape: readResource({ uri })
                try {
                    return await mcpClient.readResource({ uri });
                } catch {
                    // Some clients use readResource(uri)
                    return await mcpClient.readResource(uri);
                }
            }
            return null;
        } catch (error) {
            console.log("Error reading resource from MCP client:", error);
            return null;
        }
    }

    private static async getPromptInternal(
        mcpClient: any,
        name: string,
        args?: Record<string, any>,
    ) {
        try {
            if (!mcpClient) return null;
            if (typeof mcpClient.getPrompt === "function") {
                // Common MCP shape: getPrompt({ name, arguments })
                try {
                    return await mcpClient.getPrompt({
                        name,
                        arguments: args ?? {},
                    });
                } catch {
                    // Some clients use getPrompt(name, args)
                    return await mcpClient.getPrompt(name, args ?? {});
                }
            }
            return null;
        } catch (error) {
            console.log("Error getting prompt from MCP client:", error);
            return null;
        }
    }

    /**
     * 获取 MCP Servers 的资源列表（会自动启动已启用的 server）。
     */
    public static async getResources(
        servers: McpServer[],
        options: { skipStopDisabled?: boolean } = {},
    ) {
        const result: Array<{ server: McpServer; resources: any[] }> = [];

        for (const server of servers) {
            if (!server.enabled) {
                if (!options.skipStopDisabled) {
                    if (this.activeServers.has(server.id)) {
                        await this.stopServer(server.id);
                    }
                }
                continue;
            }

            try {
                const client = await McpUtils.startServer(server);
                const payload = await McpUtils.listResources(client);
                result.push({
                    server,
                    resources: payload?.resources || [],
                });
            } catch (error) {
                console.log(
                    `Failed to fetch MCP resources from ${server.name}:`,
                    error,
                );
            }
        }

        return result;
    }

    /**
     * 获取 MCP Servers 的 Resource Templates（uriTemplate）。
     */
    public static async getResourceTemplates(
        servers: McpServer[],
        options: { skipStopDisabled?: boolean } = {},
    ) {
        const result: Array<{ server: McpServer; templates: any[] }> = [];

        for (const server of servers) {
            if (!server.enabled) {
                if (!options.skipStopDisabled) {
                    if (this.activeServers.has(server.id)) {
                        await this.stopServer(server.id);
                    }
                }
                continue;
            }

            try {
                const client = await McpUtils.startServer(server);
                const payload = await McpUtils.listResourceTemplates(client);
                result.push({
                    server,
                    templates: payload?.resourceTemplates || [],
                });
            } catch (error) {
                console.log(
                    `Failed to fetch MCP resource templates from ${server.name}:`,
                    error,
                );
            }
        }

        return result;
    }

    /**
     * 获取 MCP Servers 的 Prompts（提示词模板）。
     */
    public static async getPrompts(
        servers: McpServer[],
        options: { skipStopDisabled?: boolean } = {},
    ) {
        const result: Array<{ server: McpServer; prompts: any[] }> = [];

        for (const server of servers) {
            if (!server.enabled) {
                if (!options.skipStopDisabled) {
                    if (this.activeServers.has(server.id)) {
                        await this.stopServer(server.id);
                    }
                }
                continue;
            }

            try {
                const client = await McpUtils.startServer(server);
                const payload = await McpUtils.listPrompts(client);
                result.push({
                    server,
                    prompts: payload?.prompts || [],
                });
            } catch (error) {
                console.log(
                    `Failed to fetch MCP prompts from ${server.name}:`,
                    error,
                );
            }
        }

        return result;
    }

    /**
     * 读取资源内容。
     */
    public static async readResource(server: McpServer, uri: string) {
        const client = await McpUtils.startServer(server);
        return await McpUtils.readResourceInternal(client, uri);
    }

    /**
     * 获取 Prompt 详情（可带参数）。
     */
    public static async getPrompt(
        server: McpServer,
        name: string,
        args?: Record<string, any>,
    ) {
        const client = await McpUtils.startServer(server);
        return await McpUtils.getPromptInternal(client, name, args);
    }

    public static async testConnection(server: McpServer) {
        let transport;
        let mcpClient: any;
        try {
            const result = await this.createClientAndTransport(server);
            mcpClient = result.client;
            transport = result.transport;

            const caps = await McpUtils.fetchCapabilities(mcpClient);

            // Close transport after test
            if (mcpClient && typeof mcpClient.close === "function") {
                await mcpClient.close();
            } else if (transport && typeof transport.close === "function") {
                await transport.close();
            }

            return {
                success: true,
                ...caps,
            };
        } catch (error: any) {
            console.log("MCP Test Error:", error);
            try {
                if (mcpClient && typeof mcpClient.close === "function") {
                    await mcpClient.close();
                } else if (transport && typeof transport.close === "function") {
                    await transport.close();
                }
            } catch {
                // ignore
            }
            return { success: false, error: error.message || String(error) };
        }
    }
}
