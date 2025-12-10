<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2 } from "lucide-vue-next";
import { useChatStore } from "@/stores/chat";
import { storeToRefs } from "pinia";
import { cn } from "@/lib/utils";

const chatStore = useChatStore();
const { conversationsItems, activeKey } = storeToRefs(chatStore);

const createNewChat = async () => {
    await chatStore.createNewConversation();
};

const selectChat = (key: string) => {
    activeKey.value = key;
};

const deleteChat = async (key: string, event: Event) => {
    event.stopPropagation();
    await chatStore.deleteConversation(key);
};
</script>

<template>
    <div class="flex flex-col h-full border-r bg-muted/10 w-64">
        <div class="p-4">
            <Button
                @click="createNewChat"
                class="w-full justify-start gap-2"
                variant="default"
            >
                <Plus class="w-4 h-4" />
                新建对话
            </Button>
        </div>

        <div class="flex-1 overflow-y-auto px-2">
            <div class="space-y-1">
                <div
                    v-for="item in conversationsItems"
                    :key="item.key"
                    @click="selectChat(item.key)"
                    :class="
                        cn(
                            'flex items-center justify-between p-2 rounded-md cursor-pointer text-sm transition-colors group',
                            activeKey === item.key
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-accent/50 text-muted-foreground'
                        )
                    "
                >
                    <div class="flex items-center gap-2 overflow-hidden">
                        <MessageSquare class="w-4 h-4 shrink-0" />
                        <span class="truncate">{{ item.label }}</span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        @click="(e: any) => deleteChat(item.key, e)"
                    >
                        <Trash2 class="w-3 h-3" />
                    </Button>
                </div>
            </div>
        </div>
    </div>
</template>
