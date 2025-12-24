
<script lang="ts">
  import { goto } from "$app/navigation";
  import {authClient} from "$lib/auth-client";
  import {orpc} from "$lib/api-client";
  
  const session = authClient.useSession();

  $effect(() => {
    if(!$session.data && !$session.isPending){
      goto("/login");
    }
  });

  
</script>

<div class="flex flex-col gap-3 p-6 w-full h-full">
  
</div>