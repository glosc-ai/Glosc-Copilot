<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    MessageSquare,
    Trash2,
    Pencil,
    ChevronDown,
    ChevronRight,
    FolderPlus,
    Sparkles,
    Folder,
    FolderOpen,
    Plus,
    Settings,
    SlidersHorizontal,
} from "lucide-vue-next";
import { useChatStore } from "@/stores/chat";
import { storeToRefs } from "pinia";
import { cn } from "@/lib/utils";
import { computed, nextTick, ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const chatStore = useChatStore();
const uiStore = useUiStore();
const { conversationsItems, activeKey, sidebarConversationGroups } =
    storeToRefs(chatStore);

const router = useRouter();
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
const isOrganizing = ref(false);

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

// 初始化分组折叠状态（默认仅展开“今天”）
watch(
    sidebarConversationGroups,
    (newGroups) => {
        const newCollapsed: Record<string, boolean> = {};
        newGroups.forEach((group) => {
            if (!(group.key in collapsedGroups.value)) {
                // 默认折叠非当天的历史（今天展开，其它折叠）
                newCollapsed[group.key] =
                    !group.custom && group.label !== "今天";
            } else {
                newCollapsed[group.key] = collapsedGroups.value[group.key];
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

const selectChat = (key: string) => {
    void chatStore.selectConversation(key);
};

const createNewChat = async () => {
    await chatStore.createNewConversation(true);
    if (route.path !== "/") {
        await router.push("/");
    }
};

const openSettings = () => {
    uiStore.openSettings();
};

const openModelSettings = () => {
    uiStore.openModelSettings();
};

const deleteChat = async (key: string, event: Event) => {
    event.stopPropagation();
    await chatStore.deleteConversation(key);
};

const createGroup = async () => {
    const name = window.prompt("新分组名称");
    if (!name?.trim()) return;
    await chatStore.createConversationGroup(name);
};

const renameGroup = async (
    groupId: string | null,
    currentName: string,
    event: Event,
) => {
    event.stopPropagation();
    if (!groupId) return;
    const name = window.prompt("分组名称", currentName);
    if (!name?.trim()) return;
    await chatStore.renameConversationGroup(groupId, name);
};

const deleteGroup = async (groupId: string | null, event: Event) => {
    event.stopPropagation();
    if (!groupId) return;
    if (!window.confirm("删除该分组？会话会回到按日期分组。")) return;
    await chatStore.deleteConversationGroup(groupId);
};

const organizeGroups = async () => {
    if (isOrganizing.value) return;
    isOrganizing.value = true;
    try {
        const count = await chatStore.autoOrganizeConversationGroups();
        if (count > 0) {
            ElMessage.success(`已整理 ${count} 个会话`);
        } else {
            ElMessage.info("没有可整理的会话");
        }
    } catch (error: any) {
        console.error("AI 整理分组失败:", error);
        ElMessage.error(error?.message || "AI 整理失败，请稍后重试");
    } finally {
        isOrganizing.value = false;
    }
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

const onDropGroup = async (groupId: string | null, event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const sourceKey =
        event.dataTransfer?.getData("text/plain") || draggingKey.value;
    draggingKey.value = null;
    if (!sourceKey) return;
    await chatStore.setConversationGroup(sourceKey, groupId);
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
            <!-- <div class="p-4">
                <Button
                    @click="createNewChat"
                    class="w-full justify-start gap-2"
                    variant="default"
                >
                    <Plus class="w-4 h-4" />
                    新建对话
                </Button>
                <router-link to="/test">
                    <Button class="w-full justify-start gap-2">测试</Button>
                </router-link>
            </div> -->

            <div class="flex items-center gap-1 px-2 py-2">
                <Button
                    variant="default"
                    size="sm"
                    class="h-8 flex-1 justify-start gap-2"
                    @click="createNewChat"
                >
                    <Plus class="w-4 h-4" />
                    新建会话
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8"
                    title="新建分组"
                    @click="createGroup"
                >
                    <FolderPlus class="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8"
                    title="AI 整理分组"
                    :disabled="isOrganizing"
                    @click="organizeGroups"
                >
                    <Sparkles
                        class="w-4 h-4"
                        :class="{ 'animate-spin': isOrganizing }"
                    />
                </Button>
            </div>

            <div class="flex-1 overflow-y-auto px-2">
                <div class="space-y-2">
                    <div
                        v-for="section in sidebarConversationGroups"
                        :key="section.key"
                        class="space-y-1"
                    >
                        <!-- 分组标题 -->
                        <div
                            class="flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors group"
                            @click="toggleGroup(section.key)"
                            @dragover="onDragOver"
                            @drop="
                                (e: DragEvent) =>
                                    onDropGroup(section.groupId, e)
                            "
                        >
                            <ChevronDown
                                v-if="!collapsedGroups[section.key]"
                                class="w-3 h-3"
                            />
                            <ChevronRight v-else class="w-3 h-3" />
                            <FolderOpen
                                v-if="section.custom && !collapsedGroups[section.key]"
                                class="w-3 h-3"
                            />
                            <Folder
                                v-else-if="section.custom"
                                class="w-3 h-3"
                            />
                            <span class="truncate">{{ section.label }}</span>
                            <span class="ml-auto text-xs opacity-50"
                                >({{ section.items.length }})</span
                            >
                            <template v-if="section.custom">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="重命名分组"
                                    @click="
                                        (e: any) =>
                                            renameGroup(
                                                section.groupId,
                                                section.label,
                                                e,
                                            )
                                    "
                                >
                                    <Pencil class="w-3 h-3" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="删除分组"
                                    @click="
                                        (e: any) =>
                                            deleteGroup(section.groupId, e)
                                    "
                                >
                                    <Trash2 class="w-3 h-3" />
                                </Button>
                            </template>
                        </div>

                        <!-- 分组内容 -->
                        <div
                            v-show="!collapsedGroups[section.key]"
                            class="space-y-1"
                        >
                            <div
                                v-for="item in section.items"
                                :key="item.key"
                                @click="selectChat(item.key)"
                                draggable="true"
                                @dragstart="
                                    (e: DragEvent) => onDragStart(item.key, e)
                                "
                                @dragover="onDragOver"
                                @drop="
                                    (e: DragEvent) =>
                                        onDrop(item.key, e)
                                "
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

        <div class="border-t p-2 space-y-1">
            <Button
                variant="ghost"
                size="sm"
                class="w-full justify-start gap-2"
                @click="openModelSettings"
            >
                <SlidersHorizontal class="w-4 h-4" />
                模型设置
            </Button>
            <Button
                variant="ghost"
                size="sm"
                class="w-full justify-start gap-2"
                @click="openSettings"
            >
                <Settings class="w-4 h-4" />
                设置
            </Button>
        </div>

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
