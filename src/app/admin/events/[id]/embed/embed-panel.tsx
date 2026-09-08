"use client";

import { useState } from "react";
import { Card, SectionTitle } from "@/components/ui";

function Copyable({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <pre className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-3 text-xs leading-relaxed text-ink-200">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-7 rounded border border-ink-700 bg-ink-800 px-2 py-1 text-xs hover:bg-ink-700"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

export function EmbedPanel({
  orgSlug,
  eventSlug,
  title,
  venue,
  startsAt,
  published,
  origin,
}: {
  orgSlug: string;
  eventSlug: string;
  title: string;
  venue: string | null;
  startsAt: number;
  published: boolean;
  origin: string;
}) {
  const path = `/e/${orgSlug}/${eventSlug}`;
  const url = `${origin}${path}`;
  const embedUrl = `${origin}/embed/${orgSlug}/${eventSlug}`;

  const scriptSnippet = `<!-- Paste where the booking section should appear -->
<div id="gathara-tickets"></div>
<script
  src="${origin}/embed.js"
  data-event="${orgSlug}/${eventSlug}"
  data-target="#gathara-tickets"
  async
></script>`;

  const iframeSnippet = `<iframe
  src="${embedUrl}"
  title="Book tickets for ${title}"
  style="width:100%;border:0;min-height:760px"
  loading="lazy"
></iframe>`;

  const buttonSnippet = `<a href="${url}"
   style="display:inline-block;background:#e11d48;color:#fff;padding:14px 28px;border-radius:10px;font:600 16px system-ui;text-decoration:none">
  Book tickets
</a>`;

  const whatsappText = `🎉 *${title}*
${venue ? `📍 ${venue}\n` : ""}🗓 ${new Date(startsAt * 1000).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}

Book your passes here 👇
${url}`;

  return (
    <div className="max-w-3xl space-y-6">
      {!published ? (
        <div className="rounded-[--radius-card] border border-amber-900 bg-amber-950/50 p-4 text-sm text-amber-200">
          This event is not published yet, so the links below will show a
          &ldquo;not on sale&rdquo; page to visitors. Switch the status to{" "}
          <strong>Published</strong> when you&apos;re ready.
        </div>
      ) : null}

      <Card className="space-y-4 p-5">
        <SectionTitle
          title="Direct link"
          hint="A full booking page hosted for you. Works on its own — no website needed."
        />
        <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2">
          <span className="truncate font-mono text-sm text-ink-200">{url}</span>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(url)}
            className="ml-auto shrink-0 rounded border border-ink-700 bg-ink-800 px-2 py-1 text-xs hover:bg-ink-700"
          >
            Copy
          </button>
        </div>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Share on WhatsApp
        </a>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionTitle
          title="Put it on your own website"
          hint="Two ways. The script auto-sizes to its container; the iframe is the simplest paste."
        />
        <Copyable label="Recommended — script tag" code={scriptSnippet} />
        <Copyable label="Alternative — plain iframe" code={iframeSnippet} />
        <Copyable label="Just a button that opens the booking page" code={buttonSnippet} />
      </Card>

      <Card className="space-y-3 p-5">
        <SectionTitle
          title="Live preview"
          hint="Exactly what your visitors will see inside your site."
        />
        <div className="overflow-hidden rounded-lg border border-ink-700 bg-white">
          {origin ? (
            <iframe
              src={embedUrl}
              title="Booking preview"
              className="h-[560px] w-full"
              loading="lazy"
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
