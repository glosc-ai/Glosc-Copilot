<script setup lang="ts">
import { computed } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { GripVertical, X, User, ListTodo } from "lucide-vue-next";
import type { QueueNode } from "@/utils/meetingInterface";
import { VueDraggableNext } from "vue-draggable-next";

const props = defineProps<{
    meetingId: string;
}>();

const meetingStore = useMeetingStore();
const { activeMeeting, currentQueue } = storeToRefs(meetingStore);

const queueNodes = computed({
    get: () => currentQueue.value,
    set: async (newQueue: QueueNode[]) => {
        await meetingStore.updateQueue(props.meetingId, newQueue);
    },
});

function getNodeDisplay(node: QueueNode) {
    const meeting = activeMeeting.value;
    if (!meeting) return { name: "未知", avatar: "❓", color: "#6b7280" };

    if (node.type === "role" && node.roleId) {
        const role = meeting.roles.find((r) => r.id === node.roleId);
        if (role) {
            return {
                name: role.name,
                avatar: role.avatar || "👤",
                color: role.color || "#6b7280",
            };
        }
    } else if (node.type === "user") {
        return {
            name: "用户发言",
            avatar: "👤",
            color: "#6b7280",
        };
    } else if (node.type === "task") {
        return {
            name: node.taskType || "任务",
            avatar: "📋",
            color: "#8b5cf6",
        };
    }

    return { name: "未知", avatar: "❓", color: "#6b7280" };
}

async function addUserToQueue() {
    await meetingStore.addToQueue(props.meetingId, {
        type: "user",
    });
}

async function addSummaryTask() {
    await meetingStore.addToQueue(props.meetingId, {
        type: "task",
        taskType: "总结会议",
    });
}

async function removeFromQueue(nodeId: string) {
    await meetingStore.removeFromQueue(props.meetingId, nodeId);
}

const currentSpeakerIndex = computed(
    () => activeMeeting.value?.currentSpeakerIndex ?? 0,
);
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b">
            <h3 class="font-semibold mb-2">发言队列</h3>
            <p class="text-xs text-muted-foreground">
                拖拽调整发言顺序，或添加用户发言/任务节点
            </p>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-2">
            <VueDraggableNext
                v-model="queueNodes"
                :animation="150"
                handle=".drag-handle"
            >
                <div
                    v-for="(node, index) in queueNodes"
                    :key="node.id"
                    class="flex items-center gap-2 p-2 rounded-lg border bg-card group"
                    :class="{
                        'ring-2 ring-primary': index === currentSpeakerIndex,
                        'opacity-40': index < currentSpeakerIndex,
                    }"
                >
                    <!-- 拖拽手柄 -->
                    <div class="drag-handle cursor-move text-muted-foreground">
                        <GripVertical class="w-4 h-4" />
                    </div>

                    <!-- 序号 -->
                    <div
                        class="text-xs text-muted-foreground w-6 text-center shrink-0"
                    >
                        {{ index + 1 }}
                    </div>

                    <!-- 头像 -->
                    <div
                        class="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0"
                        :style="{
                            backgroundColor: getNodeDisplay(node).color + '20',
                        }"
                    >
                        {{ getNodeDisplay(node).avatar }}
                    </div>

                    <!-- 名称 -->
                    <div class="flex-1 min-w-0 text-sm truncate">
                        {{ getNodeDisplay(node).name }}
                    </div>

                    <!-- 删除按钮 -->
                    <Button
                        variant="ghost"
                        size="sm"
                        class="shrink-0 opacity-0 group-hover:opacity-100"
                        @click="removeFromQueue(node.id)"
                    >
                        <X class="w-3 h-3" />
                    </Button>
                </div>
            </VueDraggableNext>

            <div
                v-if="!queueNodes.length"
                class="text-center py-8 text-muted-foreground"
            >
                <p class="text-sm">队列为空</p>
                <p class="text-xs mt-1">会议开始时会自动生成队列</p>
            </div>
        </div>

        <div class="p-4 border-t space-y-2">
            <Button
                variant="outline"
                size="sm"
                class="w-full gap-2"
                @click="addUserToQueue"
            >
                <User class="w-4 h-4" />
                插入用户发言
            </Button>
            <Button
                variant="outline"
                size="sm"
                class="w-full gap-2"
                @click="addSummaryTask"
            >
                <ListTodo class="w-4 h-4" />
                插入总结任务
            </Button>
        </div>
    </div>
</template>
