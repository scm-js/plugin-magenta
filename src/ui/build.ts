/**
 * The Build step: the map as it stands, plus the sidecar's build records, sent to the
 * scmjs.dev server's euddraft box, and the built map saved beside the source. Nothing
 * about the map is kept on the server; the built file is what players get, the source
 * map stays the editor's. The server address is the plugin's own setting.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { composePlugins } from "../model/builds";
import type { Store } from "./store";

export const DEFAULT_SERVER = "https://api.scmjs.dev";
const SERVER_KEY = "server";

export const serverUrl = (api: PluginApi): string => api.storage.get(SERVER_KEY, DEFAULT_SERVER).replace(/\/+$/, "");
export const setServerUrl = (api: PluginApi, url: string): void => { api.storage.set(SERVER_KEY, url.trim().replace(/\/+$/, "") || DEFAULT_SERVER); };

interface BuildError { error?: { code?: string; message?: string; log?: string } }

const toBase64 = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function openBuildDialog(api: PluginApi, store: Store, everyFrame: boolean): void {
  const t = api.i18n.t;
  const el = api.ui.el;
  const w = api.ui.widgets;
  const builds = store.sidecar.builds;
  const chats = builds.filter((b) => b.kind === "chat").length;
  const hooks = builds.length - chats;
  const plugins = composePlugins(builds, store.sidecar.chat, everyFrame);
  const info = api.document.info();
  const stem = (info?.fileName ?? "map").replace(/\.(scx|scm|chk)$/i, "");

  const server = w.text({ value: serverUrl(api), placeholder: DEFAULT_SERVER });
  const status = w.statusLine();
  const log = el("textarea", { className: "textarea", rows: 10, readOnly: true, spellcheck: false, style: "font-family: var(--font-mono); font-size: var(--fs-xs); display: none" }) as HTMLTextAreaElement;
  const summary = el("ul", {},
    el("li", {}, chats ? t("{n, plural, one {# chat command} other {# chat commands}}", { n: chats }) : t("No chat commands")),
    el("li", {}, hooks ? t("{n, plural, one {# build row} other {# build rows}} (text, maths, unit passes)", { n: hooks }) : t("No build rows")),
    el("li", {}, everyFrame ? t("Triggers run every frame (turbo)") : t("Triggers run every two seconds")),
  );
  const nothing = !Object.keys(plugins).length;

  api.ui.dialog({
    title: t("Build EUD map"),
    size: "md",
    mount(body) {
      body.append(
        w.hint(t("The map goes to the build server as it stands, euddraft adds the code for the rows below, and the built map comes back as a file to save. The server keeps nothing. Only StarCraft: Remastered plays the result, and this editor cannot open it yet: keep this map as the source.")),
        summary,
        w.form([{ label: t("Build server"), field: server }]),
        status, log,
      );
      if (nothing) status.set(t("Nothing in this map needs a build; a plain save is all it takes."), "warn");
    },
    buttons: [
      { label: t("Build…"), primary: true, closes: false, run: async () => {
        setServerUrl(api, server.value);
        const file = await api.document.export();
        if (!file) { status.set(t("No map is open."), "error"); return; }
        status.busy(t("Building…"));
        log.style.display = "none";
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const res = await fetch(`${serverUrl(api)}/v1/eud/build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ map: toBase64(bytes), plugins }) });
          const answer = (await res.json().catch(() => null)) as ({ map?: string; bytes?: number; log?: string } & BuildError) | null;
          if (!res.ok || !answer?.map) {
            const e = answer?.error;
            status.set(e?.message ?? t("The server answered {status}.", { status: res.status }), "error");
            if (e?.log) { log.value = e.log; log.style.display = ""; }
            return;
          }
          const out = fromBase64(answer.map);
          const saved = await api.ui.saveFile(out, `${stem}-eud.scx`);
          status.set(saved ? t("Built: {name}, {kb} KB.", { name: saved.fileName, kb: Math.round(out.length / 1024) }) : t("Built, but not saved."), saved ? "ok" : "warn");
          if (answer.log) { log.value = answer.log; log.style.display = ""; }
        } catch (err) {
          status.set(t("Could not reach the build server: {why}", { why: String((err as Error).message ?? err) }), "error");
        }
      } },
      { label: t("Close") },
    ],
  });
}
