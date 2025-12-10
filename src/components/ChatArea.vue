<script setup lang="ts">
import { Badge, Button, Flex, Typography } from "ant-design-vue";
import {
    PaperClipOutlined,
    CloudUploadOutlined,
    UserOutlined,
    ThunderboltOutlined,
} from "@ant-design/icons-vue";
import {
    BubbleList,
    Prompts,
    Sender,
    Attachments,
    type BubbleListProps,
} from "ant-design-x-vue";
import { Chat } from "@ai-sdk/vue";
import { DefaultChatTransport } from "ai";
import ChatWelcome from "./ChatWelcome.vue";
import { formatModelName, groupModelsByProvider } from "../utils/ModelApi";
import MarkdownIt from "markdown-it";

const store = useChatStore();
const md = MarkdownIt({ html: true, breaks: true });

// 模型相关
const modelsByProvider = computed(() => {
    return groupModelsByProvider(store.availableModels);
});

const providerNames = computed(() => {
    return Object.keys(modelsByProvider.value).sort();
});

// Cascader 数据结构
const cascaderOptions = computed(() => {
    return providerNames.value.map((provider) => ({
        value: provider,
        label: provider,
        children: modelsByProvider.value[provider].map((model) => ({
            value: model.id,
            label: model.name || formatModelName(model.id),
            description: model.description,
            tags: model.tags,
            context_window: model.context_window,
            pricing: model.pricing,
        })),
    }));
});

const cascaderValue = computed({
    get: () => {
        if (store.selectedModel) {
            return [
                store.selectedModel.owned_by || "unknown",
                store.selectedModel.id,
            ];
        }
        return [];
    },
    set: (value: any[]) => {
        if (value && value.length === 2) {
            const model = store.availableModels.find((m) => m.id === value[1]);
            store.selectModel(model || null);
        }
    },
});

const handleModelChange = (value: any) => {
    if (Array.isArray(value) && value.length === 2) {
        const model = store.availableModels.find((m) => m.id === value[1]);
        store.selectModel(model || null);
    }
};

// Element Plus Cascader 过滤方法
const filterMethod = (node: any, keyword: string) => {
    const searchText = keyword.toLowerCase();
    const label = node.label?.toLowerCase() || "";
    const desc = node.data?.description?.toLowerCase() || "";
    return label.includes(searchText) || desc.includes(searchText);
};

// 初始化加载模型和会话
onMounted(async () => {
    // 初始化 store
    await store.init();

    // 加载模型列表
    if (store.availableModels.length === 0) {
        store.loadAvailableModels();
    }
});

// 使用 Chat 实例
const chat = new Chat({
    transport: new DefaultChatTransport({
        api:
            (import.meta.env.VITE_API_HOST || "http://localhost:3000") +
            "/api/chat",
        body: {
            model: store.selectedModel?.id || "xai/grok-4",
        },
    }),
});

const renderMarkdown = (content: string) => {
    return h(Typography, null, {
        default: () => h("div", { innerHTML: md.render(content) }),
    });
};

// 访问 Chat 的状态（使用公共 getter）
const messages = computed(() => chat.messages);
const chatStatus = computed(() => chat.status);

// 获取当前会话的历史消息
const currentConversation = computed(() => {
    return store.activeKey ? store.conversations[store.activeKey] : null;
});

// 将 UIMessage 转换为 BubbleList items
const items = computed<BubbleListProps["items"]>(() => {
    const conversation = currentConversation.value;

    // 如果没有会话或没有消息，显示欢迎页
    if (!conversation || conversation.messages.length === 0) {
        return [
            {
                key: "welcome",
                content: h(ChatWelcome, { onPromptsItemClick }),
                variant: "borderless",
            },
        ];
    }

    // 显示历史消息
    return conversation.messages.map((msg) => ({
        key: msg.id,
        role: msg.role,
        content: msg.content,
        loading: false,
    }));
});

const fooAvatar = {
    color: "#f56a00",
    backgroundColor: "#fde3cf",
};

const barAvatar = {
    color: "#fff",
    backgroundColor: "#87d068",
};

const roles: BubbleListProps["roles"] = {
    assistant: {
        placement: "start",
        avatar: { icon: h(UserOutlined), style: barAvatar },
        typing: { step: 5, interval: 20 },
        messageRender: renderMarkdown,
        style: {
            maxWidth: "600px",
        },
        variant: "filled",
    },
    user: {
        placement: "end",
        avatar: { icon: h(UserOutlined), style: fooAvatar },
        messageRender: renderMarkdown,
        variant: "filled",
    },
};

