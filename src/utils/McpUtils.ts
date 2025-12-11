import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { useMcpStore } from "@/stores/mcp";
import { ElMessage } from "element-plus";

// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class McpUtils {
    private static activeServers: Map<string, { client: any; transport: any }> =
        new Map();

    private static async createClientAndTransport(server: McpServer) {
        let transport;
        let mcpClient;
        if (server.type === "stdio") {
            console.log(server);
            transport = new TauriStdioTransport({
                command: server.command,
                args: server.args,
                env: server.env,
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
            });
        }
        return { client: mcpClient, transport };
    }

    /**
     * 启动 MCP 服务器
     */
    public static async startServer(server: McpServer) {
        if (this.activeServers.has(server.id)) {
            return this.activeServers.get(server.id)!.client;
        }

        console.log(`Starting MCP server: ${server.name}`);
        try {
            const { client, transport } =
                await this.createClientAndTransport(server);
            this.activeServers.set(server.id, { client, transport });
            return client;
        } catch (error) {
            ElMessage.error(`Failed to start server ${server.name}: ${error}`);
            throw error;
        }
    }

    /**
     * 停止 MCP 服务器
     */
    public static async stopServer(serverId: string) {
        const session = this.activeServers.get(serverId);
        if (session) {
            console.log(`Stopping MCP server: ${serverId}`);
            if (
                session.transport &&
                typeof session.transport.close === "function"
            ) {
                await session.transport.close();
            }
            this.activeServers.delete(serverId);
        }
    }

    public static async getTools() {
        const mcpStore = useMcpStore();
        if (!mcpStore.initialized) {
            await mcpStore.init();
        }

        const tools: any = {};

        for (const server of mcpStore.servers) {
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
                console.error(
                    `Failed to initialize MCP server ${server.name}:`,
                    error
                );
            }
        }

        return tools;
    }

    public static async testConnection(server: McpServer) {
        let transport;
        try {
            const result = await this.createClientAndTransport(server);
            const mcpClient = result.client;
            transport = result.transport;

            const tools = await mcpClient.tools();
            const resources = await mcpClient.listResources();
            const templates = await mcpClient.listResourceTemplates();
            const prompts = await mcpClient.listPrompts();
            console.log(tools);

            // Close transport after test
            if (transport && typeof transport.close === "function") {
                await transport.close();
            }

            return {
                success: true,
                tools,
                resources,
                templates,
                prompts,
            };
        } catch (error: any) {
            console.error("MCP Test Error:", error);
            if (transport && typeof transport.close === "function") {
                await transport.close();
            }
            return { success: false, error: error.message || String(error) };
        }
    }
}
