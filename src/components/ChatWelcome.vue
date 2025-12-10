<script setup lang="ts">
import { Bot } from "lucide-vue-next";
</script>

<template>
    <div
        class="flex flex-col items-center justify-center h-full text-center p-8 space-y-4"
    >
        <div class="bg-primary/10 p-6 rounded-full">
            <Bot class="w-12 h-12 text-primary" />
        </div>
        <h1 class="text-2xl font-bold tracking-tight">
            Welcome to Gloss Copilot
        </h1>
        <p class="text-muted-foreground max-w-md">
            Your AI-powered assistant. Select a conversation from the sidebar or
            start a new one to begin.
        </p>
    </div>
</template>
