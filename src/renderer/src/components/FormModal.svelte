<script lang="ts">
  export let selectedForm
  export let formData
  export let formResponse
  export let isSubmittingForm
  export let onClose
  export let onSubmit

  function handleSubmit() {
    onSubmit()
  }

  function handleClose() {
    onClose()
  }

  function withBase(html: string, baseHref: string | undefined): string {
    if (!html) return ''
    if (!baseHref) return html
    // If there's already a <base>, keep as-is
    if (/<base\s+href=/i.test(html)) return html
    // Insert <base> right after <head>
    const baseTag = `<base href="${baseHref}">`
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head([^>]*)>/i, (_m, g1) => `<head${g1}>${baseTag}`)
    }
    // If no <head>, prepend one
    return `<head>${baseTag}</head>` + html
  }
</script>

{#if selectedForm}
  <div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <div class="bg-gray-900 border border-gray-700 max-w-2xl w-full max-h-[90vh] flex flex-col">
      <div class="p-4 border-b border-gray-700">
        <div class="flex justify-between items-center">
          <h2 class="text-sm font-medium text-white">Test Form</h2>
          <button on:click={handleClose} class="text-gray-400 hover:text-white text-lg"> ✕ </button>
        </div>
        <div class="text-xs text-gray-400 mt-1">
          Action: {selectedForm.action || 'None'} | Method: {selectedForm.method.toUpperCase()}
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div class="p-4">
          <div class="grid grid-cols-1 gap-4 mb-4">
            {#each selectedForm.fields as field}
              <div>
                <span class="block text-xs font-medium text-gray-300 mb-1">
                  {field.name}
                  {#if field.required}
                    <span class="text-red-400">*</span>
                  {/if}
                </span>
                {#if field.type === 'textarea'}
                  <textarea
                    bind:value={formData[field.name]}
                    placeholder={field.placeholder || ''}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-gray-500"
                    rows="3"
                  ></textarea>
                {:else if field.type === 'select'}
                  <select
                    bind:value={formData[field.name]}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-gray-500"
                  >
                    <option value="">Select...</option>
                    {#each field.options || [] as option}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                {:else}
                  <input
                    bind:value={formData[field.name]}
                    type={field.type}
                    placeholder={field.placeholder || ''}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-gray-500"
                  />
                {/if}
                <div class="text-xs text-gray-500 mt-1">
                  Type: {field.type}{field.required ? ' (required)' : ''}
                  {#if field.value}
                    | Default: {field.value}
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="flex gap-2 mb-4">
            <button
              on:click={handleSubmit}
              disabled={isSubmittingForm}
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm"
            >
              {isSubmittingForm ? 'Submitting...' : 'Submit Form'}
            </button>
            <button
              on:click={handleClose}
              class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm"
            >
              Cancel
            </button>
          </div>

          {#if formResponse}
            <div class="border-t border-gray-700 pt-4">
              <h3 class="text-sm font-medium text-white mb-3">Response</h3>

              <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <span class="block text-xs font-medium text-gray-300 mb-1">Status</span>
                  <div
                    class="text-sm font-mono {formResponse.status &&
                    formResponse.status >= 200 &&
                    formResponse.status < 300
                      ? 'text-green-400'
                      : 'text-red-400'}"
                  >
                    {formResponse.status || 'N/A'}
                  </div>
                </div>
                <div>
                  <span class="block text-xs font-medium text-gray-300 mb-1">Time</span>
                  <div class="text-sm font-mono text-gray-400">
                    {new Date().toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {#if formResponse.error}
                <div class="mb-4">
                  <span class="block text-xs font-medium text-gray-300 mb-1">Error</span>
                  <div
                    class="px-3 py-2 bg-red-950 border border-red-800 text-red-300 text-sm font-mono"
                  >
                    {formResponse.error}
                  </div>
                </div>
              {/if}

              {#if formResponse.headers && Object.keys(formResponse.headers).length > 0}
                <div class="mb-4">
                  <span class="block text-xs font-medium text-gray-300 mb-1">Headers</span>
                  <div class="px-3 py-2 bg-gray-800 border border-gray-700 text-sm overflow-x-auto">
                    <pre class="text-gray-300 font-mono">{JSON.stringify(
                        formResponse.headers,
                        null,
                        2
                      )}</pre>
                  </div>
                </div>
              {/if}

              {#if formResponse.body}
                <div>
                  <span class="block text-xs font-medium text-gray-300 mb-1">Body</span>
                  <div
                    class="px-3 py-2 bg-gray-800 border border-gray-700 text-sm overflow-x-auto max-h-64"
                  >
                    <pre class="text-gray-300 font-mono">{formResponse.body.substring(
                        0,
                        1000
                      )}{formResponse.body.length > 1000 ? '...' : ''}</pre>
                  </div>
                </div>
              {/if}

              {#if formResponse.html}
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="block text-xs font-medium text-gray-300">Rendered Page</span>
                    {#if formResponse.finalUrl}
                      <a
                        href={formResponse.finalUrl}
                        target="_blank"
                        class="text-[10px] text-blue-400 hover:text-blue-300 underline"
                        >Open in browser</a
                      >
                    {/if}
                  </div>
                  <div class="bg-gray-900 border border-gray-700 rounded overflow-hidden">
                    <iframe
                      title="Submitted page preview"
                      srcdoc={withBase(formResponse.html, formResponse.finalUrl)}
                      sandbox="allow-scripts allow-forms allow-same-origin"
                      class="w-full h-96 bg-white"
                    ></iframe>
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
