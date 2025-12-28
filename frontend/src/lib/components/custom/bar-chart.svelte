<script lang="ts">
  import { BarChart } from "layerchart";
  import { scaleBand } from "d3-scale";
  import type { ChartConfig } from "$lib/components/ui/chart";
  import * as Chart from "$lib/components/ui/chart";

  type BarChartProps = {
    data: Array<Record<string, any>>;
    config: ChartConfig;
    dataKey: string;
    categoryKey: string;
    className?: string;
  };

  let {
    data,
    config,
    dataKey,
    categoryKey,
    className = ""
  }: BarChartProps = $props();
</script>

<Chart.Container {config} class="h-50 w-full {className}">
  <BarChart
    {data}
    xScale={scaleBand().padding(0.2)}
    x={categoryKey}
    y={dataKey}
    axis="x"
    tooltip={false}
  />
</Chart.Container>
