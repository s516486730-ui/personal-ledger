<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import dayjs from "dayjs";
import { useCategoriesStore } from "../stores/categories";
import {
  deleteTransaction,
  listTransactions,
  sumByType,
  updateTransaction,
  type TransactionFilters,
  type TransactionWithCategory,
} from "../db/transactions";
import { centsToYuan, yuanToCents } from "../utils/money";
import type { TxType } from "../db/categories";

const store = useCategoriesStore();

// ---- 筛选条件 ----
const month = ref(dayjs().format("YYYY-MM"));
const typeFilter = ref<"" | TxType>("");
const majorFilter = ref<number | null>(null);
const keyword = ref("");

const startDate = computed(() => `${month.value}-01`);
const endDate = computed(() => dayjs(`${month.value}-01`).endOf("month").format("YYYY-MM-DD"));

const allMajors = computed(() => [...store.expenseMajors, ...store.incomeMajors]);

// ---- 数据 ----
const rows = ref<TransactionWithCategory[]>([]);
const totals = ref({ expense: 0, income: 0 });

async function load() {
  const filters: TransactionFilters = {
    startDate: startDate.value,
    endDate: endDate.value,
  };
  if (typeFilter.value) filters.type = typeFilter.value;
  if (majorFilter.value) {
    const kids = store.childrenOf(majorFilter.value);
    filters.categoryIds = kids.length > 0 ? kids.map((k) => k.id) : [majorFilter.value];
  }
  if (keyword.value.trim()) filters.keyword = keyword.value.trim();
  rows.value = await listTransactions(filters);
  // 本月合计始终按整月统计（不受筛选影响）
  totals.value = await sumByType(startDate.value, endDate.value);
}

function changeMonth(delta: number) {
  month.value = dayjs(`${month.value}-01`).add(delta, "month").format("YYYY-MM");
  load();
}

function search() {
  load();
}

// ---- 编辑 ----
const editVisible = ref(false);
const editId = ref<number | null>(null);
const editType = ref<TxType>("expense");
const editMajorId = ref<number | null>(null);
const editSubId = ref<number | null>(null);
const editAmount = ref("");
const editDate = ref("");
const editNote = ref("");

const editMajors = computed(() => store.majorsOf(editType.value));
const editSubs = computed(() => (editMajorId.value ? store.childrenOf(editMajorId.value) : []));

function openEdit(row: TransactionWithCategory) {
  const cat = store.byId(row.category_id);
  editId.value = row.id;
  editType.value = row.type;
  editMajorId.value = cat?.parent_id ?? cat?.id ?? null;
  editSubId.value = cat?.parent_id ? cat.id : null;
  editAmount.value = centsToYuan(row.amount_cents);
  editDate.value = row.occurred_date;
  editNote.value = row.note;
  editVisible.value = true;
}

async function saveEdit() {
  let cents: number;
  try {
    cents = yuanToCents(editAmount.value);
  } catch (e) {
    ElMessage.warning((e as Error).message);
    return;
  }
  if (cents <= 0) {
    ElMessage.warning("请输入大于 0 的金额");
    return;
  }
  const categoryId = editSubId.value ?? editMajorId.value;
  if (!categoryId) {
    ElMessage.warning("请选择分类");
    return;
  }
  await updateTransaction(
    editId.value!,
    editType.value,
    categoryId,
    cents,
    editDate.value,
    editNote.value.trim(),
  );
  ElMessage.success("已保存修改");
  editVisible.value = false;
  await load();
}

// ---- 删除 ----
async function removeRow(row: TransactionWithCategory) {
  try {
    await ElMessageBox.confirm(
      `确定删除这笔账吗？${store.fullName(row.category_id)} ${centsToYuan(row.amount_cents)} 元`,
      "删除确认",
      { type: "warning", confirmButtonText: "删除", cancelButtonText: "取消" },
    );
  } catch {
    return; // 用户取消
  }
  await deleteTransaction(row.id);
  ElMessage.success("已删除");
  await load();
}

onMounted(async () => {
  if (!store.loaded) await store.refresh();
  await load();
});
</script>

