/**
 * Payment provider seam.
 *
 * Local development runs the "mock" provider, which walks the buyer through a
 * fake gateway page so the whole flow (checkout -> pay -> tickets -> gate scan)
 * is exercisable without keys. Set PAYMENT_PROVIDER=razorpay plus the key pair
 * to switch to the real thing — nothing else in the app changes.
 */
import { createHmac } from "node:crypto";

export type ProviderName = "mock" | "razorpay";

export type PaymentIntent = {
  provider: ProviderName;
  /** Provider-side order id we store on our order row. */
  ref: string;
  /** Extra fields the browser needs to open the gateway. */
  checkout: Record<string, string | number>;
};

export function activeProvider(): ProviderName {
  const p = process.env.PAYMENT_PROVIDER;
  if (p === "razorpay" && process.env.RAZORPAY_KEY_ID) return "razorpay";
  return "mock";
}

export async function createIntent(args: {
  orderPublicId: string;
  amountMinor: number;
  currency: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | null;
}): Promise<PaymentIntent> {
  if (activeProvider() === "razorpay") {
    const keyId = process.env.RAZORPAY_KEY_ID!;
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: args.amountMinor,
        currency: args.currency,
        receipt: args.orderPublicId,
        notes: { phone: args.buyerPhone, name: args.buyerName },
      }),
    });
    if (!res.ok) throw new Error(`Razorpay order failed: ${await res.text()}`);
    const order = (await res.json()) as { id: string };
    return {
      provider: "razorpay",
      ref: order.id,
      checkout: {
        key: keyId,
        order_id: order.id,
        amount: args.amountMinor,
        currency: args.currency,
        name: args.buyerName,
        contact: args.buyerPhone,
        email: args.buyerEmail ?? "",
      },
    };
  }

  return {
    provider: "mock",
    ref: `mock_${args.orderPublicId}`,
    checkout: { amount: args.amountMinor, currency: args.currency },
  };
}

/** Verifies a gateway callback actually came from the gateway. */
export function verifyCallback(payload: Record<string, string>) {
  if (activeProvider() === "razorpay") {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = payload;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
      return false;
    const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    return expected === razorpay_signature;
  }
  return true;
}
