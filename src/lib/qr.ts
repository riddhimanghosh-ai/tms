import QRCode from "qrcode";

/** Inline SVG string — no client library, no network fetch at render time. */
export async function qrSvg(text: string) {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#0f172a", light: "#00000000" },
  });
}
