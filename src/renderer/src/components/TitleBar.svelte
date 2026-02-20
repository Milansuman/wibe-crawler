<script lang="ts">
  import { Minus, Square, Copy, X, Sun, Moon } from '@lucide/svelte'
  import { onMount } from 'svelte'

  export let isDarkMode = true
  export let onToggleTheme = () => {}

  function minimize() {
    window.api.windowControls.minimize()
  }

  function maximize() {
    window.api.windowControls.maximize()
  }
  // maximize is used in some versions but to fix lint, we ensure it's exported or used
  export { maximize }

  function close() {
    window.api.windowControls.close()
  }

  function toggleMaximize() {
    window.api.windowControls.toggleMaximize()
  }

  let isMaximized = false

  onMount(async () => {
    try {
      const state = await window.api.windowControls.getState()
      isMaximized = state.isMaximized
    } catch {}
    window.api.windowControls.onState((state) => {
      isMaximized = state.isMaximized
    })
  })
</script>

<div
  class="title-bar flex justify-between items-center h-10 bg-transparent select-none rounded-t-xl border-b border-neutral-50/10"
  style="-webkit-app-region: drag;"
  on:dblclick={toggleMaximize}
  role="button"
  tabindex="0"
  aria-label="Toggle maximize by double click"
>
  <div class="flex-1"></div>

  <div class="window-controls flex items-center gap-1 px-2" style="-webkit-app-region: no-drag;">
    <button
      class="control-button hover:bg-white/10 transition-colors duration-200 w-8 h-8 flex items-center justify-center rounded-md mr-1"
      on:click={onToggleTheme}
      title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {#if isDarkMode}
        <Sun size={16} class="text-white/45" />
      {:else}
        <Moon size={16} class="text-white/45" />
      {/if}
    </button>

    <button
      class="control-button hover:bg-white/10 transition-colors duration-200 w-fit h-8 flex items-center justify-center"
      on:click={minimize}
    >
      <Minus size={16} class="text-white/45" />
    </button>

    <button
      class="control-button hover:bg-white/10 transition-colors duration-200 w-fit h-8 flex items-center justify-center"
      on:click={toggleMaximize}
      tabindex="0"
    >
      {#if isMaximized}
        <Copy size={14} class="text-white/45" />
      {:else}
        <Square size={14} class="text-white/45" />
      {/if}
    </button>

    <button
      class="control-button hover:bg-red-500 transition-colors duration-200 w-fit h-8 flex items-center justify-center"
      on:click={close}
    >
      <X size={16} class="text-white/45" />
    </button>
  </div>
</div>

<style>
  .title-bar {
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
  }

  .control-button {
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .control-button:focus {
    outline: none;
  }
</style>
