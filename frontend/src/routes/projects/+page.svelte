<script>
    import Header from "$lib/components/custom/header.svelte";
    import * as Card from "$lib/components/ui/card";

    const projects = [
        { id: 1, url: "example.com", pagesCrawled: 142, lastCrawled: "2 hours ago", status: "Completed" },
        { id: 2, url: "docs.company.io", pagesCrawled: 89, lastCrawled: "5 mins ago", status: "Crawling" },
        { id: 3, url: "blog.website.dev", pagesCrawled: 234, lastCrawled: "1 day ago", status: "Completed" },
        { id: 4, url: "shop.store.com", pagesCrawled: 567, lastCrawled: "3 hours ago", status: "Completed" },
        { id: 5, url: "api.service.net", pagesCrawled: 45, lastCrawled: "10 mins ago", status: "Crawling" },
        { id: 6, url: "learn.platform.edu", pagesCrawled: 312, lastCrawled: "6 hours ago", status: "Completed" }
    ];
</script>

<div class="flex flex-col gap-6">
    <Header />
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-8">
        {#each projects as project}
            <a href="/projects/{project.id}">
                <Card.Root class="cursor-pointer hover:shadow-lg hover:scale-102 transition-all duration-200">
                    <Card.Header>
                        <Card.Title class="text-lg font-mono">{project.url}</Card.Title>
                        <Card.Description>Last crawled {project.lastCrawled}</Card.Description>
                    </Card.Header>
                    <Card.Content>
                        <div class="space-y-2">
                            <p class="text-sm text-gray-600">Pages: <span class="font-semibold">{project.pagesCrawled}</span></p>
                            <p class="text-sm text-gray-600">Status: <span class="font-semibold {project.status === 'Crawling' ? 'text-blue-600' : 'text-green-600'}">{project.status}</span></p>
                        </div>
                    </Card.Content>
                    <Card.Footer>
                        <span class="text-sm text-blue-600 hover:text-blue-800">View Report</span>
                    </Card.Footer>
                </Card.Root>
            </a>
        {/each}
    </div>
</div>