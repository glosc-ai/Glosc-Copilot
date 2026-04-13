import {
    convertToModelMessages,
    lastAssistantMessageIsCompleteWithToolCalls,
    stepCountIs,
    ToolSet,
    streamText,
    type ChatTransport,
    type UIMessage,
    type UIMessageChunk,
    validateUIMessages,
} from "ai";
import { Chat } from "@ai-sdk/vue";
import type { CreateChatClientOptions } from "@/utils/interface";
import { createLanguageModelFromRequestBody } from "@/utils/LocalAiProvider";

const DEFAULT_TOOL_LOOP_STEPS = 8;

class LocalChatTransport<
    UI_MESSAGE extends UIMessage,
> implements ChatTransport<UI_MESSAGE> {
    async sendMessages(options: {
        trigger: "submit-message" | "regenerate-message";
        chatId: string;
        messageId: string | undefined;
        messages: UI_MESSAGE[];
        abortSignal: AbortSignal | undefined;
        headers?: Record<string, string> | Headers;
        body?: object;
        metadata?: unknown;
    }): Promise<ReadableStream<UIMessageChunk>> {
        const requestBody = (options.body ?? {}) as Record<string, any>;
        const tools = (requestBody.tools || {}) as ToolSet;
        const validationTools = tools as any;
        const validatedMessages = await validateUIMessages({
            messages: options.messages,
            tools: validationTools,
        });

        const modelMessages = await convertToModelMessages(
            validatedMessages.map((message) => {
                const { id: _id, ...rest } = message as UI_MESSAGE & {
                    id?: string;
                };
                return rest;
            }),
            {
                tools: validationTools,
                ignoreIncompleteToolCalls: true,
            },
        );

        const result = streamText({
            model: createLanguageModelFromRequestBody(requestBody),
            messages: modelMessages,
            tools,
            ...(Object.keys(tools).length > 0
                ? { stopWhen: stepCountIs(DEFAULT_TOOL_LOOP_STEPS) }
                : {}),
            abortSignal: options.abortSignal,
        });

        return result.toUIMessageStream({
            originalMessages: options.messages,
            onError: (error) =>
                ChatUtils.extractStreamErrorText(error) ||
                (error instanceof Error
                    ? error.message
                    : typeof error === "string"
                      ? error
                      : "流式传输发生错误"),
        }) as ReadableStream<UIMessageChunk>;
    }

    async reconnectToStream() {
        return null;
    }
}

export class ChatUtils {
    public static getChat(options: CreateChatClientOptions = {}) {
        const chat = new Chat({
            transport: new LocalChatTransport(),
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
