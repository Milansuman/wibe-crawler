<script lang="ts">
  import { PieChart } from "layerchart";
  import type { ChartConfig } from "$lib/components/ui/chart";
  import * as Chart from "$lib/components/ui/chart";

  type PieChartProps = {
    data: Array<{ name: string; value: number; fill: string }>;
    config: ChartConfig;
    total?: number;
    totalLabel?: string;
    className?: string;
  };

  let {
    data,
    config,
    total,
    totalLabel = "Total",
    className = ""
  }: PieChartProps = $props();

  const series = $derived(data.map(item => ({
    key: item.name,
    value: item.value,
    label: item.name,
    color: item.fill
  })));
</script>

<Chart.Container {config} class="mx-auto aspect-square max-h-[250px] {className}">
  <PieChart
    data={data}
    value="value"
    {series}
  />
</Chart.Container>
