import { customAlphabet, nanoid } from "nanoid";

// No 0/O/1/I — these get read aloud and typed in by hand at the gate.
const readable = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", 6);

export const id = () => nanoid(16);
export const orderPublicId = () => `GRB-${readable()}`;
export const ticketCode = () => `${readable()}${readable()}`;
export const cartId = () => nanoid(24);

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}
