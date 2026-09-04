<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useCategoriesStore } from "./stores/categories";
import { ElMessage } from "element-plus";

const router = useRouter();
const categories = useCategoriesStore();

onMounted(async () => {
  try {
    await categories.refresh();
  } catch (e) {
    ElMessage.error("数据加载失败：" + e);
  }
});
</script>

<template>
  <el-container class="app-shell">
    <el-aside width="160px" class="app-aside">
      <div class="app-logo">💰 个人记账</div>
      <el-menu router :default-active="router.currentRoute.value.path" class="app-menu">
        <el-menu-item index="/">
          <span>✏️ 记一笔</span>
        </el-menu-item>
        <el-menu-item index="/transactions">
          <span>📒 账单</span>
        </el-menu-item>
        <el-menu-item index="/stats">
          <span>📊 统计</span>
        </el-menu-item>
        <el-menu-item index="/categories">
          <span>🗂️ 分类管理</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <span>⚙️ 设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<style>
html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
}

.app-shell {
  height: 100%;
}

.app-aside {
  border-right: 1px solid var(--el-border-color-light);
  display: flex;
  flex-direction: column;
  background: #fff;
}

.app-logo {
  padding: 18px 12px;
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  border-bottom: 1px solid var(--el-border-color-light);
  user-select: none;
}

.app-menu {
  border-right: none;
  flex: 1;
}

.app-main {
  background: #f5f7fa;
  padding: 20px;
  overflow-y: auto;
}
</style>