<template>
  <div class="tx-page">
    <!-- 筛选工具栏 -->
    <el-card shadow="never" class="toolbar">
      <div class="toolbar-row">
        <div class="month-nav">
          <el-button size="small" @click="changeMonth(-1)">◀</el-button>
          <el-date-picker
            v-model="month"
            type="month"
            value-format="YYYY-MM"
            format="YYYY 年 MM 月"
            :clearable="false"
            size="small"
            style="width: 130px"
            @change="load"
          />
          <el-button size="small" @click="changeMonth(1)">▶</el-button>
        </div>

        <el-radio-group v-model="typeFilter" size="small" @change="load">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
        </el-radio-group>

        <el-select
          v-model="majorFilter"
          placeholder="全部分类"
          clearable
          size="small"
          style="width: 140px"
          @change="load"
        >
          <el-option v-for="m in allMajors" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>

        <el-input
          v-model="keyword"
          placeholder="搜索备注…"
          clearable
          size="small"
          style="width: 180px"
          @keyup.enter="search"
          @clear="search"
        >
          <template #append>
            <el-button @click="search">搜索</el-button>
          </template>
        </el-input>
      </div>

      <!-- 本月合计 -->
      <div class="summary-row">
        <div class="summary-item">
          <span class="summary-label">本月支出</span>
          <span class="summary-value expense">¥{{ centsToYuan(totals.expense) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">本月收入</span>
          <span class="summary-value income">¥{{ centsToYuan(totals.income) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">结余</span>
          <span class="summary-value">{{ centsToYuan(totals.income - totals.expense) }}</span>
        </div>
      </div>
    </el-card>

    <!-- 账单表格 -->
    <el-card shadow="never">
      <el-table :data="rows" stripe empty-text="这个月还没有账单，去「记一笔」页添加吧">
        <el-table-column prop="occurred_date" label="日期" width="110" />
        <el-table-column label="类型" width="70">
          <template #default="{ row }">
            <el-tag :type="row.type === 'expense' ? 'danger' : 'success'" size="small">
              {{ row.type === "expense" ? "支出" : "收入" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="180">
          <template #default="{ row }">{{ store.fullName(row.category_id) }}</template>
        </el-table-column>
        <el-table-column label="金额（元）" width="130" align="right">
          <template #default="{ row }">
            <span :class="row.type === 'expense' ? 'amount-expense' : 'amount-income'">
              {{ row.type === "expense" ? "-" : "+" }}{{ centsToYuan(row.amount_cents) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="160">
          <template #default="{ row }">{{ row.note || "—" }}</template>
        </el-table-column>
        <el-table-column label="操作" width="130" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" title="编辑账单" width="480px">
      <el-form label-position="top">
        <el-form-item label="类型">
          <el-radio-group v-model="editType">
            <el-radio-button value="expense">支出</el-radio-button>
            <el-radio-button value="income">收入</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额（元）">
          <el-input v-model="editAmount" placeholder="0.00" @keyup.enter="saveEdit">
            <template #prefix>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="分类">
          <div class="category-row">
            <el-select v-model="editMajorId" placeholder="一级大类" clearable>
              <el-option v-for="m in editMajors" :key="m.id" :label="m.name" :value="m.id" />
            </el-select>
            <el-select
              v-model="editSubId"
              placeholder="二级小类"
              clearable
              :disabled="!editMajorId || editSubs.length === 0"
            >
              <el-option v-for="s in editSubs" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="editDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注（可选）">
          <el-input v-model="editNote" maxlength="100" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  margin-bottom: 12px;
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.month-nav {
  display: flex;
  gap: 4px;
  align-items: center;
}

.summary-row {
  display: flex;
  gap: 40px;
  padding-top: 12px;
  border-top: 1px dashed var(--el-border-color-light);
}

.summary-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.summary-label {
  color: #909399;
  font-size: 13px;
}

.summary-value {
  font-size: 20px;
  font-weight: 600;
}

.summary-value.expense {
  color: #f56c6c;
}

.summary-value.income {
  color: #67c23a;
}

.amount-expense {
  color: #f56c6c;
  font-weight: 600;
}

.amount-income {
  color: #67c23a;
  font-weight: 600;
}

.category-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.category-row .el-select {
  flex: 1;
}
</style>
