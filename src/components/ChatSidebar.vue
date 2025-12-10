<script setup lang="ts">
import { ref } from "vue";
import { Button, Dropdown, Menu, Avatar, Modal, Input } from "ant-design-vue";
import {
    PlusOutlined,
    UserOutlined,
    SettingOutlined,
    LogoutOutlined,
    LoginOutlined,
    DeleteOutlined,
    EditOutlined,
} from "@ant-design/icons-vue";
import { Conversations } from "ant-design-x-vue";
import { useChatStore } from "../stores/chat";

const store = useChatStore();

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

// 重命名会话
const renameModalVisible = ref(false);
const renamingConversationId = ref("");
const newConversationTitle = ref("");

const showRenameModal = (conversationId: string) => {
    renamingConversationId.value = conversationId;
    const conversation = store.conversations[conversationId];
    newConversationTitle.value = conversation?.title || "";
    renameModalVisible.value = true;
};

const handleRename = async () => {
    if (newConversationTitle.value.trim()) {
        await store.renameConversation(
            renamingConversationId.value,
            newConversationTitle.value.trim()
        );
        renameModalVisible.value = false;
    }
};

// 删除会话
const handleDelete = (conversationId: string) => {
    Modal.confirm({
        title: "确认删除",
        content: "确定要删除这个会话吗？此操作无法撤销。",
        okText: "删除",
        okType: "danger",
        cancelText: "取消",
        onOk: async () => {
            await store.deleteConversation(conversationId);
        },
    });
};

// 会话菜单配置
const conversationMenuConfig = (conversation: any) => {
    return {
        items: [
            {
                key: "rename",
                label: "重命名",
                icon: h(EditOutlined),
                onClick: () => showRenameModal(conversation.key),
            },
            {
                key: "delete",
                label: "删除",
                icon: h(DeleteOutlined),
                danger: true,
                onClick: () => handleDelete(conversation.key),
            },
        ],
        onClick: (e: any) => {
            const menuItem = e.item;
            if (menuItem?.onClick) {
                menuItem.onClick();
            }
        },
    };
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
            :menu="conversationMenuConfig"
            @active-change="store.onConversationClick"
        />

        <!-- 🌟 重命名对话框 -->
        <Modal
            v-model:open="renameModalVisible"
            title="重命名会话"
            @ok="handleRename"
            ok-text="确定"
            cancel-text="取消"
        >
            <Input
                v-model:value="newConversationTitle"
                placeholder="请输入新的会话名称"
                @press-enter="handleRename"
            />
        </Modal>

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
