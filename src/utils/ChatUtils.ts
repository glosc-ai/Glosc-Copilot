import { createGateway } from "@ai-sdk/gateway";
import { ref, type Ref, reactive } from "vue";
import {
    ModelMessage,
    streamText,
    DefaultChatTransport,
    lastAssistantMessageIsCompleteWithToolCalls,
    ToolSet,
} from "ai";
import { Chat } from "@ai-sdk/vue";

export class ChatUtils {
    private static host =
        import.meta.env.VITE_API_HOST || "http://localhost:3000";

    private static gateway = createGateway({
        baseURL: `${this.host}/api/v1`,
        apiKey: import.meta.env.AI_GATEWAY_API_KEY || "",
    });

    static streamResponse(
        modelId: string,
        messages: ModelMessage[],
        tools?: ToolSet
    ) {
        const result = streamText({
            model: this.gateway(modelId),
            messages: messages,
            tools,
        });
    }

    static createGatewayChat(
        modelId: string,
        options: {
            tools?: ToolSet;
            onToolCall?: (toolCall: any) => void;
            onFinish?: (result: any) => void;
        } = {}
    ) {
        const messages: ModelMessage[] = [];
        const status = ref<"ready" | "streaming" | "error">("ready");
        const error = ref<any>(undefined);

        const processStream = async () => {
            status.value = "streaming";
            error.value = undefined;

            try {
                const result = streamText({
                    model: this.gateway(modelId),
                    messages: messages,
                    tools: options.tools,
                });

                let assistantMessage: ModelMessage = {
                    role: "assistant",
                    content: "",
                };

                messages.push(assistantMessage);
                const messageIndex = messages.length - 1;

                for await (const part of result.fullStream) {
                    const currentMessage = messages[messageIndex];

                    if (part.type === "text-delta") {
                        if (typeof currentMessage.content === "string") {
                            currentMessage.content += part.text;
                        }
                    } else if (part.type === "tool-call") {
                        if (!(currentMessage as any).toolCalls) {
                            (currentMessage as any).toolCalls = [];
                        }
                        (currentMessage as any).toolCalls.push(part);

                        if (options.onToolCall) {
                            options.onToolCall(part);
                        }
                    }
                }

                if (options.onFinish) {
                    options.onFinish(await result.text);
                }
                status.value = "ready";
            } catch (err) {
                error.value = err;
                status.value = "error";
            }
        };

        const sendMessage = async (content: string) => {
            messages.push({ role: "user", content });
            await processStream();
        };

        const resume = async () => {
            await processStream();
        };

        return {
            messages,
            sendMessage,
            onToolCall: options.onToolCall,
            onFinish: options.onFinish,
            resume,
            error,
            status,
        };
    }

    public static getCht() {
        const chat = new Chat({
            transport: new DefaultChatTransport({
                api: `${this.host}/api/chat`,
            }),
            sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        });
        return chat;
    }
}
