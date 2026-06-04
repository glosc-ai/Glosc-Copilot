use enigo::{
    Axis, Button, Coordinate, Direction, Enigo, Mouse, Settings,
};

/// Move the mouse cursor to absolute screen coordinates (x, y).
#[tauri::command]
pub fn computer_move_mouse(x: i32, y: i32) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .move_mouse(x, y, Coordinate::Abs)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Perform a left mouse button click at the current cursor position.
#[tauri::command]
pub fn computer_mouse_click() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .button(Button::Left, Direction::Click)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Perform a left mouse button double-click at the current cursor position.
#[tauri::command]
pub fn computer_mouse_double_click() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .button(Button::Left, Direction::Click)
        .map_err(|e| e.to_string())?;
    enigo
        .button(Button::Left, Direction::Click)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Perform a right mouse button click at the current cursor position.
#[tauri::command]
pub fn computer_mouse_right_click() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .button(Button::Right, Direction::Click)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Scroll the mouse wheel. Positive length scrolls up, negative scrolls down.
#[tauri::command]
pub fn computer_mouse_scroll(delta_y: i32) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .scroll(delta_y, Axis::Vertical)
        .map_err(|e| e.to_string())?;
    Ok(())
}
