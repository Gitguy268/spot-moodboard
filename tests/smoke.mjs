// Smoke test: every look × filter, dragging on the board, the lightbox,
// saved positions, phone width and a file:// load. Fails on console errors
// and on any picture that does not load.
//
//   npm ci && npx playwright install chromium webkit && npm run smoke
//   BROWSERS=chromium npm run smoke      (one engine only)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium, webkit } = await import(process.env.PLAYWRIGHT || "playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(root, path.endsWith("/") ? path + "index.html" : path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${msg}`); if (!ok) failures++; };

const engines = { chromium, webkit };
const wanted = (process.env.BROWSERS || "chromium,webkit").split(",").map((s) => s.trim());

for (const name of wanted) {
  const engine = engines[name];
  if (!engine) throw new Error(`unknown browser ${name}`);
  console.log(`\n${name}`);
  const browser = await engine.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const badResponses = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  page.on("response", (r) => { if (r.url().startsWith(base) && r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });
  // offline-safe: never wait on Google Fonts
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));

  await page.goto(base);
  const data = await page.evaluate(() => window.SPOT_IMAGES);
  check(data.length >= 30, `${data.length} pictures in data.js`);
  const tags = ["all", "cozy", "festive", "studio", "art", "games"];
  const expected = (t) => (t === "all" ? data.length : data.filter((d) => d.tags.includes(t)).length);

  for (const look of ["board", "gallery", "cozy"]) {
    await page.click(`.picker [data-look="${look}"]`);
    check(await page.evaluate((l) => document.body.classList.contains(`look-${l}`), look), `${look}: look applied`);
    for (const t of tags) {
      await page.click(`.chip[data-tag="${t}"]`);
      const n = await page.locator(".card:not(.hidden)").count();
      check(n === expected(t), `${look}/${t}: ${n} cards (want ${expected(t)})`);
    }
    await page.click('.chip[data-tag="all"]');
  }

  // every picture loads (thumbs and full size)
  const broken = await page.evaluate(async (ids) => {
    const bad = [];
    for (const id of ids) for (const dir of ["thumb", "img"]) {
      const img = new Image();
      img.src = `assets/${dir}/${id}.webp`;
      try { await img.decode(); if (!img.naturalWidth) bad.push(img.src); } catch { bad.push(img.src); }
    }
    return bad;
  }, data.map((d) => d.id));
  check(broken.length === 0, `all ${data.length * 2} image files decode${broken.length ? ": " + broken.join(", ") : ""}`);

  // board: drag a card, it stays there after a reload
  await page.click('.picker [data-look="board"]');
  const card = page.locator(".board .card:not(.hidden)").nth(3);
  await card.scrollIntoViewIfNeeded();
  const id = await card.getAttribute("data-id");
  const before = await card.evaluate((el) => el.style.transform);
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 120, { steps: 8 });
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + 160, { steps: 8 });
  await page.mouse.up();
  const after = await card.evaluate((el) => el.style.transform);
  check(after !== before, `drag moved ${id}`);
  check(!(await page.locator("#lightbox[open]").count()), "drag did not open the lightbox");
  await page.reload();
  const reloaded = await page.locator(`.board .card[data-id="${id}"]`).evaluate((el) => el.style.transform);
  check(reloaded === after, "position saved across reload");

  // zoom out and back
  await page.click("#zoom-out");
  check(await page.evaluate(() => /scale\(0\.85\)/.test(document.querySelector(".board").style.transform)), "zoom out scales the board");
  await page.click("#zoom-in");
  check(await page.evaluate(() => document.querySelector(".board").style.transform === ""), "zoom back to 100%");

  // lightbox: click opens, arrows step, Escape closes
  const first = page.locator(".board .card:not(.hidden)").first();
  await first.scrollIntoViewIfNeeded();
  await first.click();
  check(await page.locator("#lightbox[open]").count() === 1, "click opens the lightbox");
  const c1 = await page.textContent("#lb-count");
  await page.keyboard.press("ArrowRight");
  const c2 = await page.textContent("#lb-count");
  check(c1 !== c2 && c2.startsWith("2 /"), `ArrowRight steps (${c1} → ${c2})`);
  check(await page.locator("#lb-pal button").count() >= 3, "palette swatches shown");
  await page.keyboard.press("Escape");
  check(await page.locator("#lightbox[open]").count() === 0, "Escape closes the lightbox");

  // gallery: click opens too; keyboard Enter on a focused card
  await page.click('.picker [data-look="gallery"]');
  await page.locator(".grid .card").first().focus();
  await page.keyboard.press("Enter");
  check(await page.locator("#lightbox[open]").count() === 1, "Enter on a card opens the lightbox");
  await page.keyboard.press("Escape");

  // shuffle and tidy do not throw
  await page.click("#shuffle");
  await page.click('.picker [data-look="board"]');
  await page.click("#reset");
  await page.click('.picker [data-look="cozy"]');
  const snowOn = await page.waitForFunction(() => getComputedStyle(document.getElementById("snow")).opacity === "1", null, { timeout: 5000 }).then(() => true, () => false);
  check(snowOn, "cozy shows snow");

  // phone width: no sideways scroll in any look
  await page.setViewportSize({ width: 375, height: 800 });
  for (const look of ["board", "gallery", "cozy"]) {
    await page.click(`.picker [data-look="${look}"]`);
    await page.waitForTimeout(250);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check(sw <= 375, `${look} at 375px: scrollWidth ${sw}`);
  }

  check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  check(badResponses.length === 0, `no failed requests${badResponses.length ? ": " + badResponses.join(", ") : ""}`);
  await context.close();

  if (name === "chromium") {
    // phone: a tap opens a picture; press-and-hold then drag moves a card without scrolling the page
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await p.goto(base);
    const c = p.locator(".board .card").first();
    await c.scrollIntoViewIfNeeded();
    await c.tap();
    await p.waitForTimeout(500);
    check(await p.locator("#lightbox[open]").count() === 1, "phone: tap opens the lightbox and it stays open");
    await p.locator("#lb-close").tap();
    const cdp = await ctx.newCDPSession(p);
    const b = await c.boundingBox();
    const x = b.x + b.width / 2, y = b.y + 60;
    const t0 = await c.evaluate((el) => el.style.transform);
    const s0 = await p.evaluate(() => scrollY);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await p.waitForTimeout(450);
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + i * 6, y: y + i * 12 }] });
      await p.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await p.waitForTimeout(200);
    const t1 = await c.evaluate((el) => el.style.transform);
    const s1 = await p.evaluate(() => scrollY);
    check(t1 !== t0 && s1 === s0, `phone: hold + drag moves the card (scroll ${s0} → ${s1})`);
    check(await p.locator("#lightbox[open]").count() === 0, "phone: hold + drag does not open the lightbox");
    // a quick swipe over a card scrolls the page and leaves the card alone
    const b2 = await c.boundingBox();
    const t2 = await c.evaluate((el) => el.style.transform);
    const s2 = await p.evaluate(() => scrollY);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: b2.x + 40, y: b2.y + 200 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: b2.x + 40, y: b2.y + 200 - i * 25 }] });
      await p.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await p.waitForTimeout(400);
    const s3 = await p.evaluate(() => scrollY);
    check(s3 > s2 && (await c.evaluate((el) => el.style.transform)) === t2, `phone: swipe scrolls the page (${s2} → ${s3})`);
    await ctx.close();
  }
  if (name === "chromium") {
    // double-click open: file:// works without a server
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const fileErrors = [];
    p.on("pageerror", (e) => fileErrors.push(String(e)));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await p.goto(pathToFileURL(join(root, "index.html")).href);
    const n = await p.locator(".card").count();
    check(n === data.length && fileErrors.length === 0, `file:// load shows ${n} cards`);
    await ctx.close();
  }
  await browser.close();
}

server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
