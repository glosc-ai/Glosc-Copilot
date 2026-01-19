<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    ChevronDown,
    ChevronRight,
    Pencil,
    Plus,
    Trash2,
} from "lucide-vue-next";
import { cn } from "@/lib/utils";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const meetingStore = useMeetingStore();
const { activeKey, groupedMeetings, meetingsItems } = storeToRefs(meetingStore);

const router = useRouter();
const route = useRoute();

onMounted(() => {
    void meetingStore.init();
});

// ===== 分组折叠状态 =====
const collapsedGroups = ref<Record<string, boolean>>({});

const toggleGroup = (groupKey: string) => {
    collapsedGroups.value[groupKey] = !collapsedGroups.value[groupKey];
};

watch(
    groupedMeetings,
    (newGroups) => {
        const next: Record<string, boolean> = {};
        Object.keys(newGroups).forEach((key) => {
            if (!(key in collapsedGroups.value)) {
                next[key] = key !== "今天";
            } else {
                next[key] = collapsedGroups.value[key];
            }
        });
        collapsedGroups.value = next;
    },
    { immediate: true },
);

// ===== 可拖拽调整宽度 =====
const sidebarWidth = ref(
    parseInt(localStorage.getItem("meetingSidebarWidth") || "256"),
);
const isResizing = ref(false);

const startResize = (event: MouseEvent) => {
    isResizing.value = true;
    document.addEventListener("mousemove", resize);
    document.addEventListener("mouseup", stopResize);
    event.preventDefault();
};

const resize = (event: MouseEvent) => {
    if (!isResizing.value) return;
    const newWidth = event.clientX;
    if (newWidth >= 200 && newWidth <= 500) {
        sidebarWidth.value = newWidth;
    }
};

const stopResize = () => {
    isResizing.value = false;
    document.removeEventListener("mousemove", resize);
    document.removeEventListener("mouseup", stopResize);
    localStorage.setItem("meetingSidebarWidth", sidebarWidth.value.toString());
};

watch(sidebarWidth, (newWidth) => {
    localStorage.setItem("meetingSidebarWidth", newWidth.toString());
});

const currentMeetingId = computed(
    () => (route.params as any).id as string | undefined,
);

const selectMeeting = async (key: string) => {
    if (!key) return;
    if (currentMeetingId.value !== key) {
        await router.push(`/meeting/${key}`);
    }
    await meetingStore.selectMeeting(key);
};

const deleteMeeting = async (key: string, event: Event) => {
    event.stopPropagation();

    try {
        await ElMessageBox.confirm(
            "确定要删除此会议吗？此操作无法撤销。",
            "提示",
            {
                type: "warning",
                confirmButtonText: "删除",
                cancelButtonText: "取消",
            },
        );
    } catch {
        return;
    }

    const deletingActive = currentMeetingId.value === key;
    await meetingStore.deleteMeeting(key);

    if (deletingActive) {
        const nextId = meetingStore.activeKey;
        if (nextId) {
            await router.push(`/meeting/${nextId}`);
        } else {
            await router.push("/meeting");
        }
    }
};

// ===== 手动重命名 =====
const editingKey = ref<string | null>(null);
const editingTitle = ref<string>("");

const startRename = async (key: string, event?: Event) => {
    event?.stopPropagation();
    const item = meetingsItems.value.find((it) => it.key === key);
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
    await meetingStore.renameMeeting(key, title);
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
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
};

const onDrop = async (targetKey: string, event: DragEvent) => {
    event.preventDefault();
    const sourceKey =
        event.dataTransfer?.getData("text/plain") || draggingKey.value;
    draggingKey.value = null;
    if (!sourceKey || sourceKey === targetKey) return;
    await meetingStore.moveMeeting(sourceKey, targetKey);
};

const createNewMeeting = async () => {
    const id = await meetingStore.createMeeting();
    await router.push(`/meeting/${id}`);
};
</script>

<template>
    <div
        class="flex flex-col h-full border-r bg-muted/10 relative"
        :style="{ width: sidebarWidth + 'px' }"
    >
        <div class="p-3 border-b">
            <Button
                class="w-full justify-start gap-2"
                @click="createNewMeeting"
            >
                <Plus class="w-4 h-4" />
                创建新会议
            </Button>
        </div>

        <div class="flex-1 overflow-y-auto px-2">
            <div class="space-y-2">
                <div
                    v-for="(items, groupKey) in groupedMeetings"
                    :key="groupKey"
                    class="space-y-1"
                >
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

                    <div v-show="!collapsedGroups[groupKey]" class="space-y-1">
                        <div
                            v-for="item in items"
                            :key="item.key"
                            @click="selectMeeting(item.key)"
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
                                        : 'hover:bg-accent/50 text-muted-foreground',
                                )
                            "
                        >
                            <div class="flex items-center gap-2 flex-1 min-w-0">
                                <div class="flex-1 min-w-0">
                                    <template v-if="editingKey === item.key">
                                        <Input
                                            v-model="editingTitle"
                                            class="h-7"
                                            @keydown.enter.prevent="
                                                confirmRename
                                            "
                                            @keydown.esc.prevent="cancelRename"
                                            @blur="confirmRename"
                                            autofocus
                                        />
                                    </template>
                                    <template v-else>
                                        <div class="truncate">
                                            {{ item.label }}
                                        </div>
                                        <div
                                            class="text-xs opacity-60 truncate"
                                        >
                                            {{ item.summary || "" }}
                                        </div>
                                    </template>
                                </div>
                            </div>

                            <div
                                class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                @click.stop
                            >
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7"
                                    @click="
                                        (e: Event) => startRename(item.key, e)
                                    "
                                >
                                    <Pencil class="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7 text-destructive"
                                    @click="
                                        (e: Event) => deleteMeeting(item.key, e)
                                    "
                                >
                                    <Trash2 class="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- resize handle -->
        <div
            class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/40"
            @mousedown="startResize"
        />
    </div>
</template>
