<script setup lang="ts">
import ChatSidebar from "../components/ChatSidebar.vue";
import ChatArea from "../components/ChatArea.vue";
import SettingsModal from "../components/SettingsModal.vue";

defineOptions({ name: "PlaygroundIndependentSetup" });
</script>

<template>
    <div
        class="w-full min-w-[970px] h-screen rounded-lg flex bg-amber-50 dark:bg-[#141414] font-['AlibabaPuHuiTi',sans-serif]"
    >
        <ChatSidebar />
        <ChatArea />
        <SettingsModal />
    </div>
</template>
