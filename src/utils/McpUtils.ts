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

    public static async getTools(servers: McpServer[]) {
        const tools: any = {};

        for (const server of servers) {
            if (!server.enabled) {
                // Ensure it's stopped if disabled
                if (this.activeServers.has(server.id)) {
                    await this.stopServer(server.id);
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
                    error
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
                error
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
