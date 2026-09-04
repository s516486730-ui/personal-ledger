import Database from "@tauri-apps/plugin-sql";

/** 数据库连接单例：整个应用只建立一次连接并复用 */
let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:ledger.db");
  }
  return db;
}
