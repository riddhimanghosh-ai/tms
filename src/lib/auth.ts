import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizers, sessions } from "@/db/schema";
import { id } from "./ids";

const COOKIE = "rasana_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

export async function createSession(organizerId: string) {
  const sessionId = id();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  await db.insert(sessions).values({ id: sessionId, organizerId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession() {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (sessionId) await db.delete(sessions).where(eq(sessions.id, sessionId));
  jar.delete(COOKIE);
}

/** Returns the signed-in organizer, or null. Never throws. */
export async function getOrganizer() {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (!sessionId) return null;

  const row = await db
    .select({ organizer: organizers, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(organizers, eq(sessions.organizerId, organizers.id))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!row) return null;
  if (row.expiresAt < Math.floor(Date.now() / 1000)) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  return row.organizer;
}

/** Use inside admin pages and actions — redirects when signed out. */
export async function requireOrganizer() {
  const organizer = await getOrganizer();
  if (!organizer) redirect("/admin/login");
  return organizer;
}
