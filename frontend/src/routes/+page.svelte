
<script lang="ts">
    import { goto } from "$app/navigation";
  import {authClient} from "$lib/auth-client";
  
  const session = authClient.useSession();

  $effect(() => {
    if(!$session.data && !$session.isPending){
      goto("/login");
    }
  });
</script>

<div class="h-screen w-screen flex flex-col justify-center items-center gap-5 lg:flex hidden"> 
  <img src="/images/logo.png" alt="Vibe Crawler Logo" class="mb-4 w-100 h-100 -m-20"/>
  <h1 class="text-5xl font-black -mt-10">Vibe Crawler</h1>
  <a href="/projects"><button class="text-xl font-bold py-5 px-15 bg-blue-500 text-white rounded-full hover:bg-blue-600">Start Crawling</button></a>
</div>

<div class="h-screen w-screen flex flex-col justify-center items-center gap-5 lg:hidden block"> 
  <h1>This App is only available for desktop devices.</h1>
</div>