<script setup lang="ts">
import { h } from "vue";
import { Space, Button } from "ant-design-vue";
import { ShareAltOutlined, EllipsisOutlined } from "@ant-design/icons-vue";
import { Welcome, Prompts } from "ant-design-x-vue";
import { useChatStore } from "../stores/chat";

const store = useChatStore();

// 定义 props 接收处理函数
interface Props {
    onPromptsItemClick?: (info: any) => void;
}

const props = defineProps<Props>();
</script>

<template>
    <div class="w-full h-full flex flex-col items-center justify-center px-6">
        <Space
            direction="vertical"
            :size="16"
            class="pt-8 text-left flex-1 justify-center"
        >
            <Welcome
                variant="borderless"
                title="你好，我是 Gloss Copilot"
                description="基于 Ant Design，AGI 产品界面解决方案，创造更美好的智能愿景~"
            >
                <template #icon>
                    <img src="/logo.png" alt="logo" />
                </template>
                <template #extra>
                    <Space>
                        <Button :icon="h(ShareAltOutlined)" />
                        <Button :icon="h(EllipsisOutlined)" />
                    </Space>
                </template>
            </Welcome>
            <Prompts
                title="你想要什么？"
                :items="store.placeholderPromptsItems"
                @item-click="props.onPromptsItemClick"
            />
        </Space>
    </div>
</template>
