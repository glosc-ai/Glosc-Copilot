import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
    state: () => ({
        mcpManagerOpen: false,
        settingsOpen: false,
    }),
    actions: {
        openMcpManager() {
            this.mcpManagerOpen = true;
        },
        closeMcpManager() {
            this.mcpManagerOpen = false;
        },
        openSettings() {
            this.settingsOpen = true;
        },
        closeSettings() {
            this.settingsOpen = false;
        },
    },
});
