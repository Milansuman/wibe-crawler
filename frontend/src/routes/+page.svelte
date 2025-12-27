
<script lang="ts">
  import { goto } from "$app/navigation";
  import {authClient} from "$lib/auth-client";
  import {safeRPC} from "$lib/api-client";
  import type {PageProps} from "./$types";

  import {Input} from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { toast } from "svelte-sonner";

  const session = authClient.useSession();

  $effect(() => {
    if(!$session.data && !$session.isPending){
      goto("/login");
    }
  });

  const {data: projectResult}: PageProps = $props();
  let url = $state("https://");

  const handleNewProject = async () => {
    const {data, error} = await safeRPC.projects.createProject({
      url
    });

    if(error){
      toast.error(error.message);
    }else{
      goto(`/project/${data.id}`);
    }
  }
</script>

<div class="flex flex-col gap-3 p-6 w-full h-full">
  <form class="flex flex-row gap-3 w-full">
    <Input placeholder="Enter a url to start a new project" defaultValue={url} oninput={(event) => url = event.currentTarget.value}/>
    <Button onclick={handleNewProject}>New Project</Button>
  </form>
  <h1 class="font-bold text-3xl">Projects</h1>
  <div class="flex flex-col gap-2">
    {#each projectResult.projects as project}
      <a href={`/project/${project.id}`}>{project.url}</a>
    {/each}
  </div>
</div>