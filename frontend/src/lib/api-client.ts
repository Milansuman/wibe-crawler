import type { RouterClient } from '@orpc/server'
import { createORPCClient, onError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { BACKEND_URL } from '$env/static/private'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import router from "../../../backend/src/router";

const link = new RPCLink({
  url: `${BACKEND_URL}/rpc`,
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

const client: RouterClient<typeof router> = createORPCClient(link);
export const orpc = createTanstackQueryUtils(client);