import type { InjectionKey, Ref } from "vue";

export type TerminalContext = {
    output: Ref<string>;
    isStreaming: Ref<boolean>;
    autoScroll: Ref<boolean>;
    onClear?: () => void;
};

export const terminalContextKey: InjectionKey<TerminalContext> = Symbol(
    "ai-elements-terminal",
);
