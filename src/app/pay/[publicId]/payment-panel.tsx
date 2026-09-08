"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { abandonPayment, completePayment } from "@/app/e/actions";
import { formatMinor } from "@/lib/money";

type Props = {
  publicId: string;
  provider: string;
  order: {
    buyerName: string;
    buyerPhone: string;
    subtotalMinor: number;
    discountMinor: number;
    feeMinor: number;
    totalMinor: number;
    paymentRef: string | null;
  };
  items: { name: string; qty: number; unitPriceMinor: number }[];
  eventTitle: string;
  brandColor: string;
  razorpayKey: string;
};

export function PaymentPanel(props: Props) {
  const { publicId, provider, order, items, eventTitle, brandColor } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(method: string) {
    setBusy(true);
    setError(null);

    if (provider === "razorpay") {
      const opened = await openRazorpay(props, setError, (to) => router.push(to));
      if (!opened) setBusy(false);
      return;
    }

    // Mock gateway: settle immediately so the whole flow is testable locally.
    const res = await completePayment(publicId, { method });
    if (res.ok) router.push(`/order/${publicId}`);
    else {
      setError(res.error);
      setBusy(false);
    }
  }

  return (
    <div className="surface-light grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm text-slate-500">Paying for</p>
            <p className="font-semibold text-slate-900">{eventTitle}</p>
            <p className="mt-1 font-mono text-xs text-slate-400">{publicId}</p>
          </div>

          <dl className="space-y-1.5 border-b border-slate-100 px-5 py-4 text-sm">
            {items.map((i) => (
              <div key={i.name} className="flex justify-between">
                <dt className="text-slate-600">
                  {i.name} × {i.qty}
                </dt>
                <dd className="tabular-nums text-slate-900">
                  {formatMinor(i.unitPriceMinor * i.qty)}
                </dd>
              </div>
            ))}
            {order.discountMinor > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <dt>Discount</dt>
                <dd className="tabular-nums">−{formatMinor(order.discountMinor)}</dd>
              </div>
            ) : null}
            {order.feeMinor > 0 ? (
              <div className="flex justify-between">
                <dt className="text-slate-600">Convenience fee</dt>
                <dd className="tabular-nums text-slate-900">{formatMinor(order.feeMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <dt className="text-slate-900">Total</dt>
              <dd className="tabular-nums text-slate-900">{formatMinor(order.totalMinor)}</dd>
            </div>
          </dl>

          <div className="space-y-3 px-5 py-5">
            {provider === "mock" ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Test mode — no real payment gateway is connected. Choose a method to
                simulate a successful payment.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              {["UPI", "Card", "Netbanking", "Wallet"].map((m) => (
                <button
                  key={m}
                  disabled={busy}
                  onClick={() => void pay(m)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
                >
                  {m}
                </button>
              ))}
            </div>

            <button
              disabled={busy}
              onClick={() => void pay("UPI")}
              className="w-full rounded-xl px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
              style={{ background: brandColor }}
            >
              {busy ? "Processing…" : `Pay ${formatMinor(order.totalMinor)}`}
            </button>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              disabled={busy}
              onClick={async () => {
                await abandonPayment(publicId);
                history.back();
              }}
              className="w-full text-center text-sm text-slate-500 underline hover:text-slate-800"
            >
              Cancel and release my seats
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          Your passes are issued the moment payment succeeds.
        </p>
      </div>
    </div>
  );
}

type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void };

async function openRazorpay(
  props: Props,
  setError: (m: string) => void,
  navigate: (to: string) => void,
) {
  const loaded = await new Promise<boolean>((resolve) => {
    if ((window as unknown as { Razorpay?: RazorpayCtor }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

  if (!loaded) {
    setError("Couldn't reach the payment gateway. Check your connection and retry.");
    return false;
  }

  const Razorpay = (window as unknown as { Razorpay: RazorpayCtor }).Razorpay;
  new Razorpay({
    key: props.razorpayKey,
    order_id: props.order.paymentRef,
    amount: props.order.totalMinor,
    currency: "INR",
    name: props.eventTitle,
    prefill: { name: props.order.buyerName, contact: props.order.buyerPhone },
    theme: { color: props.brandColor },
    handler: async (response: Record<string, string>) => {
      const res = await completePayment(props.publicId, response);
      if (res.ok) navigate(`/order/${props.publicId}`);
      else setError(res.error);
    },
    modal: { ondismiss: () => setError("Payment was cancelled.") },
  }).open();

  return true;
}