// 处理提示词点击
const onPromptsItemClick = (info: any) => {
    const content = info.data.description as string;
    if (content) {
        chat.sendMessage({
            text: content,
        });
    }
};

// AI 响应状态跟踪
const isWaitingResponse = ref(false);
const currentAssistantMsgId = ref<string | null>(null);

// 处理提交
const onSubmit = async (content: string) => {
    if (!content || !store.activeKey) return;

    // 保存用户消息（立即保存用户输入）
    await store.addMessage(
        store.activeKey,
        {
            role: "user",
            content: content,
        },
        true
    );

    // 标记正在等待响应
    isWaitingResponse.value = true;
    currentAssistantMsgId.value = null;

    // 发送消息到 AI
    chat.sendMessage({ text: content });
    store.content = "";
};

// 监听 AI 响应并保存
watch(
    () => messages.value,
    async (newMessages) => {
        if (!store.activeKey || !isWaitingResponse.value) return;

        // 检查是否有新的 assistant 消息
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
            // 提取消息内容
            let content = "";
            for (const part of lastMessage.parts) {
                if (part.type === "text") {
                    content += part.text;
                }
            }

            if (content) {
                // 如果还没有创建 assistant 消息，创建一个（不立即保存）
                if (!currentAssistantMsgId.value) {
                    const msg = await store.addMessage(
                        store.activeKey,
                        {
                            role: "assistant",
                            content: content,
                        },
                        false
                    );
                    currentAssistantMsgId.value = msg?.id || null;
                } else {
                    // 更新现有消息（不立即保存，等流式完成）
                    await store.updateMessage(
                        store.activeKey,
                        currentAssistantMsgId.value,
                        { content },
                        false
                    );
                }

                // 如果流式传输完成，立即保存所有更改
                if (chatStatus.value === "ready") {
                    await store.saveImmediately();
                    isWaitingResponse.value = false;
                    currentAssistantMsgId.value = null;
                }
            }
        }
    },
    { deep: true }
);

// 组件卸载时保存待保存的更改
onUnmounted(() => {
    if (store.hasPendingChanges) {
        store.saveImmediately();
    }
});
</script>

