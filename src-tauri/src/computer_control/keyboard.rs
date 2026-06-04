use enigo::{
    Direction, Enigo, Key, Keyboard, Settings,
};

/// Type the given text at the current cursor position.
#[tauri::command]
pub fn computer_type_text(text: String) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.text(&text).map_err(|e| e.to_string())?;
    Ok(())
}

/// Press a single key. Key names follow enigo::Key semantics
/// (e.g., "Return", "Tab", "Escape", "Space", "a", "b", etc.).
#[tauri::command]
pub fn computer_key_press(key_name: String) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let key = parse_key(&key_name)?;
    enigo
        .key(key, Direction::Click)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Press a key combination (e.g., ["Control", "c"] for Ctrl+C).
/// Keys are pressed simultaneously and then released.
#[tauri::command]
pub fn computer_key_combination(keys: Vec<String>) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let parsed_keys: Vec<Key> = keys
        .iter()
        .map(|k| parse_key(k))
        .collect::<Result<Vec<_>, _>>()?;

    // Press all keys in order
    for key in &parsed_keys {
        enigo.key(*key, Direction::Press).map_err(|e| e.to_string())?;
    }
    // Release all keys in reverse order
    for key in parsed_keys.iter().rev() {
        enigo.key(*key, Direction::Release).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn parse_key(name: &str) -> Result<Key, String> {
    match name.to_lowercase().as_str() {
        "return" | "enter" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "space" => Ok(Key::Space),
        "backspace" => Ok(Key::Backspace),
        "escape" | "esc" => Ok(Key::Escape),
        "delete" | "del" => Ok(Key::Delete),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),
        "up" | "uparrow" => Ok(Key::UpArrow),
        "down" | "downarrow" => Ok(Key::DownArrow),
        "left" | "leftarrow" => Ok(Key::LeftArrow),
        "right" | "rightarrow" => Ok(Key::RightArrow),
        "shift" => Ok(Key::Shift),
        "control" | "ctrl" => Ok(Key::Control),
        "alt" => Ok(Key::Alt),
        "meta" | "command" | "win" | "super" => Ok(Key::Meta),
        "capslock" => Ok(Key::CapsLock),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        // Single character keys: 'a' through 'z' and '0' through '9'
        c if c.len() == 1 => {
            let ch = c.chars().next().unwrap();
            if ch.is_ascii_alphanumeric() {
                Ok(Key::Unicode(ch))
            } else {
                Err(format!("unknown key: {}", name))
            }
        }
        _ => Err(format!("unknown key: {}", name)),
    }
}
