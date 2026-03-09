/**
 * Capture all documentation screenshots sequentially.
 *
 * Strategy: Use Node.js fetch to call the login API, extract the session cookie,
 * then inject it into the browser context before navigating to authenticated pages.
 * This bypasses the CSP+webpack eval issue that prevents React hydration in headless Playwright.
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

/**
 * Login via API and return session cookies.
 * Uses native fetch to call the login endpoint and extract Set-Cookie headers.
 */
async function getSessionCookies(email, password) {
  const res = await fetch(`${BASE}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed: ${JSON.stringify(data)}`);

  // Extract Set-Cookie headers
  const cookies = [];
  const setCookies = res.headers.getSetCookie?.() || [];
  for (const sc of setCookies) {
    const parts = sc.split(";")[0].split("=");
    const name = parts[0].trim();
    const value = parts.slice(1).join("=").trim();
    cookies.push({ name, value, domain: "localhost", path: "/" });
  }

  console.log(`  Logged in as ${email}, got ${cookies.length} cookie(s): ${cookies.map(c => c.name).join(", ")}`);
  return cookies;
}

// Temp disable admin MFA using better-sqlite3 directly
async function setAdminMfa(on) {
  const Database = (await import("better-sqlite3")).default;
  const dbPath = (process.env.DATABASE_URL || "file:./dev.db").replace("file:", "");
  const db = new Database(dbPath);
  if (on) {
    const { createCipheriv, randomBytes } = await import("crypto");
    const key = Buffer.from(process.env.MASTER_ENCRYPTION_KEY, "hex");
    const iv = randomBytes(16); const c = createCipheriv("aes-256-gcm", key, iv);
    const e = Buffer.concat([c.update("JBSWY3DPEHPK3PXP", "utf8"), c.final()]);
    const t = c.getAuthTag();
    const enc = `${iv.toString("hex")}:${t.toString("hex")}:${e.toString("hex")}`;
    db.prepare("UPDATE User SET mfaEnabled = 1, totpSecretEnc = ?, totpEnabledAt = datetime('now', '-30 days') WHERE email = ?").run(enc, "admin@example.com");
  } else {
    db.prepare("UPDATE User SET mfaEnabled = 0, totpSecretEnc = NULL, totpEnabledAt = NULL WHERE email = ?").run("admin@example.com");
  }
  db.close();
}

async function main() {
  // Warm up pages
  console.log("Warming up...");
  for (const p of ["/login","/register","/forgot-password"]) {
    try { await fetch(`${BASE}${p}`, { signal: AbortSignal.timeout(20000) }); } catch {}
  }
  console.log("");

  const browser = await chromium.launch({ headless: true });

  // --- Unauthenticated pages ---
  // These don't need CSP workaround since they're server-rendered static forms
  console.log("--- Auth Pages ---");
  const ctx1 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // Disable CSP to allow webpack scripts to execute
    bypassCSP: true,
  });
  const p1 = await ctx1.newPage();

  await go(p1, "/login", { waitFor: "#email" });
  await snap(p1, "user-auth-login");

  await go(p1, "/register", { waitFor: "#email" });
  await snap(p1, "user-auth-register");

  await go(p1, "/forgot-password", { waitFor: "#email" });
  await snap(p1, "user-auth-forgot-password");
  await ctx1.close();

  // --- User pages (Alex Chen) ---
  console.log("\n--- User Pages ---");
  const userCookies = await getSessionCookies("alex.chen@example.com", "Test1234!");

  const ctx2 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    bypassCSP: true,
  });
  // Inject session cookies before navigation
  await ctx2.addCookies(userCookies);
  const p2 = await ctx2.newPage();

  await go(p2, "/");
  console.log(`  Dashboard URL: ${p2.url()}`);
  await snap(p2, "user-dashboard-overview");

  await go(p2, "/apps/new", { waitFor: "form" });
  await snap(p2, "user-app-create");

  await go(p2, "/settings", { waitFor: "form" });
  await snap(p2, "user-settings-profile");

  await go(p2, "/teams");
  await snap(p2, "user-teams-directory");

  // Test page for an app
  await go(p2, "/");
  try {
    const link = await p2.$('a[href*="/test/"]');
    if (link) {
      const href = await link.getAttribute("href");
      if (href) {
        await go(p2, href, { waitFor: "button" });
        await snap(p2, "user-app-test-page");
      }
    }
  } catch {}
  await ctx2.close();

  // --- Admin pages (MFA off) ---
  console.log("\n--- Admin Pages ---");
  await setAdminMfa(false);
  console.log("  (MFA off)");

  const adminCookies = await getSessionCookies("admin@example.com", "Test1234!");

  const ctx3 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    bypassCSP: true,
  });
  await ctx3.addCookies(adminCookies);
  const p3 = await ctx3.newPage();

  await go(p3, "/");
  console.log(`  Admin dashboard URL: ${p3.url()}`);
  await snap(p3, "admin-dashboard-overview");

  await go(p3, "/admin/users");
  await snap(p3, "admin-users-list");

  await go(p3, "/admin/settings", { waitFor: "form" });
  await snap(p3, "admin-config-email");

  await go(p3, "/teams");
  await snap(p3, "admin-teams-directory");

  await go(p3, "/teams/new", { waitFor: "form" });
  await snap(p3, "admin-teams-create");

  await go(p3, "/settings", { waitFor: "form" });
  await snap(p3, "admin-settings-security");
  await ctx3.close();

  // --- MFA prompt ---
  // For the MFA prompt, we need to actually interact with the login form
  // Use bypassCSP so React hydrates and the form works
  await setAdminMfa(true);
  console.log("  (MFA on)");

  console.log("\n--- MFA Prompt ---");
  const ctx4 = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    bypassCSP: true,
  });
  const p4 = await ctx4.newPage();
  await go(p4, "/login", { waitFor: "#email" });
  // With CSP bypassed, React should hydrate
  await p4.waitForTimeout(3000);
  await p4.fill("#email", "admin@example.com");
  await p4.fill("#password", "Test1234!");
  await p4.click('button[type="submit"]');
  await p4.waitForTimeout(5000);
  console.log(`  MFA prompt URL: ${p4.url()}`);
  await snap(p4, "user-auth-mfa-prompt");
  await ctx4.close();

  console.log("\n✅ Done!");
  await browser.close();
}

main().catch(e => { console.error("Failed:", e.message); process.exit(1); });
