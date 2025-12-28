<script lang="ts">
  import {safeRPC} from "$lib/api-client";
  import type {PageProps} from "./$types";
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
  import PieChart from "$lib/components/custom/pie-chart.svelte";
  import BarChart from "$lib/components/custom/bar-chart.svelte";
  import type { ChartConfig } from "$lib/components/ui/chart";

  const {data}: PageProps = $props();

  // Prepare chart data
  const crawlStatusData = $derived((data as any).statistics ? [
    { name: "Crawled", value: (data as any).statistics.urls.crawled, fill: "hsl(210, 100%, 40%)" },
    { name: "Uncrawled", value: (data as any).statistics.urls.uncrawled, fill: "hsl(200, 100%, 85%)" }
  ] : []);

  const crawlStatusConfig: ChartConfig = {
    crawled: {
      label: "Crawled",
      color: "hsl(210, 100%, 40%)"
    },
    uncrawled: {
      label: "Uncrawled",
      color: "hsl(200, 100%, 85%)"
    }
  };

  const typeDistributionData = $derived((data as any).statistics?.typeDistribution.map((item: any) => ({
    type: item.type,
    count: item.count,
    fill: item.type === 'page' ? 'hsl(220, 75%, 45%)' : item.type === 'image' ? 'hsl(215, 80%, 55%)' : item.type === 'pdf' ? 'hsl(210, 85%, 65%)' : item.type === 'video' ? 'hsl(200, 90%, 75%)' : 'hsl(195, 85%, 80%)'
  })) || []);

  const typeConfig: ChartConfig = {
    value: {
      label: "Count",
      color: "hsl(215, 80%, 55%)"
    }
  };

  const interestDistributionData = $derived(
    (data as any).statistics?.interestDistribution
      .sort((a: any, b: any) => a.interest - b.interest)
      .map((item: any) => ({
        interest: `Level ${item.interest}`,
        count: item.count
      })) || []
  );

  const interestConfig: ChartConfig = {
    value: {
      label: "Count",
      color: "hsl(215, 80%, 55%)"
    }
  };

  const levelDistributionData = $derived(
    (data as any).statistics?.levelDistribution
      .sort((a: any, b: any) => a.level - b.level)
      .map((item: any) => ({
        level: `Level ${item.level}`,
        count: item.count
      })) || []
  );

  const levelConfig: ChartConfig = {
    value: {
      label: "Count",
      color: "hsl(215, 80%, 55%)"
    }
  };
</script>

<div class="w-full h-full flex flex-col gap-6 p-6">
  <div>
    <h1 class="text-4xl font-bold text-foreground">Project Overview</h1>
    <p class="text-muted-foreground mt-1">{(data as any).project?.url}</p>
  </div>

  {#if !(data as any).statistics}
    <div class="flex items-center justify-center p-12 border border-border rounded-lg bg-muted/20">
      <p class="text-muted-foreground">No statistics available. Start crawling to see data.</p>
    </div>
  {:else}
    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader class="pb-2">
          <CardDescription>Total URLs</CardDescription>
          <CardTitle class="text-4xl">{(data as any).statistics.urls.total}</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            {(data as any).statistics.urls.crawled} crawled, {(data as any).statistics.urls.uncrawled} pending
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardDescription>Emails Found</CardDescription>
          <CardTitle class="text-4xl">{(data as any).statistics.emails.total}</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Discovered email addresses
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardDescription>Cookies Found</CardDescription>
          <CardTitle class="text-4xl">{(data as any).statistics.cookies.total}</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Discovered cookies
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="pb-2">
          <CardDescription>Crawl Progress</CardDescription>
          <CardTitle class="text-4xl">
            {(data as any).statistics.urls.total > 0 ? Math.round(((data as any).statistics.urls.crawled / (data as any).statistics.urls.total) * 100) : 0}%
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-xs text-muted-foreground">
            Completion rate
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Charts -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Crawl Status</CardTitle>
          <CardDescription>Distribution of crawled vs uncrawled URLs</CardDescription>
        </CardHeader>
        <CardContent>
          <PieChart
            data={crawlStatusData}
            config={crawlStatusConfig}
            total={(data as any).statistics.urls.total}
            totalLabel="URLs"
          />
        </CardContent>
      </Card>

      {#if typeDistributionData.length > 0}
        <Card>
          <CardHeader>
            <CardTitle>URL Types</CardTitle>
            <CardDescription>Distribution by content type</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={typeDistributionData}
              config={typeConfig}
              dataKey="count"
              categoryKey="type"
            />
          </CardContent>
        </Card>
      {/if}

      {#if interestDistributionData.length > 0}
        <Card>
          <CardHeader>
            <CardTitle>Interest Distribution</CardTitle>
            <CardDescription>URLs by interest level</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={interestDistributionData}
              config={interestConfig}
              dataKey="count"
              categoryKey="interest"
            />
          </CardContent>
        </Card>
      {/if}

      {#if levelDistributionData.length > 0}
        <Card>
          <CardHeader>
            <CardTitle>Depth Distribution</CardTitle>
            <CardDescription>URLs by crawl depth level</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={levelDistributionData}
              config={levelConfig}
              dataKey="count"
              categoryKey="level"
            />
          </CardContent>
        </Card>
      {/if}
    </div>
  {/if}
</div>