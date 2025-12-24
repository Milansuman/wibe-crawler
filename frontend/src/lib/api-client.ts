import type { RouterClient } from '@orpc/server'
import { createORPCClient, onError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { PUBLIC_BACKEND_URL } from '$env/static/public'
import type router from "../../../backend/src/router";

const link = new RPCLink({
  url: `${PUBLIC_BACKEND_URL}/rpc`,
  fetch: (request, init) => {
    return fetch(request, {
      ...init,
      credentials: 'include',
    })
  },
  interceptors: [
    onError((error) => {
      console.error(error)
    })
  ],
})

export const orpc: RouterClient<typeof router> = createORPCClient(link);