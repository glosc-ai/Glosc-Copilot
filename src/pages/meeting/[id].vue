<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-vue-next";

import MeetingConfig from "@/components/meeting/MeetingConfig.vue";
import MeetingRoom from "@/components/meeting/MeetingRoom.vue";

const route = useRoute();
const router = useRouter();
const meetingStore = useMeetingStore();
const { activeMeeting } = storeToRefs(meetingStore);

const meetingId = computed(() => (route.params as any).id as string);
const activeTab = ref<"config" | "room">("config");

onMounted(async () => {
    await meetingStore.init();
    if (meetingId.value) {
        await meetingStore.selectMeeting(meetingId.value);
    }
});

function goBack() {
    router.push("/meeting");
}

function switchToRoom() {
    activeTab.value = "room";
}
</script>

<template>
    <div
        class="flex h-[calc(100vh-40px)] overflow-hidden bg-background text-foreground"
    >
        <div class="flex-1 flex flex-col overflow-hidden">
            <!-- Header -->
            <div class="border-b px-4 py-3 flex items-center gap-4">
                <Button variant="ghost" size="sm" @click="goBack" class="gap-2">
                    <ArrowLeft class="w-4 h-4" />
                    返回列表
                </Button>
                <div class="flex-1 min-w-0">
                    <h1 class="text-lg font-semibold truncate">
                        {{ activeMeeting?.title || "加载中..." }}
                    </h1>
                </div>
            </div>

            <!-- Tabs -->
            <Tabs
                v-model="activeTab"
                class="flex-1 flex flex-col overflow-hidden"
            >
                <TabsList class="mx-4 mt-3 w-fit">
                    <TabsTrigger value="config">会议配置</TabsTrigger>
                    <TabsTrigger value="room">会议室</TabsTrigger>
                </TabsList>

                <TabsContent value="config" class="flex-1 overflow-hidden mt-0">
                    <MeetingConfig
                        v-if="activeMeeting"
                        :meeting-id="meetingId"
                        @start-meeting="switchToRoom"
                    />
                </TabsContent>

                <TabsContent value="room" class="flex-1 overflow-hidden mt-0">
                    <MeetingRoom v-if="activeMeeting" :meeting-id="meetingId" />
                </TabsContent>
            </Tabs>
        </div>
    </div>
</template>
