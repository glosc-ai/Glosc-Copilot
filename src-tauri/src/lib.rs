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

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn is_debug_enabled(state: tauri::State<'_, DebugState>) -> bool {
    state.enabled
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let debug_enabled = is_dev_file_present();

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
            is_debug_enabled,
            open_devtools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
