<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import dayjs from "dayjs";
import { useCategoriesStore } from "../stores/categories";
import { addTransaction } from "../db/transactions";
import { addCategory } from "../db/categories";
import { yuanToCents } from "../utils/money";
import type { TxType } from "../db/categories";

const store = useCategoriesStore();

const CUSTOM = "__custom"; // 二级小类下拉框里「自定义输入…」选项的占位值

const type = ref<TxType>("expense");
const majorId = ref<number | null>(null);
const subId = ref<number | string | null>(null);
const customSub = ref("");
const amount = ref("");
const date = ref(dayjs().format("YYYY-MM-DD"));
const note = ref("");

const majors = computed(() => store.majorsOf(type.value));
const subs = computed(() => (majorId.value ? store.childrenOf(majorId.value) : []));
const isCustomSub = computed(() => subId.value === CUSTOM);

// 切换收支类型 / 一级大类时，清空已选下级分类
watch(type, () => {
  majorId.value = null;
  subId.value = null;
  customSub.value = "";
});
watch(majorId, () => {
  subId.value = null;
  customSub.value = "";
});

/** 决定最终入库的分类：自定义输入时按名称复用或新建小类 */
async function resolveCategoryId(): Promise<number | null> {
  if (!majorId.value) return null;
  if (isCustomSub.value) {
    const name = customSub.value.trim();
    if (!name) return null;
    const existing = store.childrenOf(majorId.value).find((c) => c.name === name);
    if (existing) return existing.id;
    const created = await addCategory(name, majorId.value, type.value);
    await store.refresh(); // 让「记一笔」下拉框和分类管理页立即可见新小类
    return created.id;
  }
  return (subId.value as number | null) ?? majorId.value;
}

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
  if (!majorId.value) {
    ElMessage.warning("请选择分类");
    return;
  }
  if (isCustomSub.value && !customSub.value.trim()) {
    ElMessage.warning("请输入自定义小类名称");
    return;
  }
  const categoryId = await resolveCategoryId();
  if (!categoryId) {
    ElMessage.warning("请选择分类");
    return;
  }
  try {
    await addTransaction(type.value, categoryId, cents, date.value, note.value.trim());
    ElMessage.success("记账成功 ✓");
    amount.value = "";
    note.value = "";
    subId.value = null;
    customSub.value = "";
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
        <el-row :gutter="16">
          <el-col :xs="24" :sm="8">
            <el-form-item label="类型">
              <el-radio-group v-model="type" size="large">
                <el-radio-button value="expense">💰 支出</el-radio-button>
                <el-radio-button value="income">💵 收入</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="8">
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
          </el-col>
          <el-col :xs="24" :sm="8">
            <el-form-item label="日期">
              <el-date-picker
                v-model="date"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="8">
            <el-form-item label="一级大类">
              <el-select v-model="majorId" placeholder="请选择一级大类" clearable style="width: 100%">
                <el-option v-for="m in majors" :key="m.id" :label="m.name" :value="m.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="8">
            <el-form-item label="二级小类">
              <el-select
                v-model="subId"
                placeholder="请选择二级小类"
                clearable
                :disabled="!majorId || subs.length === 0"
                style="width: 100%"
              >
                <el-option v-for="s in subs" :key="s.id" :label="s.name" :value="s.id" />
                <el-option :value="CUSTOM" label="➕ 自定义输入…" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col v-if="isCustomSub" :xs="24" :sm="8">
            <el-form-item label="自定义小类名称">
              <el-input
                v-model="customSub"
                placeholder="输入后自动保存为新小类"
                maxlength="20"
                @keyup.enter="submit"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="16">
          <el-col :span="24">
            <el-form-item label="备注（可选）">
              <el-input
                v-model="note"
                placeholder="例如：和同事一起吃午饭"
                maxlength="100"
                show-word-limit
              />
            </el-form-item>
          </el-col>
        </el-row>

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

/* 全屏宽排版：卡片占满整个内容区 */
.record-card {
  width: 100%;
  max-width: 960px;
}
</style>
