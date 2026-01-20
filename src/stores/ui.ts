import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", {
    state: () => ({
        mcpManagerOpen: false,
        settingsOpen: false,
        aboutOpen: false,
        aboutTab: "about" as "about" | "changelog" | "github",
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

        openAbout(tab?: "about" | "changelog" | "github") {
            if (tab) this.aboutTab = tab;
            this.aboutOpen = true;
        },
        closeAbout() {
            this.aboutOpen = false;
        },
    },
});
