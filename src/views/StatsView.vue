<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import * as echarts from "echarts/core";
import { LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import dayjs from "dayjs";
import { useCategoriesStore } from "../stores/categories";
import { monthlyTrend, sumByCategory, sumByType } from "../db/transactions";
import { centsToYuan } from "../utils/money";
import type { TxType } from "../db/categories";

echarts.use([LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

/**
 * 图表配色（经 dataviz 校验脚本验证通过）：
 * - 折线图：支出 #e34948 / 收入 #1baf7a（色觉障碍安全对，ΔE 6.9，配合图例与端点文字标签）
 * - 饼图：8 色分类色板按固定顺序取用；「其他」用中性灰 #898781（语义正确，
 *   与红色的 CVD 区分度略低于底线，已用「每块直接文字标签 + 图例 + 下方表格」三重兜底）
 * - 文字一律用墨色 token，不用系列色；金额数据下方有表格视图（无障碍要求）
 */
const CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER_COLOR = "#898781";
const EXPENSE_COLOR = "#e34948";
const INCOME_COLOR = "#1baf7a";
const GRID_LINE = "#e1e0d9";
const AXIS_INK = "#898781";

const store = useCategoriesStore();

const month = ref(dayjs().format("YYYY-MM"));
const pieType = ref<TxType>("expense");
const totals = ref({ expense: 0, income: 0 });
const pieRows = ref<{ name: string; value: number; percent: number; color: string }[]>([]);
const hasAnyData = ref(false);

const startDate = computed(() => `${month.value}-01`);
const endDate = computed(() => dayjs(`${month.value}-01`).endOf("month").format("YYYY-MM-DD"));
const trendStart = computed(() =>
  dayjs(`${month.value}-01`).subtract(11, "month").format("YYYY-MM-01"),
);

// 分类名 → 颜色槽位映射：颜色跟随实体，不跟随排名（换月份颜色不漂移）
const colorMap = new Map<string, string>();

function colorFor(name: string): string {
  if (!colorMap.has(name)) {
    const used = new Set(colorMap.values());
    const free = CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[colorMap.size % CATEGORY_COLORS.length];
    colorMap.set(name, free);
  }
  return colorMap.get(name)!;
}

// ---- 图表实例 ----
const trendEl = ref<HTMLDivElement | null>(null);
const pieEl = ref<HTMLDivElement | null>(null);
const donutEl = ref<HTMLDivElement | null>(null);
let trendChart: ReturnType<typeof echarts.init> | null = null;
let pieChart: ReturnType<typeof echarts.init> | null = null;
let donutChart: ReturnType<typeof echarts.init> | null = null;

async function load() {
  totals.value = await sumByType(startDate.value, endDate.value);

  // 近 12 个月收支趋势
  const trend = await monthlyTrend(trendStart.value, endDate.value);
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    months.push(dayjs(`${month.value}-01`).subtract(i, "month").format("YYYY-MM"));
  }
  const expenseSeries = months.map(() => 0);
  const incomeSeries = months.map(() => 0);
  for (const row of trend) {
    const idx = months.indexOf(row.month);
    if (idx >= 0) {
      if (row.type === "expense") expenseSeries[idx] = row.total;
      else incomeSeries[idx] = row.total;
    }
  }

  // 当月分类占比（前 7 + 其他）
  const cats = await sumByCategory(pieType.value, startDate.value, endDate.value);
  const rows: { name: string; value: number; percent: number; color: string }[] = [];
  const total = cats.reduce((s, c) => s + c.total, 0);
  if (cats.length > 0) {
    const top = cats.slice(0, 7);
    const rest = cats.slice(7).reduce((s, c) => s + c.total, 0);
    for (const c of top) {
      rows.push({ name: c.name, value: c.total, percent: (c.total / total) * 100, color: colorFor(c.name) });
    }
    if (rest > 0) {
      rows.push({ name: "其他", value: rest, percent: (rest / total) * 100, color: OTHER_COLOR });
    }
  }
  pieRows.value = rows;
  hasAnyData.value = total > 0 || trend.length > 0;

  // 容器用 v-if 渲染，因此在这里惰性初始化图表（保证容器已有尺寸）
  if (!trendChart && trendEl.value) trendChart = echarts.init(trendEl.value);
  if (!pieChart && pieEl.value) pieChart = echarts.init(pieEl.value);
  if (!donutChart && donutEl.value) donutChart = echarts.init(donutEl.value);

  renderTrend(months, expenseSeries, incomeSeries);
  renderPie();
  renderDonut();
}

function renderTrend(months: string[], expenseSeries: number[], incomeSeries: number[]) {
  if (!trendChart) return;
  // 选择性直接标注：只在每条线最后一个点标注系列名（≤4 系列允许）
  const seriesData = (data: number[], name: string, position: "top" | "bottom") =>
    data.map((v, i) =>
      i === data.length - 1
        ? { value: v, label: { show: true, formatter: name, position, color: "#52514e", fontSize: 11 } }
        : v,
    );
  trendChart.setOption({
    grid: { left: 10, right: 16, top: 42, bottom: 8, containLabel: true },
    legend: { top: 6, itemWidth: 14, itemHeight: 10, textStyle: { color: "#52514e" } },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => "¥" + centsToYuan(v),
    },
    xAxis: {
      type: "category",
      data: months.map((m) => m.slice(5) + "月"),
      axisLine: { lineStyle: { color: "#c3c2b7" } },
      axisTick: { show: false },
      axisLabel: { color: AXIS_INK },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: AXIS_INK,
        formatter: (v: number) => (v / 100).toFixed(2).replace(/\.?0+$/, "") + "元",
      },
      splitLine: { lineStyle: { color: GRID_LINE } },
    },
    series: [
      {
        name: "支出",
        type: "line",
        data: seriesData(expenseSeries, "支出", "top"),
        color: EXPENSE_COLOR,
        lineStyle: { width: 2 },
        symbol: "circle",
        symbolSize: 6,
      },
      {
        name: "收入",
        type: "line",
        data: seriesData(incomeSeries, "收入", "bottom"),
        color: INCOME_COLOR,
        lineStyle: { width: 2 },
        symbol: "circle",
        symbolSize: 6,
      },
    ],
  });
}

