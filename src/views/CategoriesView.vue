<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useCategoriesStore } from "../stores/categories";
import {
  addCategory,
  countChildren,
  countTransactionsByCategory,
  deleteCategory,
  renameCategory,
} from "../db/categories";
import type { Category, TxType } from "../db/categories";

const store = useCategoriesStore();

const typeFilter = ref<TxType>("expense");
const majors = computed(() => store.majorsOf(typeFilter.value));

// ---- 弹窗 ----
const dialogVisible = ref(false);
const dialogMode = ref<"addMajor" | "addSub" | "rename">("addMajor");
const dialogName = ref("");
const targetMajor = ref<Category | null>(null);
const targetCategory = ref<Category | null>(null);

const dialogTitle = computed(() => {
  if (dialogMode.value === "addMajor") return "添加大类";
  if (dialogMode.value === "addSub") return `在「${targetMajor.value?.name}」下添加小类`;
  return "重命名分类";
});

function openAddMajor() {
  dialogMode.value = "addMajor";
  dialogName.value = "";
  targetMajor.value = null;
  targetCategory.value = null;
  dialogVisible.value = true;
}

function openAddSub(major: Category) {
  dialogMode.value = "addSub";
  dialogName.value = "";
  targetMajor.value = major;
  targetCategory.value = null;
  dialogVisible.value = true;
}

function openRename(cat: Category) {
  dialogMode.value = "rename";
  dialogName.value = cat.name;
  targetMajor.value = null;
  targetCategory.value = cat;
  dialogVisible.value = true;
}

/** 目标分类的同级列表（用于查重名） */
function siblings(): Category[] {
  if (dialogMode.value === "addMajor") return store.majorsOf(typeFilter.value);
  if (dialogMode.value === "addSub") return store.childrenOf(targetMajor.value!.id);
  const t = targetCategory.value!;
  return t.parent_id === null ? store.majorsOf(t.type) : store.childrenOf(t.parent_id);
}

async function submitDialog() {
  const name = dialogName.value.trim();
  if (!name) {
    ElMessage.warning("请输入分类名称");
    return;
  }
  const dup = siblings().some((c) => c.name === name && c.id !== targetCategory.value?.id);
  if (dup) {
    ElMessage.warning("同级下已有同名分类");
    return;
  }
  if (dialogMode.value === "addMajor") {
    await addCategory(name, null, typeFilter.value);
    ElMessage.success("已添加大类");
  } else if (dialogMode.value === "addSub") {
    await addCategory(name, targetMajor.value!.id, typeFilter.value);
    ElMessage.success("已添加小类");
  } else {
    await renameCategory(targetCategory.value!.id, name);
    ElMessage.success("已重命名");
  }
  dialogVisible.value = false;
  await store.refresh(); // 刷新全局缓存，记一笔页的分类级联立即生效
}

async function removeCategory(cat: Category) {
  try {
    await ElMessageBox.confirm(`确定删除分类「${cat.name}」吗？`, "删除确认", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return; // 用户取消
  }
  if (cat.parent_id === null && (await countChildren(cat.id)) > 0) {
    ElMessage.warning(`「${cat.name}」下还有小类，请先删除小类`);
    return;
  }
  if ((await countTransactionsByCategory(cat.id)) > 0) {
    ElMessage.warning(`「${cat.name}」下已有记账记录，不能删除`);
    return;
  }
  await deleteCategory(cat.id);
  ElMessage.success("已删除");
  await store.refresh();
}

onMounted(async () => {
  if (!store.loaded) await store.refresh();
});
</script>

<template>
  <div class="cat-page">
    <el-card shadow="never">
      <template #header>
        <div class="header-row">
          <span>🗂️ 分类管理</span>
          <div class="header-actions">
            <el-radio-group v-model="typeFilter" size="small">
              <el-radio-button value="expense">支出分类</el-radio-button>
              <el-radio-button value="income">收入分类</el-radio-button>
            </el-radio-group>
            <el-button type="primary" size="small" @click="openAddMajor">＋ 添加大类</el-button>
          </div>
        </div>
      </template>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="提示：所有分类都可以重命名和删除；但已有记账记录的、或还包含小类的分类不能删除。"
        style="margin-bottom: 12px"
      />

      <el-collapse>
        <el-collapse-item v-for="m in majors" :key="m.id" :name="m.id">
          <template #title>
            <div class="major-title">
              <span class="major-name">{{ m.name }}</span>
              <span class="major-count">{{ store.childrenOf(m.id).length }} 个小类</span>
              <span class="major-ops" @click.stop>
                <el-button link type="primary" size="small" @click="openRename(m)">重命名</el-button>
                <el-button link type="danger" size="small" @click="removeCategory(m)">删除</el-button>
              </span>
            </div>
          </template>

          <div class="sub-list">
            <div v-for="s in store.childrenOf(m.id)" :key="s.id" class="sub-row">
              <span class="sub-name">{{ s.name }}</span>
              <span class="sub-ops">
                <el-button link type="primary" size="small" @click="openRename(s)">重命名</el-button>
                <el-button link type="danger" size="small" @click="removeCategory(s)">删除</el-button>
              </span>
            </div>
            <el-button link type="primary" size="small" @click="openAddSub(m)">
              ＋ 添加小类
            </el-button>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="400px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="分类名称">
          <el-input
            v-model="dialogName"
            maxlength="20"
            show-word-limit
            placeholder="请输入名称，最多 20 个字"
            @keyup.enter="submitDialog"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitDialog">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.major-title {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.major-name {
  font-weight: 600;
}

.major-count {
  color: #909399;
  font-size: 12px;
}

.major-ops {
  margin-left: auto;
}

.sub-list {
  padding: 0 16px;
}

.sub-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
}

.sub-ops {
  margin-left: auto;
}
</style>
