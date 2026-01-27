<script setup lang="ts">
import {
    Bot,
    MessageSquarePlus,
    Code2,
    TerminalSquare,
    PenLine,
    Lightbulb,
} from "lucide-vue-next";

// useChatStore is auto-imported

const chatStore = useChatStore();

const examples = [
    {
        icon: Code2,
        title: "代码解释",
        description: "解释这段 TypeScript 代码的作用...",
        prompt: "请解释一下这段 TypeScript 代码的作用和原理：\n\n",
    },
    {
        icon: TerminalSquare,
        title: "命令生成",
        description: "如何使用 kubectl 查看 pod 日志...",
        prompt: "请告诉我如何使用 kubectl 查看 Kubernetes pod 的日志，包括常用的参数选项。",
    },
    {
        icon: PenLine,
        title: "代码重构",
        description: "重构这个组件以提高可复用性...",
        prompt: "我有以下的 Vue 组件代码，请帮我重构它以提高可复用性和可维护性：\n\n",
    },
    {
        icon: Lightbulb,
        title: "概念学习",
        description: "解释什么是 Reactivity System...",
        prompt: "请深入浅出地解释 Vue 3 的响应式系统（Reactivity System）是如何工作的。",
    },
];

const createNewChat = async () => {
    await chatStore.createNewConversation();
};

const startWithPrompt = async (prompt: string) => {
    chatStore.content = prompt;
    await chatStore.createNewConversation();
};
</script>

<template>
    <div class="h-full overflow-y-auto w-full">
        <div
            class="flex flex-col items-center justify-center min-h-full py-12 px-4 space-y-10 max-w-5xl mx-auto"
        >
            <!-- Hero Section -->
            <div
                class="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-700"
            >
                <div
                    class="mx-auto w-24 h-24 bg-linear-to-br from-primary/20 to-primary/5 rounded-4xl flex items-center justify-center shadow-inner"
                >
                    <Bot class="w-12 h-12 text-primary" />
                </div>
                <div class="space-y-2">
                    <h1
                        class="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-foreground to-foreground/70"
                    >
                        欢迎使用 Glosc Copilot
                    </h1>
                    <p class="text-xl text-muted-foreground max-w-150 mx-auto">
                        您的智能 AI
                        编程助手。我可以帮您编写代码、解答疑问、或者仅仅是聊聊天。
                    </p>
                </div>
                <div>
                    <Button
                        size="lg"
                        @click="createNewChat"
                        class="h-12 px-8 text-base shadow-lg hover:shadow-xl transition-all"
                    >
                        <MessageSquarePlus class="w-5 h-5 mr-2" />
                        开始一个新的对话
                    </Button>
                </div>
            </div>

            <!-- Suggestions Grid -->
            <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 w-full max-w-3xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200"
            >
                <Card
                    v-for="(item, index) in examples"
                    :key="index"
                    class="cursor-pointer hover:bg-muted/50 transition-colors border-muted hover:border-primary/20 group backdrop-blur-sm bg-card/50"
                    @click="startWithPrompt(item.prompt)"
                >
                    <CardHeader
                        class="flex flex-row items-center gap-4 space-y-0 pb-2"
                    >
                        <div
                            class="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                        >
                            <component :is="item.icon" class="w-5 h-5" />
                        </div>
                        <CardTitle class="text-base">
                            {{ item.title }}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <CardDescription class="text-sm">
                            {{ item.description }}
                        </CardDescription>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
</template>
