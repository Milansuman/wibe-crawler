import { os } from '@orpc/server'
import { auth } from '../../lib/auth'
import { ORPCError } from '@orpc/server'

export const base = os.$context<{ headers: Headers }>()

export const authMiddleware = base.middleware(async ({ context, next }) => {
  const sessionData = await auth.api.getSession({
    headers: context.headers,
  })

  if (!sessionData?.session || !sessionData?.user) {
    throw new ORPCError('UNAUTHORIZED')
  }

  // Adds session and user to the context
  return next({
    context: {
      session: sessionData.session,
      user: sessionData.user
    },
  })
});

export const authenticated = base.use(authMiddleware);