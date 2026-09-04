-- 需求变更：「其他支出」下仅保留「其他」小类。
-- 删除预置的宠物支出/意外支出；若已被记账引用则保留，避免破坏数据。
DELETE FROM categories
WHERE id = 1001
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE category_id = 1001);

DELETE FROM categories
WHERE id = 1002
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE category_id = 1002);

-- 「其他」的排序号调整为 1
UPDATE categories SET sort_order = 1 WHERE id = 1003;
