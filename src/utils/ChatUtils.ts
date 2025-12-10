import { createGateway } from "@ai-sdk/gateway";
import {
    ModelMessage,
    streamText,
    DefaultChatTransport,
    lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { Chat } from "@ai-sdk/vue";

export class ChatUtils {
    private static host =
        import.meta.env.VITE_API_HOST || "http://localhost:3000";

    private static gateway = createGateway({
        baseURL: `${this.host}/api/v2`,
        apiKey: import.meta.env.AI_GATEWAY_API_KEY || "",
    });

    // static chat = new Chat({
    //     transport: new DefaultChatTransport({
    //         api: `${this.host}/api/chat`,
    //     }),
    //     sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    //     async onToolCall({ toolCall }) {
    //         console.log(toolCall);
    //     },
    // });

    static streamResponse(modelId: string, messages: ModelMessage[]) {
        return streamText({
            model: this.gateway(modelId),
            messages: messages,
        });
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
