
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