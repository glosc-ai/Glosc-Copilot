<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Maximize2 } from "lucide-vue-next";
import { ref, onMounted } from "vue";

const appWindow = getCurrentWindow();
const chatStore = useChatStore();
const uiStore = useUiStore();

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

const createNewChat = () => {
    chatStore.createNewConversation();
};

const openMcpManager = () => {
    uiStore.openMcpManager();
};
</script>

<template>
    <div
        data-tauri-drag-region
        class="app-header h-10 flex items-center justify-between bg-background border-b select-none px-4 fixed top-0 left-0 right-0 z-50"
    >
        <div class="flex items-center gap-2 text-sm font-medium">
            <img src="/favicon.ico" class="w-4 h-4" alt="Logo" />
            <!-- <span>Glosc Copilot</span> -->
            <div class="flex">
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="ghost"> 开始 </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class="w-20" align="start">
                        <DropdownMenuGroup>
                            <DropdownMenuItem @click="createNewChat"
                                >新建会话
                            </DropdownMenuItem>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    工作区
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem>
                                            新建工作区
                                        </DropdownMenuItem>
                                        <DropdownMenuItem>
                                            打开工作区
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button variant="ghost"> 选项 </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent class="w-20" align="start">
                        <DropdownMenuGroup>
                            <DropdownMenuItem @click="openMcpManager">
                                工具
                            </DropdownMenuItem>
                            <DropdownMenuItem> 设置 </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
        <div class="title-bar-dragger"></div>
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
<style scoped lang="less">
.app-header {
    // 禁用选中
    user-select: none;
}
.title-bar-dragger {
    -webkit-app-region: drag;
    user-select: none;
}
</style>
