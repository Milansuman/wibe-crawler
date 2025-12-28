<script lang="ts">
  import { safeRPC } from "$lib/api-client";
  import { Button } from "$lib/components/ui/button";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "$lib/components/ui/tabs";
  import type {PageProps} from "./$types";
  import {page} from "$app/state";
  import { toast } from "svelte-sonner";
  import {Network} from "vis-network";
  import { onMount } from "svelte";
  import {SvelteMap } from "svelte/reactivity";

  const {data}: PageProps = $props();

  let urls = $state(new SvelteMap<string, any>());
  let isCrawling = $state(false);
  let visContainer = $state<HTMLDivElement | null>(null);
  let abortController: AbortController | null = null;
  let network: any = null;
  let activeTab = $state("graph");

  // Get color based on interest score (0-10)
  const getColorByInterest = (interest: number) => {
    if (interest >= 8) return "#ef4444"; // red - high interest
    if (interest >= 6) return "#f97316"; // orange
    if (interest >= 4) return "#eab308"; // yellow
    if (interest >= 2) return "#84cc16"; // lime
    return "#22c55e"; // green - low interest
  };

  const initializeNetwork = () => {
    if (!visContainer || urls.size === 0) return;

    // Create nodes from URLs
    const nodes = Array.from(urls.values()).map((url) => {
      const interestColor = getColorByInterest(url.interest);
      const isCrawled = url.crawled;

      return {
        id: url.id,
        label: url.url,
        title: `${url.url}\nLevel: ${url.level}\nInterest: ${url.interest}\nCrawled: ${isCrawled}`,
        color: {
          background: isCrawled ? interestColor : 'transparent',
          border: interestColor,
          highlight: {
            background: isCrawled ? interestColor : 'rgba(0,0,0,0.1)',
            border: '#000000'
          }
        },
        level: url.level,
        font: { color: isCrawled ? '#ffffff' : interestColor }
      };
    });

    // Create edges based on parent-child relationships
    const edges = Array.from(urls.values())
      .filter((url) => url.parentUrlId)
      .map((url) => ({
        from: url.parentUrlId!,
        to: url.id,
        arrows: 'to',
        smooth: { enabled: true, type: 'cubicBezier', roundness: 0.5 }
      }));

    const networkData = {
      nodes,
      edges
    };

    const options = {
      layout: {
        hierarchical: {
          enabled: true,
          direction: 'UD',
          sortMethod: 'directed',
          levelSeparation: 500,
          nodeSpacing: 400
        }
      },
      physics: {
        enabled: false,
      },
      nodes: {
        shape: 'box',
        margin: { top: 10, right: 10, bottom: 10, left: 10 },
        widthConstraint: {
          maximum: 300
        }
      },
      edges: {
        color: { color: '#848484' },
        width: 2
      },
      interaction: {
        hover: false,
        tooltipDelay: 100,
        zoomView: true,
        dragView: true,
        dragNodes: false,
        selectable: false,
        zoomSpeed: 0.5
      }
    };

    network = new Network(visContainer, networkData, options);

    // Fit the entire network in view initially
    setTimeout(() => {
      try {
        network?.fit({
          animation: {
            duration: 500,
            easingFunction: 'easeInOutQuad'
          }
        });
      } catch (e) {
        console.error('Error fitting network:', e);
      }
    }, 100);
  };

  const updateNetwork = () => {
    if (!network || !visContainer) {
      initializeNetwork();
      return;
    }

    // Get existing node IDs
    const existingNodeIds = new Set(network.body.data.nodes.getIds());

    // Separate new nodes and nodes to update
    const newNodes: any[] = [];
    const nodesToUpdate: any[] = [];

    Array.from(urls.values()).forEach((url) => {
      const interestColor = getColorByInterest(url.interest);
      const isCrawled = url.crawled;
      
      const nodeData = {
        id: url.id,
        label: url.url,
        title: `${url.url}\nLevel: ${url.level}\nInterest: ${url.interest}\nCrawled: ${isCrawled}`,
        color: {
          background: isCrawled ? interestColor : 'transparent',
          border: interestColor,
          highlight: {
            background: isCrawled ? interestColor : 'rgba(0,0,0,0.1)',
            border: '#000000'
          }
        },
        level: url.level,
        font: { color: isCrawled ? '#ffffff' : interestColor }
      };

      if (!existingNodeIds.has(url.id)) {
        newNodes.push(nodeData);
      } else {
        // Update existing node if it's now crawled
        nodesToUpdate.push(nodeData);
      }
    });

    // Get existing edge pairs
    const existingEdges = network.body.data.edges.get();
    const existingEdgePairs = new Set(
      existingEdges.map((e: any) => `${e.from}-${e.to}`)
    );

    // Only add new edges
    const newEdges = Array.from(urls.values())
      .filter((url) => url.parentUrlId)
      .filter((url) => !existingEdgePairs.has(`${url.parentUrlId}-${url.id}`))
      .map((url) => ({
        from: url.parentUrlId,
        to: url.id,
        arrows: 'to',
        smooth: { enabled: true, type: 'cubicBezier', roundness: 0.5 }
      }));

    if (newNodes.length > 0) {
      network.body.data.nodes.add(newNodes);
    }
    if (nodesToUpdate.length > 0) {
      network.body.data.nodes.update(nodesToUpdate);
    }
    if (newEdges.length > 0) {
      network.body.data.edges.add(newEdges);
    }
  };

  onMount(() => {
    // Initialize urls from data
    data.urls.forEach(url => {
      urls.set(url.id, url);
    });
    initializeNetwork();
  });

  $effect(() => {
    // Re-render network when urls change
    if (urls.size > 0) {
      console.log("rerendering")
      updateNetwork();
    }
  });

  const handleCrawlUrls = async () => {
    if(!isCrawling){
      // Start crawling
      isCrawling = true;
      abortController = new AbortController();

      try {
        const {data, error} = await safeRPC.urls.crawlWebsiteUrls({
          projectId: page.params.id!,
          withAi: false
        }, {
          signal: abortController.signal
        });

        if(error){
          console.error(error);
          toast.error("An error occurred");
          isCrawling = false;
          return;
        }

        for await(const url of data!){
          if(abortController.signal.aborted) {
            break;
          }
          if(!url.crawled){
            // Add new uncrawled URL
            urls.set(url.id, url);
          }else{
            // Update existing URL to mark as crawled
            const existingUrl = urls.get(url.id);
            if(existingUrl) {
              existingUrl.crawled = true;
              urls.set(url.id, existingUrl);
            }
          }
        }

        toast.success("Crawling completed");
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          toast.info("Crawling stopped");
        } else {
          console.error(error);
          toast.error("An error occurred");
        }
      } finally {
        isCrawling = false;
        abortController = null;
      }
    } else {
      // Stop crawling
      if(abortController) {
        abortController.abort();
      }
    }
  }


  // Get color based on interest score (0-10) for list view
  const getColorClassByInterest = (interest: number) => {
    if (interest >= 8) return "text-red-500";
    if (interest >= 6) return "text-orange-500";
    if (interest >= 4) return "text-yellow-500";
    if (interest >= 2) return "text-lime-500";
    return "text-green-500";
  };

  const urlsArray = $derived(Array.from(urls.values()).sort((a, b) => a.level - b.level));
