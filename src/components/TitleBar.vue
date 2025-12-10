<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Maximize2 } from "lucide-vue-next";
import { ref, onMounted } from "vue";

const appWindow = getCurrentWindow();
const isMaximized = ref(false);

onMounted(async () => {
    isMaximized.value = await appWindow.isMaximized();
    // Listen for resize events to update state if needed,
    // but for simplicity we'll just toggle state on click
});

const minimize = () => appWindow.minimize();
const toggleMaximize = async () => {
    await appWindow.toggleMaximize();
    isMaximized.value = await appWindow.isMaximized();
};
const close = () => appWindow.close();
</script>

<template>
    <div
        data-tauri-drag-region
        class="title-bar-dragger h-10 flex items-center justify-between bg-background border-b select-none px-4 fixed top-0 left-0 right-0 z-50"
    >
        <div class="flex items-center gap-2 text-sm font-medium">
            <img src="/favicon.ico" class="w-4 h-4" alt="Logo" />
            <span>Gloss Copilot</span>
        </div>
        <div class="flex items-center gap-1">
            <button
                @click="minimize"
                class="p-2 hover:bg-accent rounded-md transition-colors"
            >
                <Minus class="w-4 h-4" />
            </button>
            <button
                @click="toggleMaximize"
                class="p-2 hover:bg-accent rounded-md transition-colors"
            >
                <Maximize2 v-if="!isMaximized" class="w-4 h-4" />
                <Square v-else class="w-4 h-4" />
            </button>
            <button
                @click="close"
                class="p-2 hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors"
            >
                <X class="w-4 h-4" />
            </button>
        </div>
    </div>
</template>
<style scoped>
.title-bar-dragger {
    -webkit-app-region: drag;
    user-select: none;
}
</style>
