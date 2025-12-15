<script lang="ts">
	import { authClient } from "$lib/auth-client";
	import * as Form from "$lib/components/ui/form";
	import { Input } from "$lib/components/ui/input";
	import { loginSchema, type LoginSchema } from "./schema";
	import type { PageData } from "./$types.js";
	import type { SuperValidated, Infer } from "sveltekit-superforms";
	import { superForm } from "sveltekit-superforms";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { goto } from "$app/navigation";
  import { redirect } from "@sveltejs/kit";

	let { data }: { data: PageData } = $props();

	let error = $state("");
	let loading = $state(false);

	const form = superForm(data.form, {
		validators: zod4Client(loginSchema),
		onUpdate: async ({ form }) => {
			if (form.valid) {
				loading = true;
				error = "";

        const result = await authClient.signIn.email({
          email: form.data.email,
          password: form.data.password,
          callbackURL: "/"
        });

        if (result.error) {
          error = result.error.message || "Login failed. Please check your credentials.";
        }
			}
		},
	});

	const { form: formData, enhance } = form;
</script>

<div class="flex min-h-screen items-center justify-center p-4">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold tracking-tight">Login</h1>
			<p class="text-muted-foreground mt-2">Enter your credentials to access your account</p>
		</div>

		<form method="POST" class="space-y-6" use:enhance>
			<Form.Field {form} name="email">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Email</Form.Label>
						<Input 
							{...props} 
							type="email" 
							placeholder="your@email.com"
							bind:value={$formData.email}
							disabled={loading}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field {form} name="password">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Password</Form.Label>
						<Input 
							{...props} 
							type="password" 
							placeholder="••••••••"
							bind:value={$formData.password}
							disabled={loading}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			{#if error}
				<div class="text-destructive text-sm">
					{error}
				</div>
			{/if}

			<Form.Button class="w-full" disabled={loading}>
				{loading ? "Logging in..." : "Login"}
			</Form.Button>

			<div class="text-center text-sm">
				Don't have an account?
				<a href="/signup" class="text-primary hover:underline font-medium">
					Sign up
				</a>
			</div>
		</form>
	</div>
</div>
