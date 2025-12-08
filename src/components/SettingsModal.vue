<script setup lang="ts">
import {
    Modal,
    Tabs,
    TabPane,
    Form,
    FormItem,
    Select,
    SelectOption,
    RadioGroup,
    RadioButton,
    Switch,
    Input,
    InputSearch,
    Textarea,
    Button,
    List,
    ListItem,
    ListItemMeta,
    Tag,
} from "ant-design-vue";
import { useChatStore } from "../stores/chat";

const chatStore = useChatStore();

const storeUtils = new StoreUtils();

const apiKey = ref("");

async function init() {
    if (await storeUtils.get("apiKey")) {
        apiKey.value = (await storeUtils.get("apiKey")) || "";
    }
}

function saveApiKey() {
    storeUtils.set("apiKey", apiKey.value);
}

onMounted(() => {
    init();
});
</script>

<template>
    <Modal
        v-model:open="chatStore.settingsOpen"
        title="设置"
        width="700px"
        :footer="null"
    >
        <Tabs tab-position="left">
            <TabPane key="general" tab="通用">
                <Form layout="vertical">
                    <FormItem label="开机自启">
                        <Switch />
                    </FormItem>
                    <FormItem label="语音唤醒词">
                        <Input placeholder="例如：Hey Gloss" />
                    </FormItem>
                    <FormItem label="授权目录">
                        <InputSearch
                            enter-button="添加"
                            placeholder="选择目录"
                        />
                        <div class="mt-2">
                            <Tag closable>E:\GitHub\GlossMod</Tag>
                        </div>
                    </FormItem>
                    <FormItem label="API 密钥">
                        <Input
                            v-model:value="apiKey"
                            @blur="saveApiKey"
                            placeholder="输入 DeepSeek API 密钥"
                            type="password"
                        />
                    </FormItem>
                </Form>
            </TabPane>
            <TabPane key="interface" tab="界面">
                <Form layout="vertical">
                    <FormItem label="语言">
                        <Select value="zh-CN">
                            <SelectOption value="zh-CN">简体中文</SelectOption>
                        </Select>
                    </FormItem>
                    <FormItem label="主题">
                        <RadioGroup value="dark">
                            <RadioButton value="dark">暗色</RadioButton>
                            <RadioButton value="light">亮色</RadioButton>
                            <RadioButton value="system">跟随系统</RadioButton>
                        </RadioGroup>
                    </FormItem>
                </Form>
            </TabPane>
            <TabPane key="behavior" tab="行为偏好">
                <Form layout="vertical">
                    <FormItem label="自动滚动">
                        <Switch checked />
                    </FormItem>
                    <FormItem label="完成时通知我">
                        <Switch />
                    </FormItem>
                    <FormItem label="启用富文本编辑器">
                        <Switch />
                    </FormItem>
                </Form>
            </TabPane>
            <TabPane key="custom" tab="自定义">
                <Form layout="vertical">
                    <FormItem label="系统提示词">
                        <Textarea
                            :rows="4"
                            placeholder="设置全局系统提示词..."
                        />
                    </FormItem>
                </Form>
            </TabPane>
            <TabPane key="data" tab="数据管理">
                <List item-layout="horizontal">
                    <ListItem>
                        <ListItemMeta
                            title="清除所有聊天记录"
                            description="此操作不可恢复"
                        />
                        <template #actions>
                            <Button danger>清除</Button>
                        </template>
                    </ListItem>
                    <ListItem>
                        <ListItemMeta
                            title="导出数据"
                            description="导出所有设置和聊天记录"
                        />
                        <template #actions>
                            <Button>导出</Button>
                        </template>
                    </ListItem>
                </List>
            </TabPane>
        </Tabs>
    </Modal>
</template>
