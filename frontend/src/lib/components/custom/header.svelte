<script>
    import * as Menubar from "$lib/components/ui/menubar/index.js";
    import { User } from "@lucide/svelte";
    const menuOptions = [
        {
            trigger: "File",
            label: "My Account",
            items: [
                { name: "Profile" },
                { name: "Billing" },
                { name: "Team", shortcut: "⌘+T" },
                { name: "Subscription" },
            ],
        },
        {
            trigger: "Edit",
            label: "My Account",
            items: [
                { name: "Profile" },
                { name: "Billing" },
                { name: "Team", shortcut: "⌘+T" },
                { name: "Subscription" },
            ],
        },
        {
            trigger: "View",
            label: "My Account",
            items: [
                { name: "Profile" },
                { name: "Billing" },
                { name: "Team", shortcut: "⌘+T" },
                { name: "Subscription" },
            ],
        },
        {
            trigger: "Layer",
            label: "My Account",
            items: [
                { name: "Profile" },
                { name: "Billing" },
                { name: "Team", shortcut: "⌘+T" },
                { name: "Subscription" },
            ],
        },
        {
            trigger: "Settings",
            label: "My Account",
            items: [
                { name: "Profile" },
                { name: "Billing" },
                { name: "Team", shortcut: "⌘+T" },
                { name: "Subscription" },
            ],
        },
    ];
</script>

<div
    class="flex bg-white rounded-full w-full px-8 border-2 border-gray-300 py-3 shadow-xm items-center justify-between"
>
    <div class="flex items-center space-x-4">
        <img src="/images/headerlogo.svg" alt="logo2" class="w-6" />
        <Menubar.Root class="border-0 shadow-none">
        {#each menuOptions as menu}
            <Menubar.Menu>
                <Menubar.Trigger>{menu.trigger}</Menubar.Trigger>
                <Menubar.Content>
                    <Menubar.Label>{menu.label}</Menubar.Label>
                    <Menubar.Separator />
                    {#each menu.items as item}
                        <Menubar.Item>
                            {item.name}
                            {#if item.shortcut}
                                <Menubar.Shortcut
                                    >{item.shortcut}</Menubar.Shortcut
                                >
                            {/if}
                        </Menubar.Item>
                    {/each}
                </Menubar.Content>
            </Menubar.Menu>
        {/each}
    </Menubar.Root>
    </div>
    <div class="flex items-center space-x-4">
        <h1>username</h1>
            <User class="w-6 h-6 opacity-75 hover:opacity-100" />
    </div>
</div>
