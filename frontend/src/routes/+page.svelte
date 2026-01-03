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
  import {Send, StopCircle, Trash, Loader2, Settings} from "lucide-svelte";
  import SvelteMarkdown from "svelte-markdown";

  interface Project {
    id: string;
    title: string;
    url: string;
    cookies: string | null;
    localStorage: string | null;
  }

  interface ProjectMessage{
    id: string;
    projectId: string;
    role: "user" | "system" | "assistant" | "tool" | null;
    text: string | null;
  }

  interface StreamingMessage {
    role: "assistant" | "reasoning" | "tool";
    text: string;
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
  let streamingMessages = $state<StreamingMessage[]>([]);
  let currentBuffer = $state("");
  let currentType = $state<"text" | "reasoning" | "tool" | undefined>();
  let projectMessages = $state<ProjectMessage[]>([]);
  let isStreaming = $state(false);
  let abortController = $state<AbortController | undefined>();
  let settingsDialogOpen = $state(false);
  let settingsLoading = $state(false);

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
      isStreaming = true;
      abortController = new AbortController();

      const promptText = promptInput; //stop promptInput state change from affecting projectMessages
      promptInput = ""; // Clear input immediately
      
      projectMessages.push({
        id: "deadbeef",
        projectId: currentProject.id,
        role: "user",
        text: promptText
      })

      try {
        const {data: responseStream, error} = await safeRPC.agent.getAgentResponse({
          prompt: promptText,
          projectId: currentProject.id
        }, {
          signal: abortController.signal
        });

        if(error){
          console.log(error);
          toast.error(error.message);
          return;
        }

        for await (const responseObject of responseStream){
          // If type changed, save current buffer to streaming messages array
          if(currentType && responseObject.type !== currentType && currentBuffer.length > 0){
            const role = currentType === "text" ? "assistant" : currentType === "reasoning" ? "reasoning" : "tool";
            streamingMessages.push({
              role,
              text: currentBuffer
            });
            
            // Also push to project messages if it's text
            if(currentType === "text"){
              projectMessages.push({
                id: "deadbeef",
                projectId: currentProject.id,
                role: "assistant",
                text: currentBuffer
              });
            }
            
            currentBuffer = "";
          }

          currentType = responseObject.type as "tool" | "reasoning" | "text";
          currentBuffer += responseObject.content;
        }

        // Push any remaining buffer content when stream ends
        if(currentBuffer.length > 0){
          const role = currentType === "text" ? "assistant" : currentType === "reasoning" ? "reasoning" : "tool";
          streamingMessages.push({
            role,
            text: currentBuffer
          });
          
          // Also push to project messages if it's text
          if(currentType === "text"){
            projectMessages.push({
              id: "deadbeef",
              projectId: currentProject.id,
              role: "assistant",
              text: currentBuffer
            });
          }
          
          currentBuffer = "";
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          toast.info("Response stopped");
        } else {
          toast.error("An error occurred");
        }
      } finally {
        currentType = undefined;
        streamingMessages = [];
        currentBuffer = "";
        isStreaming = false;
        abortController = undefined;
      }
    }
  }

  const handleStopResponse = () => {
    if (abortController) {
      abortController.abort();
    }
  }

  const handleClearChat = async () => {
    if(!currentProject) return;

    await safeRPC.projects.clearProjectMessages({
      projectId: currentProject.id
    });
    projectMessages = [];
  }

  const handleUpdateProject = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!currentProject) return;
    
    settingsLoading = true;
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    
    const { data: updatedProject, error } = await safeRPC.projects.updateProject({
      projectId: currentProject.id,
      url: formData.get("url") as string || undefined,
      title: formData.get("title") as string || undefined,
      cookies: formData.get("cookies") as string || undefined,
      localStorage: formData.get("localStorage") as string || undefined,
    });

    if (error) {
      toast.error(error.message);
    } else {
      // Update the project in the projects list
      const projectIndex = projects.findIndex(p => p.id === updatedProject.id);
      if (projectIndex !== -1) {
        projects[projectIndex] = updatedProject;
      }
      currentProject = updatedProject;
      toast.success("Project updated successfully");
      settingsDialogOpen = false;
    }
    
    settingsLoading = false;
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
    <Dialog.Root
      open={settingsDialogOpen}
      onOpenChange={(open) => (settingsDialogOpen = open)}
    >
      <Dialog.Content class="dark text-foreground">
        <Dialog.Header>
          <Dialog.Title>Project Settings</Dialog.Title>
          <Dialog.Description>
            Update project configuration
          </Dialog.Description>
        </Dialog.Header>
        <form class="flex flex-col gap-4" onsubmit={handleUpdateProject}>
          <div class="flex flex-col gap-2">
            <label for="title" class="text-sm font-medium">Title</label>
            <Input 
              id="title"
              name="title" 
              placeholder="Project title"
              value={currentProject.title}
            />
          </div>
          <div class="flex flex-col gap-2">
            <label for="url" class="text-sm font-medium">URL</label>
            <Input 
              id="url"
              type="url"
              name="url" 
              placeholder="https://example.com"
              value={currentProject.url}
            />
          </div>
          <div class="flex flex-col gap-2">
            <label for="cookies" class="text-sm font-medium">Cookies</label>
            <textarea 
              id="cookies"
              name="cookies"
              class="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder='Session=123&Cookie=456 etc'
              value={currentProject.cookies || ""}
            ></textarea>
          </div>
          <div class="flex flex-col gap-2">
            <label for="localStorage" class="text-sm font-medium">Local Storage</label>
            <textarea 
              id="localStorage"
              name="localStorage"
              class="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={currentProject.localStorage || ""}
            ></textarea>
          </div>
          <div class="flex gap-2 justify-end">
            <Button 
              type="button" 
              variant="outline"
              onclick={() => settingsDialogOpen = false}
              disabled={settingsLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={settingsLoading}>
              {settingsLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
    <div
      class="bg-card w-full h-full rounded-xl flex flex-col border border-border min-w-0 relative"
    >
      <div
        class="flex flex-row p-4 border-b border-border overflow-hidden w-full min-h-20 items-center"
      >
        <div class="flex flex-col max-w-[70%]">
          <h1 class="text-xl truncate">{currentProject.title}</h1>
          <p class="text-muted-foreground">{currentProject.url}</p>
        </div>
        <button 
          class="ml-auto hover:text-muted-foreground transition-colors"
          onclick={() => settingsDialogOpen = true}
        >
          <Settings/>
        </button>
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
          {:else if message.role === "tool"}
            <div class="flex flex-col">
              <h2 class="font-bold text-blue-400 text-sm">🔧 Tool Call</h2>
              <p class="text-blue-300 text-sm">{message.text}</p>
            </div>
          {/if}
        {/each}

        {#each streamingMessages as streamMsg}
          {#if streamMsg.role === "reasoning"}
            <div class="flex flex-col">
              <h2 class="font-bold text-muted-foreground text-sm">Agent (Reasoning)</h2>
              <p class="text-muted-foreground">{streamMsg.text}</p>
            </div>
          {:else if streamMsg.role === "assistant"}
            <div class="flex flex-col">
              <h2 class="font-bold text-muted-foreground text-sm">Agent</h2>
              <SvelteMarkdown source={streamMsg.text}/>
            </div>
          {:else if streamMsg.role === "tool"}
            <div class="flex flex-col">
              <h2 class="font-bold text-blue-400 text-sm flex items-center gap-2">
                <Loader2 class="animate-spin" size={16}/>
                Calling Tool
              </h2>
              <p class="text-blue-300 text-sm">{streamMsg.text}</p>
            </div>
          {/if}
        {/each}

        {#if currentBuffer.length > 0}
          {#if currentType === "reasoning"}
            <div class="flex flex-col">
              <h2 class="font-bold text-muted-foreground text-sm">Agent (Reasoning)</h2>
              <p class="text-muted-foreground">{currentBuffer}</p>
            </div>
          {:else if currentType === "text"}
            <div class="flex flex-col">
              <h2 class="font-bold text-muted-foreground text-sm">Agent</h2>
              <SvelteMarkdown source={currentBuffer}/>
            </div>
          {:else if currentType === "tool"}
            <div class="flex flex-col">
              <h2 class="font-bold text-blue-400 text-sm flex items-center gap-2">
                <Loader2 class="animate-spin" size={16}/>
                Calling Tool
              </h2>
              <p class="text-blue-300 text-sm">{currentBuffer}</p>
            </div>
          {/if}
        {/if}
      </div>
      <div class="absolute bottom-0 w-full p-4">
        <InputGroup.Root class="backdrop-blur-3xl">
          <InputGroup.Input 
            bind:value={promptInput}
            placeholder="Describe your suggestions" 
            disabled={isStreaming}
          />
          <InputGroup.Addon align="inline-end">
            <InputGroup.Button onclick={handleClearChat} disabled={isStreaming}>
              <Trash/>
            </InputGroup.Button>
            {#if isStreaming}
              <InputGroup.Button onclick={handleStopResponse}>
                <StopCircle size={30}/>
              </InputGroup.Button>
            {:else}
              <InputGroup.Button onclick={handleAgentPrompt} disabled={promptInput.length === 0}>
                <Send size={30}/>
              </InputGroup.Button>
            {/if}
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
