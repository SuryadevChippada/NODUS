use tauri_plugin_sql::{Migration, MigrationKind};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

const DB_URL: &str = "sqlite:nodus.db";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create workspaces, sessions, nodes, edges",
            sql: r#"
            CREATE TABLE workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX idx_sessions_workspace_id ON sessions(workspace_id);

            CREATE TABLE nodes (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                text TEXT NOT NULL,
                position_x REAL NOT NULL,
                position_y REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX idx_nodes_session_id ON nodes(session_id);

            CREATE TABLE edges (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                source_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                target_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE INDEX idx_edges_session_id ON edges(session_id);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add suggested_branches to nodes",
            sql: "ALTER TABLE nodes ADD COLUMN suggested_branches TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add identities table and node identity snapshot columns",
            sql: r#"
            CREATE TABLE identities (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                symbol TEXT NOT NULL,
                preferred_model TEXT,
                response_style TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX idx_identities_workspace_id ON identities(workspace_id);

            ALTER TABLE nodes ADD COLUMN identity_name TEXT;
            ALTER TABLE nodes ADD COLUMN identity_symbol TEXT;
        "#,
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
