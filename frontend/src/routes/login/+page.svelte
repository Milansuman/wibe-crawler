<script lang="ts">
	import { authClient } from "$lib/auth-client";
	import * as Form from "$lib/components/ui/form";
	import { Input } from "$lib/components/ui/input";
	import { loginSchema, type LoginSchema } from "./schema";
	import type { PageData } from "./$types.js";
	import { superForm } from "sveltekit-superforms";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { toast } from "svelte-sonner";
  
	let { data }: { data: PageData } = $props();

	const form = superForm(data.form, {
		validators: zod4Client(loginSchema),
		onUpdate: async ({ form }) => {
			if (form.valid) {
				const toastId = toast.loading("Logging in...");

        const result = await authClient.signIn.email({
          email: form.data.email,
          password: form.data.password,
          callbackURL: "/"
        });

        if (result.error) {
          toast.error(result.error.message || "Login failed. Please check your credentials.", {
						id: toastId
					});
        } else {
					toast.success("Login successful!", {
						id: toastId
					});
				}
			}
		},
	});

	const { form: formData, enhance } = form;
</script>

<div class="flex min-h-screen items-center justify-center p-4 w-full">
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
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Button class="w-full">
				Login
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
