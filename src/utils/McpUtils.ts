import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { useMcpStore } from "@/stores/mcp";
import { fetch } from "@tauri-apps/plugin-http";

// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class McpUtils {
    /**
     * 创建MCP客户端
     * @param server
     * @returns
     */
    private static async getMcpClient(server: McpServer) {
        let mcpClient;
        if (server.type === "stdio") {
            console.log(server);
            const transport = new Experimental_StdioMCPTransport({
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
        return mcpClient;
    }

    public static async getTools() {
        const mcpStore = useMcpStore();
        if (!mcpStore.initialized) {
            await mcpStore.init();
        }

        const tools: any = {};

        for (const server of mcpStore.servers) {
            if (!server.enabled) continue;

            try {
                const client = await McpUtils.getMcpClient(server);
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
        try {
            const mcpClient = await McpUtils.getMcpClient(server);

            const tools = await mcpClient.tools();
            const resources = await mcpClient.listResources();
            const templates = await mcpClient.listResourceTemplates();
            const prompts = await mcpClient.listPrompts();
            console.log(tools);

            return {
                success: true,
                tools,
                resources,
                templates,
                prompts,
            };
        } catch (error: any) {
            console.error("MCP Test Error:", error);
            return { success: false, error: error.message || String(error) };
        }
    }
}
