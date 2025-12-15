<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Trash2, Pencil } from "lucide-vue-next";
import { useChatStore } from "@/stores/chat";
import { storeToRefs } from "pinia";
import { cn } from "@/lib/utils";
import { nextTick, ref } from "vue";

const chatStore = useChatStore();
const { conversationsItems, activeKey } = storeToRefs(chatStore);

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
    <div class="flex flex-col h-full border-r bg-muted/10 w-64">
        <div class="p-4">
            <Button
                @click="createNewChat"
                class="w-full justify-start gap-2"
                variant="default"
            >
                <Plus class="w-4 h-4" />
                新建对话
            </Button>
            <!-- <Button
                class="w-full justify-start gap-2"
                @click="$router.push('/test')"
                variant="default"
                >测试</Button
            > -->
        </div>

        <div class="flex-1 overflow-y-auto px-2">
            <div class="space-y-1">
                <div
                    v-for="item in conversationsItems"
                    :key="item.key"
                    @click="selectChat(item.key)"
                    draggable="true"
                    @dragstart="(e: DragEvent) => onDragStart(item.key, e)"
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
                    <div class="flex items-center gap-2 overflow-hidden">
                        <MessageSquare class="w-4 h-4 shrink-0" />
                        <template v-if="editingKey === item.key">
                            <Input
                                v-model="editingTitle"
                                class="h-7"
                                @click.stop
                                @keydown.enter.prevent="confirmRename"
                                @keydown.esc.prevent="cancelRename"
                                @blur="confirmRename"
                            />
                        </template>
                        <template v-else>
                            <span class="truncate">{{ item.label }}</span>
                        </template>
                    </div>
                    <div class="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            @click="(e: any) => startRename(item.key, e)"
                        >
                            <Pencil class="w-3 h-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            @click="(e: any) => deleteChat(item.key, e)"
                        >
                            <Trash2 class="w-3 h-3" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <!-- <div class="p-4 border-t">
            <Button
                @click="goToMcp"
                class="w-full justify-start gap-2"
                variant="ghost"
            >
                <Server class="w-4 h-4" />
                MCP 配置
            </Button>
        </div> -->
    </div>
</template>
