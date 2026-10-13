import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const WIDTH = 1200;
const HEIGHT = 630;
const OUT_PATH = "bilko/og.png";
const FEATURES = ["Photos", "Calendar", "Messages", "Weather"];

export function renderOgHtml(iconDataUri: string, fontDataUri?: string): string {
  const fontFace = fontDataUri
    ? `@font-face{font-family:"OgSerif";font-weight:700;src:url(${fontDataUri}) format("woff2");}`
    : "";
  const chips = FEATURES.map(
    (name, i) => `<span class="chip ${i % 2 === 0 ? "honey" : "sage"}">${name}</span>`,
  ).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${fontFace}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;}
.root{position:relative;width:${WIDTH}px;height:${HEIGHT}px;background:#FDF8F2;font-family:"OgSerif",Georgia,"Times New Roman",serif;color:#3a2a24;}
.bar{position:absolute;left:0;top:0;bottom:0;width:36px;background:#C05746;}
.content{position:absolute;left:120px;top:0;right:80px;bottom:0;display:flex;flex-direction:column;justify-content:center;}
.icon{width:160px;height:160px;border-radius:36px;display:block;margin-bottom:36px;}
h1{margin:0;font-size:104px;line-height:1.05;font-weight:700;color:#C05746;}
.tag{margin:16px 0 0;font-size:44px;line-height:1.2;color:#3a2a24;}
.chips{display:flex;gap:20px;margin-top:48px;}
.chip{font-size:30px;font-weight:700;padding:12px 30px;border-radius:999px;}
.honey{background:#F4D06F;color:#3a2a24;}
.sage{background:#82937A;color:#1f2a1c;}
</style>
</head>
<body>
<div class="root">
<div class="bar"></div>
<div class="content">
<img class="icon" src="${iconDataUri}" alt="">
<h1>Family Frame</h1>
<p class="tag">The window between homes</p>
<div class="chips">${chips}</div>
</div>
</div>
</body>
</html>
`;
}

async function main() {
  const icon = readFileSync(path.resolve("client/public/favicon.png")).toString("base64");
  const font = readFileSync(
    path.resolve("node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2"),
  ).toString("base64");
  const html = renderOgHtml(`data:image/png;base64,${icon}`, `data:font/woff2;base64,${font}`);

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT_PATH, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  } finally {
    await browser.close();
  }
  console.log(`bilko-og: ${OUT_PATH} ${statSync(OUT_PATH).size} bytes`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`bilko-og: ${(e as Error).message}`);
    process.exit(1);
  });
}
