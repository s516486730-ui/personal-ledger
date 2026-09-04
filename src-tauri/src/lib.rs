use tauri_plugin_sql::{Migration, MigrationKind};

/// 写 CSV 文件（内容前自动加 UTF-8 BOM，防止 Excel 打开中文乱码）
#[tauri::command]
fn export_csv(path: String, content: String) -> Result<(), String> {
    let mut data = String::from("\u{FEFF}");
    data.push_str(&content);
    std::fs::write(&path, data.as_bytes()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create tables and seed default categories",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ledger.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![export_csv])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