<template>
    <div class="h-full w-full mx-auto box-border flex flex-col p-6 gap-4">
        <!-- 🌟 消息列表 -->
        <BubbleList
            class="flex-1 overflow-y-auto"
            :items="items"
            :roles="roles"
        />

        <!-- 🌟 提示词 -->
        <Prompts
            class="text-black dark:text-amber-50"
            :items="store.senderPromptsItems"
            @item-click="onPromptsItemClick"
        />

        <!-- 🌟 输入框 -->
        <Sender
            :value="store.content"
            class="shadow-md"
            :loading="chatStatus === 'submitted' || chatStatus === 'streaming'"
            @submit="onSubmit"
            @change="(value) => (store.content = value)"
        >
            <template #prefix>
                <Badge
                    :dot="store.attachedFiles.length > 0 && !store.headerOpen"
                >
                    <Button
                        type="text"
                        @click="() => (store.headerOpen = !store.headerOpen)"
                    >
                        <template #icon>
                            <PaperClipOutlined />
                        </template>
                    </Button>
                </Badge>
            </template>

            <template #footer>
                <div
                    class="flex items-center gap-3 px-3 py-2 border-t border-gray-200 dark:border-gray-700"
                >
                    <div class="flex items-center gap-2 text-xs">
                        <ThunderboltOutlined class="text-blue-500" />
                        <span class="text-gray-600 dark:text-gray-400"
                            >模型:</span
                        >
                    </div>
                    <el-cascader
                        v-model="cascaderValue"
                        @change="handleModelChange"
                        :options="cascaderOptions"
                        size="small"
                        class="cascader-model-selector"
                        filterable
                        :filter-method="filterMethod"
                        placeholder="选择模型"
                        :props="{
                            expandTrigger: 'hover',
                            value: 'value',
                            label: 'label',
                            children: 'children',
                        }"
                        clearable
                        :show-all-levels="true"
                    >
                        <template #default="{ data }">
                            <!-- 模型选项（叶子节点）-->
                            <div
                                v-if="!data.children"
                                class="model-option py-1"
                            >
                                <div class="flex items-start gap-2">
                                    <div
                                        class="flex-1 max-w-[300px] group group-2"
                                        :title="data.description"
                                    >
                                        <div
                                            class="flex items-center gap-2 mb-0.5"
                                        >
                                            <span
                                                class="font-semibold text-sm truncate"
                                            >
                                                {{ data.label }}
                                            </span>
                                            <span
                                                class="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shrink-0"
                                            >
                                                {{ data.value.split("/")[0] }}
                                            </span>
                                        </div>
                                        <div
                                            class="flex items-center gap-2 flex-wrap mb-1"
                                        >
                                            <div
                                                v-if="
                                                    data.tags &&
                                                    data.tags.length > 0
                                                "
                                                class="flex gap-1"
                                            >
                                                <span
                                                    v-for="tag in data.tags.slice(
                                                        0,
                                                        3
                                                    )"
                                                    :key="tag"
                                                    class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                                >
                                                    {{ tag }}
                                                </span>
                                            </div>
                                        </div>

                                        <div
                                            class="flex items-center gap-3 text-xs text-gray-500"
                                        >
                                            <span
                                                v-if="data.context_window"
                                                title="上下文窗口"
                                                class="flex items-center gap-1"
                                            >
                                                <span>📝</span>
                                                <span
                                                    >{{
                                                        (
                                                            data.context_window /
                                                            1000
                                                        ).toFixed(0)
                                                    }}K</span
                                                >
                                            </span>
                                            <span
                                                v-if="data.pricing"
                                                title="定价"
                                                class="flex items-center gap-1 text-green-600 dark:text-green-400"
                                            >
                                                <span>💰</span>
                                                <span
                                                    >${{
                                                        data.pricing.input
                                                    }}/${{
                                                        data.pricing.output
                                                    }}</span
                                                >
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 提供商选项（父节点）-->
                            <div v-else class="provider-option">
                                <span class="font-medium">{{
                                    data.label
                                }}</span>
                                <span class="text-xs text-gray-400 ml-2"
                                    >({{ data.children?.length || 0 }} )</span
                                >
                            </div>
                        </template>
                    </el-cascader>
                    <div class="flex items-center gap-2 text-xs">
                        <span
                            v-if="store.isLoadingModels"
                            class="text-gray-400 dark:text-gray-500"
                        >
                            🔄 加载中...
                        </span>
                        <template v-else>
                            <span
                                v-if="store.selectedModel"
                                class="text-gray-500 dark:text-gray-400"
                                :title="store.selectedModel.description"
                            >
                                {{
                                    store.selectedModel.name ||
                                    formatModelName(store.selectedModel.id)
                                }}
                            </span>
                            <span
                                v-if="store.selectedModel?.context_window"
                                class="text-gray-400 dark:text-gray-500"
                            >
                                |
                                {{
                                    (
                                        store.selectedModel.context_window /
                                        1000
                                    ).toFixed(0)
                                }}K
                            </span>
                            <span
                                v-if="store.selectedModel?.pricing"
                                class="text-green-600 dark:text-green-400"
                                title="每 token 定价"
                                >${{ store.selectedModel.pricing.input }}/${{
                                    store.selectedModel.pricing.output
                                }}</span
                            >
                        </template>
                    </div>
                </div>
            </template>

            <template #header>
                <Sender.Header
                    class="text-black dark:text-amber-50"
                    title="附件"
                    :open="store.headerOpen"
                    :styles="{ content: { padding: 0 } }"
                    @open-change="(open) => (store.headerOpen = open)"
                >
                    <Attachments
                        :before-upload="() => false"
                        :items="store.attachedFiles"
                        @change="store.handleFileChange"
                    >
                        <template #placeholder="type">
                            <Flex
                                v-if="type && type.type === 'inline'"
                                align="center"
                                justify="center"
                                vertical
                                gap="2"
                            >
                                <Typography.Text
                                    style="font-size: 30px; line-height: 1"
                                >
                                    <CloudUploadOutlined />
                                </Typography.Text>
                                <Typography.Title
                                    :level="5"
                                    style="
                                        margin: 0;
                                        font-size: 14px;
                                        line-height: 1.5;
                                    "
                                    content="上传文件"
                                />
                                <Typography.Text
                                    type="secondary"
                                    content="点击或拖拽文件到此区域上传"
                                />
                            </Flex>
                            <Typography.Text
                                v-if="type && type.type === 'drop'"
                                content="释放文件到此处"
                            />
                        </template>
                    </Attachments>
                </Sender.Header>
            </template>
        </Sender>
    </div>
</template>

<style scoped lang="less">
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-clamp: 2;
}
</style>
<style lang="less">
.el-cascader-menu:last-child .el-cascader-node {
    height: 70px;
}
</style>
