<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import dayjs from "dayjs";
import { useCategoriesStore } from "../stores/categories";
import { addTransaction } from "../db/transactions";
import { yuanToCents } from "../utils/money";
import type { TxType } from "../db/categories";

const store = useCategoriesStore();

const type = ref<TxType>("expense");
const majorId = ref<number | null>(null);
const subId = ref<number | null>(null);
const amount = ref("");
const date = ref(dayjs().format("YYYY-MM-DD"));
const note = ref("");

const majors = computed(() => store.majorsOf(type.value));
const subs = computed(() => (majorId.value ? store.childrenOf(majorId.value) : []));

// 切换收支类型 / 一级大类时，清空已选下级分类
watch(type, () => {
  majorId.value = null;
  subId.value = null;
});
watch(majorId, () => {
  subId.value = null;
});

async function submit() {
  let cents: number;
  try {
    cents = yuanToCents(amount.value);
  } catch (e) {
    ElMessage.warning((e as Error).message);
    return;
  }
  if (cents <= 0) {
    ElMessage.warning("请输入大于 0 的金额");
    return;
  }
  // 选了二级小类用二级，否则用一级大类
  const categoryId = subId.value ?? majorId.value;
  if (!categoryId) {
    ElMessage.warning("请选择分类");
    return;
  }
  try {
    await addTransaction(type.value, categoryId, cents, date.value, note.value.trim());
    ElMessage.success("记账成功 ✓");
    amount.value = "";
    note.value = "";
  } catch (e) {
    ElMessage.error("保存失败：" + e);
  }
}
</script>

<template>
  <div class="record-page">
    <el-card class="record-card">
      <template #header>✏️ 记一笔</template>
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="类型">
          <el-radio-group v-model="type">
            <el-radio-button value="expense">💰 支出</el-radio-button>
            <el-radio-button value="income">💵 收入</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="金额（元）">
          <el-input
            v-model="amount"
            placeholder="0.00"
            size="large"
            @keyup.enter="submit"
          >
            <template #prefix>¥</template>
          </el-input>
        </el-form-item>

        <el-form-item label="分类">
          <div class="category-row">
            <el-select v-model="majorId" placeholder="一级大类" clearable>
              <el-option v-for="m in majors" :key="m.id" :label="m.name" :value="m.id" />
            </el-select>
            <el-select
              v-model="subId"
              placeholder="二级小类"
              clearable
              :disabled="!majorId || subs.length === 0"
            >
              <el-option v-for="s in subs" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </div>
        </el-form-item>

        <el-form-item label="日期">
          <el-date-picker
            v-model="date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="备注（可选）">
          <el-input
            v-model="note"
            placeholder="例如：和同事一起吃午饭"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <el-button type="primary" size="large" style="width: 100%" @click="submit">
          保存
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.record-page {
  display: flex;
  justify-content: center;
}

.record-card {
  width: 520px;
  max-width: 100%;
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
