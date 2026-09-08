"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkInTicket } from "@/app/admin/actions";
import { Button, Card, Input, SectionTitle, cn } from "@/components/ui";

type Result = Awaited<ReturnType<typeof checkInTicket>>;

const tones = {
  ok: "border-emerald-700 bg-emerald-950 text-emerald-100",
  duplicate: "border-amber-700 bg-amber-950 text-amber-100",
  invalid: "border-red-800 bg-red-950 text-red-100",
  error: "border-ink-700 bg-ink-850 text-ink-200",
} as const;

const headlines = {
  ok: "LET THEM IN",
  duplicate: "ALREADY SCANNED",
  invalid: "DO NOT ADMIT",
  error: "TRY AGAIN",
} as const;

export function Scanner({
  eventId,
  inside,
  expected,
}: {
  eventId: string;
  inside: number;
  expected: number;
}) {
  const [result, setResult] = useState<Result | null>(null);
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
        const res = await checkInTicket(eventId, code);
        setResult(res);
        if (navigator.vibrate) navigator.vibrate(res.status === "ok" ? 60 : [40, 60, 40]);
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
        inputRef.current?.focus();
      }
    },
    [busy, eventId],
  );

  // Camera scanning uses the built-in BarcodeDetector where the browser has it;
  // the manual field below is always available as the fallback.
  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    (async () => {
      const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (!Detector) {
        setCameraError("This browser can't scan QR codes. Type the code instead.");
        setCamera(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
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
            // Debounce: a QR sits in frame for many frames.
            if (code !== lastScan.current.code || now - lastScan.current.at > 3000) {
              lastScan.current = { code, at: now };
              void submit(code);
            }
          }
        } catch {
          /* frame not ready — ignore */
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

  const pct = expected ? (inside / expected) * 100 : 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Inside right now
            </p>
            <p className="tabular mt-1 text-3xl font-semibold">
              {inside.toLocaleString("en-IN")}
              <span className="ml-2 text-base font-normal text-ink-400">
                / {expected.toLocaleString("en-IN")} expected
              </span>
            </p>
          </div>
          <p className="tabular text-sm text-ink-400">{pct.toFixed(0)}% arrived</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, pct)}%` }} />
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

        {camera ? (
          <div className="relative mb-4 overflow-hidden rounded-lg border border-ink-700 bg-black">
            <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="size-40 rounded-xl border-2 border-white/70" />
            </div>
          </div>
        ) : null}

        {cameraError ? <p className="mb-3 text-sm text-amber-300">{cameraError}</p> : null}

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
            {busy ? "…" : "Check in"}
          </Button>
        </form>

        {result ? (
          <div className={cn("mt-4 rounded-xl border p-4", tones[result.status])}>
            <p className="text-lg font-bold tracking-tight">{headlines[result.status]}</p>
            <p className="mt-1 text-sm opacity-90">{result.message}</p>
            {"ticket" in result && result.ticket ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-white/15 pt-3 text-sm">
                <div>
                  <dt className="text-xs opacity-70">Name</dt>
                  <dd className="font-medium">{result.ticket.holderName}</dd>
                </div>
                <div>
                  <dt className="text-xs opacity-70">Category</dt>
                  <dd className="font-medium">{result.ticket.zoneName}</dd>
                </div>
                {result.ticket.seatLabel ? (
                  <div>
                    <dt className="text-xs opacity-70">Seat</dt>
                    <dd className="font-medium">{result.ticket.seatLabel}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-xs opacity-70">Admits</dt>
                  <dd className="font-medium">{result.ticket.admitsCount}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
