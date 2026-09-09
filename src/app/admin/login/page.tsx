"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { useActionState } from "react";
import { login } from "../auth-actions";
import { Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark size={30} />
        </div>

        <form action={action} className="space-y-4 rounded-[--radius-card] border border-ink-700 bg-ink-900 card-shadow p-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Organiser sign in</h1>
            <p className="mt-1 text-sm text-ink-400">Manage your events and sales.</p>
          </div>

          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" defaultValue="organiser@demo.in" required />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" defaultValue="demo1234" required />
          </Field>

          {state?.error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          ) : null}

          <Button className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>

          <p className="text-center text-xs text-ink-400">
            No account?{" "}
            <Link href="/admin/signup" className="text-brand-600 hover:underline">
              Create one
            </Link>
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-ink-500">
          Demo login is pre-filled: organiser@demo.in / demo1234
        </p>
      </div>
    </main>
  );
}
