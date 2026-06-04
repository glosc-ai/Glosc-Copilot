<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { Monitor, MousePointer2, Window } from "lucide-vue-next";

const computerStore = useComputerControlStore();

let refreshInterval: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
    await computerStore.refreshScreenInfo();
    await computerStore.refreshActiveWindow();
    // Refresh active window every 3 seconds
    refreshInterval = setInterval(() => {
        computerStore.refreshActiveWindow();
    }, 3000);
});

onUnmounted(() => {
    if (refreshInterval) clearInterval(refreshInterval);
});
</script>

<template>
    <div
        class="flex items-center gap-4 px-4 py-2 bg-muted/30 rounded-lg text-xs text-muted-foreground"
    >
        <div v-if="computerStore.screenInfo" class="flex items-center gap-1.5">
            <Monitor class="w-3.5 h-3.5" />
            <span>
                {{ computerStore.screenInfo.width }} ×
                {{ computerStore.screenInfo.height }}
                ({{ (computerStore.screenInfo.scale_factor * 100).toFixed(0) }}%)
            </span>
        </div>
        <div v-if="computerStore.activeWindow" class="flex items-center gap-1.5">
            <Window class="w-3.5 h-3.5" />
            <span class="truncate max-w-64">{{ computerStore.activeWindow }}</span>
        </div>
        <div v-if="!computerStore.safetyConfig.enabled" class="text-destructive font-medium">
            ⚠ 电脑控制功能已禁用
        </div>
    </div>
</template>
