import type { FileUIPart } from "ai";
import type { ComputedRef, Ref } from "vue";

export interface PromptInputMessage {
    text: string;
    files: FileUIPart[];
}

export interface AttachmentFile extends FileUIPart {
    id: string;
    file?: File;
}

export interface PromptInputContext {
    textInput: Ref<string>;
    displayTextInput: ComputedRef<string>;
    files: Ref<AttachmentFile[]>;
    isLoading: Ref<boolean>;
    fileInputRef: Ref<HTMLInputElement | null>;
    setTextInput: (val: string) => void;
    setDisplayTextInput: (val: string) => void;
    addFiles: (files: File[] | FileList) => void;
    removeFile: (id: string) => void;
    clearFiles: () => void;
    clearInput: () => void;
    openFileDialog: () => void;
    submitForm: () => void;
}

export const PROMPT_INPUT_KEY = Symbol("PromptInputContext");
