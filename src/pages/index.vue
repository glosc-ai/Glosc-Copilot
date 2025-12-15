<script setup lang="ts">
import ChatSidebar from "@/components/ChatSidebar.vue";
import ChatArea from "@/components/ChatArea.vue";
import ChatWelcome from "@/components/ChatWelcome.vue";
import SettingsModal from "@/components/SettingsModal.vue";
import { useChatStore } from "@/stores/chat";
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted } from "vue";

const chatStore = useChatStore();
const { activeKey } = storeToRefs(chatStore);

onMounted(async () => {
    // 关键：从本地 store 恢复会话，否则重启后列表会像“被清空”
    await chatStore.init();
});

const handleVisibilityOrUnload = () => {
    // 兜底：窗口关闭/切后台时尽量落盘
    void chatStore.saveImmediately();
};

const handleVisibilityChange = () => {
    if (document.visibilityState !== "visible") {
        handleVisibilityOrUnload();
    }
};

onMounted(() => {
    window.addEventListener("beforeunload", handleVisibilityOrUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
});

onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", handleVisibilityOrUnload);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
    <div
        class="flex flex-col h-[calc(100vh-40px)] overflow-hidden bg-background text-foreground"
    >
        <div class="flex flex-1 overflow-hidden">
            <ChatSidebar />
            <main class="flex-1 relative min-w-0">
                <ChatArea v-if="activeKey" />
                <ChatWelcome v-else />
            </main>
        </div>
        <SettingsModal />
    </div>
</template>
