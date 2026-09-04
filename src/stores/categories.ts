import { defineStore } from "pinia";
import { listCategories, type Category, type TxType } from "../db/categories";

/** 分类全局缓存：各页面共享一份分类数据，分类管理页改动后调用 refresh() 刷新 */
export const useCategoriesStore = defineStore("categories", {
  state: () => ({
    loaded: false,
    all: [] as Category[],
  }),
  getters: {
    /** 支出大类（一级） */
    expenseMajors: (state) => state.all.filter((c) => c.type === "expense" && c.parent_id === null),
    /** 收入大类（一级） */
    incomeMajors: (state) => state.all.filter((c) => c.type === "income" && c.parent_id === null),
  },
  actions: {
    async refresh() {
      this.all = await listCategories();
      this.loaded = true;
    },
    /** 某大类下的二级小类 */
    childrenOf(parentId: number): Category[] {
      return this.all.filter((c) => c.parent_id === parentId);
    },
    /** 某收支类型下的全部大类 */
    majorsOf(type: TxType): Category[] {
      return this.all.filter((c) => c.type === type && c.parent_id === null);
    },
    /** 按 id 找分类 */
    byId(id: number): Category | undefined {
      return this.all.find((c) => c.id === id);
    },
    /** 分类全名（"一级 / 二级" 或 "一级"） */
    fullName(categoryId: number): string {
      const c = this.byId(categoryId);
      if (!c) return "";
      if (c.parent_id === null) return c.name;
      const p = this.byId(c.parent_id);
      return p ? `${p.name} / ${c.name}` : c.name;
    },
  },
});
