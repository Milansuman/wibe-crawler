<script lang="ts">
  import { safeRPC } from "$lib/api-client";
  import { Button } from "$lib/components/ui/button";
  import type {PageProps} from "./$types";
  import {page} from "$app/state";
  import { toast } from "svelte-sonner";
  import {Network} from "vis-network";
  import { onMount } from "svelte";

  const {data}: PageProps = $props();

  let urls = $state(data.urls);
  let isCrawling = $state(false);
  let visContainer = $state<HTMLDivElement | null>(null);
  let abortController: AbortController | null = null;
  let network: Network | null = null;

  // Get color based on interest score (0-10)
  const getColorByInterest = (interest: number) => {
    if (interest >= 8) return "#ef4444"; // red - high interest
    if (interest >= 6) return "#f97316"; // orange
    if (interest >= 4) return "#eab308"; // yellow
    if (interest >= 2) return "#84cc16"; // lime
    return "#22c55e"; // green - low interest
  };

  const initializeNetwork = () => {
    if (!visContainer || urls.length === 0) return;

    // Create nodes from URLs
    const nodes = urls.map((url) => {
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
    const edges = urls
      .filter((url) => url.parentUrlId)
      .map((url) => ({
        from: url.parentUrlId,
        to: url.id,
        arrows: 'to',
        smooth: { type: 'cubicBezier' }
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
        margin: 10,
        widthConstraint: {
          maximum: 300
        }
      },
      edges: {
        color: { color: '#848484' },
        width: 2
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        zoomView: true,
        dragView: true
      }
    };

    network = new Network(visContainer, networkData, options);

    // Focus on root node initially
    const rootNodes = urls.filter(url => !url.parentUrlId);
    if (rootNodes.length > 0) {
      setTimeout(() => {
        network?.focus(rootNodes[0].id, {
          scale: 0.8,
          animation: {
            duration: 500,
            easingFunction: 'easeInOutQuad'
          }
        });
      }, 100);
    }
  };

  const updateNetwork = () => {
    if (!network || !visContainer) {
      initializeNetwork();
      return;
    }

    // Get existing node IDs
    const existingNodeIds = new Set(network.body.data.nodes.getIds());

    // Only add new nodes
    const newNodes = urls
      .filter((url) => !existingNodeIds.has(url.id))
      .map((url) => {
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

    // Get existing edge pairs
    const existingEdges = network.body.data.edges.get();
    const existingEdgePairs = new Set(
      existingEdges.map((e: any) => `${e.from}-${e.to}`)
    );

    // Only add new edges
    const newEdges = urls
      .filter((url) => url.parentUrlId)
      .filter((url) => !existingEdgePairs.has(`${url.parentUrlId}-${url.id}`))
      .map((url) => ({
        from: url.parentUrlId,
        to: url.id,
        arrows: 'to',
        smooth: { type: 'cubicBezier' }
      }));

    if (newNodes.length > 0) {
      network.body.data.nodes.add(newNodes);
    }
    if (newEdges.length > 0) {
      network.body.data.edges.add(newEdges);
    }
  };

  onMount(() => {
    initializeNetwork();
  });

  $effect(() => {
    // Re-render network when urls change
    if (urls.length > 0) {
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
          urls.push(url);
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


</script>

<div class="flex flex-col gap-2 w-full h-full p-6">
  <div class="flex flex-row justify-between">
    <span>
      <h1 class="text-4xl font-bold">Crawl Project</h1>
      <p class="text-foreground-muted">{data.url}</p>
    </span>
    <Button variant={isCrawling ? "destructive" : "default"} onclick={handleCrawlUrls}>{!isCrawling ? "Start Crawling" : "Stop Crawling"}</Button>
  </div>
  <div class="w-full h-full min-h-[600px] border rounded-lg" bind:this={visContainer}>

  </div>
</div>
