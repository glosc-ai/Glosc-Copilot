<script lang="ts" setup>
import { ConfigProvider, theme } from "ant-design-vue";
</script>
<template>
    <ConfigProvider :theme="{ algorithm: theme.darkAlgorithm }">
        <router-view />
    </ConfigProvider>
</template>
<script lang="ts">
export default {
    name: "Default",
};
</script>
<style lang="less" scoped></style>
