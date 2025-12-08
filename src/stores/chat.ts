import { defineStore } from "pinia";
import { h } from "vue";
import {
    FireOutlined,
    ReadOutlined,
    HeartOutlined,
    SmileOutlined,
    CommentOutlined,
} from "@ant-design/icons-vue";
import { Space } from "ant-design-vue";
import { streamText, type ModelMessage } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { storeUtils } from "../utils/StoreUtils";
import type {
    AttachmentsProps,
    PromptsProps,
    BubbleListProps,
} from "ant-design-x-vue";

function renderTitle(icon: any, title: string) {
    return h(Space, { align: "start" }, () => [icon, h("span", title)]);
}

export type ChatMessage = ModelMessage & { id: string; status?: string };

export const useChatStore = defineStore("chat", {
    state: () => ({
        headerOpen: false,
        settingsOpen: false,
        content: "",
        conversationsItems: [
            {
                key: "0",
                label: "什么是 Ant Design X？",
            },
        ],
        activeKey: "0",
        attachedFiles: [] as AttachmentsProps["items"],
        agentRequestLoading: false,
        messages: [] as ChatMessage[],
    }),
    getters: {
        placeholderPromptsItems(): PromptsProps["items"] {
            return [
                {
                    key: "1",
                    label: renderTitle(
                        h(FireOutlined, { style: { color: "#FF4D4F" } }),
                        "热门话题"
                    ),
                    description: "你对什么感兴趣？",
                    children: [
                        {
                            key: "1-1",
                            description: `X 有什么新功能？`,
                        },
                        {
                            key: "1-2",
                            description: `什么是 AGI？`,
                        },
                        {
                            key: "1-3",
                            description: `文档在哪里？`,
                        },
                    ],
                },
                {
                    key: "2",
                    label: renderTitle(
                        h(ReadOutlined, { style: { color: "#1890FF" } }),
                        "设计指南"
                    ),
                    description: "如何设计一个好产品？",
                    children: [
                        {
                            key: "2-1",
                            icon: h(HeartOutlined),
                            description: `深入了解`,
                        },
                        {
                            key: "2-2",
                            icon: h(SmileOutlined),
                            description: `设定 AI 角色`,
                        },
                        {
                            key: "2-3",
                            icon: h(CommentOutlined),
                            description: `表达感受`,
                        },
                    ],
                },
            ];
        },
        senderPromptsItems(): PromptsProps["items"] {
            return [
                {
                    key: "1",
                    description: "热门话题",
                    icon: h(FireOutlined, { style: { color: "#FF4D4F" } }),
                },
                {
                    key: "2",
                    description: "设计指南",
                    icon: h(ReadOutlined, { style: { color: "#1890FF" } }),
                },
            ];
        },
        roles() {
            return {
                assistant: {
                    placement: "start",
                    typing: { step: 5, interval: 20 },
                    styles: {
                        content: {
                            borderRadius: "16px",
                        },
                    },
                },
                user: {
                    placement: "end",
                    variant: "shadow",
                },
            };
        },
    },
    actions: {
        async onRequest(content: string) {
            const userMsgId = Date.now().toString();
            this.messages.push({
                id: userMsgId,
                content: content,
                role: "user",
                status: "success",
            });

            this.agentRequestLoading = true;
            const aiMsgId = (Date.now() + 1).toString();

            // 先添加一个空的 AI 消息占位
            this.messages.push({
                id: aiMsgId,
                content: "",
                role: "assistant",
                status: "loading",
            });

            try {
                const apiKey = await storeUtils.get<string>("apiKey");
                if (!apiKey) {
                    const msg = (this.messages as ChatMessage[]).find(
                        (m) => m.id === aiMsgId
                    );
                    if (msg) {
                        msg.content = "请先在设置中配置 API Key";
                        msg.status = "error";
                    }
                    return;
                }

                const deepseek = createDeepSeek({ apiKey });

                // 过滤历史消息，排除当前正在生成的 AI 消息
                const history = (this.messages as ChatMessage[])
                    .filter((m) => m.status === "success" && m.id !== aiMsgId)
                    .map((m) => ({ role: m.role, content: m.content }));

                const { textStream } = streamText({
                    model: deepseek("deepseek-chat"),
                    messages: history as any,
                });

                for await (const textPart of textStream) {
                    const msg = (this.messages as ChatMessage[]).find(
                        (m) => m.id === aiMsgId
                    );
                    if (msg) {
                        msg.content += textPart;
                    }
                }

                const msg = this.messages.find((m) => m.id === aiMsgId);
                if (msg) {
                    msg.status = "success";
                }
            } catch (error) {
                console.error(error);
                const msg = this.messages.find((m) => m.id === aiMsgId);
                if (msg) {
                    msg.content = "请求失败，请检查网络或 API Key";
                    msg.status = "error";
                }
            } finally {
                this.agentRequestLoading = false;
            }
        },
        onSubmit(nextContent: string) {
            if (!nextContent) return;
            this.onRequest(nextContent);
            this.content = "";
        },
        onPromptsItemClick(info: any) {
            this.onRequest(info.data.description as string);
        },
        onAddConversation() {
            this.conversationsItems.push({
                key: `${this.conversationsItems.length}`,
                label: `新会话 ${this.conversationsItems.length}`,
            });
            this.activeKey = `${this.conversationsItems.length - 1}`;
            this.messages = [];
        },
        onConversationClick(key: string) {
            this.activeKey = key;
            this.messages = [];
        },
        handleFileChange(info: any) {
            this.attachedFiles = info.fileList;
        },
        setMessages(messages: any[]) {
            this.messages = messages;
        },
    },
});
