import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const results = [];
const ok = (name, detail = "") => results.push(["PASS", name, detail]);
const bad = (name, detail = "") => results.push(["FAIL", name, detail]);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });

try {
  // ---------- marketplace ----------
  await page.goto(BASE, { waitUntil: "networkidle" });
  const cards = await page.locator("main ul li a").count();
  cards >= 3 ? ok("marketplace lists events", `${cards} cards`) : bad("marketplace lists events", `${cards}`);

  // ---------- sign in (the reported bug) ----------
  await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "organiser@demo.in");
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/admin(\?|$)/, { timeout: 30000 });
  const welcome = await page.locator("text=Welcome back").count();
  welcome ? ok("sign in reaches the dashboard") : bad("sign in reaches the dashboard", page.url());

  // ---------- dashboard ----------
  await page.click('a:has-text("Navratri Nights 2026")');
  await page.waitForURL(/\/admin\/events\//, { timeout: 30000 });
  await page.waitForSelector("text=Event overview", { timeout: 30000 });
  const hasDonut = await page.locator('svg[aria-label="Share by source"]').count();
  const hasLive = await page.locator("text=Live").first().count();
  hasDonut && hasLive ? ok("dashboard renders charts + live pill") : bad("dashboard charts", `donut=${hasDonut} live=${hasLive}`);
  await page.screenshot({ path: "/tmp/shot-dashboard.png" });

  const eventUrl = page.url();
  // ---------- admin tabs ----------
  for (const [tab, marker] of [
    ["Nights", "Nights"],
    ["Tickets & seating", "Ticket categories"],
    ["Codes", "Discount"],
    ["Orders", "Export CSV"],
    ["Check-in", "Gate scanner"],
    ["Embed & share", "Direct link"],
    ["Settings", "Gate & re-entry"],
  ]) {
    await page.click(`nav a:has-text("${tab}")`);
    await page.waitForTimeout(2500);
    const found = await page.locator(`text=${marker}`).first().count();
    found ? ok(`tab: ${tab}`) : bad(`tab: ${tab}`, `no "${marker}"`);
  }

  // ---------- seat map on the ringed event ----------
  await page.goto(`${BASE}/e/rhythm-events/raas-in-the-round/book`, { waitUntil: "networkidle" });
  const seatCircles = await page.locator('svg[aria-label*="Seat map"] circle').count();
  seatCircles > 200 ? ok("ring seat map renders", `${seatCircles} circles`) : bad("ring seat map", `${seatCircles}`);
  await page.screenshot({ path: "/tmp/shot-seatmap.png" });

  // ---------- full purchase on the nine-night event ----------
  await page.goto(`${BASE}/e/rhythm-events/navratri-nights-2026`, { waitUntil: "networkidle" });
  const countdown = await page.locator('[role="timer"]').count();
  countdown ? ok("landing page countdown") : bad("landing page countdown");
  await page.screenshot({ path: "/tmp/shot-landing.png", fullPage: false });

  await page.click('a:has-text("Book tickets")');
  await page.waitForURL(/\/book/, { timeout: 30000 });
  await page.waitForSelector("text=Which night?", { timeout: 30000 });
  ok("night picker shown for a 9-night event");

  await page.locator('button[aria-pressed]').nth(2).click();   // pick night 3
  await page.waitForTimeout(2500);
  await page.locator('button[aria-label^="Add one"]').first().click();
  await page.locator('button[aria-label^="Add one"]').first().click();
  await page.waitForTimeout(2500);

  const total = await page.locator('button:has-text("Continue")').innerText();
  total.includes("₹") ? ok("cart prices server-side", total.trim()) : bad("cart price", total);

  await page.click('button:has-text("Continue")');
  await page.fill('input[name="name"]', "Playwright Buyer");
  await page.fill('input[name="phone"]', "+919812345678");
  await page.click('button:has-text("Pay")');
  await page.waitForURL(/\/pay\//, { timeout: 40000 });
  ok("checkout reaches payment");

  await page.click('button:has-text("UPI")');
  await page.waitForURL(/\/order\//, { timeout: 40000 });
  const goingText = await page.locator("text=You're going").count();
  const qrCount = await page.locator("article svg").count();
  goingText && qrCount >= 2
    ? ok("passes issued with QR codes", `${qrCount} passes`)
    : bad("passes issued", `going=${goingText} qr=${qrCount}`);
  await page.screenshot({ path: "/tmp/shot-passes.png" });

  const passCode = (await page.locator("article p.font-mono").first().innerText()).trim();

  // ---------- gate: scan in, out, back in ----------
  await page.goto(`${eventUrl}/checkin`, { waitUntil: "networkidle" });
  await page.fill('input[name="code"]', passCode);
  await page.click('button:has-text("Scan")');
  await page.waitForTimeout(2500);
  const first = await page.locator("text=Admit").count();
  first ? ok("gate admits a valid pass") : bad("gate admit", await page.locator(".rounded-2xl.border").last().innerText().catch(() => ""));

  await page.fill('input[name="code"]', passCode);
  await page.click('button:has-text("Scan")');
  await page.waitForTimeout(2500);
  const out = await page.locator("text=Checked out").count();
  out ? ok("re-entry: same QR checks out") : bad("re-entry check-out");

  await page.fill('input[name="code"]', passCode);
  await page.click('button:has-text("Scan")');
  await page.waitForTimeout(2500);
  const backText = await page.locator("text=Too soon to re-enter").count();
  backText ? ok("re-entry cooldown enforced (10 min set on this event)") : bad("re-entry cooldown");
  await page.screenshot({ path: "/tmp/shot-gate.png" });

} catch (e) {
  bad("run aborted", String(e).slice(0, 220));
}

console.log("\n================ BROWSER CHECK ================");
for (const [status, name, detail] of results) {
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}${detail ? "  — " + detail : ""}`);
}
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (errors.length) {
  console.log("\nconsole/page errors:");
  [...new Set(errors)].slice(0, 6).forEach((e) => console.log("  " + e));
} else {
  console.log("\nno JavaScript errors on any page");
}
await browser.close();
