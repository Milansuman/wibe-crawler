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
  import {
    Send,
    StopCircle,
    Trash,
    Loader2,
    Settings,
    Check,
  } from "lucide-svelte";
  import SvelteMarkdown from "svelte-markdown";
  import {Spinner} from "$lib/components/ui/spinner";
  import * as Tabs from "$lib/components/ui/tabs";

  interface Project {
    id: string;
    title: string;
    url: string;
    cookies: string | null;
    localStorage: any | null;
  }

  interface ProjectMessage {
    id: string;
    projectId: string;
    role: "user" | "system" | "assistant" | "tool" | null;
    text: string | null;
  }

  interface StreamingMessage {
    role: "assistant" | "reasoning" | "tool";
    text: string;
  }

  interface PageUrl {
    id: string;
    projectId: string;
    url: string;
    js: string | null;
    html: string | null;
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
  let projectUrls = $state<PageUrl[]>([]);
  let selectedUrl = $state<PageUrl | undefined>();
  let urlDetailsDialogOpen = $state(false);
  let urlDetailsTab = $state<"html" | "js">("html");

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
    if (promptInput.length > 0 && currentProject) {
      isStreaming = true;
      abortController = new AbortController();

      const promptText = promptInput; //stop promptInput state change from affecting projectMessages
      promptInput = ""; // Clear input immediately

      projectMessages.push({
        id: "deadbeef",
        projectId: currentProject.id,
        role: "user",
        text: promptText,
      });

      try {
        const { data: responseStream, error } =
          await safeRPC.agent.getAgentResponse(
            {
              prompt: promptText,
              projectId: currentProject.id,
            },
            {
              signal: abortController.signal,
            },
          );

        if (error) {
          console.log(error);
          toast.error(error.message);
          return;
        }

        for await (const responseObject of responseStream) {
          // If type changed, save current buffer to streaming messages array
          if (
            currentType &&
            responseObject.type !== currentType &&
            currentBuffer.length > 0
          ) {
            const role =
              currentType === "text"
                ? "assistant"
                : currentType === "reasoning"
                  ? "reasoning"
                  : "tool";
            streamingMessages.push({
              role,
              text: currentBuffer,
            });

            // Also push to project messages if it's text
            if (currentType === "text") {
              projectMessages.push({
                id: "deadbeef",
                projectId: currentProject.id,
                role: "assistant",
                text: currentBuffer,
              });
            }

            currentBuffer = "";
          }

          currentType = responseObject.type as "tool" | "reasoning" | "text";
          currentBuffer += responseObject.content;
        }

        // Push any remaining buffer content when stream ends
        if (currentBuffer.length > 0) {
          const role =
            currentType === "text"
              ? "assistant"
              : currentType === "reasoning"
                ? "reasoning"
                : "tool";
          streamingMessages.push({
            role,
            text: currentBuffer,
          });

          // Also push to project messages if it's text
          if (currentType === "text") {
            projectMessages.push({
              id: "deadbeef",
              projectId: currentProject.id,
              role: "assistant",
              text: currentBuffer,
            });
          }

          currentBuffer = "";
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
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
  };

  const handleStopResponse = () => {
    if (abortController) {
      abortController.abort();
    }
  };

  const handleClearChat = async () => {
    if (!currentProject) return;

    await safeRPC.projects.clearProjectMessages({
      projectId: currentProject.id,
    });
    projectMessages = [];
  };

  const handleUpdateProject = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!currentProject) return;

    settingsLoading = true;
    const formData = new FormData(event.currentTarget as HTMLFormElement);

    const { data: updatedProject, error } =
      await safeRPC.projects.updateProject({
        projectId: currentProject.id,
        url: (formData.get("url") as string) || undefined,
        title: (formData.get("title") as string) || undefined,
        cookies: (formData.get("cookies") as string) || undefined,
        localStorage: (formData.get("localStorage") as string) || undefined,
      });

    if (error) {
      toast.error(error.message);
    } else {
      // Update the project in the projects list
      const projectIndex = projects.findIndex(
        (p) => p.id === updatedProject.id,
      );
      if (projectIndex !== -1) {
        projects[projectIndex] = updatedProject;
      }
      currentProject = updatedProject;
      toast.success("Project updated successfully");
      settingsDialogOpen = false;
    }

    settingsLoading = false;
  };

  // Effects
  $effect(() => {
    if (currentProject) {
      (async () => {
        const { data, error } = await safeRPC.projects.getProjectMessages({
          projectId: currentProject.id,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        projectMessages = data;
      })();

      (async () => {
        const { data, error } = await safeRPC.projects.getProjectUrls({
          projectId: currentProject.id,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        projectUrls = data;
      })();
    }
  });
</script>

<div class="flex flex-row gap-6 p-6 w-full h-full overflow-hidden">
  <nav class="flex flex-col gap-3 w-56 h-full">
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
      open={urlDetailsDialogOpen}
      onOpenChange={(open) => (urlDetailsDialogOpen = open)}
    >
      <Dialog.Content class="dark text-foreground max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        <Dialog.Header class="flex-shrink-0">
          <Dialog.Title>URL Details</Dialog.Title>
          <Dialog.Description class="break-all"
            >{selectedUrl?.url}</Dialog.Description
          >
        </Dialog.Header>
        {#if selectedUrl}
          <Tabs.Root bind:value={urlDetailsTab} class="flex flex-col overflow-hidden flex-1 min-h-0">
            <Tabs.List class="w-full flex-shrink-0">
              <Tabs.Trigger value="html" class="flex-1">HTML</Tabs.Trigger>
              <Tabs.Trigger value="js" class="flex-1">JavaScript</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="html" class="overflow-auto flex-1 min-h-0">
              <pre
                class="bg-secondary p-4 rounded-md text-xs"><code class="whitespace-pre-wrap break-all">{selectedUrl.html || "No HTML content"}</code></pre>
            </Tabs.Content>
            <Tabs.Content value="js" class="overflow-auto flex-1 min-h-0">
              <pre
                class="bg-secondary p-4 rounded-md text-xs"><code class="whitespace-pre-wrap break-all">{selectedUrl.js || "No JavaScript content"}</code></pre>
            </Tabs.Content>
          </Tabs.Root>
        {/if}
      </Dialog.Content>
    </Dialog.Root>
    <Dialog.Root
      open={settingsDialogOpen}
      onOpenChange={(open) => (settingsDialogOpen = open)}
    >
      <Dialog.Content class="dark text-foreground">
        <Dialog.Header>
          <Dialog.Title>Project Settings</Dialog.Title>
          <Dialog.Description>Update project configuration</Dialog.Description>
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
              placeholder="Session=123&Cookie=456 etc"
              value={currentProject.cookies || ""}
            ></textarea>
          </div>
          <div class="flex flex-col gap-2">
            <label for="localStorage" class="text-sm font-medium"
              >Local Storage</label
            >
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
              onclick={() => (settingsDialogOpen = false)}
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
      class="bg-card rounded-xl flex flex-col border border-border w-full h-full"
    >
      <div class="flex flex-row p-3 border-b border-border items-center">
        <div class="flex flex-col max-w-[70%]">
          <h1 class="text-md truncate">{currentProject.title.slice(0, 50)}</h1>
          <p class="text-muted-foreground text-sm">{currentProject.url}</p>
        </div>
        <button
          class="ml-auto hover:text-muted-foreground transition-colors"
          onclick={() => (settingsDialogOpen = true)}
        >
          <Settings />
        </button>
      </div>
      <div class="flex flex-row flex-1 overflow-hidden">
        <div class="w-[70%] border-r border-border flex p-4">
          <!--DASHBOARD-->
          <Tabs.Root>
            <Tabs.List>
              <Tabs.Trigger value="stats">Home</Tabs.Trigger>
              <Tabs.Trigger value="urls">URLs</Tabs.Trigger>
              <Tabs.Trigger value="assets">Assets</Tabs.Trigger>
              <Tabs.Trigger value="stack">Tech Stack</Tabs.Trigger>
              <Tabs.Trigger value="exploits">Vulnerabilities</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="urls" class="overflow-auto">
              <div class="flex flex-col gap-2 mt-4">
                {#if projectUrls.length === 0}
                  <p class="text-muted-foreground text-sm">
                    No URLs have been crawled yet. Chat with the agent to start
                    crawling.
                  </p>
                {:else}
                  <div class="space-y-2 overflow-auto">
                    {#each projectUrls as pageUrl}
                      <button
                        class="w-full text-left p-3 rounded-lg border border-border hover:bg-secondary transition-colors"
                        onclick={() => {
                          selectedUrl = pageUrl;
                          urlDetailsDialogOpen = true;
                          urlDetailsTab = "html";
                        }}
                      >
                        <p class="text-sm font-medium truncate">
                          {pageUrl.url}
                        </p>
                        <div class="flex gap-2 mt-1">
                          {#if pageUrl.html}
                            <span
                              class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                              >HTML</span
                            >
                          {/if}
                          {#if pageUrl.js}
                            <span
                              class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                              >JS</span
                            >
                          {/if}
                        </div>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
        <div class="flex flex-col w-[30%] p-4 gap-2">
          <!--CHAT AREA-->
          <div class="flex flex-col gap-2 overflow-y-auto text-sm">
            {#each projectMessages as projectMessage}
              {#if projectMessage.role === "assistant"}
                <SvelteMarkdown source={projectMessage.text} />
              {:else if projectMessage.role === "user"}
                <div class="w-3/4 ml-auto p-2 rounded-lg border border-border">
                  <p>{projectMessage.text}</p>
                </div>
              {/if}
            {/each}
            {#each streamingMessages as streamMessage}
              {#if streamMessage.role === "assistant"}
                <SvelteMarkdown source={streamMessage.text} />
              {:else if streamMessage.role === "reasoning"}
                <div class="text-sm text-muted-foreground">
                  <SvelteMarkdown source={streamMessage.text} />
                </div>
              {:else if streamMessage.role === "tool"}
                <div class="flex flex-row items-center gap-2">
                  {#if isStreaming && currentType === "tool"}
                    <Spinner/>
                  {:else}
                    <Check />
                  {/if}
                  <p>{streamMessage.text}</p>
                </div>
              {/if}
            {/each}
          </div>
          <div class="mt-auto pt-4 border-t border-border">
            <InputGroup.Root>
              <InputGroup.Textarea
                placeholder="Ask something about the website..."
                bind:value={promptInput}
                disabled={isStreaming}
                onkeydown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAgentPrompt();
                  }
                }}
              />
              <InputGroup.InputGroupAddon align="block-end" class="flex flex-row justify-end">
                <InputGroup.Button onclick={handleClearChat} variant="outline">
                  <Trash/>
                </InputGroup.Button>
                <InputGroup.Button
                  onclick={isStreaming ? handleStopResponse : handleAgentPrompt}
                  disabled={!isStreaming && promptInput.length === 0}
                  variant="outline"
                >
                  {#if isStreaming}
                    <StopCircle/>
                  {:else}
                    <Send/>
                  {/if}
                </InputGroup.Button>
              </InputGroup.InputGroupAddon>
            </InputGroup.Root>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div
      class="bg-card w-full h-full rounded-xl flex flex-col border border-border"
    ></div>
  {/if}
</div>
