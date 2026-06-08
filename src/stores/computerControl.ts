import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ScreenInfo } from "../utils/ComputerControlUtils";
import {
    computerCaptureScreen,
    computerGetScreenSize,
    computerGetActiveWindow,
} from "../utils/ComputerControlUtils";

export interface ComputerActionLog {
    id: string;
    tool: string;
    input: Record<string, any>;
    timestamp: number;
    success: boolean;
    result?: string;
}

export interface ComputerSafetyConfig {
    /** 是否启用电脑控制功能 */
    enabled: boolean;
    /** 执行 Shell 命令前需要确认 */
    confirmShellCommands: boolean;
    /** 允许的 Shell 命令前缀（空 = 全部允许） */
    allowedShellPrefixes: string[];
}

export const useComputerControlStore = defineStore("computerControl", () => {
    // ========== State ==========
    const safetyConfig = ref<ComputerSafetyConfig>({
        enabled: true,
        confirmShellCommands: true,
        allowedShellPrefixes: [],
    });

    const actionLog = ref<ComputerActionLog[]>([]);

    const screenInfo = ref<ScreenInfo | null>(null);

    const lastScreenshot = ref<string | null>(null);

    const activeWindow = ref<string>("");

    // ========== Getters ==========
    const isEnabled = computed(() => safetyConfig.value.enabled);

    const recentActions = computed(() => actionLog.value.slice(-50).reverse());

    // ========== Actions ==========
    let logIdCounter = 0;

    function addActionLog(
        tool: string,
        input: Record<string, any>,
        success: boolean,
        result?: string,
    ) {
        logIdCounter++;
        actionLog.value.push({
            id: `computer-${logIdCounter}`,
            tool,
            input,
            timestamp: Date.now(),
            success,
            result,
        });
    }

    async function refreshScreenInfo() {
        try {
            screenInfo.value = await computerGetScreenSize();
        } catch (e) {
            console.error("Failed to get screen info:", e);
        }
    }

    async function refreshActiveWindow() {
        try {
            const info = await computerGetActiveWindow();
            activeWindow.value = info.title
                ? `${info.title} — ${info.app_name}`
                : info.app_name;
        } catch (e) {
            console.error("Failed to get active window:", e);
        }
    }

    async function takeScreenshot() {
        try {
            lastScreenshot.value = await computerCaptureScreen();
            addActionLog("computer_capture_screen", {}, true, "截图成功");
            return lastScreenshot.value;
        } catch (e: any) {
            addActionLog("computer_capture_screen", {}, false, String(e));
            throw e;
        }
    }

    function updateSafetyConfig(config: Partial<ComputerSafetyConfig>) {
        Object.assign(safetyConfig.value, config);
    }

    function clearActionLog() {
        actionLog.value = [];
    }

    return {
        // State
        safetyConfig,
        actionLog,
        screenInfo,
        lastScreenshot,
        activeWindow,
        // Getters
        isEnabled,
        recentActions,
        // Actions
        addActionLog,
        refreshScreenInfo,
        refreshActiveWindow,
        takeScreenshot,
        updateSafetyConfig,
        clearActionLog,
    };
});
