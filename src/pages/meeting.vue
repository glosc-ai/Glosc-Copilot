<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from "@/components/ui/card";
import { Plus, Users, MessageSquare, Calendar, Trash2 } from "lucide-vue-next";
import { useMeetingStore } from "@/stores/meeting";
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import { useRouter } from "vue-router";

const meetingStore = useMeetingStore();
const { meetingsItems } = storeToRefs(meetingStore);
const router = useRouter();

onMounted(async () => {
    await meetingStore.init();
});

async function createNewMeeting() {
    const id = await meetingStore.createMeeting();
    // 跳转到会议配置页面
    router.push(`/meeting/${id}`);
}

function openMeeting(id: string) {
    router.push(`/meeting/${id}`);
}

async function deleteMeeting(id: string, event: Event) {
    event.stopPropagation();
    if (confirm("确定要删除此会议吗？此操作无法撤销。")) {
        await meetingStore.deleteMeeting(id);
    }
}

function formatDate(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date >= today) {
        return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    } else if (date >= yesterday) {
        return `昨天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
    } else {
        return date.toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    }
}
</script>

<template>
    <div class="h-[calc(100vh-40px)] overflow-auto bg-background text-foreground">
        <div class="max-w-7xl mx-auto p-6">
            <!-- Header -->
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h1 class="text-3xl font-bold">AI 会议</h1>
                    <p class="text-muted-foreground mt-1">
                        创建多智能体协作会议，让AI角色们一起讨论和解决问题
                    </p>
                </div>
                <Button @click="createNewMeeting" class="gap-2">
                    <Plus class="w-4 h-4" />
                    创建新会议
                </Button>
            </div>

            <!-- Empty State -->
            <div
                v-if="meetingsItems.length === 0"
                class="flex flex-col items-center justify-center py-20"
            >
                <Users class="w-16 h-16 text-muted-foreground mb-4" />
                <h2 class="text-xl font-semibold mb-2">还没有会议</h2>
                <p class="text-muted-foreground mb-6">
                    创建你的第一个AI会议，让多个智能体协作讨论
                </p>
                <Button @click="createNewMeeting" class="gap-2">
                    <Plus class="w-4 h-4" />
                    创建新会议
                </Button>
            </div>

            <!-- Meeting Cards -->
            <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card
                    v-for="meeting in meetingsItems"
                    :key="meeting.key"
                    class="cursor-pointer hover:shadow-lg transition-shadow"
                    @click="openMeeting(meeting.key)"
                >
                    <CardHeader>
                        <div class="flex items-start justify-between">
                            <div class="flex-1 min-w-0">
                                <CardTitle class="truncate">
                                    {{ meeting.label }}
                                </CardTitle>
                                <CardDescription class="mt-1 line-clamp-2">
                                    {{ meeting.summary }}
                                </CardDescription>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                class="ml-2 shrink-0"
                                @click="deleteMeeting(meeting.key, $event)"
                            >
                                <Trash2 class="w-4 h-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div class="flex items-center gap-4 text-sm text-muted-foreground">
                            <div class="flex items-center gap-1">
                                <Users class="w-4 h-4" />
                                <span>{{ meeting.roleCount }} 个角色</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <MessageSquare class="w-4 h-4" />
                                <span>{{ meeting.messageCount }} 条消息</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                            <Calendar class="w-3 h-3" />
                            <span>{{ formatDate(meeting.timestamp) }}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
</template>
