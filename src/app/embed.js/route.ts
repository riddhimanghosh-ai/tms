/**
 * Drop-in loader for an organiser's existing website:
 *
 *   <div id="rasana-tickets"></div>
 *   <script src="https://…/embed.js" data-event="org/event" data-target="#rasana-tickets" async></script>
 *
 * Injects an iframe and keeps its height in sync with the booking form.
 */
import { canonicalOrigin } from "@/lib/site-url";

export async function GET() {
  // Same reasoning as the snippet itself: the iframe must resolve to the
  // durable domain, not to whichever deployment happened to serve this script.
  const origin = await canonicalOrigin();

  const js = `(function () {
  var script = document.currentScript;
  if (!script) {
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf("/embed.js") !== -1) { script = all[i]; break; }
    }
  }
  if (!script) return;

  var slug = script.getAttribute("data-event");
  if (!slug) { console.error("[rasana] data-event is required, e.g. my-org/my-event"); return; }

  var selector = script.getAttribute("data-target");
  var mount = selector ? document.querySelector(selector) : null;
  if (!mount) {
    mount = document.createElement("div");
    script.parentNode.insertBefore(mount, script);
  }

  var params = new URLSearchParams(window.location.search);
  var ref = script.getAttribute("data-ref") || params.get("ref") || "";

  var frame = document.createElement("iframe");
  frame.src = "${origin}/embed/" + slug + (ref ? "?ref=" + encodeURIComponent(ref) : "");
  frame.title = "Book tickets";
  frame.loading = "lazy";
  frame.setAttribute("allow", "payment");
  frame.style.cssText = "width:100%;border:0;display:block;min-height:640px;transition:height .2s";
  mount.appendChild(frame);

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "rasana:height") return;
    if (event.source !== frame.contentWindow) return;
    frame.style.height = Math.max(420, event.data.height) + "px";
  });
})();`;

  return new Response(js, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
