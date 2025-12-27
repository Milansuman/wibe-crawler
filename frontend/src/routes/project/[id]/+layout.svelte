<script lang="ts">
  import {LayoutDashboard, Globe, Cookie, AtSign, Settings, Form, House} from "lucide-svelte";
  import {page} from "$app/state";

  const {children} = $props();
</script>

<div class="flex flex-row w-full h-full bg-background text-foreground rounded-xl border border-border">
  <nav class="h-full flex flex-col gap-4 p-3 border-r border-border">
    <a href={`/project/${page.params.id}`}>
      <LayoutDashboard/>
    </a>
    <a href={`/project/${page.params.id}/urls`}>
      <Globe/>
    </a>
    <a href={`/project/${page.params.id}/cookies`}>
      <Cookie/>
    </a>
    <a href={`/project/${page.params.id}/emails`}>
      <AtSign/>
    </a>
    <a href={`/project/${page.params.id}/forms`}>
      <Form/>
    </a>
    <a class="mt-auto" href={`/project/${page.params.id}/settings`}>
      <Settings/>
    </a>
    <a href="/">
      <House/>
    </a>
  </nav>
  <div class="w-full h-full flex flex-col overflow-auto">
    {@render children()}
  </div>
  <div class="min-w-96 border-l border-border">

  </div>
</div>