</script>

<div class="flex flex-col gap-2 w-full h-full p-6">
  <div class="flex flex-row justify-between">
    <span>
      <h1 class="text-4xl font-bold">Crawl Project</h1>
      <p class="text-muted-foreground">{data.url}</p>
    </span>
    <Button variant={isCrawling ? "destructive" : "default"} onclick={handleCrawlUrls}>
      {!isCrawling ? "Start Crawling" : "Stop Crawling"}
    </Button>
  </div>

  <Tabs bind:value={activeTab} class="flex-1 flex flex-col">
    <TabsList class="w-fit">
      <TabsTrigger value="graph">Graph View</TabsTrigger>
      <TabsTrigger value="list">List View</TabsTrigger>
    </TabsList>

    <TabsContent value="graph" class="flex-1 mt-4">
      <div class="w-full h-full min-h-150 border rounded-lg" bind:this={visContainer}></div>
    </TabsContent>

    <TabsContent value="list" class="flex-1 mt-4">
      {#if urlsArray.length === 0}
        <div class="flex items-center justify-center p-12 border border-border rounded-lg bg-muted/20">
          <p class="text-muted-foreground">No URLs found. Start crawling to discover URLs.</p>
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each urlsArray as url}
            <div class="flex flex-col gap-2 p-4 border border-border rounded-lg bg-card hover:bg-muted/50 transition-colors {!url.crawled ? 'opacity-60' : ''}">
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <a 
                      href={url.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      class="text-sm font-medium text-primary hover:underline break-all"
                    >
                      {url.url}
                    </a>
                  </div>
                  <div class="flex flex-wrap gap-3 mt-2 text-xs">
                    <span class="text-muted-foreground">
                      <span class="font-medium text-foreground">Level:</span> {url.level}
                    </span>
                    <span class={getColorClassByInterest(url.interest)}>
                      <span class="font-medium text-foreground">Interest:</span> {url.interest}/10
                    </span>
                    <span class="text-muted-foreground">
                      <span class="font-medium text-foreground">Type:</span> {url.type}
                    </span>
                    <span class="text-muted-foreground">
                      <span class="font-medium text-foreground">Status:</span>
                      <span class={url.crawled ? "text-green-500" : "text-yellow-500"}>
                        {url.crawled ? "Crawled" : "Pending"}
                      </span>
                    </span>
                  </div>
                </div>
                <button
                  onclick={() => navigator.clipboard.writeText(url.url)}
                  class="px-3 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors whitespace-nowrap"
                >
                  Copy
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </TabsContent>
  </Tabs>
</div>
