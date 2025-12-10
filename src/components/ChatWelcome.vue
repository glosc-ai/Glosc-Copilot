<script setup lang="ts">
import { Bot } from "lucide-vue-next";

const chatStore = useChatStore();

const createNewChat = async () => {
    await chatStore.createNewConversation();
};
</script>

<template>
    <div
        class="flex flex-col items-center justify-center h-full text-center p-8 space-y-4"
    >
        <div class="bg-primary/10 p-6 rounded-full">
            <Bot class="w-12 h-12 text-primary" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight">
            欢迎使用 Gloss Copilot
        </h1>
        <p class="text-muted-foreground max-w-md">
            您的 AI 智能助手。从侧边栏选择一个对话或直接
            <Button @click="createNewChat">开始一个新的对话</Button>
        </p>
    </div>
</template>
