<script lang="ts" setup>
import { xai } from "@ai-sdk/xai";

const text = ref("");

async function test() {
    const xaiTools = {
        web_search: xai.tools.webSearch(),
        x_search: xai.tools.xSearch(),
        code_execution: xai.tools.codeExecution(),
    };
    console.log({ xaiTools });
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
