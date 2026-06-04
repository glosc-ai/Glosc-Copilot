import { invoke } from "@tauri-apps/api/core";

export interface ScreenInfo {
    width: number;
    height: number;
    scale_factor: number;
}

export interface WindowInfo {
    title: string;
    app_name: string;
}

export interface ShellResult {
    stdout: string;
    stderr: string;
    exit_code: number;
}

/** Move mouse cursor to absolute screen coordinates */
export async function computerMoveMouse(x: number, y: number): Promise<void> {
    await invoke("computer_move_mouse", { x, y });
}

/** Left click at current cursor position */
export async function computerMouseClick(): Promise<void> {
    await invoke("computer_mouse_click");
}

/** Double click at current cursor position */
export async function computerMouseDoubleClick(): Promise<void> {
    await invoke("computer_mouse_double_click");
}

/** Right click at current cursor position */
export async function computerMouseRightClick(): Promise<void> {
    await invoke("computer_mouse_right_click");
}

/** Scroll vertically. Positive = up, negative = down. */
export async function computerMouseScroll(deltaY: number): Promise<void> {
    await invoke("computer_mouse_scroll", { deltaY });
}

/** Type text at current cursor position */
export async function computerTypeText(text: string): Promise<void> {
    await invoke("computer_type_text", { text });
}

/** Press a single key (e.g. "Return", "Escape", "a") */
export async function computerKeyPress(keyName: string): Promise<void> {
    await invoke("computer_key_press", { keyName });
}

/** Press a key combination (e.g. ["Control", "c"] for Ctrl+C) */
export async function computerKeyCombination(keys: string[]): Promise<void> {
    await invoke("computer_key_combination", { keys });
}

/** Capture screenshot as base64 PNG */
export async function computerCaptureScreen(): Promise<string> {
    return await invoke<string>("computer_capture_screen");
}

/** Get primary monitor size info */
export async function computerGetScreenSize(): Promise<ScreenInfo> {
    return await invoke<ScreenInfo>("computer_get_screen_size");
}

/** Get active window info */
export async function computerGetActiveWindow(): Promise<WindowInfo> {
    return await invoke<WindowInfo>("computer_get_active_window");
}

/** Execute a shell command */
export async function computerExecCommand(command: string): Promise<ShellResult> {
    return await invoke<ShellResult>("computer_exec_command", { command });
}
