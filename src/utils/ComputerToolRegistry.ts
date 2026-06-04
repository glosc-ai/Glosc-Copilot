import { z } from "zod";
import {
    computerMoveMouse,
    computerMouseClick,
    computerMouseDoubleClick,
    computerMouseRightClick,
    computerMouseScroll,
    computerTypeText,
    computerKeyPress,
    computerKeyCombination,
    computerCaptureScreen,
    computerGetScreenSize,
    computerExecCommand,
} from "./ComputerControlUtils";

/**
 * Computer tool definitions that follow the MCP tool interface pattern,
 * making them compatible with the AI SDK's tool system.
 * These are injected alongside MCP tools in chat / workspace sessions.
 */
export const computerTools = {
    computer_move_mouse: {
        description: "移动鼠标光标到绝对屏幕坐标 (x, y)",
        parameters: z.object({
            x: z.number().describe("目标 X 坐标（像素）"),
            y: z.number().describe("目标 Y 坐标（像素）"),
        }),
        execute: async ({ x, y }: { x: number; y: number }) => {
            await computerMoveMouse(x, y);
            return `鼠标已移动到 (${x}, ${y})`;
        },
    },
    computer_mouse_click: {
        description: "在当前光标位置执行鼠标左键单击",
        parameters: z.object({}),
        execute: async () => {
            await computerMouseClick();
            return "鼠标左键已单击";
        },
    },
    computer_mouse_double_click: {
        description: "在当前光标位置执行鼠标左键双击",
        parameters: z.object({}),
        execute: async () => {
            await computerMouseDoubleClick();
            return "鼠标左键已双击";
        },
    },
    computer_mouse_right_click: {
        description: "在当前光标位置执行鼠标右键单击",
        parameters: z.object({}),
        execute: async () => {
            await computerMouseRightClick();
            return "鼠标右键已单击";
        },
    },
    computer_mouse_scroll: {
        description: "滚动鼠标滚轮（正数向上，负数向下）",
        parameters: z.object({
            delta_y: z.number().describe("滚动量（正数向上，负数向下）"),
        }),
        execute: async ({ delta_y }: { delta_y: number }) => {
            await computerMouseScroll(delta_y);
            return `鼠标已滚动 ${delta_y}`;
        },
    },
    computer_type_text: {
        description: "在当前光标位置输入指定的文本",
        parameters: z.object({
            text: z.string().describe("要输入的文本内容"),
        }),
        execute: async ({ text }: { text: string }) => {
            await computerTypeText(text);
            return `已输入文本：${text}`;
        },
    },
    computer_key_press: {
        description: "按下并释放指定的按键（如 Return、Escape、Space、a、b 等）",
        parameters: z.object({
            key_name: z.string().describe("按键名称，例如 Return、Escape、Tab、a、Control 等"),
        }),
        execute: async ({ key_name }: { key_name: string }) => {
            await computerKeyPress(key_name);
            return `已按下按键：${key_name}`;
        },
    },
    computer_key_combination: {
        description: "按下按键组合（例如 ['Control', 'c'] 表示 Ctrl+C）",
        parameters: z.object({
            keys: z.array(z.string()).describe("按键名称数组，例如 ['Control', 'c'] 表示 Ctrl+C"),
        }),
        execute: async ({ keys }: { keys: string[] }) => {
            await computerKeyCombination(keys);
            return `已按下按键组合：${keys.join(" + ")}`;
        },
    },
    computer_capture_screen: {
        description: "截取当前屏幕并返回 base64 编码的 PNG 图片。可在后续步骤中用于分析屏幕内容。",
        parameters: z.object({}),
        execute: async () => {
            const base64 = await computerCaptureScreen();
            return {
                type: "image",
                mime: "image/png",
                data: base64,
                summary: "屏幕截图已获取",
            };
        },
    },
    computer_exec_command: {
        description: "在系统 Shell 中执行一条命令并返回输出结果。注意：此工具有安全风险，谨慎使用。",
        parameters: z.object({
            command: z.string().describe("要执行的 Shell 命令"),
        }),
        execute: async ({ command }: { command: string }) => {
            const result = await computerExecCommand(command);
            return {
                stdout: result.stdout,
                stderr: result.stderr,
                exit_code: result.exit_code,
                summary: `命令已执行（退出码：${result.exit_code}）`,
            };
        },
    },
} as const;

export type ComputerToolName = keyof typeof computerTools;
