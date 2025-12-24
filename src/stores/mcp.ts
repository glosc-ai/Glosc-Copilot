import { defineStore } from "pinia";
import { storeUtils } from "@/utils/StoreUtils";
import { McpUtils } from "@/utils/McpUtils";

// Cache duration for MCP tools (in milliseconds)
const CACHE_DURATION_MS = 5000;

export const useMcpStore = defineStore("mcp", {
    state: () => ({
        servers: [] as McpServer[],
        mcpEnabled: false,
        initialized: false,
        serverCapabilities: {} as Record<string, any>,
        cachedTools: null as Record<string, any> | null,
        toolsLastUpdated: 0,
        toolsLoadingPromise: null as Promise<Record<string, any>> | null,
    }),
    getters: {
        hasEnabledServers(state) {
            return state.servers.some((s) => s.enabled);
        },
    },
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
                    // Use a single, resilient capability fetch path (same semantics as MCP page "启动" flow).
                    const caps = await McpUtils.getActiveCapabilities(server);
                    this.setServerCapability(server.id, caps);
                } catch (e) {
                    console.log(`Check failed for ${server.name}:`, e);
                    const errorText =
                        e instanceof Error
                            ? e.message
                            : (e as any)?.message
                              ? String((e as any).message)
                              : String(e);
                    this.setServerCapability(server.id, {
                        success: false,
                        error: errorText,
                    });
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

                // Invalidate tools cache when server config changes
                if (Object.keys(updates).length > 0) {
                    this.invalidateToolsCache();
                }

                // Handle start/stop if enabled status changed
                if (updates.enabled !== undefined) {
                    if (updates.enabled) {
                        try {
                            await McpUtils.startServer(newServer);
                        } catch (e) {
                            console.error(
                                `Failed to start server ${newServer.name}`,
                                e
                            );
                            this.setServerCapability(id, {
                                success: false,
                                error: (e as any)?.message || String(e),
                            });
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
        async getCachedTools(forceRefresh = false) {
            // Cache tools to avoid reloading on each message
            const now = Date.now();
            const cacheValid =
                this.cachedTools &&
                now - this.toolsLastUpdated < CACHE_DURATION_MS;

            if (!forceRefresh && cacheValid) {
                return this.cachedTools;
            }

            // If already loading, return the existing promise to avoid concurrent fetches
            if (this.toolsLoadingPromise) {
                return this.toolsLoadingPromise;
            }

            // Create and store the loading promise
            this.toolsLoadingPromise = (async () => {
                try {
                    const tools = await McpUtils.getTools(this.servers);
                    this.cachedTools = tools;
                    this.toolsLastUpdated = Date.now();
                    return tools;
                } catch (error) {
                    // On error, invalidate cache and re-throw
                    this.invalidateToolsCache();
                    throw error;
                } finally {
                    // Clear the loading promise
                    this.toolsLoadingPromise = null;
                }
            })();

            return this.toolsLoadingPromise;
        },
        invalidateToolsCache() {
            this.cachedTools = null;
            this.toolsLastUpdated = 0;
        },
    },
});
