// The live site (https://merchants.evitaas.com) is up and serves what is on main. Run by the daily check and after
// each deploy. Needs only Node (no browser).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SITE = "https://merchants.evitaas.com/";
const ROOT = path.resolve(import.meta.dirname, "..");

async function get(url) {
  for (let i = 0; i < 6; i++) {             // GitHub Pages can take a minute to publish a new deploy
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) return r;
    await new Promise(s => setTimeout(s, 10000));
  }
  throw new Error(`${url} did not answer with 200`);
}

test("the live page is up, over HTTPS, and is the page on main", async () => {
  let live;
  for (let i = 0; i < 12; i++) {             // after a deploy, wait up to 2 minutes for the new page
    live = await (await get(SITE + "?t=" + Date.now())).text();
    if (live === fs.readFileSync(path.join(ROOT, "index.html"), "utf8")) break;
    await new Promise(s => setTimeout(s, 10000));
  }
  assert.equal(live, fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), "the live page differs from index.html on main");
});

test("the live page's own files load", async () => {
  for (const f of ["assets/css/style.css", "assets/js/main.js", "assets/img/logo-header.png", "assets/img/favicon.svg"]) await get(SITE + f);
});