function renderPie() {
  if (!pieChart) return;
  pieChart.setOption({
    legend: { bottom: 0, itemWidth: 14, itemHeight: 10, textStyle: { color: "#52514e" } },
    tooltip: {
      trigger: "item",
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}<br/>¥${centsToYuan(p.value)}（${p.percent.toFixed(1)}%）`,
    },
    series: [
      {
        type: "pie",
        radius: ["42%", "68%"],
        center: ["50%", "44%"],
        // 每块之间留 2px 表面间隔
        itemStyle: { borderColor: "#fcfcfb", borderWidth: 2 },
        label: {
          formatter: "{b} {d}%",
          color: "#52514e",
          fontSize: 11,
        },
        labelLine: { length: 8, length2: 6 },
        data: pieRows.value.map((r) => ({
          name: r.name,
          value: r.value,
          itemStyle: { color: r.color },
        })),
      },
    ],
  });
}

/** 本月收支构成环形图（支出 vs 收入总占比，颜色为已校验的固定实体色） */
function renderDonut() {
  if (!donutChart) return;
  const data = [
    { name: "支出", value: totals.value.expense, color: EXPENSE_COLOR },
    { name: "收入", value: totals.value.income, color: INCOME_COLOR },
  ].filter((d) => d.value > 0);
  donutChart.setOption({
    legend: { bottom: 0, itemWidth: 14, itemHeight: 10, textStyle: { color: "#52514e" } },
    tooltip: {
      trigger: "item",
      formatter: (p: { name: string; value: number; percent: number }) =>
        `${p.name}<br/>¥${centsToYuan(p.value)}（${p.percent.toFixed(1)}%）`,
    },
    series: [
      {
        type: "pie",
        radius: ["46%", "70%"],
        center: ["50%", "44%"],
        itemStyle: { borderColor: "#fcfcfb", borderWidth: 2 },
        label: { formatter: "{b}\n{d}%", color: "#52514e", fontSize: 11 },
        labelLine: { length: 8, length2: 6 },
        data: data.map((d) => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
      },
    ],
  });
}

function onResize() {
  trendChart?.resize();
  pieChart?.resize();
  donutChart?.resize();
}

onMounted(async () => {
  if (!store.loaded) await store.refresh();
  if (trendEl.value) trendChart = echarts.init(trendEl.value);
  if (pieEl.value) pieChart = echarts.init(pieEl.value);
  window.addEventListener("resize", onResize);
  await load();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  trendChart?.dispose();
  pieChart?.dispose();
  donutChart?.dispose();
});
</script>

<template>
  <div class="stats-page">
    <!-- 筛选行 -->
    <div class="filter-row">
      <el-date-picker
        v-model="month"
        type="month"
        value-format="YYYY-MM"
        format="YYYY 年 MM 月"
        :clearable="false"
        style="width: 140px"
        @change="load"
      />
      <el-radio-group v-model="pieType" size="small" @change="load">
        <el-radio-button value="expense">支出占比</el-radio-button>
        <el-radio-button value="income">收入占比</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 本月汇总卡片（数值用墨色文字 + 彩色圆点标识，不靠颜色传义） -->
    <div class="summary-cards">
      <el-card shadow="never" class="summary-card">
        <span class="dot" style="background: #e34948"></span>
        <span class="card-label">本月支出</span>
        <div class="card-value">¥{{ centsToYuan(totals.expense) }}</div>
      </el-card>
      <el-card shadow="never" class="summary-card">
        <span class="dot" style="background: #1baf7a"></span>
        <span class="card-label">本月收入</span>
        <div class="card-value">¥{{ centsToYuan(totals.income) }}</div>
      </el-card>
      <el-card shadow="never" class="summary-card">
        <span class="dot" style="background: #c3c2b7"></span>
        <span class="card-label">本月结余</span>
        <div class="card-value">
          {{ totals.income - totals.expense >= 0 ? "¥" : "-¥"
          }}{{ centsToYuan(Math.abs(totals.income - totals.expense)) }}
        </div>
      </el-card>
    </div>

    <!-- 近 12 个月趋势折线图 -->
    <el-card shadow="never" class="chart-card">
      <template #header>近 12 个月收支趋势</template>
      <el-empty v-if="!hasAnyData" description="暂无数据，先去记一笔吧" />
      <div v-if="hasAnyData" ref="trendEl" class="chart trend-chart"></div>
    </el-card>

    <!-- 本月收支构成 + 当月分类占比 -->
    <div class="bottom-row">
      <el-card shadow="never" class="chart-card panel">
        <template #header>本月收支构成</template>
        <el-empty v-if="totals.expense === 0 && totals.income === 0" description="本月暂无账目" />
        <div v-else ref="donutEl" class="chart donut-chart"></div>
      </el-card>

      <el-card shadow="never" class="chart-card panel">
        <template #header>本月分类占比（{{ pieType === "expense" ? "支出" : "收入" }}）</template>
        <el-empty v-if="pieRows.length === 0" description="本月暂无该类账目" />
        <div v-if="pieRows.length > 0" ref="pieEl" class="chart pie-chart"></div>
      </el-card>

      <!-- 分类明细表（表格视图，满足无障碍要求） -->
      <el-card shadow="never" class="chart-card panel">
        <template #header>分类明细</template>
        <el-table :data="pieRows" size="small" empty-text="暂无数据">
          <el-table-column label="分类" min-width="100">
            <template #default="{ row }">
              <span class="dot" :style="{ background: row.color }"></span>{{ row.name }}
            </template>
          </el-table-column>
          <el-table-column label="金额（元）" align="right" width="110">
            <template #default="{ row }">{{ centsToYuan(row.value) }}</template>
          </el-table-column>
          <el-table-column label="占比" align="right" width="80">
            <template #default="{ row }">{{ row.percent.toFixed(1) }}%</template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.stats-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.summary-cards {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.summary-card {
  flex: 1;
  min-width: 160px;
}

.card-label {
  color: #909399;
  font-size: 13px;
  margin-left: 4px;
}

.card-value {
  font-size: 24px;
  font-weight: 600;
  color: #0b0b0b;
  font-variant-numeric: tabular-nums;
  margin-top: 6px;
}

.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 2px;
}

.chart-card {
  width: 100%;
}

.chart {
  width: 100%;
}

.trend-chart {
  height: 300px;
}

.pie-chart {
  height: 300px;
}

.bottom-row {
  display: flex;
  gap: 12px;
  align-items: stretch;
  flex-wrap: wrap;
}

.bottom-row .panel {
  flex: 1;
  min-width: 300px;
}

.donut-chart {
  height: 260px;
}
</style>
