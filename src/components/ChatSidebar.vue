<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Plus,
    MessageSquare,
    Trash2,
    Pencil,
    ChevronDown,
    ChevronRight,
} from "lucide-vue-next";
import { useChatStore } from "@/stores/chat";
import { storeToRefs } from "pinia";
import { cn } from "@/lib/utils";
import { computed, nextTick, ref, watch, onMounted } from "vue";
import { useRoute } from "vue-router";

const chatStore = useChatStore();
const { conversationsItems, activeKey, groupedConversations } =
    storeToRefs(chatStore);

// const router = useRouter();
const route = useRoute();

onMounted(() => {
    // 让侧边栏在任何模式下首次挂载时都能恢复会话数据
    void chatStore.init();
});

// const modeItems = [
//     { label: "对话", path: "/" },
//     { label: "任务", path: "/tasks" },
//     { label: "工作区", path: "/workspace" },
//     { label: "计划", path: "/plan" },
// ];

const isChatMode = computed(() => route.path === "/");

// const isModeActive = (path: string) => route.path === path;
// const goToMode = (path: string) => {
//     if (route.path === path) return;
//     void router.push(path);
// };

// ===== 分组折叠状态 =====
const collapsedGroups = ref<Record<string, boolean>>({});

// 切换分组折叠状态
const toggleGroup = (groupKey: string) => {
    collapsedGroups.value[groupKey] = !collapsedGroups.value[groupKey];
};

// 初始化分组折叠状态（默认展开）
watch(
    groupedConversations,
    (newGroups) => {
        const newCollapsed: Record<string, boolean> = {};
        Object.keys(newGroups).forEach((key) => {
            if (!(key in collapsedGroups.value)) {
                newCollapsed[key] = false; // 默认展开
            } else {
                newCollapsed[key] = collapsedGroups.value[key];
            }
        });
        collapsedGroups.value = newCollapsed;
    },
    { immediate: true }
);

// ===== 可拖拽调整宽度 =====
const sidebarWidth = ref(
    parseInt(localStorage.getItem("chatSidebarWidth") || "256")
); // 从localStorage加载，默认256px
const isResizing = ref(false);

const startResize = (event: MouseEvent) => {
    isResizing.value = true;
    document.addEventListener("mousemove", resize);
    document.addEventListener("mouseup", stopResize);
    event.preventDefault();
};

const resize = (event: MouseEvent) => {
    if (isResizing.value) {
        const newWidth = event.clientX;
        if (newWidth >= 200 && newWidth <= 500) {
            // 限制最小和最大宽度
            sidebarWidth.value = newWidth;
        }
    }
};

const stopResize = () => {
    isResizing.value = false;
    document.removeEventListener("mousemove", resize);
    document.removeEventListener("mouseup", stopResize);
    // 保存宽度到localStorage
    localStorage.setItem("chatSidebarWidth", sidebarWidth.value.toString());
};

// 监听宽度变化并保存（作为备用方案）
watch(sidebarWidth, (newWidth) => {
    localStorage.setItem("chatSidebarWidth", newWidth.toString());
});

const createNewChat = async () => {
    await chatStore.createNewConversation();
};

const selectChat = (key: string) => {
    activeKey.value = key;
};

const deleteChat = async (key: string, event: Event) => {
    event.stopPropagation();
    await chatStore.deleteConversation(key);
};

// ===== 手动重命名 =====
const editingKey = ref<string | null>(null);
const editingTitle = ref<string>("");

const startRename = async (key: string, event?: Event) => {
    event?.stopPropagation();
    const item = conversationsItems.value.find((it) => it.key === key);
    editingKey.value = key;
    editingTitle.value = item?.label ?? "";
    await nextTick();
};

const cancelRename = () => {
    editingKey.value = null;
    editingTitle.value = "";
};

const confirmRename = async () => {
    if (!editingKey.value) return;
    const key = editingKey.value;
    const title = editingTitle.value.trim();
    cancelRename();
    if (!title) return;
    await chatStore.renameConversation(key, title);
};

// ===== 拖拽排序 =====
const draggingKey = ref<string | null>(null);

const onDragStart = (key: string, event: DragEvent) => {
    draggingKey.value = key;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
    }
};

const onDragOver = (event: DragEvent) => {
    // 必须 preventDefault 才能触发 drop
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
};

