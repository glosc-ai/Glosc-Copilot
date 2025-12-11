import { defineStore } from "pinia";
import { storeUtils } from "@/utils/StoreUtils";
import { McpUtils } from "@/utils/McpUtils";

export const useMcpStore = defineStore("mcp", {
    state: () => ({
        servers: [] as McpServer[],
        mcpEnabled: false,
        initialized: false,
        serverCapabilities: {} as Record<string, any>,
    }),
    getters: {},
    actions: {
        setServerCapability(id: string, capability: any) {
            this.serverCapabilities[id] = capability;
        },
        async init() {
            if (this.initialized) return;
            const storedServers =
                await storeUtils.get<McpServer[]>("mcp_servers");
            if (storedServers) {
                this.servers = storedServers;
            }
            const storedEnabled = await storeUtils.get<boolean>("mcp_enabled");
            if (storedEnabled !== null) {
                this.mcpEnabled = storedEnabled;
            }
            this.initialized = true;
        },
        async checkConnections() {
            const promises = this.servers.map(async (server) => {
                if (!server.enabled) return;
                try {
                    const client = await McpUtils.startServer(server);
                    const tools = await client.tools();
                    const resources = await client.listResources();
                    const templates = await client.listResourceTemplates();
                    const prompts = await client.listPrompts();

                    this.setServerCapability(server.id, {
                        success: true,
                        tools,
                        resources,
                        templates,
                        prompts,
                    });
                } catch (e) {
                    console.error(`Check failed for ${server.name}:`, e);
                    await this.updateServer(server.id, { enabled: false });
                }
            });
            await Promise.all(promises);
        },
        async saveServers() {
            // Store unencrypted as requested
            await storeUtils.set("mcp_servers", this.servers, false);
        },
        async saveEnabled() {
            await storeUtils.set("mcp_enabled", this.mcpEnabled, false);
        },
        async addServer(server: Omit<McpServer, "id">) {
            const newServer = {
                ...server,
                id: crypto.randomUUID(),
            } as McpServer;
            this.servers.push(newServer);
            await this.saveServers();
        },
        async updateServer(id: string, updates: Partial<McpServer>) {
            const index = this.servers.findIndex((s) => s.id === id);
            if (index !== -1) {
                const oldServer = this.servers[index];
                const newServer = {
                    ...oldServer,
                    ...updates,
                } as McpServer;

                this.servers[index] = newServer;
                await this.saveServers();

                // Handle start/stop if enabled status changed
                if (updates.enabled !== undefined) {
                    if (updates.enabled) {
                        try {
                            await McpUtils.startServer(newServer);
                        } catch (e) {
                            console.error(
                                `Failed to start server ${newServer.name}, disabling...`,
                                e
                            );
                            this.servers[index] = {
                                ...newServer,
                                enabled: false,
                            };
                            await this.saveServers();
                            await McpUtils.stopServer(id);
                        }
                    } else {
                        await McpUtils.stopServer(id);
                    }
                }
            }
        },
        async removeServer(id: string) {
            this.servers = this.servers.filter((s) => s.id !== id);
            await this.saveServers();
        },
        async toggleMcp() {
            this.mcpEnabled = !this.mcpEnabled;
            await this.saveEnabled();
        },
    },
});
