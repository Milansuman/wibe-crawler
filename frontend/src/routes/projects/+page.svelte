<script>
    import Header from "$lib/components/custom/header.svelte";
    import * as Card from "$lib/components/ui/card";
    import { Input } from "$lib/components/ui/input";
    import { Button } from "$lib/components/ui/button";
    import { Search, Plus } from "@lucide/svelte";

    const projects = [
        {
            id: 1,
            url: "example.com",
            pagesCrawled: 142,
            lastCrawled: "2 hours ago",
            status: "Completed",
        },
        {
            id: 2,
            url: "docs.company.io",
            pagesCrawled: 89,
            lastCrawled: "5 mins ago",
            status: "Crawling",
        },
        {
            id: 3,
            url: "blog.website.dev",
            pagesCrawled: 234,
            lastCrawled: "1 day ago",
            status: "Completed",
        },
        {
            id: 4,
            url: "shop.store.com",
            pagesCrawled: 567,
            lastCrawled: "3 hours ago",
            status: "Completed",
        },
        {
            id: 5,
            url: "api.service.net",
            pagesCrawled: 45,
            lastCrawled: "10 mins ago",
            status: "Crawling",
        },
        {
            id: 6,
            url: "learn.platform.edu",
            pagesCrawled: 312,
            lastCrawled: "6 hours ago",
            status: "Completed",
        },
        {
            id: 6,
            url: "learn.platform.edu",
            pagesCrawled: 312,
            lastCrawled: "6 hours ago",
            status: "Completed",
        },
        {
            id: 6,
            url: "learn.platform.edu",
            pagesCrawled: 312,
            lastCrawled: "6 hours ago",
            status: "Completed",
        },
        {
            id: 6,
            url: "learn.platform.edu",
            pagesCrawled: 312,
            lastCrawled: "6 hours ago",
            status: "Completed",
        },
        {
            id: 6,
            url: "learn.platform.edu",
            pagesCrawled: 312,
            lastCrawled: "6 hours ago",
            status: "Completed",
        },
        {
            id: 6,
            url: "learn.platform.edu",
            pagesCrawled: 312,
            lastCrawled: "6 hours ago",
            status: "Completed",
        },
        {
            id: 6,
            url: "learn.platform.edu",
            pagesCrawled: 312,
            lastCrawled: "6 hours ago",
            status: "Completed",
        },
        {
            id: 6,
            url: "learn.platform.edu",
            pagesCrawled: 312,
            lastCrawled: "6 hours ago",
            status: "Completed",
        },
    ];

    let searchQuery = $state("");
    let crawlUrl = $state("");
    let statusFilter = $state("All");

    const statusOptions = ["All", "Completed", "Crawling"];

    const filteredProjects = $derived(
        projects.filter((project) => {
            const matchesSearch = project.url.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === "All" || project.status === statusFilter;
            return matchesSearch && matchesStatus;
        }),
    );

    function handleCrawl() {
        if (crawlUrl.trim()) {
            console.log("Crawling URL:", crawlUrl);
            // Add crawl logic here
        }
    }
</script>

<div class="flex flex-col gap-6">
    <!-- Search and Crawl URL in same row -->
    <div class="px-8 flex gap-4 items-center">
        <div class="relative flex-1">
            <Search
                class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
            />
            <Input
                type="text"
                placeholder="Search projects..."
                bind:value={searchQuery}
                class="pl-10"
            />
        </div>
        <div class="flex gap-2">
            <Input
                type="url"
                placeholder="Enter URL to crawl..."
                bind:value={crawlUrl}
                class="w-64"
            />
            <Button onclick={handleCrawl}>
                <Plus class="w-4 h-4 mr-2" />
                Crawl URL
            </Button>
        </div>
    </div>

    <!-- Filter Capsules -->
    <div class="px-8">
        <div class="flex gap-2 items-center">
            <span class="text-sm text-gray-600 mr-2">Filter by status:</span>
            {#each statusOptions as option}
                <button
                    onclick={() => statusFilter = option}
                    class="px-4 py-1.5 rounded-full text-sm transition-all {statusFilter === option 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'}"
                >
                    {option}
                </button>
            {/each}
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-8">
        {#each filteredProjects as project}
            <a href="/projects/{project.id}">
                <Card.Root
                    class="cursor-pointer hover:shadow-lg hover:scale-102 transition-all duration-200"
                >
                    <Card.Header>
                        <Card.Title class="text-lg font-mono"
                            >{project.url}</Card.Title
                        >
                        <Card.Description
                            >Last crawled {project.lastCrawled}</Card.Description
                        >
                    </Card.Header>
                    <Card.Content>
                        <div class="space-y-2">
                            <p class="text-sm text-gray-600">
                                Pages: <span class="font-semibold"
                                    >{project.pagesCrawled}</span
                                >
                            </p>
                            <p class="text-sm text-gray-600">
                                Status: <span
                                    class="font-semibold {project.status ===
                                    'Crawling'
                                        ? 'text-blue-600'
                                        : 'text-green-600'}"
                                    >{project.status}</span
                                >
                            </p>
                        </div>
                    </Card.Content>
                    <Card.Footer>
                        <span class="text-sm text-blue-600 hover:text-blue-800"
                            >View Report</span
                        >
                    </Card.Footer>
                </Card.Root>
            </a>
        {/each}
    </div>
</div>
