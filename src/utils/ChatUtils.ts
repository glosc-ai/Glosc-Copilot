import { createGateway } from "@ai-sdk/gateway";
import { streamText } from "ai";

export class ChatUtils {
    private static gateway = createGateway({
        baseURL:
            (import.meta.env.VITE_API_HOST || "http://localhost:3000") +
            "/api/v2",
        apiKey: import.meta.env.AI_GATEWAY_API_KEY || "",
    });

    static streamResponse(modelId: string, messages: StoredChatMessage[]) {
        return streamText({
            model: this.gateway(modelId),
            messages: messages,
        });
    }
}
