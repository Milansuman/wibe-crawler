import { Hono } from 'hono'
import { auth } from "../lib/auth";
import { cors } from "hono/cors";
import { RPCHandler } from '@orpc/server/fetch'
import { onError, onStart, onFinish } from '@orpc/server'
import { CORSPlugin } from '@orpc/server/plugins';
import router from "./router";

const app = new Hono()

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
    onStart(({request}) => {
      console.log("-->", request.url.pathname)
    })
  ],
  plugins: [
    new CORSPlugin({
      origin: "http://localhost:5173",
      credentials: true
    })
  ]
})

app.use('/rpc/*', async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/rpc',
    context: {
      headers: c.req.header()
    } // Provide initial context if needed
  })

  if (matched) {
    return c.newResponse(response.body, response)
  }

  await next()
})


app.use(
	"/api/auth/*",
	cors({
		origin: "http://localhost:5173",
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true,
	}),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

export default app
