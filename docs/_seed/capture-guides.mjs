/**
 * Capture screenshots for SAML, SCIM, and Inspector guides.
 * Requires: webpack dev server on localhost:3000, seed data loaded.
 */

import "dotenv/config";
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE = "http://localhost:3000";
const DIR = "docs/screenshots";
mkdirSync(DIR, { recursive: true });

async function snap(page, name) {
  const buf = await page.screenshot({ type: "png" });
  writeFileSync(join(DIR, `${name}.png`), buf);
  console.log(`  ✓ ${name}.png (${buf.length} bytes)`);
}

async function go(page, path, opts = {}) {
  const { waitFor } = opts;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch {}
  if (waitFor) {
    try { await page.waitForSelector(waitFor, { timeout: 10000 }); } catch {}
  }
  await page.waitForTimeout(4000);
}

function cookieHeader(cookies) {
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

function parseCookies(res) {
  const cookies = [];
  for (const sc of (res.headers.getSetCookie?.() || [])) {
    const parts = sc.split(";")[0].split("=");
    cookies.push({ name: parts[0].trim(), value: parts.slice(1).join("=").trim(), domain: "localhost", path: "/" });
  }
  return cookies;
}

async function loginAndSwitch(email, password, teamName) {
  const res = await fetch(`${BASE}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}`);
  let cookies = parseCookies(res);

  if (teamName) {
    const teamRes = await fetch(`${BASE}/api/teams`, { headers: { Cookie: cookieHeader(cookies) } });
    const teams = await teamRes.json();
    const team = teams.find(t => t.name === teamName);
    if (team) {
      const switchRes = await fetch(`${BASE}/api/teams/switch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(cookies) },
        body: JSON.stringify({ teamId: team.id }),
      });
      const newCookies = parseCookies(switchRes);
      for (const nc of newCookies) {
        const idx = cookies.findIndex(c => c.name === nc.name);
        if (idx >= 0) cookies[idx] = nc; else cookies.push(nc);
      }
    }
  }
  return cookies;
}

async function main() {
  console.log("Warming up...");
  for (const p of ["/login", "/", "/test/entra-saml", "/test/okta-dev-oidc"]) {
    try { await fetch(`${BASE}${p}`, { signal: AbortSignal.timeout(20000) }); } catch {}
  }

  // Get app IDs from DB
  const Database = (await import("better-sqlite3")).default;
  const dbPath = (process.env.DATABASE_URL || "file:./dev.db").replace("file:", "");
  const db = new Database(dbPath);
  const entraSamlId = db.prepare("SELECT id FROM AppInstance WHERE slug = ?").get("entra-saml")?.id;
  const oktaSamlId = db.prepare("SELECT id FROM AppInstance WHERE slug = ?").get("okta-saml")?.id;
  const oktaOidcId = db.prepare("SELECT id FROM AppInstance WHERE slug = ?").get("okta-dev-oidc")?.id;
  db.close();
  console.log(`  App IDs: entra-saml=${entraSamlId}, okta-saml=${oktaSamlId}, okta-oidc=${oktaOidcId}`);

  const browser = await chromium.launch({ headless: true });

  // ========== SAML Screenshots ==========
  console.log("\n=== SAML Guide Screenshots ===");
  const samlCookies = await loginAndSwitch("alex.chen@example.com", "Test1234!", "Platform Engineering");

  const samlCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
  await samlCtx.addCookies(samlCookies);
  const samlPage = await samlCtx.newPage();

  // SAML test page
  await go(samlPage, "/test/entra-saml", { waitFor: "button" });
  await snap(samlPage, "saml-test-page");

  // SAML app settings page (top — basic config)
  if (entraSamlId) {
    await go(samlPage, `/apps/${entraSamlId}`, { waitFor: "form" });
    await snap(samlPage, "saml-app-settings");

    // Scroll to signing/encryption section
    await samlPage.evaluate(() => window.scrollBy(0, 700));
    await samlPage.waitForTimeout(1500);
    await snap(samlPage, "saml-app-settings-signing");

    // Scroll more for auth controls / SLO
    await samlPage.evaluate(() => window.scrollBy(0, 700));
    await samlPage.waitForTimeout(1500);
    await snap(samlPage, "saml-app-settings-controls");
  }

  await samlCtx.close();

  // ========== SCIM Screenshots ==========
  console.log("\n=== SCIM Guide Screenshots ===");
  // Use a tall viewport to capture more content
  const scimCookies = await loginAndSwitch("alex.chen@example.com", "Test1234!", "Platform Engineering");

  const scimCtx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, bypassCSP: true });
  await scimCtx.addCookies(scimCookies);
  const scimPage = await scimCtx.newPage();

  // Test page full height to capture SCIM sections
  await go(scimPage, "/test/okta-dev-oidc", { waitFor: "button" });

  // Get page height info
  const pageHeight = await scimPage.evaluate(() => document.body.scrollHeight);
  console.log(`  Page height: ${pageHeight}px`);

  // Scroll to bottom half where SCIM data should be
  await scimPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4));
  await scimPage.waitForTimeout(2000);
  await snap(scimPage, "scim-endpoints");

  // Scroll more
  await scimPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
  await scimPage.waitForTimeout(2000);
  await snap(scimPage, "scim-resources");

  // Bottom of page
  await scimPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await scimPage.waitForTimeout(2000);
  await snap(scimPage, "scim-request-log");

  await scimCtx.close();

  // ========== Inspector Screenshots ==========
  console.log("\n=== Inspector Guide Screenshots ===");
  const inspCookies = await loginAndSwitch("alex.chen@example.com", "Test1234!", "Platform Engineering");

  const inspCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
  await inspCtx.addCookies(inspCookies);
  const inspPage = await inspCtx.newPage();

  // Test page — scroll to bottom to see discovery metadata and auth history
  await go(inspPage, "/test/okta-dev-oidc", { waitFor: "button" });
  await inspPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await inspPage.waitForTimeout(2000);
  await snap(inspPage, "inspector-discovery-metadata");

  // Inspector page (will show empty state since no auth runs exist)
  await go(inspPage, "/test/okta-dev-oidc/inspector");
  await snap(inspPage, "inspector-page");

  await inspCtx.close();

  console.log("\n✅ Done!");
  await browser.close();
}

main().catch(e => { console.error("Failed:", e.message); process.exit(1); });
