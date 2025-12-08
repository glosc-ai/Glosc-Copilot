<script setup lang="ts">
import { computed, ref } from "vue";
import { theme, Button, Dropdown, Menu, Avatar } from "ant-design-vue";
import {
    PlusOutlined,
    UserOutlined,
    SettingOutlined,
    LogoutOutlined,
    LoginOutlined,
} from "@ant-design/icons-vue";
import { Conversations } from "ant-design-x-vue";
import { useChatStore } from "../stores/chat";

const store = useChatStore();
const { token } = theme.useToken();

// 模拟用户状态
const user = ref({
    isLoggedIn: false,
    name: "Guest",
    avatar: "",
});

const handleMenuClick = (e: any) => {
    if (e.key === "login") {
        user.value = {
            isLoggedIn: true,
            name: "User",
            avatar: "https://api.dicebear.com/7.x/miniavs/svg?seed=1",
        };
    } else if (e.key === "logout") {
        user.value = { isLoggedIn: false, name: "Guest", avatar: "" };
    } else if (e.key === "settings") {
        store.settingsOpen = true;
    }
};
</script>

<template>
    <div
        class="w-[280px] h-full flex flex-col bg-gray-50/50 dark:bg-gray-900/50"
    >
        <!-- 🌟 Logo -->
        <div class="flex h-[72px] items-center justify-start px-6 box-border">
            <img
                src="/logo.png"
                draggable="false"
                alt="logo"
                class="w-6 h-6 inline-block"
            />
            <span
                class="inline-block mx-2 font-bold text-base text-gray-900 dark:text-gray-100"
                >Gloss Copilot</span
            >
        </div>

        <!-- 🌟 添加会话 -->
        <Button
            type="link"
            class="w-[calc(100%-24px)] mx-3 mb-6 bg-blue-50/10 border border-blue-200/20"
            @click="store.onAddConversation"
        >
            <PlusOutlined />
            新会话
        </Button>

        <!-- 🌟 会话管理 -->
        <Conversations
            :items="store.conversationsItems"
            class="px-3 flex-1 overflow-y-auto"
            :active-key="store.activeKey"
            @active-change="store.onConversationClick"
        />

        <!-- 🌟 底部账号管理 -->
        <div class="p-3 border-t border-gray-200 dark:border-gray-700">
            <Dropdown :trigger="['click']">
                <div
                    class="flex items-center gap-2 cursor-pointer p-2 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                    <Avatar :size="32" :src="user.avatar">
                        <template #icon><UserOutlined /></template>
                    </Avatar>
                    <span class="font-medium text-gray-900 dark:text-gray-100">
                        {{ user.name }}
                    </span>
                </div>
                <template #overlay>
                    <Menu @click="handleMenuClick">
                        <Menu.Item key="account" v-if="user.isLoggedIn">
                            <template #icon><UserOutlined /></template>
                            账号
                        </Menu.Item>
                        <Menu.Item key="settings">
                            <template #icon><SettingOutlined /></template>
                            设置
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item key="login" v-if="!user.isLoggedIn">
                            <template #icon><LoginOutlined /></template>
                            登录
                        </Menu.Item>
                        <Menu.Item key="logout" v-if="user.isLoggedIn" danger>
                            <template #icon><LogoutOutlined /></template>
                            登出
                        </Menu.Item>
                    </Menu>
                </template>
            </Dropdown>
        </div>
    </div>
</template>
