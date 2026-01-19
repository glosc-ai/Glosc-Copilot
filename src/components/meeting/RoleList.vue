<script setup lang="ts">
import { computed } from "vue";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";

defineProps<{
    meetingId: string;
}>();

const meetingStore = useMeetingStore();
const { currentRoles, activeMeeting } = storeToRefs(meetingStore);

const currentSpeakerId = computed(() => {
    const meeting = activeMeeting.value;
    if (!meeting || !meeting.speakerQueue) return null;

    const currentIndex = meeting.currentSpeakerIndex ?? 0;
    const currentNode = meeting.speakerQueue[currentIndex];

    if (currentNode?.type === "role") {
        return currentNode.roleId;
    }

    return null;
});
<<<<<<< HEAD

async function jumpToRole(roleId: string) {
    await meetingStore.jumpToRoleInQueue(props.meetingId, roleId);
}
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="p-4 border-b">
            <h3 class="font-semibold">会议角色</h3>
            <p class="text-xs text-muted-foreground mt-1">
                共 {{ currentRoles.length }} 个参与角色
            </p>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
            <div
                v-for="role in currentRoles"
                :key="role.id"
                class="p-3 rounded-lg border bg-card"
                :class="{
                    'ring-2 ring-primary': currentSpeakerId === role.id,
                }"
<<<<<<< HEAD
                role="button"
                tabindex="0"
                @click="jumpToRole(role.id)"
                @keydown.enter.prevent="jumpToRole(role.id)"
=======
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
            >
                <div class="flex items-center gap-3">
                    <div
                        class="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
<<<<<<< HEAD
<<<<<<< HEAD
                        :style="{
                            backgroundColor: (role.color || '#6b7280') + '20',
                        }"
=======
                        :style="{ backgroundColor: (role.color || '#6b7280') + '20' }"
>>>>>>> 6ffc780 (Add core meeting infrastructure: types, store, pages, and components)
=======
                        :style="{
                            backgroundColor: (role.color || '#6b7280') + '20',
                        }"
>>>>>>> 5e25028 (实现基础会议功能)
                    >
                        {{ role.avatar || "👤" }}
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-sm truncate">
                            {{ role.name }}
                        </h4>
                        <p class="text-xs text-muted-foreground truncate">
                            {{ role.modelId }}
                        </p>
                    </div>
                </div>
                <div
                    v-if="role.systemPrompt"
                    class="mt-2 text-xs text-muted-foreground line-clamp-2"
                >
                    {{ role.systemPrompt }}
                </div>
            </div>

            <div
                v-if="!currentRoles.length"
                class="text-center py-8 text-muted-foreground"
            >
                <p class="text-sm">还没有角色</p>
                <p class="text-xs mt-1">请在配置页面添加角色</p>
            </div>
        </div>
    </div>
</template>
