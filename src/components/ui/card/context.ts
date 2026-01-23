import type { ComputedRef, InjectionKey } from "vue";

export type CardVariant = "default" | "outline";

export type CardContext = {
    variant: ComputedRef<CardVariant>;
};

export const cardContextKey: InjectionKey<CardContext> = Symbol("cardContext");
