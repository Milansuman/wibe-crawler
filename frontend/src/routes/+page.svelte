<script lang="ts">
  import { goto } from "$app/navigation";
  import { authClient } from "$lib/auth-client";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import * as InputGroup from "$lib/components/ui/input-group";
  import type { PageProps } from "./$types";
  import { safeRPC } from "$lib/api-client";
  import { toast } from "svelte-sonner";
  import {Send, StopCircle} from "lucide-svelte";
  import SvelteMarkdown from "svelte-markdown";

  interface Project {
    id: string;
    title: string;
    url: string;
  }

  interface ProjectMessage{
    id: string;
    projectId: string;
    role: "user" | "system" | "assistant" | "tool" | null;
    text: string | null;
  }

  const { data: initialPageData }: PageProps = $props();

  const session = authClient.useSession();

  $effect(() => {
    if (!$session.data && !$session.isPending) {
      goto("/login");
    }
  });

  // States
  let projects = $state(initialPageData.projects);
  let currentProject = $state<Project | undefined>(projects[0]);
  let newProjectLoading = $state(false);
  let newProjectDialogOpen = $state(false);

  let promptInput = $state("");
  let agentResponseReasoningBuffer = $state("");
  let agentResponseBuffer = $state("");
  let responseTokenTypeFlag = $state<"text" | "reasoning" | undefined>();
  let projectMessages = $state<ProjectMessage[]>([]);

  // Handlers
  const handleNewProject = async (event: SubmitEvent) => {
    event.preventDefault();
    newProjectLoading = true;
    console.log("clicked");
    if (!event.currentTarget) return;

    const formData = new FormData(event.currentTarget as HTMLFormElement);
    const { data: newProject, error } = await safeRPC.projects.createProject({
      url: formData.get("url") as string,
    });

    if (error) {
      toast.error(error.message);
    } else {
      projects.push(newProject);
      currentProject = newProject;
    }
    newProjectLoading = false;
    newProjectDialogOpen = false;
  };

  const handleAgentPrompt = async () => {
    if(promptInput.length > 0 && currentProject){

      const promptText = promptInput; //stop promptInput state change from affecting projectMessages
      projectMessages.push({
        id: "deadbeef",
        projectId: currentProject.id,
        role: "user",
        text: promptText
      })

      
      const {data: responseStream, error} = await safeRPC.agent.getAgentResponse({
        prompt: promptInput,
        projectId: currentProject.id
      });

      if(error){
        toast.error(error.message);
        return;
      }

      const {done, value} = await responseStream.next();
      if(done){
        const firstToken = (value as unknown as {type: "text" | "reasoning", content: string})
        responseTokenTypeFlag = firstToken.type;
        if(responseTokenTypeFlag === "text"){
          agentResponseBuffer += firstToken.content;
        }else if(responseTokenTypeFlag === "reasoning"){
          agentResponseReasoningBuffer += firstToken.content;
        }
      }

      for await (const responseObject of responseStream){

        if(responseObject.type === "text"){
          if(responseObject.type !== responseTokenTypeFlag){
            const messageText = agentResponseBuffer; //ensure it isn't the state
            projectMessages.push({
              id: "deadbeef",
              projectId: currentProject.id,
              role: "assistant",
              text: messageText
            })
            agentResponseBuffer = "";
            responseTokenTypeFlag = responseObject.type;
          }

          agentResponseBuffer += responseObject.content;
        }else if(responseObject.type === "reasoning"){
          if(responseObject.type !== responseTokenTypeFlag){
            agentResponseReasoningBuffer = "";
            responseTokenTypeFlag = responseObject.type;
          }

          agentResponseReasoningBuffer += responseObject.content;
        }
      }

      responseTokenTypeFlag = undefined;
    }
  }

  // Effects
  $effect(() => {
    if(currentProject){
      (async () => {
        const {data, error} = await safeRPC.projects.getProjectMessages({
          projectId: currentProject.id
        });

        if(error){
          toast.error(error.message);
          return;
        }

        projectMessages = data;
      })();
    }
  })
</script>

<div class="flex flex-row gap-6 p-2 w-full h-full overflow-hidden">
  <nav class="flex flex-col gap-3 w-56 h-full shrink-0">
    <Dialog.Root
      open={newProjectDialogOpen}
      onOpenChange={(open) => (newProjectDialogOpen = open)}
    >
      <Dialog.Trigger>
        <Button class="w-full">New Project</Button>
      </Dialog.Trigger>
      <Dialog.Content class="dark text-foreground">
        <Dialog.Header>
          <Dialog.Title>Test a new website</Dialog.Title>
          <Dialog.Description
            >Which website do you want to test?</Dialog.Description
          >
        </Dialog.Header>
        <form class="flex flex-row gap-2" onsubmit={handleNewProject}>
          <Input type="url" placeholder="https://example.com" name="url" />
          <Button disabled={newProjectLoading} type="submit"
            >{newProjectLoading ? "Loading..." : "Start Chatting"}</Button
          >
        </form>
      </Dialog.Content>
    </Dialog.Root>
    <div class="flex flex-col">
      {#each projects as project}
        <button
          class="flex flex-row gap-2 p-2 rounded-lg hover:bg-secondary overflow-hidden text-muted-foreground hover:text-foreground"
          onclick={() => (currentProject = project)}
        >
          <span class="truncate">{project.title}</span>
        </button>
      {/each}
    </div>
  </nav>

  {#if currentProject}
    <div
      class="bg-card w-full h-full rounded-xl flex flex-col border border-border min-w-0 relative"
    >
      <div
        class="flex flex-col p-4 border-b border-border overflow-hidden w-full min-h-20"
      >
        <h1 class="text-xl truncate">{currentProject.title}</h1>
        <p class="text-muted-foreground">{currentProject.url}</p>
      </div>
      <div class="flex flex-col gap-2 p-4 pb-16 overflow-auto">
        {#each projectMessages as message}
          {#if message.role === "assistant"}
            <div class="flex flex-col">
              <h2 class="font-bold text-muted-foreground text-sm">Agent</h2>
              <SvelteMarkdown source={message.text}/>
            </div>
          {:else if message.role === "user"}
            <div class="flex flex-col ml-auto text-right">
              <h2 class="font-bold text-muted-foreground text-sm">You</h2>
              <p>{message.text}</p>
            </div>
          {/if}
        {/each}

        {#if responseTokenTypeFlag}
          {#if responseTokenTypeFlag === "reasoning"}
            <div class="flex flex-col">
              <h2 class="font-bold text-muted-foreground text-sm">Agent (Reasoning)</h2>
              <p>{agentResponseReasoningBuffer}</p>
            </div>
          {:else if responseTokenTypeFlag === "text"}
            <div class="flex flex-col">
              <h2 class="font-bold text-muted-foreground text-sm">Agent</h2>
              <p>{agentResponseBuffer}</p>
            </div>
          {/if}
        {/if}
      </div>
      <div class="absolute bottom-0 w-full p-4">
        <InputGroup.Root class="backdrop-blur-3xl">
          <InputGroup.Input placeholder="Describe your suggestions" oninput={(event) => promptInput = event.currentTarget!.value}/>
          <InputGroup.Addon align="inline-end">
            <InputGroup.Button onclick={handleAgentPrompt}>
              <Send size={30}/>
            </InputGroup.Button>
          </InputGroup.Addon>
        </InputGroup.Root>
      </div>
    </div>
  {:else}
    <div
      class="bg-card w-full h-full rounded-xl flex flex-col border border-border"
    ></div>
  {/if}
</div>
