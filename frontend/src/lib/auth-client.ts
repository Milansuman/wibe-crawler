import { createAuthClient } from "better-auth/svelte"
import {PUBLIC_BACKEND_URL} from "$env/static/public";

export const authClient = createAuthClient({
    baseURL: PUBLIC_BACKEND_URL
})