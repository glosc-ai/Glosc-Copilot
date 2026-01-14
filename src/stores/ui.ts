import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
    state: () => ({
        mcpManagerOpen: false,
    }),
    actions: {
        openMcpManager() {
            this.mcpManagerOpen = true;
        },
        closeMcpManager() {
            this.mcpManagerOpen = false;
        },
    },
});
