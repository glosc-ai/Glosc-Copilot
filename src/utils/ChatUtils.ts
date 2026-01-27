import { createGateway } from "@ai-sdk/gateway";
import { ref } from "vue";
import {
    ModelMessage,
    streamText,
    DefaultChatTransport,
    lastAssistantMessageIsCompleteWithToolCalls,
    ToolSet,
} from "ai";
import { Chat } from "@ai-sdk/vue";
import { useAuthStore } from "@/stores/auth";

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
        tools?: ToolSet,
    ) {
        return streamText({
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
        } = {},
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

    public static getChat(options: CreateChatClientOptions = {}) {
        const apiPath = options.apiPath || "/api/chat";
        const authStore = useAuthStore();
        const chat = new Chat({
            transport: new DefaultChatTransport({
                api: `${this.host}${apiPath}`,
                fetch: async (input, init) => {
                    const res = await fetch(input, init);
                    if (res.status === 401 || res.status === 403) {
                        // token likely expired/revoked
                        try {
                            await authStore.logout();
                        } catch {
                            // ignore
                        }
                    }
                    return res;
                },
                prepareSendMessagesRequest: (options) => {
                    // 该 hook 的返回值会覆盖 SDK 默认构造的请求体。
                    // 因此必须把 messages/id/trigger/messageId 一并写回，否则后端会收不到 messages。
                    const token = authStore.token;
                    const headers = new Headers(options.headers || undefined);
                    if (token) headers.set("Authorization", `Bearer ${token}`);

                    const body = {
                        ...(options.body ?? {}),
                        id: options.id,
                        messages: options.messages,
                        trigger: options.trigger,
                        messageId: options.messageId,
                    };

                    // 用户自定义模型：除了放在 body 里，也额外放到 header 里。
                    // 这样后端可以用 header 直接组装 OpenAI-compatible 请求（baseUrl + apiKey）。
                    // 注意：这里发送的是用户本地配置的 Key，本质上就是要交给后端用于转发。
                    const useUserKey = Boolean((body as any)?.useUserKey);
                    const userModelApiKey = String(
                        (body as any)?.userModelApiKey || "",
                    ).trim();
                    const userModelBaseUrl = String(
                        (body as any)?.userModelBaseUrl || "",
                    ).trim();
                    if (useUserKey && userModelApiKey && userModelBaseUrl) {
                        headers.set("X-User-Model-Api-Key", userModelApiKey);
                        headers.set("X-User-Model-Base-Url", userModelBaseUrl);
                    }

                    return { headers, body };
                },
                prepareReconnectToStreamRequest: (options) => {
                    const token = authStore.token;
                    const headers = new Headers(options.headers || undefined);
                    if (token) headers.set("Authorization", `Bearer ${token}`);
                    return { headers };
                },
            }),
            sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
            onToolCall: async ({ toolCall }) => {
                // 文档建议先判断 dynamic 做类型收窄
                if (toolCall?.dynamic) return;

                const toolName: string | undefined = toolCall?.toolName;
                const toolCallId: string | undefined = toolCall?.toolCallId;
                const input = toolCall?.input ?? {};

                if (!toolName || !toolCallId) return;

                const registry = options.toolsRef?.value;
                const tool = registry ? registry[toolName] : undefined;

                if (options.debugTools) {
                    // eslint-disable-next-line no-console
                    console.log("[onToolCall]", {
                        toolName,
                        toolCallId,
                        input,
                        hasTool: Boolean(tool),
                    });
                }

                if (!tool || typeof tool.execute !== "function") {
                    void chat.addToolOutput({
                        tool: toolName as any,
                        toolCallId,
                        state: "output-error" as any,
                        errorText: `Client tool '${toolName}' not found or not executable.`,
                    });
                    return;
                }

                try {
                    const output = await tool.execute(input, {});
                    // 不 await，避免潜在死锁（与官方示例一致）
                    void chat.addToolOutput({
                        tool: toolName as any,
                        toolCallId,
                        output,
                    });
                } catch (err: any) {
                    const errorText =
                        err instanceof Error
                            ? err.message
                            : typeof err === "string"
                              ? err
                              : "Unable to execute client tool";

                    void chat.addToolOutput({
                        tool: toolName as any,
                        toolCallId,
                        state: "output-error" as any,
                        errorText,
                    });
                }
            },
        });
        return chat;
    }

    /**
     * 从 AI SDK 抛出的未知错误中尽量提取可展示的错误文本。
     * 兼容后端在流式传输中直接发送 JSON 帧：{"type":"error","errorText":"..."}
     */
    static extractStreamErrorText(err: unknown): string | null {
        const tryParseJson = (text: string): any | null => {
            const trimmed = (text || "").trim();
            if (!trimmed) return null;
            if (!(trimmed.startsWith("{") || trimmed.startsWith("[")))
                return null;
            try {
                return JSON.parse(trimmed);
            } catch {
                return null;
            }
        };

        const extractFromAny = (value: any): string | null => {
            if (!value) return null;

            if (typeof value === "string") {
                const parsed = tryParseJson(value);
                if (parsed && typeof parsed === "object") {
                    const t = (parsed as any).type;
                    const errorText = (parsed as any).errorText;
                    if (
                        t === "error" &&
                        typeof errorText === "string" &&
                        errorText.trim()
                    ) {
                        return errorText.trim();
                    }
                }

                // 兜底：从字符串中抓取 errorText 字段（避免 message 前后包了一些额外内容）
                const m = value.match(/"errorText"\s*:\s*"([^"]+)"/i);
                if (m && m[1]) return m[1];
                return value.trim() || null;
            }

            if (typeof value === "object") {
                const type = (value as any).type;
                const errorText = (value as any).errorText;
                if (
                    type === "error" &&
                    typeof errorText === "string" &&
                    errorText.trim()
                ) {
                    return errorText.trim();
                }

                const message = (value as any).message;
                if (typeof message === "string") {
                    const fromMessage = extractFromAny(message);
                    if (fromMessage) return fromMessage;
                }

                const cause = (value as any).cause;
                if (cause) {
                    const fromCause = extractFromAny(cause);
                    if (fromCause) return fromCause;
                }
            }

            return null;
        };

        return extractFromAny(err);
    }
}
