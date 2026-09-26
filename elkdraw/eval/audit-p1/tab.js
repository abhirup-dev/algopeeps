// Holds one headless Chromium tab open on a yctimlin canvas URL until killed:
// its screenshot, export-image and mermaid commands need a live frontend.
// Run: bun elkdraw/eval/audit-p1/tab.js <url>
import { chromium } from "playwright";

const url = process.argv[2];
if (url === undefined) throw new Error("usage: tab.js <url>");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url);
console.log(`tab open on ${url}`);
const stop = () => {
  void browser.close().then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
