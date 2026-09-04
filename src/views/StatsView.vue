<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import * as echarts from "echarts/core";
import { LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import dayjs from "dayjs";
import { useCategoriesStore } from "../stores/categories";
import { monthlyTrend, sumByCategory, sumByType } from "../db/transactions";
import { centsToYuan } from "../utils/money";

echarts.use([LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

/**
 * 图表配色（经 dataviz 校验脚本验证通过）：
 * - 折线图：支出 #e34948 / 收入 #1baf7a（色觉障碍安全对，配合图例与端点文字标签）
 * - 饼图：8 色分类色板按固定顺序取用；「其他」用中性灰 #898781（每块直接文字标签 + 图例 + 表格三重兜底）
 * - 文字一律用墨色 token，不用系列色；金额数据下方有表格视图（无障碍要求）
 */
const CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER_COLOR = "#898781";
const EXPENSE_COLOR = "#e34948";
const INCOME_COLOR = "#1baf7a";
const GRID_LINE = "#e1e0d9";
const AXIS_INK = "#898781";

const store = useCategoriesStore();

/**
 * 页面模式：
 * - 「月总占比」：整页只显示某一个月 —— 月统计卡片 + 近12个月趋势 + 本月收支环形图 + 本月支出分类饼图
 * - 「年总占比」：整页只显示某一年 —— 年统计卡片 + 该年12个月趋势图 + 本年收支环形图（独立的图和数据）
 */
const scopeType = ref<"month" | "year">("month");
const month = ref(dayjs().format("YYYY-MM"));
const year = ref(dayjs().format("YYYY"));

const totals = ref({ expense: 0, income: 0 });
const yearTotals = ref({ expense: 0, income: 0 });
const pieRows = ref<{ name: string; value: number; percent: number; color: string }[]>([]);
const hasMonthData = ref(false);
const hasYearData = ref(false);

const startDate = computed(() => `${month.value}-01`);
const endDate = computed(() => dayjs(`${month.value}-01`).endOf("month").format("YYYY-MM-DD"));
const trendStart = computed(() =>
  dayjs(`${month.value}-01`).subtract(11, "month").format("YYYY-MM-01"),
);
const yearStart = computed(() => `${year.value}-01-01`);
const yearEnd = computed(() => `${year.value}-12-31`);

/** 占比环形图在当前模式下是否无账目 */
const donutEmpty = computed(() => {
  const src = scopeType.value === "month" ? totals.value : yearTotals.value;
  return src.expense === 0 && src.income === 0;
});

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
const trendEl = ref<HTMLDivElement | null>(null); // 月模式：近12个月趋势
const yearTrendEl = ref<HTMLDivElement | null>(null); // 年模式：该年12个月趋势
const pieEl = ref<HTMLDivElement | null>(null);
const donutEl = ref<HTMLDivElement | null>(null);
let trendChart: ReturnType<typeof echarts.init> | null = null;
let yearTrendChart: ReturnType<typeof echarts.init> | null = null;
let pieChart: ReturnType<typeof echarts.init> | null = null;
let donutChart: ReturnType<typeof echarts.init> | null = null;

/** v-if 会让容器在「有数据/无数据」之间销毁重建：图表必须绑定当前的 DOM 元素 */
function ensureChart(el: HTMLDivElement | null, chart: ReturnType<typeof echarts.init> | null): ReturnType<typeof echarts.init> | null {
  if (!el) return chart;
  if (chart && chart.getDom() === el) return chart;
  chart?.dispose();
  return echarts.init(el);
}

async function load() {
  if (scopeType.value === "month") await loadMonth();
  else await loadYear();
}

async function loadMonth() {
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

  // 当月支出分类占比（前 7 + 其他）
  const cats = await sumByCategory("expense", startDate.value, endDate.value);
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
  hasMonthData.value = total > 0 || trend.length > 0;

  // 必须 await nextTick()：等 v-if 的 DOM 真正渲染完成后再初始化（历史 BUG 修复）
  await nextTick();
  trendChart = ensureChart(trendEl.value, trendChart);
  pieChart = ensureChart(pieEl.value, pieChart);
  donutChart = ensureChart(donutEl.value, donutChart);

  renderTrend(months, expenseSeries, incomeSeries);
  renderPie();
  renderDonut();
}

async function loadYear() {
  yearTotals.value = await sumByType(yearStart.value, yearEnd.value);

  // 该年 12 个月收支趋势（年模式独立的趋势图）
  const trend = await monthlyTrend(yearStart.value, yearEnd.value);
  const months: string[] = [];
  for (let i = 1; i <= 12; i++) months.push(`${year.value}-${String(i).padStart(2, "0")}`);
  const expenseSeries = months.map(() => 0);
  const incomeSeries = months.map(() => 0);
  for (const row of trend) {
    const idx = months.indexOf(row.month);
    if (idx >= 0) {
      if (row.type === "expense") expenseSeries[idx] = row.total;
      else incomeSeries[idx] = row.total;
    }
  }
  hasYearData.value = trend.length > 0;

  await nextTick();
  yearTrendChart = ensureChart(yearTrendEl.value, yearTrendChart);
  donutChart = ensureChart(donutEl.value, donutChart);

  renderYearTrend(months, expenseSeries, incomeSeries);
  renderDonut();
}

function renderTrend(months: string[], expenseSeries: number[], incomeSeries: number[]) {
  if (!trendChart) return;
  trendChart.setOption(trendOption(months.map((m) => m.slice(5) + "月"), expenseSeries, incomeSeries));
}

function renderYearTrend(months: string[], expenseSeries: number[], incomeSeries: number[]) {
  if (!yearTrendChart) return;
  yearTrendChart.setOption(
    trendOption(
      months.map((m) => Number(m.slice(5)) + "月"),
      expenseSeries,
      incomeSeries,
    ),
  );
}

/** 折线图公共配置（选择性直接标注：只在每条线最后一个点标注系列名） */
function trendOption(labels: string[], expenseSeries: number[], incomeSeries: number[]) {
  // 两个系列的文字标注都在最后一个点上方、上下错开 16px：
  // 即使某条线为 0 贴住横轴，或两值接近，文字也不会重叠
  const seriesData = (data: number[], name: string, offsetY: number) =>
    data.map((v, i) =>
      i === data.length - 1
        ? {
            value: v,
            label: {
              show: true,
              formatter: name,
              position: "top",
              offset: [0, offsetY],
              color: "#52514e",
              fontSize: 11,
            },
          }
        : v,
    );
  return {
    grid: { left: 10, right: 16, top: 42, bottom: 8, containLabel: true },
    legend: { top: 6, itemWidth: 14, itemHeight: 10, textStyle: { color: "#52514e" } },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => "¥" + centsToYuan(v),
    },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: "#c3c2b7" } },
      axisTick: { show: false },
      axisLabel: { color: AXIS_INK },
    },
    yAxis: {
      type: "value",
      // 底部留出约 5% 的空隙：零值曲线不紧贴横轴，横轴标签不被遮挡
      min: (value: { min: number; max: number }) =>
        value.min - Math.max((value.max - value.min) * 0.05, 1),
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
        data: seriesData(expenseSeries, "支出", -6),
        color: EXPENSE_COLOR,
        lineStyle: { width: 2 },
        symbol: "circle",
        symbolSize: 6,
      },
      {
        name: "收入",
        type: "line",
        data: seriesData(incomeSeries, "收入", -22),
        color: INCOME_COLOR,
        lineStyle: { width: 2 },
        symbol: "circle",
        symbolSize: 6,
      },
    ],
  };
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

