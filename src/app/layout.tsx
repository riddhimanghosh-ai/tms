import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rasana — book Garba nights, concerts and utsavs",
  description:
    "Sell tickets on your own site or over WhatsApp, and run the whole event from one dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extensions (tag managers, password tools) stamp attributes onto
    // <html> and <body> before React hydrates. Without this, that mismatch
    // throws during hydration and the page's interactivity never wires up —
    // which is what leaves a submitted form stuck on "Signing in…".
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
