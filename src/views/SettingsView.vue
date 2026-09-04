<script setup lang="ts">
import { onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { appConfigDir } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import dayjs from "dayjs";
import { getDb } from "../db/index";
import { allTransactionsForCsv } from "../db/transactions";
import { centsToYuan } from "../utils/money";

const dataDir = ref("");
const exporting = ref(false);
const backingUp = ref(false);

onMounted(async () => {
  try {
    dataDir.value = await appConfigDir();
  } catch (e) {
    dataDir.value = "获取失败：" + e;
  }
});

/** 选择备份文件夹：把数据库完整快照复制到用户指定的位置（VACUUM INTO 在线备份，数据一致） */
async function backupToFolder() {
  try {
    const dir = await open({ directory: true, title: "选择备份文件夹" });
    if (!dir) return; // 用户取消
    const dest = `${dir}/个人记账备份_${dayjs().format("YYYYMMDD_HHmmss")}.db`;
    backingUp.value = true;
    const db = await getDb();
    await db.execute(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    ElMessage.success("备份完成：" + dest);
  } catch (e) {
    ElMessage.error("备份失败：" + e);
  } finally {
    backingUp.value = false;
  }
}

/** CSV 字段转义：含逗号/引号/换行的字段加引号包裹 */
function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

async function doExport() {
  try {
    const rows = await allTransactionsForCsv();
    if (rows.length === 0) {
      ElMessage.warning("还没有账单记录，无需导出");
      return;
    }
    let path = await save({
      defaultPath: `个人记账导出_${dayjs().format("YYYYMMDD_HHmmss")}.csv`,
      filters: [{ name: "CSV 文件", extensions: ["csv"] }],
    });
    if (!path) return; // 用户取消
    if (!path.toLowerCase().endsWith(".csv")) path += ".csv";

    exporting.value = true;
    const lines = [
      "日期,类型,一级分类,二级分类,金额(元),备注",
      ...rows.map((r) =>
        [
          r.occurred_date,
          r.type === "expense" ? "支出" : "收入",
          csvEscape(r.parent_name ?? ""),
          csvEscape(r.category_name),
          centsToYuan(r.amount_cents),
          csvEscape(r.note),
        ].join(","),
      ),
    ];
    await invoke("export_csv", { path, content: lines.join("\r\n") });
    ElMessage.success("导出成功：" + path);
  } catch (e) {
    ElMessage.error("导出失败：" + e);
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <el-card shadow="never">
      <template #header>💾 数据备份</template>
      <p class="desc">
        你的所有账单都保存在本机。建议定期导出 CSV 备份（可以用 Excel / WPS
        打开查看），换电脑或重装系统前务必先导出。
      </p>
      <el-button type="primary" :loading="exporting" @click="doExport">
        📄 导出全部账单（CSV）
      </el-button>
    </el-card>

    <el-card shadow="never">
      <template #header>📁 备份到指定文件夹</template>
      <p class="desc">
        点击下方按钮，选择你希望保存备份的文件夹（如 U 盘、网盘同步目录），应用会把完整数据库复制一份过去（文件名带日期时间）。建议定期备份。
      </p>
      <el-button type="primary" :loading="backingUp" @click="backupToFolder">
        📁 选择备份文件夹
      </el-button>
      <p class="desc small">
        数据当前保存位置：<code>{{ dataDir }}</code>
      </p>
    </el-card>

    <el-card shadow="never">
      <template #header>ℹ️ 关于</template>
      <p class="desc">
        个人记账 v0.1.1<br />
        本地记账工具 · 数据不出本机 · 无广告
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 720px;
}

.desc {
  color: #606266;
  font-size: 13px;
  line-height: 1.8;
  margin: 0 0 12px;
}

.desc.small {
  margin: 12px 0 0;
  font-size: 12px;
  color: #909399;
}
</style>
