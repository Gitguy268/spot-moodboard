// Turns the source pictures of Spot into the web-ready files in assets/.
// Every picture is stripped of all metadata, collar tags are pixelated, and
// files get neutral names. Writes assets/img, assets/thumb and assets/data.js.
//
// The source pictures are not in this repository. Their paths live in
// scripts/sources.local.json (git-ignored): { "<id>": "/path/to/picture", ... }
//
//   npm run images
//
// Needs ImageMagick 7 (magick) and cwebp.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesFile = join(root, "scripts/sources.local.json");
if (!existsSync(sourcesFile)) throw new Error("scripts/sources.local.json is missing: it maps each picture id to its source file");
const SOURCES = JSON.parse(readFileSync(sourcesFile, "utf8"));

// tags: cozy, festive, studio, art, games
// mask: [x, y, w, h] regions (source pixels) to pixelate, for collar tags.
const items = [
  { id: "blanket-maple", title: "Maple-leaf blanket", tags: ["cozy", "studio"], alt: "Spot sitting under a green maple-leaf blanket" },
  { id: "blanket-bow", title: "Pink bow nap", tags: ["cozy", "studio"], alt: "Spot as a puppy lying in a white blanket with a pink bow" },
  { id: "basket-tartan", title: "Tartan basket", tags: ["cozy", "studio"], alt: "Spot in a wicker basket with a red tartan blanket" },
  { id: "fireside-bowtie", title: "Bow tie by the fire", tags: ["cozy", "festive"], alt: "Spot in a red cable-knit sweater and tartan bow tie by a candlelit fireplace" },
  { id: "fireside-basket", title: "Fireside basket", tags: ["cozy", "festive"], alt: "Spot in a white Santa hat in a basket in front of a fire" },
  { id: "scarf-gifts", title: "Scarf & presents", tags: ["cozy", "festive"], alt: "Spot in a striped scarf among wrapped presents" },
  { id: "tree-fireplace", title: "Tree, fire, Spot", tags: ["cozy", "festive"], alt: "Spot in a Santa hat between a stone fireplace and a Christmas tree", mask: [[420, 785, 52, 62]] },
  { id: "blanket-cutout", title: "Blanket cape", tags: ["cozy"], alt: "Spot sitting with a grey bone-print blanket over his back", mask: [[1240, 1760, 260, 340]] },
  { id: "profile-blanket", title: "Side profile", tags: ["cozy", "studio"], alt: "Spot in profile wrapped in a grey bone-print blanket", mask: [[310, 585, 58, 70]] },
  { id: "back-blanket", title: "Back view", tags: ["cozy", "studio"], alt: "Spot seen from behind under a grey blanket" },
  { id: "right-blanket", title: "Looking right", tags: ["cozy", "studio"], alt: "Spot looking right under a grey bone-print blanket", mask: [[530, 578, 62, 80]] },
  { id: "santa-jumper", title: "Fair Isle jumper", tags: ["festive", "studio"], alt: "Puppy Spot in a Santa hat and green Fair Isle jumper" },
  { id: "santa-gingham", title: "Gingham bandana", tags: ["festive", "studio"], alt: "Spot in a Santa hat with a red gingham bandana" },
  { id: "paw-sweater", title: "Paw-print sweater", tags: ["festive", "studio"], alt: "Puppy Spot in a paw-print sweater and Santa hat" },
  { id: "striped-sweater", title: "Striped sweater", tags: ["festive", "studio"], alt: "Spot in a red striped sweater and Santa hat" },
  { id: "reindeer", title: "Reindeer Spot", tags: ["festive", "studio"], alt: "Puppy Spot with reindeer antlers and a yellow scarf" },
  { id: "navy-sweater", title: "Navy reindeer knit", tags: ["festive", "cozy"], alt: "Spot in a navy reindeer sweater on a sheepskin rug" },
  { id: "pink-sweater", title: "Pink sweater", tags: ["festive", "studio"], alt: "Puppy Spot lying down in a pink sweater and Santa hat" },
  { id: "snowfield", title: "First snow", tags: ["festive"], alt: "Puppy Spot in a red bobble hat sitting in a snowy field" },
  { id: "jingle-bandana", title: "Jingle bell", tags: ["festive", "studio"], alt: "Spot in a jingle-bell Santa hat and green tartan bandana" },
  { id: "bobble-hat", title: "Bobble hat", tags: ["festive", "studio"], alt: "Spot in a red and white bobble hat with a fluffy collar" },
  { id: "teal-scarf", title: "Teal scarf", tags: ["festive", "studio"], alt: "Puppy Spot in a Santa hat and teal scarf" },
  { id: "santa-sweater", title: "Santa Spot", tags: ["festive", "cozy"], alt: "Spot in a Santa hat and grey knitted sweater on a tiled floor", mask: [[880, 1130, 160, 180]] },
  { id: "santa-cutout", title: "Santa Spot, cut out", tags: ["festive"], alt: "Spot sitting in a Santa hat and grey sweater", mask: [[760, 960, 130, 160]] },
  { id: "snowy-santa", title: "Snowflake nose", tags: ["festive", "art"], alt: "Spot in a Santa hat with snowflakes on his nose", mask: [[870, 1230, 130, 140]] },
  { id: "snow-nose", title: "Snowy nose", tags: ["festive"], alt: "Close-up of Spot's snowy nose under a Santa hat", mask: [[610, 940, 150, 84]] },
  { id: "greeting-card", title: "Merry Christmas", tags: ["festive", "cozy"], alt: "Spot in a red bow tie by the fire, with a Merry Christmas greeting" },
  { id: "snow-render", title: "Game-ready Spot", tags: ["art"], alt: "A glossy game-style render of Spot standing in the snow", mask: [[590, 870, 175, 140]] },
  { id: "emoji", title: "Spot emoji", tags: ["art"], alt: "A smiling 3D emoji of Spot with a red collar and snow on his fur" },
  { id: "labrador-life", title: "Labrador life", tags: ["art"], alt: "An illustrated badge of a black lab with a tennis ball in a wreath" },
  { id: "earbuds", title: "Grillz & earbuds", tags: ["art", "cozy"], alt: "Spot grinning with silver grills and white earbuds by a fire", mask: [[300, 890, 110, 110]] },
  { id: "friends", title: "Lamb & axolotl pals", tags: ["art"], alt: "Puppy Spot in a red collar lying in the grass with a green lamb and a pink axolotl" },
  { id: "hd-living-room", title: "Spot-light HD", tags: ["games"], alt: "Spot-light HD: Spot chasing the laser dot in the living room", game: "spot-light-hd" },
  { id: "hd-closeup", title: "Mid-leap", tags: ["games"], alt: "Spot-light HD: close-up of Spot leaping for the dot", game: "spot-light-hd" },
  { id: "hd-retro", title: "8-bit Spot", tags: ["games"], alt: "Spot-light HD in the 8-bit look", game: "spot-light-hd" },
  { id: "classic", title: "Spot-light classic", tags: ["games"], alt: "The original Spot-light: Spot on a teal rug chasing the dot", game: "spot-light" },
  { id: "saver-dream", title: "Garden dream", tags: ["games"], alt: "Spot screensaver: Spot dreaming of running through a garden", game: "spot-screensaver" },
  { id: "saver-cabin", title: "Cabin nap", tags: ["games", "cozy"], alt: "Spot screensaver vector style: Spot in a blanket by a log-cabin fire", game: "spot-screensaver" },
  { id: "saver-butterfly", title: "Butterfly chase", tags: ["games"], alt: "Spot screensaver vector dream: Spot running after a butterfly", game: "spot-screensaver" },
  { id: "cli-pet", title: "Terminal Spot", tags: ["games", "art"], alt: "spot-cli: pixel-art Spot with hearts in the terminal", game: "spot-cli" },
];

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 << 20 });
const tmp = join(tmpdir(), "spot-moodboard-prep");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
for (const d of ["assets/img", "assets/thumb"]) {
  rmSync(join(root, d), { recursive: true, force: true });
  mkdirSync(join(root, d), { recursive: true });
}

