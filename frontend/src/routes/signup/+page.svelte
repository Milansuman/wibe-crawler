<script lang="ts">
	import { authClient } from "$lib/auth-client";
	import * as Form from "$lib/components/ui/form";
	import { Input } from "$lib/components/ui/input";
	import { signupSchema, type SignupSchema } from "./schema";
	import type { PageData } from "./$types.js";
	import type { SuperValidated, Infer } from "sveltekit-superforms";
	import { superForm } from "sveltekit-superforms";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { goto } from "$app/navigation";
	import { toast } from "svelte-sonner";

	let { data }: { data: PageData } = $props();

	const form = superForm(data.form, {
		validators: zod4Client(signupSchema),
		onUpdate: async ({ form }) => {
			if (form.valid) {
				const toastId = toast.loading("Creating account...");

				try {
					const result = await authClient.signUp.email({
						email: form.data.email,
						password: form.data.password,
						name: form.data.name,
            callbackURL: "/"
					});

					if (result.error) {
						toast.error(result.error.message || "Sign up failed. Please try again.", {
							id: toastId
						});
					} else {
						toast.success("Account created successfully!", {
							id: toastId
						});
					}
				} catch (err) {
					toast.error("An unexpected error occurred. Please try again.", {
						id: toastId
					});
					console.error("Signup error:", err);
				}
			}
		},
	});

	const { form: formData, enhance } = form;
</script>

<div class="flex min-h-screen items-center justify-center p-4 w-full">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-3xl font-bold tracking-tight">Sign Up</h1>
			<p class="text-muted-foreground mt-2">Create a new account to get started</p>
		</div>

		<form method="POST" class="space-y-6" use:enhance>
			<Form.Field {form} name="name">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Name</Form.Label>
						<Input 
							{...props} 
							type="text" 
							placeholder="John Doe"
							bind:value={$formData.name}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

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

			<Form.Field {form} name="confirmPassword">
				<Form.Control>
					{#snippet children({ props })}
						<Form.Label>Confirm Password</Form.Label>
						<Input 
							{...props} 
							type="password" 
							placeholder="••••••••"
							bind:value={$formData.confirmPassword}
						/>
					{/snippet}
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Button class="w-full">
				Sign Up
			</Form.Button>

			<div class="text-center text-sm">
				Already have an account?
				<a href="/login" class="text-primary hover:underline font-medium">
					Login
				</a>
			</div>
		</form>
	</div>
</div>
