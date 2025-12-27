<script lang="ts">
  import { safeRPC } from "$lib/api-client";
  import { Button } from "$lib/components/ui/button";
  import type {PageProps} from "./$types";
  import {page} from "$app/state";
  import { toast } from "svelte-sonner";

  const {data}: PageProps = $props();

  let urls = $state(data.urls);
  let isCrawling = $state(false);
  let abortController: AbortController | null = null;

  const handleCrawlUrls = async () => {
    if(!isCrawling){
      // Start crawling
      isCrawling = true;
      abortController = new AbortController();

      try {
        const {data, error} = await safeRPC.urls.crawlWebsiteUrls({
          projectId: page.params.id!
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
      <p>{data.url}</p>
    </span>
    <Button variant={isCrawling ? "destructive" : "default"} onclick={handleCrawlUrls}>{!isCrawling ? "Start Crawling" : "Stop Crawling"}</Button>
  </div>
  {#each urls as url}
    <p>{url.url}</p>
  {/each}
</div>