const out = [];
for (const it of items) {
  const src = SOURCES[it.id];
  if (!existsSync(src)) throw new Error(`missing source for ${it.id}`);
  const clean = join(tmp, `${it.id}.png`);
  // first frame only, no profiles or metadata, sRGB
  const args = [`${src}[0]`, "-auto-orient", "-strip", "-colorspace", "sRGB"];
  for (const [x, y, w, h] of it.mask || []) {
    // pixelate the region: blocks of ~1/6 of its size, so no engraving survives
    args.push("(", "+clone", "-crop", `${w}x${h}+${x}+${y}`, "+repage",
      "-scale", "7%", "-scale", `${w}x${h}!`, ")",
      "-geometry", `+${x}+${y}`, "-composite");
  }
  // cutouts: trim the empty transparent border, keep a small margin
  if (sh("magick", [src, "-format", "%[opaque]", "info:"]).trim().startsWith("False")) args.push("-trim", "+repage", "-bordercolor", "none", "-border", "3%");
  args.push("-resize", "1600x1600>", clean);
  sh("magick", args);
  const [w, h] = sh("magick", ["identify", "-format", "%w %h", clean]).trim().split(" ").map(Number);
  const alpha = sh("magick", ["identify", "-format", "%[opaque]", clean]).trim() === "False";
  const thumbPng = join(tmp, `${it.id}-t.png`);
  sh("magick", [clean, "-resize", "640x640>", thumbPng]);
  const webp = (from, to, q) =>
    sh("cwebp", ["-quiet", "-metadata", "none", "-q", String(q), "-alpha_q", "90", from, "-o", to]);
  webp(clean, join(root, "assets/img", `${it.id}.webp`), 80);
  webp(thumbPng, join(root, "assets/thumb", `${it.id}.webp`), 76);
  // five dominant colours, ignoring transparent pixels
  const hist = sh("magick", [clean, "-background", "#7f7f7f", "-alpha", "remove", "-resize", "96x96",
    "-colors", "6", "-format", "%c", "histogram:info:-"]);
  const palette = [...hist.matchAll(/^\s*(\d+):.*?(#[0-9A-F]{6})/gim)]
    .map((m) => [Number(m[1]), m[2].toLowerCase()])
    .sort((a, b) => b[0] - a[0])
    .map((m) => m[1])
    // drop the grey that stands in for transparent pixels in cutouts
    .filter((c) => !/^#(7[89a-f]|8[01]){3}$/.test(c))
    .slice(0, 5);
  const entry = { id: it.id, title: it.title, alt: it.alt, tags: it.tags, w, h, palette };
  if (alpha) entry.cutout = true;
  if (it.game) entry.game = it.game;
  out.push(entry);
  console.log(`${it.id.padEnd(16)} ${w}x${h}${alpha ? " alpha" : ""} ${palette.join(" ")}`);
}

writeFileSync(join(root, "assets/data.js"),
  "// Generated by scripts/prepare-images.mjs. Do not edit by hand.\n" +
  `window.SPOT_IMAGES = ${JSON.stringify(out, null, 1)};\n`);
rmSync(tmp, { recursive: true, force: true });
console.log(`${out.length} pictures written`);
