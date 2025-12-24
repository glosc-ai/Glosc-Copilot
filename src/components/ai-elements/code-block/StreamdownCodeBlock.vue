<script setup lang="ts">
import type { BundledLanguage } from "shiki";
import type { HTMLAttributes } from "vue";
import { computed } from "vue";
import CodeBlock from "./CodeBlock.vue";
import CodeBlockCopyButton from "./CodeBlockCopyButton.vue";

const props = withDefaults(
    defineProps<{
        code: string;
        language?: string;
        showLineNumbers?: boolean;
        class?: HTMLAttributes["class"];
    }>(),
    {
        language: "",
        showLineNumbers: false,
    }
);

const normalizedLanguage = computed(() => {
    const raw = (props.language || "").trim().toLowerCase();
    if (!raw) return "text";

    const aliases: Record<string, string> = {
        js: "javascript",
        jsx: "jsx",
        ts: "typescript",
        tsx: "tsx",
        py: "python",
        sh: "bash",
        zsh: "bash",
        shell: "bash",
        shellscript: "bash",
        yml: "yaml",
        md: "markdown",
        vue: "vue",
        html: "html",
        css: "css",
        json: "json",
        diff: "diff",
        go: "go",
        rust: "rust",
        sql: "sql",
        csharp: "csharp",
        "c#": "csharp",
        cs: "csharp",
    };

    const candidate = aliases[raw] ?? raw;

    const supported = new Set([
        "text",
        "typescript",
        "tsx",
        "javascript",
        "jsx",
        "json",
        "bash",
        "python",
        "diff",
        "markdown",
        "vue",
        "html",
        "css",
        "go",
        "rust",
        "yaml",
        "cpp",
        "java",
        "c",
        "csharp",
        "php",
        "ruby",
        "kotlin",
        "swift",
        "sql",
    ]);

    return supported.has(candidate) ? candidate : "text";
});

const shikiLanguage = computed(
    () => normalizedLanguage.value as BundledLanguage
);
</script>

<template>
    <CodeBlock
        :code="props.code"
        :language="shikiLanguage"
        :show-line-numbers="props.showLineNumbers"
        :class="props.class"
    >
        <CodeBlockCopyButton />
    </CodeBlock>
</template>
