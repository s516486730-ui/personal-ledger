import { getDb } from "./index";

export type TxType = "expense" | "income";

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  type: TxType;
  sort_order: number;
  is_default: number;
}

/** 查询全部分类（可按收支类型过滤），一级在前、二级跟随其后 */
export async function listCategories(type?: TxType): Promise<Category[]> {
  const db = await getDb();
  const sql = type
    ? "SELECT * FROM categories WHERE type = $1 ORDER BY sort_order, id"
    : "SELECT * FROM categories ORDER BY sort_order, id";
  return type ? db.select<Category[]>(sql, [type]) : db.select<Category[]>(sql);
}

/** 新增分类（parentId 为 null 时是一级大类） */
export async function addCategory(
  name: string,
  parentId: number | null,
  type: TxType,
): Promise<Category> {
  const db = await getDb();
  const sortOrder = await nextSortOrder(parentId, type);
  await db.execute(
    "INSERT INTO categories (name, parent_id, type, sort_order, is_default) VALUES ($1, $2, $3, $4, 0)",
    [name, parentId, type, sortOrder],
  );
  const rows = await db.select<Category[]>(
    "SELECT * FROM categories WHERE id = last_insert_rowid()",
  );
  return rows[0];
}

/** 重命名分类（所有分类均可改名） */
export async function renameCategory(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE categories SET name = $1 WHERE id = $2", [name, id]);
}

/** 删除分类前必须由前端执行完整性检查（有记账记录/有子类时拦截）；此函数仅执行删除 */
export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM categories WHERE id = $1", [id]);
}

/** 该分类下已记账的笔数（>0 则不允许删除） */
export async function countTransactionsByCategory(categoryId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM transactions WHERE category_id = $1",
    [categoryId],
  );
  return rows[0]?.n ?? 0;
}

/** 该一级分类下的二级小类数量（>0 则一级不允许删除） */
export async function countChildren(categoryId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(
    "SELECT COUNT(*) AS n FROM categories WHERE parent_id = $1",
    [categoryId],
  );
  return rows[0]?.n ?? 0;
}

/** 新分类的排序号 = 同级现有最大排序号 + 1 */
async function nextSortOrder(parentId: number | null, type: TxType): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ max: number | null }[]>(
    "SELECT MAX(sort_order) AS max FROM categories WHERE type = $1 AND parent_id IS $2",
    [type, parentId],
  );
  return (rows[0]?.max ?? 0) + 1;
}
