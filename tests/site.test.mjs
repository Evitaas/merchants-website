// Evitaas Merchants site: the page in headless Chromium, served from this checkout. Outside requests (FormSubmit,
// Cloudflare's analytics) are blocked, so nothing is sent anywhere. Run: npm install && npm test (in tests/).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const ROOT = path.resolve(import.meta.dirname, "..");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png" };
let server, base, browser;
const missing = [];
before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p === "/") p = "/index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { missing.push(p); res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function open(viewport = { width: 1280, height: 900 }, hash = "") {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(url => !url.href.startsWith(base), r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource: net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + hash, { waitUntil: "load" });
  page.errors = errors;
  return page;
}

test("loads with no errors and every file it asks for exists", async () => {
  missing.length = 0;
  const page = await open();
  assert.deepEqual(page.errors, []);
  assert.deepEqual(missing, []);
  await page.context().close();
});

test("title, description, language and mobile viewport are set", async () => {
  const page = await open();
  assert.match(await page.title(), /Evitaas Merchants/);
  assert.ok((await page.locator('meta[name="description"]').getAttribute("content")).length > 50);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.match(await page.locator('meta[name="viewport"]').getAttribute("content"), /width=device-width/);
  await page.context().close();
});

test("every image loads and has a text alternative", async () => {
  const page = await open();
  const imgs = await page.locator("img").evaluateAll(els => els.map(i => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0, alt: i.getAttribute("alt") })));
  assert.ok(imgs.length > 0);
  for (const i of imgs) { assert.ok(i.ok, `${i.src} did not load`); assert.notEqual(i.alt, null, `${i.src} has no alt`); }
  await page.context().close();
});

test("every in-page link leads to a section that exists", async () => {
  const page = await open();
  const bad = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute("href"))
    .filter(h => h.length > 1 && !document.getElementById(h.slice(1))));
  assert.deepEqual(bad, []);
  await page.context().close();
});

test("the footer shows the current year", async () => {
  const page = await open();
  assert.equal(await page.locator("#year").innerText(), String(new Date().getFullYear()));
  await page.context().close();
});

for (const [name, vp] of [["phone", { width: 375, height: 800 }], ["tablet", { width: 768, height: 1024 }], ["desktop", { width: 1280, height: 900 }]]) {
  test(`no sideways scrolling on a ${name} (${vp.width}px)`, async () => {
    const page = await open(vp);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `page is ${over}px wider than the screen`);
    await page.context().close();
  });
}

test("phone menu: opens, says so to screen readers, and closes when a link is tapped", async () => {
  const page = await open({ width: 375, height: 800 });
  const toggle = page.locator("#navToggle"), nav = page.locator("#primaryNav");
  assert.equal(await toggle.isVisible(), true);
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.match(await nav.getAttribute("class"), /\bopen\b/);
  await nav.locator("a").first().click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.doesNotMatch(await nav.getAttribute("class"), /\bopen\b/);
  await page.context().close();
});

test("contact form: required fields, honeypot hidden, sends to FormSubmit and comes back to the thank-you note", async () => {
  const page = await open();
  const form = page.locator("#contactForm");
  assert.match(await form.getAttribute("action"), /^https:\/\/formsubmit\.co\/\w+$/);
  assert.equal((await form.getAttribute("method")).toUpperCase(), "POST");
  for (const id of ["name", "email", "message"]) assert.equal(await page.locator("#" + id).getAttribute("required"), "", id);
  assert.equal(await page.locator("#email").getAttribute("type"), "email");
  assert.equal(await page.locator('input[name="_honey"]').isVisible(), false);
  const next = new URL(await page.locator('input[name="_next"]').getAttribute("value"));
  assert.equal(next.host, "merchants.evitaas.com");
  assert.equal(await page.locator(next.hash).count(), 1, `${next.hash} must exist on the page`);
  // an empty form is refused by the browser itself, before anything is sent
  await page.locator('#contactForm button[type="submit"]').click();
  assert.equal(await page.evaluate(() => document.getElementById("name").validity.valueMissing), true);
  await page.context().close();
});

test("the thank-you note shows only after sending", async () => {
  let page = await open();
  assert.equal(await page.locator("#contact-thanks").isVisible(), false);
  await page.context().close();
  page = await open(undefined, "#contact-thanks");
  assert.equal(await page.locator("#contact-thanks").isVisible(), true);
  await page.context().close();
});

test("no email address in plain text on the page (spam bots read it)", async () => {
  const page = await open();
  const html = await page.content();
  const visible = await page.locator("body").innerText();
  assert.doesNotMatch(visible, /[\w.+-]+@[\w-]+\.[\w.]+/);
  assert.doesNotMatch(html, /mailto:/);
  await page.context().close();
});
