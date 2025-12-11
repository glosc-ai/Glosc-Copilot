<script setup lang="ts">
import ChatSidebar from "@/components/ChatSidebar.vue";
import ChatArea from "@/components/ChatArea.vue";
import ChatWelcome from "@/components/ChatWelcome.vue";
import SettingsModal from "@/components/SettingsModal.vue";
import { useChatStore } from "@/stores/chat";
import { storeToRefs } from "pinia";

const chatStore = useChatStore();
const { activeKey } = storeToRefs(chatStore);
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
