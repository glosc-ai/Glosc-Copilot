<script setup lang="ts">
const computerStore = useComputerControlStore();
</script>

<template>
    <div class="space-y-1">
        <div
            v-if="computerStore.actionLog.length === 0"
            class="text-sm text-muted-foreground py-4 text-center"
        >
            暂无操作记录
        </div>
        <div
            v-for="log in computerStore.recentActions"
            :key="log.id"
            class="flex items-start gap-2 p-2 rounded text-xs font-mono hover:bg-muted/50"
        >
            <span
                class="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5"
                :class="log.success ? 'bg-green-500' : 'bg-red-500'"
            />
            <div class="min-w-0 flex-1 space-y-0.5">
                <div class="font-semibold text-foreground">{{ log.tool }}</div>
                <div
                    v-if="Object.keys(log.input).length"
                    class="text-muted-foreground"
                >
                    {{ JSON.stringify(log.input) }}
                </div>
                <div v-if="log.result" class="text-muted-foreground truncate">
                    {{ log.result }}
                </div>
            </div>
            <span class="shrink-0 text-muted-foreground">
                {{ new Date(log.timestamp).toLocaleTimeString() }}
            </span>
        </div>
    </div>
</template>
