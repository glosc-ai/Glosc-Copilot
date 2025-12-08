<script setup lang="ts">
import { computed, h } from "vue";
import { Badge, Button, Flex, Typography } from "ant-design-vue";
import {
    PaperClipOutlined,
    CloudUploadOutlined,
    UserOutlined,
} from "@ant-design/icons-vue";
import {
    Bubble,
    Prompts,
    Sender,
    Attachments,
    type BubbleListProps,
} from "ant-design-x-vue";
import { useChatStore, type ChatMessage } from "../stores/chat";
import ChatWelcome from "./ChatWelcome.vue";
import MarkdownIt from "markdown-it";

const store = useChatStore();
const md = MarkdownIt({ html: true, breaks: true });

const renderMarkdown = (content: string) => {
    return h(Typography, null, {
        default: () => h("div", { innerHTML: md.render(content) }),
    });
};

const items = computed<BubbleListProps["items"]>(() => {
    if (store.messages.length === 0) {
        return [
            {
                content: h(ChatWelcome),
                variant: "borderless",
            },
        ];
    }
    return (store.messages as ChatMessage[]).map(
        ({ id, content, role, status }) => ({
            key: id,
            loading: status === "loading",
            role: role,
            content: content,
        })
    );
});

const fooAvatar = {
    color: "#f56a00",
    backgroundColor: "#fde3cf",
};

const barAvatar = {
    color: "#fff",
    backgroundColor: "#87d068",
};
</script>

<template>
    <div class="h-full w-full mx-auto box-border flex flex-col p-6 gap-4">
        <!-- 🌟 消息列表 -->
        <div class="flex-1 overflow-y-auto flex flex-col gap-4">
            <Bubble
                v-for="item in items"
                :typing="true"
                :key="item.key || 'welcome'"
                :content="item.content"
                :placement="item.role == 'user' ? 'end' : 'start'"
            >
                <template #avatar>
                    <Avatar
                        v-if="item.role == 'user'"
                        :icon="h(UserOutlined)"
                        :style="fooAvatar"
                    />
                    <Avatar
                        v-if="item.role == 'assistant'"
                        :icon="h(UserOutlined)"
                        :style="barAvatar"
                    />
                </template>
            </Bubble>
        </div>

        <!-- 🌟 提示词 -->
        <Prompts
            class="text-black dark:text-amber-50"
            :items="store.senderPromptsItems"
            @item-click="store.onPromptsItemClick"
        />

        <!-- 🌟 输入框 -->
        <Sender
            :value="store.content"
            class="shadow-md"
            :loading="store.agentRequestLoading"
            @submit="store.onSubmit"
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
