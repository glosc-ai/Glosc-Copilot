<script lang="ts" setup>
import { createGateway, ModelMessage, streamText } from "ai";
import { useMcpStore } from "@/stores/mcp";

const text = ref("");

async function test() {
    const mcpStore = useMcpStore();
    await mcpStore.init();

    const host = import.meta.env.VITE_API_HOST || "http://localhost:3000";
    const gateway = createGateway({
        baseURL: `${host}/api/v1/ai`,
        apiKey: import.meta.env.AI_GATEWAY_API_KEY || "",
    });
    const messages: ModelMessage[] = [{ role: "user", content: "你好." }];
    const tools = (await mcpStore.getCachedTools(true)) ?? undefined;
    console.log(tools);

    const result = streamText({
        model: gateway("xai/grok-code-fast-1"),
        messages: messages,
        tools,
    });

    for await (const textPart of result.textStream) {
        console.log(textPart);
        text.value += textPart;
    }
}
</script>
<template>
    <div>
        <Button @click="test">测试</Button>
        <div>{{ text }}</div>
    </div>
</template>
<script lang="ts">
export default {
    name: "text",
};
</script>
<style lang="less" scoped></style>
