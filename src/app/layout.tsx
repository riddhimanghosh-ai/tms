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
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