/** 收支总占比环形图（月/年范围由 scopeType 决定，颜色为已校验的固定实体色） */
function renderDonut() {
  if (!donutChart) return;
  const src = scopeType.value === "month" ? totals.value : yearTotals.value;
  const data = [
    { name: "支出", value: src.expense, color: EXPENSE_COLOR },
    { name: "收入", value: src.income, color: INCOME_COLOR },
  ].filter((d) => d.value > 0);
  donutChart.setOption({
    // selectedMode: false —— 图例只作颜色说明，点击不再隐藏/显示饼块（图表固定）
    legend: { bottom: 0, itemWidth: 14, itemHeight: 10, textStyle: { color: "#52514e" }, selectedMode: false },
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
  yearTrendChart?.resize();
  pieChart?.resize();
  donutChart?.resize();
}

onMounted(async () => {
  if (!store.loaded) await store.refresh();
  window.addEventListener("resize", onResize);
  await load();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  trendChart?.dispose();
  yearTrendChart?.dispose();
  pieChart?.dispose();
  donutChart?.dispose();
});
</script>

<template>
  <div class="stats-page">
    <!-- 筛选行：月模式选月份，年模式选年份 -->
    <div class="filter-row">
      <el-date-picker
        v-if="scopeType === 'month'"
        v-model="month"
        type="month"
        value-format="YYYY-MM"
        format="YYYY 年 MM 月"
        :clearable="false"
        style="width: 140px"
        @change="load"
      />
      <el-date-picker
        v-else
        v-model="year"
        type="year"
        value-format="YYYY"
        format="YYYY 年"
        :clearable="false"
        style="width: 140px"
        @change="load"
      />
      <el-radio-group v-model="scopeType" size="small" @change="load">
        <el-radio-button value="month">📊 月总占比</el-radio-button>
        <el-radio-button value="year">📆 年总占比</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 汇总卡片：月模式只显示月统计，年模式只显示年统计 -->
    <div class="summary-groups">
      <el-card v-if="scopeType === 'month'" shadow="never" class="summary-group">
        <template #header>📅 月统计</template>
        <div class="stats-row">
          <div class="stat-item">
            <span class="dot" style="background: #e34948"></span>
            <span class="card-label">本月支出</span>
            <div class="card-value">¥{{ centsToYuan(totals.expense) }}</div>
          </div>
          <div class="stat-item">
            <span class="dot" style="background: #1baf7a"></span>
            <span class="card-label">本月收入</span>
            <div class="card-value">¥{{ centsToYuan(totals.income) }}</div>
          </div>
          <div class="stat-item">
            <span class="dot" style="background: #c3c2b7"></span>
            <span class="card-label">本月结余</span>
            <div class="card-value">
              {{ totals.income - totals.expense >= 0 ? "¥" : "-¥"
              }}{{ centsToYuan(Math.abs(totals.income - totals.expense)) }}
            </div>
          </div>
        </div>
      </el-card>

      <el-card v-else shadow="never" class="summary-group">
        <template #header>📅 年统计（{{ year }} 年）</template>
        <div class="stats-row">
          <div class="stat-item">
            <span class="dot" style="background: #e34948"></span>
            <span class="card-label">年支出</span>
            <div class="card-value">¥{{ centsToYuan(yearTotals.expense) }}</div>
          </div>
          <div class="stat-item">
            <span class="dot" style="background: #1baf7a"></span>
            <span class="card-label">年收入</span>
            <div class="card-value">¥{{ centsToYuan(yearTotals.income) }}</div>
          </div>
          <div class="stat-item">
            <span class="dot" style="background: #c3c2b7"></span>
            <span class="card-label">年结余</span>
            <div class="card-value">
              {{ yearTotals.income - yearTotals.expense >= 0 ? "¥" : "-¥"
              }}{{ centsToYuan(Math.abs(yearTotals.income - yearTotals.expense)) }}
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 趋势图：月模式 = 近12个月；年模式 = 该年独立的 12 个月趋势 -->
    <el-card v-if="scopeType === 'month'" shadow="never" class="chart-card">
      <template #header>近 12 个月收支趋势</template>
      <el-empty v-if="!hasMonthData" description="暂无数据，先去记一笔吧" />
      <div v-else ref="trendEl" class="chart trend-chart"></div>
    </el-card>
    <el-card v-else shadow="never" class="chart-card">
      <template #header>{{ year }} 年收支趋势</template>
      <el-empty v-if="!hasYearData" description="这一年还没有账目" />
      <div v-else ref="yearTrendEl" class="chart trend-chart"></div>
    </el-card>

    <!-- 占比环形图（两种模式共用，数据按模式切换）+ 月模式专属的分类饼图/明细 -->
    <div class="bottom-row">
      <el-card shadow="never" class="chart-card panel">
        <template #header>收支总占比（{{ scopeType === "month" ? "本月" : `${year} 年` }}）</template>
        <el-empty v-if="donutEmpty" :description="scopeType === 'month' ? '本月暂无账目' : '这一年暂无账目'" />
        <div v-else ref="donutEl" class="chart donut-chart"></div>
      </el-card>

      <el-card v-if="scopeType === 'month'" shadow="never" class="chart-card panel">
        <template #header>本月支出分类占比</template>
        <el-empty v-if="pieRows.length === 0" description="本月暂无支出账目" />
        <div v-else ref="pieEl" class="chart pie-chart"></div>
      </el-card>

      <el-card v-if="scopeType === 'month'" shadow="never" class="chart-card panel">
        <template #header>本月支出分类明细</template>
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

.summary-groups {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.summary-group {
  flex: 1;
  min-width: 320px;
}

.stats-row {
  display: flex;
  justify-content: space-around;
  flex-wrap: wrap;
  gap: 12px;
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

.donut-chart {
  height: 260px;
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
</style>
