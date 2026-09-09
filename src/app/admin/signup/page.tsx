"use client";

import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { useActionState } from "react";
import { signup } from "../auth-actions";
import { Button, Field, Input } from "@/components/ui";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark size={30} />
        </div>

        <form action={action} className="space-y-4 rounded-[--radius-card] border border-ink-700 bg-ink-900 card-shadow p-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Create your account</h1>
            <p className="mt-1 text-sm text-ink-400">
              Set up your first event in a couple of minutes.
            </p>
          </div>

          <Field label="Organisation name">
            <Input name="name" placeholder="Rhythm Events, Ahmedabad" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="WhatsApp number" hint="Shown to buyers for support.">
            <Input name="phone" placeholder="+91 98765 43210" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>

          {state?.error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          ) : null}

          <Button className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </Button>

          <p className="text-center text-xs text-ink-400">
            Already have one?{" "}
            <Link href="/admin/login" className="text-brand-600 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
