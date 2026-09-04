-- 个人记账 初始数据：分类表 + 交易记录表 + 内置默认分类

-- 分类表（两级：parent_id 为 NULL 是一级大类，指向一级的是二级小类）
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('expense','income')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_default  INTEGER NOT NULL DEFAULT 0,   -- 1=系统预置分类，禁止删除
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- 交易记录表（金额恒为正整数「分」，收支用 type 区分）
CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT    NOT NULL CHECK (type IN ('expense','income')),
  category_id   INTEGER NOT NULL REFERENCES categories(id),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  occurred_date TEXT    NOT NULL,           -- 'YYYY-MM-DD' 记账日期
  note          TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(occurred_date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);

PRAGMA journal_mode = WAL;

-- ============ 内置默认分类（is_default=1，不可删除） ============

-- 支出：一级大类（id 1-10）
INSERT INTO categories (id, name, parent_id, type, sort_order, is_default) VALUES
  (1,  '餐饮饮食', NULL, 'expense', 1, 1),
  (2,  '交通出行', NULL, 'expense', 2, 1),
  (3,  '购物消费', NULL, 'expense', 3, 1),
  (4,  '居住住房', NULL, 'expense', 4, 1),
  (5,  '通讯网络', NULL, 'expense', 5, 1),
  (6,  '娱乐休闲', NULL, 'expense', 6, 1),
  (7,  '医疗健康', NULL, 'expense', 7, 1),
  (8,  '教育学习', NULL, 'expense', 8, 1),
  (9,  '人情往来', NULL, 'expense', 9, 1),
  (10, '其他支出', NULL, 'expense', 10, 1);

-- 收入：一级大类（id 11-15）
INSERT INTO categories (id, name, parent_id, type, sort_order, is_default) VALUES
  (11, '工资薪金', NULL, 'income', 11, 1),
  (12, '理财投资', NULL, 'income', 12, 1),
  (13, '兼职副业', NULL, 'income', 13, 1),
  (14, '人情往来', NULL, 'income', 14, 1),
  (15, '其他收入', NULL, 'income', 15, 1);

-- 支出：二级小类（1xx 起，与一级 id 对应）
INSERT INTO categories (id, name, parent_id, type, sort_order, is_default) VALUES
  (101, '早餐',     1, 'expense', 1, 1),
  (102, '午餐',     1, 'expense', 2, 1),
  (103, '晚餐',     1, 'expense', 3, 1),
  (104, '零食饮料', 1, 'expense', 4, 1),
  (105, '外卖',     1, 'expense', 5, 1),
  (106, '聚餐',     1, 'expense', 6, 1),
  (201, '公交地铁', 2, 'expense', 1, 1),
  (202, '打车',     2, 'expense', 2, 1),
  (203, '加油充电', 2, 'expense', 3, 1),
  (204, '停车费',   2, 'expense', 4, 1),
  (205, '火车票',   2, 'expense', 5, 1),
  (206, '飞机票',   2, 'expense', 6, 1),
  (301, '日用百货', 3, 'expense', 1, 1),
  (302, '服饰鞋包', 3, 'expense', 2, 1),
  (303, '数码家电', 3, 'expense', 3, 1),
  (304, '美妆护肤', 3, 'expense', 4, 1),
  (401, '房租月供', 4, 'expense', 1, 1),
  (402, '水电燃气', 4, 'expense', 2, 1),
  (403, '物业费',   4, 'expense', 3, 1),
  (404, '家居用品', 4, 'expense', 4, 1),
  (405, '维修装修', 4, 'expense', 5, 1),
  (501, '手机话费', 5, 'expense', 1, 1),
  (502, '宽带上网', 5, 'expense', 2, 1),
  (503, '会员订阅', 5, 'expense', 3, 1),
  (601, '电影演出', 6, 'expense', 1, 1),
  (602, '游戏充值', 6, 'expense', 2, 1),
  (603, '旅游度假', 6, 'expense', 3, 1),
  (604, '运动健身', 6, 'expense', 4, 1),
  (701, '看病买药', 7, 'expense', 1, 1),
  (702, '体检保健', 7, 'expense', 2, 1),
  (801, '书籍资料', 8, 'expense', 1, 1),
  (802, '课程培训', 8, 'expense', 2, 1),
  (803, '考试报名', 8, 'expense', 3, 1),
  (804, '文具用品', 8, 'expense', 4, 1),
  (901, '红包礼金', 9, 'expense', 1, 1),
  (902, '请客送礼', 9, 'expense', 2, 1),
  (903, '孝敬父母', 9, 'expense', 3, 1),
  (904, '捐款',     9, 'expense', 4, 1),
  (1001, '宠物支出', 10, 'expense', 1, 1),
  (1002, '意外支出', 10, 'expense', 2, 1),
  (1003, '其他',    10, 'expense', 3, 1);

-- 收入：二级小类（11xx 起，与一级 id 对应）
INSERT INTO categories (id, name, parent_id, type, sort_order, is_default) VALUES
  (1101, '基本工资',     11, 'income', 1, 1),
  (1102, '奖金绩效',     11, 'income', 2, 1),
  (1103, '补贴报销',     11, 'income', 3, 1),
  (1201, '存款利息',     12, 'income', 1, 1),
  (1202, '基金股票收益', 12, 'income', 2, 1),
  (1203, '房租收入',     12, 'income', 3, 1),
  (1301, '兼职收入',     13, 'income', 1, 1),
  (1302, '稿费',         13, 'income', 2, 1),
  (1303, '二手转卖',     13, 'income', 3, 1),
  (1401, '收到红包',     14, 'income', 1, 1),
  (1402, '礼金返还',     14, 'income', 2, 1),
  (1501, '其他',         15, 'income', 1, 1);
