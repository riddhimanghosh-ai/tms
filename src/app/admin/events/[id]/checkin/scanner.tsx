"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scanTicket, undoLastScan, type ScanMode, type ScanResult } from "@/app/admin/actions";
import { Button, Card, Input, SectionTitle, cn } from "@/components/ui";
import { toast } from "@/components/toast";

const tones: Record<ScanResult["status"], string> = {
  in: "border-emerald-300 bg-emerald-50 text-emerald-900",
  out: "border-sky-300 bg-sky-50 text-sky-900",
  duplicate: "border-amber-300 bg-amber-50 text-amber-900",
  cooldown: "border-amber-300 bg-amber-50 text-amber-900",
  invalid: "border-rose-300 bg-rose-50 text-rose-900",
  error: "border-ink-700 bg-ink-800 text-ink-200",
};

const marks: Record<ScanResult["status"], string> = {
  in: "✓",
  out: "→",
  duplicate: "!",
  cooldown: "⏱",
  invalid: "✕",
  error: "?",
};

const MODES: { value: ScanMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Toggles in and out from the pass's own state" },
  { value: "in", label: "Entry only", hint: "This lane only admits" },
  { value: "out", label: "Exit only", hint: "This lane only checks people out" },
];

export function Scanner({
  eventId,
  inside,
  expected,
  arrived,
  allowReentry,
}: {
  eventId: string;
  inside: number;
  expected: number;
  arrived: number;
  allowReentry: boolean;
}) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [mode, setMode] = useState<ScanMode>("auto");
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const submit = useCallback(
    async (code: string) => {
      if (!code.trim() || busy) return;
      setBusy(true);
      try {
        const res = await scanTicket(eventId, code, mode);
        setResult(res);
        if (navigator.vibrate) {
          navigator.vibrate(res.status === "in" || res.status === "out" ? 60 : [40, 60, 40]);
        }
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
        inputRef.current?.focus();
      }
    },
    [busy, eventId, mode],
  );

  // Camera scanning uses the browser's own BarcodeDetector where it exists;
  // the manual field below is always available as the fallback.
  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    (async () => {
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (o: { formats: string[] }) => {
            detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]>;
          };
        }
      ).BarcodeDetector;
      if (!Detector) {
        setCameraError("This browser can't scan QR codes. Type the code instead.");
        setCamera(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch {
        setCameraError("Camera permission was denied.");
        setCamera(false);
        return;
      }
      if (cancelled || !videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});

      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const found = await detector.detect(videoRef.current);
          const value = found[0]?.rawValue;
          if (value) {
            const code = value.split("/").pop() ?? value;
            const now = Date.now();
            // A QR sits in frame for many frames, so debounce repeats.
            if (code !== lastScan.current.code || now - lastScan.current.at > 3000) {
              lastScan.current = { code, at: now };
              void submit(code);
            }
          }
        } catch {
          /* frame not ready */
        }
        raf = requestAnimationFrame(() => void tick());
      };
      void tick();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [camera, submit]);

  useEffect(() => inputRef.current?.focus(), []);

  const insidePct = expected ? (inside / expected) * 100 : 0;
  const steppedOut = Math.max(0, arrived - inside);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink-400">Inside right now</p>
            <p className="tabular mt-1 text-4xl font-semibold tracking-tight">
              {inside.toLocaleString("en-IN")}
              <span className="ml-2 text-base font-normal text-ink-400">
                of {expected.toLocaleString("en-IN")} expected
              </span>
            </p>
          </div>
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-ink-400">Arrived</dt>
              <dd className="tabular font-semibold">{arrived.toLocaleString("en-IN")}</dd>
            </div>
            {allowReentry ? (
              <div>
                <dt className="text-ink-400">Stepped out</dt>
                <dd className="tabular font-semibold">{steppedOut.toLocaleString("en-IN")}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-ink-400">Capacity</dt>
              <dd className="tabular font-semibold">{insidePct.toFixed(0)}%</dd>
            </div>
          </dl>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width]"
            style={{ width: `${Math.min(100, insidePct)}%` }}
          />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle
          title="Gate scanner"
          hint="Point the camera at the pass, or type the code printed under the QR."
          action={
            <Button size="sm" variant="secondary" onClick={() => setCamera((c) => !c)}>
              {camera ? "Stop camera" : "Use camera"}
            </Button>
          }
        />

        {allowReentry ? (
          <div className="mb-4">
            <div className="inline-flex rounded-lg border border-ink-700 bg-ink-800 p-1">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMode(m.value)}
                  title={m.hint}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition",
                    mode === m.value
                      ? "bg-white text-ink-50 shadow-sm"
                      : "text-ink-400 hover:text-ink-100",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-400">
              {MODES.find((m) => m.value === mode)?.hint}
            </p>
          </div>
        ) : (
          <p className="mb-4 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs text-ink-400">
            Re-entry is off for this event — a pass scans once. Turn it on in Settings to let
            people step out and come back.
          </p>
        )}

        {camera ? (
          <div className="relative mb-4 overflow-hidden rounded-xl border border-ink-700 bg-black">
            <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="size-40 rounded-xl border-2 border-white/70" />
            </div>
          </div>
        ) : null}

        {cameraError ? <p className="mb-3 text-sm text-amber-600">{cameraError}</p> : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(new FormData(e.currentTarget).get("code") as string);
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            name="code"
            placeholder="Pass code, e.g. K7M2QD4XPB"
            autoComplete="off"
            className="font-mono text-lg uppercase"
          />
          <Button disabled={busy} size="lg">
            {busy ? "…" : mode === "out" ? "Check out" : "Scan"}
          </Button>
        </form>

        {result ? (
          <div className={cn("mt-4 rounded-2xl border p-5", tones[result.status])}>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/70 text-lg font-bold">
                {marks[result.status]}
              </span>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-tight">{result.message}</p>
                {result.detail ? <p className="mt-0.5 text-sm opacity-80">{result.detail}</p> : null}
              </div>
              {result.ticket && (result.status === "in" || result.status === "out") ? (
                <button
                  type="button"
                  onClick={async () => {
                    await undoLastScan(result.ticket!.id, eventId);
                    toast("Last scan undone", "info");
                    setResult(null);
                  }}
                  className="ml-auto shrink-0 rounded-lg border border-current/20 bg-white/60 px-2.5 py-1 text-xs font-medium"
                >
                  Undo
                </button>
              ) : null}
            </div>

            {result.ticket ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-current/15 pt-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs opacity-70">Name</dt>
                  <dd className="font-semibold">{result.ticket.holderName}</dd>
                </div>
                <div>
                  <dt className="text-xs opacity-70">Category</dt>
                  <dd className="font-semibold">{result.ticket.zoneName}</dd>
                </div>
                {result.ticket.seatLabel ? (
                  <div>
                    <dt className="text-xs opacity-70">Seat</dt>
                    <dd className="font-semibold">{result.ticket.seatLabel}</dd>
                  </div>
                ) : null}
                {result.ticket.showDateLabel ? (
                  <div>
                    <dt className="text-xs opacity-70">Night</dt>
                    <dd className="font-semibold">{result.ticket.showDateLabel}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs opacity-70">Admits</dt>
                  <dd className="font-semibold">{result.ticket.admitsCount}</dd>
                </div>
                {allowReentry ? (
                  <div>
                    <dt className="text-xs opacity-70">Entries</dt>
                    <dd className="font-semibold">{result.ticket.entryCount}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
