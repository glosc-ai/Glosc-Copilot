<script setup lang="ts">
import ChatSidebar from "@/components/ChatSidebar.vue";
</script>

<template>
    <div
        class="flex flex-col h-[calc(100vh-40px)] overflow-hidden bg-background text-foreground"
    >
        <div class="flex flex-1 overflow-hidden">
            <ChatSidebar />
            <main class="flex-1 relative min-w-0 overflow-auto p-6">
                <h1 class="text-xl font-semibold">任务模式</h1>
                <p class="mt-2 text-sm text-muted-foreground">
                    占位页面：后续在这里实现任务管理相关功能。
                </p>
            </main>
        </div>
    </div>
</template>
