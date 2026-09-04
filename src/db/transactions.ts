import { getDb } from "./index";
import type { TxType } from "./categories";

export interface Transaction {
  id: number;
  type: TxType;
  category_id: number;
  amount_cents: number;
  occurred_date: string;
  note: string;
}

/** 带分类名称的账单记录（列表页展示用） */
export interface TransactionWithCategory extends Transaction {
  parent_name: string | null;
  category_name: string;
}

export interface TransactionFilters {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;
  type?: TxType;
  categoryIds?: number[]; // 分类筛选：传入 id 数组（选一级大类时传入其全部二级 id）
  keyword?: string;
}

/** 新增一笔账 */
export async function addTransaction(
  type: TxType,
  categoryId: number,
  amountCents: number,
  occurredDate: string,
  note: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO transactions (type, category_id, amount_cents, occurred_date, note) VALUES ($1, $2, $3, $4, $5)",
    [type, categoryId, amountCents, occurredDate, note],
  );
}

/** 修改一笔账 */
export async function updateTransaction(
  id: number,
  type: TxType,
  categoryId: number,
  amountCents: number,
  occurredDate: string,
  note: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE transactions SET type = $1, category_id = $2, amount_cents = $3, occurred_date = $4, note = $5, updated_at = datetime('now','localtime') WHERE id = $6",
    [type, categoryId, amountCents, occurredDate, note, id],
  );
}

/** 删除一笔账 */
export async function deleteTransaction(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM transactions WHERE id = $1", [id]);
}

/** 按筛选条件查询账单（默认按日期倒序） */
export async function listTransactions(
  filters: TransactionFilters,
): Promise<TransactionWithCategory[]> {
  const db = await getDb();
  const where: string[] = ["t.occurred_date >= $1", "t.occurred_date <= $2"];
  const params: (string | number)[] = [filters.startDate, filters.endDate];
  if (filters.type) {
    params.push(filters.type);
    where.push(`t.type = $${params.length}`);
  }
  if (filters.categoryIds && filters.categoryIds.length > 0) {
    const start = params.length + 1;
    params.push(...filters.categoryIds);
    const placeholders = filters.categoryIds.map((_, i) => `$${start + i}`).join(", ");
    where.push(`t.category_id IN (${placeholders})`);
  }
  if (filters.keyword) {
    params.push(`%${filters.keyword}%`);
    where.push(`t.note LIKE $${params.length}`);
  }
  const sql = `
    SELECT t.id, t.type, t.category_id, t.amount_cents, t.occurred_date, t.note,
           c.name AS category_name, p.name AS parent_name
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE ${where.join(" AND ")}
    ORDER BY t.occurred_date DESC, t.id DESC`;
  return db.select<TransactionWithCategory[]>(sql, params);
}

/** 时间段内收支合计（分） */
export async function sumByType(
  startDate: string,
  endDate: string,
): Promise<{ expense: number; income: number }> {
  const db = await getDb();
  const rows = await db.select<{ type: TxType; total: number }[]>(
    `SELECT type, SUM(amount_cents) AS total FROM transactions
     WHERE occurred_date >= $1 AND occurred_date <= $2 GROUP BY type`,
    [startDate, endDate],
  );
  const result = { expense: 0, income: 0 };
  for (const row of rows) result[row.type] = row.total;
  return result;
}

/** 时间段内各二级分类合计（饼图用） */
export async function sumByCategory(
  type: TxType,
  startDate: string,
  endDate: string,
): Promise<{ name: string; parent_name: string | null; total: number }[]> {
  const db = await getDb();
  return db.select(
    `SELECT c.name AS name, p.name AS parent_name, SUM(t.amount_cents) AS total
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     LEFT JOIN categories p ON p.id = c.parent_id
     WHERE t.type = $1 AND t.occurred_date >= $2 AND t.occurred_date <= $3
     GROUP BY t.category_id ORDER BY total DESC`,
    [type, startDate, endDate],
  );
}

/** 时间段内按月分组的收支趋势（折线图用） */
export async function monthlyTrend(
  startDate: string,
  endDate: string,
): Promise<{ month: string; type: TxType; total: number }[]> {
  const db = await getDb();
  return db.select(
    `SELECT strftime('%Y-%m', occurred_date) AS month, type, SUM(amount_cents) AS total
     FROM transactions
     WHERE occurred_date >= $1 AND occurred_date <= $2
     GROUP BY month, type ORDER BY month`,
    [startDate, endDate],
  );
}

/** 全部账单（CSV 导出用，按日期正序） */
export async function allTransactionsForCsv(): Promise<TransactionWithCategory[]> {
  const db = await getDb();
  return db.select(
    `SELECT t.id, t.type, t.category_id, t.amount_cents, t.occurred_date, t.note,
            c.name AS category_name, p.name AS parent_name
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     LEFT JOIN categories p ON p.id = c.parent_id
     ORDER BY t.occurred_date ASC, t.id ASC`,
  );
}
