// Headless smoke test: the editor at --base with Magenta installed from scripts/serve.mjs, a map dropped in, the panel opened, the steps run, a screenshot taken. Playwright and the headless shell come from the environment (see the scm-js headless recipe).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const exe = process.env.HOME + "/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell";
const map = process.argv[2] ?? "/home/jeany/github/scm-js/fixtures/maps/(4)Spring Thaw.scx";
const shot = process.argv[3] ?? "magenta.png";
const steps = process.argv.slice(4); let shots = 0;
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning" || /magenta|plugin/i.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.addInitScript(() => {
  localStorage.setItem("scmjs.plugins", JSON.stringify([{ spec: "http://localhost:3131/", enabled: true }]));
  delete window.showSaveFilePicker; delete window.showOpenFilePicker;
});
await page.goto("http://localhost:5173/?nosplash");
await page.waitForTimeout(3000);
const b64 = readFileSync(map).toString("base64");
const dt = await page.evaluateHandle(({ b64, name }) => { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const dt = new DataTransfer(); dt.items.add(new File([arr], name)); return dt; }, { b64, name: map.split("/").pop() });
await page.dispatchEvent(".app", "drop", { dataTransfer: dt });
await page.waitForTimeout(3000);
await page.keyboard.press("Control+Shift+M");
await page.waitForTimeout(1200);
for (const step of steps) {
  const [verb, ...rest] = step.split(":");
  const arg = rest.join(":");
  if (verb === "click") await page.locator(arg).first().click();
  else if (verb === "type") await page.keyboard.type(arg);
  else if (verb === "press") await page.keyboard.press(arg);
  else if (verb === "wait") await page.waitForTimeout(Number(arg));
  else if (verb === "shot") { shots = (globalThis.shots ?? 0) + 1; globalThis.shots = shots; await page.locator(arg).first().screenshot({ path: `el-${shots}.png` }); }
  else if (verb === "hover") await page.locator(arg).first().hover();
  else if (verb === "fill") { const [sel, val] = arg.split("="); await page.locator(sel).first().fill(val); }
  await page.waitForTimeout(400);
}
await page.screenshot({ path: shot });
const panel = await page.locator(".mg").count();
const items = await page.locator(".mg-item").count();
const listText = await page.locator(".mg-list").innerText().catch(() => "");
const title = await page.title();
const text = await page.locator(".mg-editor").innerText().catch(() => "");
console.log(JSON.stringify({ panel, items, list: listText.slice(0, 600), editor: text.slice(0, 1500), logs: logs.slice(0, 20) }, null, 1));
await browser.close();
