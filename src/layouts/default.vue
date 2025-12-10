<script lang="ts" setup>
import { ConfigProvider, theme } from "ant-design-vue";

const themeConfig = {
    algorithm: theme.darkAlgorithm,
    token: {
        colorPrimary: "#1677ff",
    },
};
</script>
<template>
    <ConfigProvider :theme="themeConfig">
        <router-view />
    </ConfigProvider>
</template>
<script lang="ts">
export default {
    name: "Default",
};
</script>
<style lang="less" scoped></style>
