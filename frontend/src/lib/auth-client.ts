import { createAuthClient } from "better-auth/svelte"
import {BACKEND_URL} from "$env/static/private";

export const authClient = createAuthClient({
    baseURL: BACKEND_URL
})