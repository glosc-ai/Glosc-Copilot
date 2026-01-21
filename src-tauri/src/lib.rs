// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[derive(Clone, Copy)]
struct DebugState {
    enabled: bool,
}

fn is_dev_file_present() -> bool {
    fn exists_in_dir(dir: &std::path::Path) -> bool {
        let dev_path = dir.join("DEV");
        dev_path.is_file()
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if exists_in_dir(exe_dir) {
                return true;
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        if exists_in_dir(&cwd) {
            return true;
        }
    }

    false
}

#[cfg(target_os = "windows")]
fn try_register_glosc_protocol() {
    use std::process::Command;

    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return,
    };
    let exe = match exe.to_str() {
        Some(s) if !s.is_empty() => s,
        _ => return,
    };

    // Register for current user (no admin required):
    // HKCU\Software\Classes\glosc\shell\open\command (Default) = "<exe>" "%1"
    let command_value = format!("\"{}\" \"%1\"", exe);

    let _ = Command::new("reg")
        .args([
            "add",
            r"HKCU\Software\Classes\glosc",
            "/ve",
            "/d",
            "URL:Glosc Protocol",
            "/f",
        ])
        .status();

    let _ = Command::new("reg")
        .args([
            "add",
            r"HKCU\Software\Classes\glosc",
            "/v",
            "URL Protocol",
            "/d",
            "",
            "/f",
        ])
        .status();

    let _ = Command::new("reg")
        .args([
            "add",
            r"HKCU\Software\Classes\glosc\shell\open\command",
            "/ve",
            "/d",
            &command_value,
            "/f",
        ])
        .status();
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// #[tauri::command]
// fn is_debug_enabled(state: tauri::State<'_, DebugState>) -> bool {
//     state.enabled
// }

#[tauri::command]
fn open_devtools(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DebugState>,
) -> Result<(), String> {
    if !state.enabled {
        return Err("debug disabled".to_string());
    }

    window.open_devtools();
    Ok(())
}

#[tauri::command]
fn get_cli_args() -> Vec<String> {
    std::env::args().collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let debug_enabled = is_dev_file_present();

    #[cfg(target_os = "windows")]
    try_register_glosc_protocol();

    tauri::Builder::default()
        .manage(DebugState {
            enabled: debug_enabled,
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            // is_debug_enabled,
            open_devtools,
            get_cli_args
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
