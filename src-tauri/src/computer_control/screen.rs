use base64::Engine;
use serde::Serialize;

/// Information about the screen / display.
#[derive(Serialize)]
pub struct ScreenInfo {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Information about the currently active window.
#[derive(Serialize)]
pub struct WindowInfo {
    pub title: String,
    pub app_name: String,
}

/// Capture a screenshot of the primary monitor and return it as a base64-encoded PNG.
#[tauri::command]
pub fn computer_capture_screen() -> Result<String, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let primary = monitors
        .into_iter()
        .next()
        .ok_or_else(|| "No monitor found".to_string())?;

    let image_data = primary.capture_image().map_err(|e| e.to_string())?;

    // Encode as PNG in memory
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    image_data
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    // Base64 encode the PNG bytes
    let encoded = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(encoded)
}

/// Get the primary monitor's size and scale factor.
#[tauri::command]
pub fn computer_get_screen_size() -> Result<ScreenInfo, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let primary = monitors
        .into_iter()
        .next()
        .ok_or_else(|| "No monitor found".to_string())?;

    Ok(ScreenInfo {
        width: primary.width().map_err(|e| e.to_string())?,
        height: primary.height().map_err(|e| e.to_string())?,
        scale_factor: primary.scale_factor().map_err(|e| e.to_string())? as f64,
    })
}

/// Get information about the currently active window.
/// On macOS, this uses AppleScript; on other platforms, returns a placeholder.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn computer_get_active_window() -> Result<WindowInfo, String> {
    use std::process::Command;

    // Use AppleScript to get the frontmost window's title and app name
    let script = r#"
        tell application "System Events"
            set frontApp to first application process whose frontmost is true
            set appName to name of frontApp
            set windowTitle to ""
            try
                set windowTitle to name of front window of frontApp
            end try
            return appName & "|||" & windowTitle
        end tell
    "#;

    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err("Failed to get active window".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout.trim().splitn(2, "|||").collect();

    Ok(WindowInfo {
        app_name: parts.first().unwrap_or(&"").to_string(),
        title: parts.get(1).unwrap_or(&"").to_string(),
    })
}

/// Fallback for non-macOS: return limited info.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn computer_get_active_window() -> Result<WindowInfo, String> {
    Ok(WindowInfo {
        title: "Not available on this platform".to_string(),
        app_name: "".to_string(),
    })
}
