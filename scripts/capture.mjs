// Makes the README pictures in docs/: one screenshot per look, a phone shot,
// the social preview (og.jpg) and an animated demo (demo.webp).
// Needs img2webp and cwebp (brew install webp).
//
//   npm run capture
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const { chromium } = await import(process.env.PLAYWRIGHT || "playwright");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
const types = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    res.writeHead(200, { "content-type": types[extname(p)] || "text/html" })
      .end(await readFile(join(root, p === "/" ? "index.html" : p)));
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;
await mkdir(docs, { recursive: true });

const browser = await chromium.launch();
const shot = async (page, file, opts = {}) => {
  const png = join(tmpdir(), "spot-capture.png");
  await page.screenshot({ path: png, ...opts });
  execFileSync("magick", [png, "-strip", "-quality", "84", join(docs, file)]);
};
const settle = async (page) => {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    // load every lazy thumbnail in view so screenshots aren't blank
    await Promise.all([...document.images].map((i) => { i.loading = "eager"; return i.decode().catch(() => {}); }));
  });
  await page.waitForTimeout(700);
};

// desktop shots
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
for (const look of ["board", "gallery", "cozy"]) {
  await page.click(`.picker [data-look="${look}"]`);
  await settle(page);
  await shot(page, `${look}.jpg`);
}
// social preview
await page.setViewportSize({ width: 1200, height: 630 });
await page.click('.picker [data-look="board"]');
await settle(page);
await shot(page, "og.jpg");

// phone
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await phone.goto(url);
await phone.click('.picker [data-look="cozy"]');
await settle(phone);
await shot(phone, "phone.jpg");

// animated demo: switch looks, drag a card, open the lightbox
const frames = join(tmpdir(), "spot-demo");
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });
const demo = await browser.newPage({ viewport: { width: 1200, height: 750 } });
await demo.goto(url);
await demo.evaluate(() => localStorage.clear());
await demo.reload();
await settle(demo);
let n = 0;
const grab = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await demo.screenshot({ path: join(frames, `${String(n++).padStart(4, "0")}.png`) });
  }
};
await grab(6);
const card = demo.locator(".board .card").nth(1);
const box = await card.boundingBox();
await demo.mouse.move(box.x + box.width / 2, box.y + 50);
await demo.mouse.down();
for (let i = 1; i <= 12; i++) {
  await demo.mouse.move(box.x + box.width / 2 + i * 18, box.y + 50 + i * 12);
  await grab();
}
await demo.mouse.up();
await grab(4);
await demo.mouse.click(box.x + box.width / 2 + 216, box.y + 194);
await demo.waitForTimeout(400);
await grab(6);
await demo.keyboard.press("ArrowRight");
await demo.waitForTimeout(400);
await grab(5);
await demo.keyboard.press("Escape");
for (const look of ["gallery", "cozy"]) {
  await demo.click(`.picker [data-look="${look}"]`);
  await settle(demo);
  await grab(look === "cozy" ? 1 : 8);
  if (look === "cozy") for (let i = 0; i < 14; i++) { await demo.waitForTimeout(60); await grab(); }
}
await browser.close();
server.close();

const list = [];
for (let i = 0; i < n; i++) list.push("-d", "120", "-lossy", "-q", "60", join(frames, `${String(i).padStart(4, "0")}.png`));
execFileSync("img2webp", ["-loop", "0", "-min_size", ...list, "-o", join(docs, "demo.webp")]);
console.log(`docs/: board.jpg gallery.jpg cozy.jpg og.jpg phone.jpg demo.webp (${n} frames)`);