const onDrop = async (targetKey: string, event: DragEvent) => {
    event.preventDefault();
    const sourceKey =
        event.dataTransfer?.getData("text/plain") || draggingKey.value;
    draggingKey.value = null;
    if (!sourceKey || sourceKey === targetKey) return;
    await chatStore.moveConversation(sourceKey, targetKey);
};

// const goToMcp = () => {
//     router.push("/mcp");
// };
</script>

<template>
    <div
        class="flex flex-col h-full border-r bg-muted/10 relative"
        :style="{ width: sidebarWidth + 'px' }"
    >
        <!-- <div class="p-2 border-b">
            <div class="grid gap-1">
                <Button
                    v-for="item in modeItems"
                    :key="item.path"
                    variant="ghost"
                    class="w-full justify-start"
                    :class="
                        cn(
                            isModeActive(item.path)
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        )
                    "
                    @click="goToMode(item.path)"
                >
                    {{ item.label }}
                </Button>
            </div>
        </div> -->

        <template v-if="isChatMode">
            <div class="p-4">
                <Button
                    @click="createNewChat"
                    class="w-full justify-start gap-2"
                    variant="default"
                >
                    <Plus class="w-4 h-4" />
                    新建对话
                </Button>
                <!-- <router-link to="/test">
                    <Button class="w-full justify-start gap-2">测试</Button>
                </router-link> -->
            </div>

            <div class="flex-1 overflow-y-auto px-2">
                <div class="space-y-2">
                    <div
                        v-for="(items, groupKey) in groupedConversations"
                        :key="groupKey"
                        class="space-y-1"
                    >
                        <!-- 分组标题 -->
                        <div
                            class="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                            @click="toggleGroup(groupKey)"
                        >
                            <ChevronDown
                                v-if="!collapsedGroups[groupKey]"
                                class="w-3 h-3"
                            />
                            <ChevronRight v-else class="w-3 h-3" />
                            <span>{{ groupKey }}</span>
                            <span class="ml-auto text-xs opacity-50"
                                >({{ items.length }})</span
                            >
                        </div>

                        <!-- 分组内容 -->
                        <div
                            v-show="!collapsedGroups[groupKey]"
                            class="space-y-1"
                        >
                            <div
                                v-for="item in items"
                                :key="item.key"
                                @click="selectChat(item.key)"
                                draggable="true"
                                @dragstart="
                                    (e: DragEvent) => onDragStart(item.key, e)
                                "
                                @dragover="onDragOver"
                                @drop="(e: DragEvent) => onDrop(item.key, e)"
                                :class="
                                    cn(
                                        'flex items-center justify-between p-2 rounded-md cursor-pointer text-sm transition-colors group',
                                        activeKey === item.key
                                            ? 'bg-accent text-accent-foreground'
                                            : 'hover:bg-accent/50 text-muted-foreground'
                                    )
                                "
                            >
                                <div
                                    class="flex items-center gap-2 overflow-hidden"
                                >
                                    <MessageSquare class="w-4 h-4 shrink-0" />
                                    <template v-if="editingKey === item.key">
                                        <Input
                                            v-model="editingTitle"
                                            class="h-7"
                                            @click.stop
                                            @keydown.enter.prevent="
                                                confirmRename
                                            "
                                            @keydown.esc.prevent="cancelRename"
                                            @blur="confirmRename"
                                        />
                                    </template>
                                    <template v-else>
                                        <span class="truncate">{{
                                            item.label
                                        }}</span>
                                    </template>
                                </div>
                                <div class="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        @click="
                                            (e: any) => startRename(item.key, e)
                                        "
                                    >
                                        <Pencil class="w-3 h-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        @click="
                                            (e: any) => deleteChat(item.key, e)
                                        "
                                    >
                                        <Trash2 class="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </template>

        <template v-else>
            <div class="flex-1 p-4 text-sm text-muted-foreground">暂无内容</div>
        </template>

        <!-- 拖拽调整宽度手柄 -->
        <div
            class="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-border hover:bg-accent transition-colors"
            @mousedown="startResize"
        ></div>

        <!-- <div class="p-4 border-t">
            <Button
                @click="goToMcp"
                class="w-full justify-start gap-2"
                variant="ghost"
            >
                <Server class="w-4 h-4" />
                工具配置
            </Button>
        </div> -->
    </div>
</template>
