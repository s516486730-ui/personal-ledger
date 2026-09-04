import { createRouter, createWebHashHistory } from "vue-router";
import RecordView from "../views/RecordView.vue";
import TransactionsView from "../views/TransactionsView.vue";
import StatsView from "../views/StatsView.vue";
import CategoriesView from "../views/CategoriesView.vue";
import SettingsView from "../views/SettingsView.vue";

const router = createRouter({
  // Tauri 桌面应用用 hash 模式最稳妥（打包后无服务器也能正常跳转）
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "record", component: RecordView, meta: { title: "记一笔" } },
    { path: "/transactions", name: "transactions", component: TransactionsView, meta: { title: "账单" } },
    { path: "/stats", name: "stats", component: StatsView, meta: { title: "统计" } },
    { path: "/categories", name: "categories", component: CategoriesView, meta: { title: "分类管理" } },
    { path: "/settings", name: "settings", component: SettingsView, meta: { title: "设置" } },
  ],
});

export default router;
