/**
 * Boot the production build and drive the paths a PM uses daily, in both languages.
 *
 * The suite proves the rules; this proves the app actually serves. It exists because a
 * whole class of failure here is invisible to vitest and to `next build`: a hook called
 * from a server component, a hydration mismatch from locale-dependent formatting, a page
 * that renders in English and throws in Arabic. Each of those has happened in this repo.
 *
 * Every page is checked in English AND Arabic, because the Arabic UI is a first-class
 * surface, not a translation layer bolted on top — `dir="rtl"` changes layout, and
 * bidirectional text reorders numbers if a string was assembled by concatenation.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = process.env.QG_PORT ?? "3178";
const BASE = `http://localhost:${PORT}`;
const EMAIL = process.env.QG_EMAIL ?? "pm@procurementhub.test";
const PASSWORD = process.env.QG_PASSWORD ?? "password123";

// Playwright's bundled download is often absent in CI images; this one ships with the box.
const PINNED = "/opt/pw-browsers/chromium";
const launchOptions = existsSync(PINNED) ? { executablePath: PINNED } : {};

const problems = [];
const note = (m) => console.log(`   ${m}`);

const server = spawn("npm", ["run", "start"], {
  env: { ...process.env, PORT },
  stdio: "ignore",
  detached: true,
});
const stop = () => { try { process.kill(-server.pid, "SIGKILL"); } catch {} };
process.on("exit", stop);

async function waitForServer(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

console.log("== smoke: production build, both locales ==");
if (!(await waitForServer())) {
  console.error("FAIL: the built app never answered on /login");
  stop();
  process.exit(1);
}
note("server up");

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  // Favicon and other asset 404s are noise, not application failures.
  if (/404|favicon/i.test(m.text())) return;
  problems.push(`console: ${m.text()}`);
});
page.on("response", (r) => {
  if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
});

await page.goto(`${BASE}/login`);
await page.fill("#email", EMAIL);
await page.fill("#password", PASSWORD);
// Scoped to the credentials form: the shell's language toggle is also a submit button.
await page.click('form:has(#email) button[type="submit"]');
await page.waitForURL(`${BASE}/`, { timeout: 30_000 });
note("signed in");

const ROUTES = ["/", "/projects", "/deliveries", "/invoices", "/forecast", "/vendors", "/clients"];

async function sweep(label) {
  for (const route of ROUTES) {
    const before = problems.length;
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    if (/Application error|Unhandled Runtime Error|500 -/i.test(body)) {
      problems.push(`${label} ${route}: error page rendered`);
    }
    if (problems.length > before) note(`${label} ${route}  ✗`);
  }
  note(`${label}: swept ${ROUTES.length} routes`);
}

await sweep("en");

// The vendor PO detail page is the densest screen in the app — delivery plan, payment
// schedule and change log all render together — so it is worth reaching deliberately
// rather than hoping a link to one happens to be on whatever page the sweep ended on.
async function findVendorPo() {
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  // "/projects/new" is a button, not a project. Real ids are cuids, so pick a link whose
  // last segment looks like one rather than trusting DOM order.
  const projectHrefs = await page
    .locator('a[href^="/projects/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))
    .catch(() => []);
  const projects = projectHrefs.filter((h) => /^\/projects\/[a-z0-9]{20,}$/.test(h));

  // Not every project has a vendor PO, so try each rather than assuming the first does.
  for (const projectHref of projects) {
    await page.goto(`${BASE}${projectHref}/vendor-pos`, { waitUntil: "networkidle" });
    const hrefs = await page
      .locator('a[href^="/vendor-pos/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))
      .catch(() => []);
    const po = hrefs.find((h) => /^\/vendor-pos\/[a-z0-9]{20,}$/.test(h));
    if (po) return po;
  }
  return null;
}

const poHref = await findVendorPo();
if (poHref) {
  await page.goto(`${BASE}${poHref}`, { waitUntil: "networkidle" });
  const body = await page.locator("body").innerText();
  if (!/Delivery plan|خطة التسليم/i.test(body)) {
    problems.push("vendor PO detail rendered without its delivery plan");
  }
  note(`vendor PO detail ok (${poHref})`);
} else {
  // Honest rather than silent: this route carries the most logic in the app, and not
  // reaching it means the smoke gate covered less than the PASS line implies.
  problems.push("no vendor PO reachable — the densest page in the app was NOT exercised");
}

// Switch to Arabic and sweep again. `dir` must actually flip, or the locale cookie is not
// reaching the server render and every RTL assertion below is meaningless.
const toggled = await page
  .locator('button[type="submit"], form button')
  .filter({ hasText: /عربي/ })
  .first()
  .click()
  .then(() => true)
  .catch(() => false);

if (!toggled) {
  problems.push("could not find the Arabic language toggle");
} else {
  await page.waitForTimeout(1500);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const dir = await page.locator("html").getAttribute("dir");
  if (dir !== "rtl") problems.push(`Arabic selected but dir="${dir}" — expected rtl`);
  else note('dir="rtl" confirmed');
  await sweep("ar");
  if (poHref) await page.goto(`${BASE}${poHref}`, { waitUntil: "networkidle" });
}

await browser.close();
stop();

if (problems.length) {
  console.error(`\nFAIL: ${problems.length} problem(s) in the running app:`);
  for (const p of problems.slice(0, 30)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\nPASS: every route served cleanly in English and Arabic.");
