<script setup lang="ts">
// import { type ToolInvocation } from "ai";
import { Loader2, Wrench, ChevronDown, ChevronRight } from "lucide-vue-next";
import { ref } from "vue";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";

defineProps<{
    toolInvocation: any;
}>();

const isOpen = ref(false);
</script>

<template>
    <div class="my-2">
        <div
            v-if="toolInvocation.state === 'call'"
            class="flex items-center gap-2 text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30"
        >
            <Loader2 class="h-4 w-4 animate-spin" />
            <span
                >正在调用工具
                <span class="font-medium text-foreground">{{
                    toolInvocation.toolName
                }}</span
                >...</span
            >
        </div>

        <Collapsible
            v-else
            v-model:open="isOpen"
            class="border rounded-md bg-muted/30 overflow-hidden"
        >
            <CollapsibleTrigger
                class="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
            >
                <Wrench class="h-4 w-4 text-primary" />
                <span class="font-medium"
                    >已调用 {{ toolInvocation.toolName }}</span
                >
                <div
                    class="ml-auto flex items-center gap-1 text-xs text-muted-foreground"
                >
                    <span>查看详情</span>
                    <ChevronDown v-if="isOpen" class="h-3 w-3" />
                    <ChevronRight v-else class="h-3 w-3" />
                </div>
            </CollapsibleTrigger>

            <CollapsibleContent
                class="border-t bg-background/50 px-3 py-2 text-xs font-mono"
            >
                <div class="mb-2">
                    <div class="text-muted-foreground mb-1">参数:</div>
                    <div
                        class="bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all"
                    >
                        {{ JSON.stringify(toolInvocation.args, null, 2) }}
                    </div>
                </div>
                <div>
                    <div class="text-muted-foreground mb-1">结果:</div>
                    <div
                        class="bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap break-all"
                    >
                        {{
                            typeof toolInvocation.result === "string"
                                ? toolInvocation.result
                                : JSON.stringify(toolInvocation.result, null, 2)
                        }}
                    </div>
                </div>
            </CollapsibleContent>
        </Collapsible>
    </div>
</template>
