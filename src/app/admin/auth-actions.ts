"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, first } from "@/db";
import { organizers } from "@/db/schema";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { id, slugify } from "@/lib/ids";

export type AuthState = { error?: string } | undefined;

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const organizer = await first(db
    .select()
    .from(organizers)
    .where(eq(organizers.email, email))
    );

  if (!organizer || !verifyPassword(password, organizer.passwordHash)) {
    return { error: "That email and password don't match." };
  }
  await createSession(organizer.id);
  redirect("/admin");
}

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phone = String(form.get("phone") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!name || !email || password.length < 8)
    return { error: "Name, email and a password of 8+ characters are required." };

  const existing = await first(db
    .select()
    .from(organizers)
    .where(eq(organizers.email, email))
    );
  if (existing) return { error: "An account already uses that email." };

  let slug = slugify(name) || "organiser";
  while (await first(db.select().from(organizers).where(eq(organizers.slug, slug)))) {
    slug = `${slug}-${Math.floor(Math.random() * 900 + 100)}`;
  }

  const organizerId = id();
  await db.insert(organizers).values({
    id: organizerId,
    slug,
    name,
    email,
    phone: phone || null,
    supportPhone: phone || null,
    passwordHash: hashPassword(password),
  });

  await createSession(organizerId);
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/admin/login");
}
