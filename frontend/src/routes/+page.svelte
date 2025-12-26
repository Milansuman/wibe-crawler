
<script lang="ts">
  import { goto } from "$app/navigation";
  import {authClient} from "$lib/auth-client";
  import {safeRPC} from "$lib/api-client";

  import {Input} from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";

  const session = authClient.useSession();

  $effect(() => {
    if(!$session.data && !$session.isPending){
      goto("/login");
    }
  });

  const projectResult = safeRPC.projects.getProjectsForUser();
</script>

<div class="flex flex-col gap-3 p-6 w-full h-full">
  <form class="flex flex-row gap-3 w-full">
    <Input placeholder="Enter a url to start a new project"/>
    <Button>New Project</Button>
  </form>
  <h1 class="font-bold text-3xl">Projects</h1>
  {#await projectResult}
    <div class="w-full h-full flex flex-row gap-2 flex-wrap">
      <p>Loading</p>
    </div>
  {:then {data}} 
    <div class="flex flex-col gap-2">
      {#each data as project}
        <a href={`/project/${project.id}`}>{project.url}</a>
      {/each}
    </div>
  {/await}
</div>