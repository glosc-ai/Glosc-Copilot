import { defineStore } from "pinia";
import { storeUtils } from "@/utils/StoreUtils";

export const useMcpStore = defineStore("mcp", {
    state: () => ({
        servers: [] as McpServer[],
        mcpEnabled: false,
        initialized: false,
    }),
    getters: {},
    actions: {
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
                this.servers[index] = {
                    ...this.servers[index],
                    ...updates,
                } as McpServer;
                await this.saveServers();
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
