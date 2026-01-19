import type { UIMessage } from "ai";
import type { MeetingMessage } from "@/utils/meetingInterface";

export type MeetingUIMessage = UIMessage & {
    speakerId?: string;
    speakerName?: string;
    speakerAvatar?: string;
    speakerColor?: string;
    timestamp?: number;
    isGenerating?: boolean;
};

export function meetingMessagesToUiMessages(
    messages: MeetingMessage[] | null | undefined,
): MeetingUIMessage[] {
    return (messages ?? []).map((m) => {
        const role = m.role === "system" ? "assistant" : m.role;

        const parts: any[] = [];
        if (m.content != null && m.content !== "") {
            parts.push({ type: "text", text: m.content });
        } else {
            parts.push({ type: "text", text: "" });
        }

        if (m.reasoning) {
            parts.push({ type: "reasoning", text: m.reasoning });
        }

        return {
            id: m.id,
            role: role as any,
            parts,
            speakerId: m.speakerId,
            speakerName: m.speakerName,
            speakerAvatar: m.speakerAvatar,
            speakerColor: m.speakerColor,
            timestamp: m.timestamp,
            isGenerating: m.isGenerating,
        } as MeetingUIMessage;
    });
}
