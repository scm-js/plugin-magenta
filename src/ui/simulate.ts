/**
 * The dry run: a second panel that runs the list the way the game does, one cycle at
 * a time, from the map's placed units, locations, forces and slots. It shows the
 * selected trigger's conditions with a verdict each and the value the run saw, the
 * conditions it could not decide with a box to pretend they hold, the state — which
 * can be poked by hand — and a log of what fired, what was shown and who won.
 */
import type { PluginApi, TriggerRecord } from "@scm-js/plugin-api";
import { cellOf, usage } from "../model/counters";
import { fingerprint, liveConditions } from "../model/records";
import { cycle as runCycle, flat, isOver, newState, putUnits, run, runsFor, secondsPerCycle, verdicts, type SimEvent, type SimRect, type SimState, type SimWorld } from "../model/simulate";
import { cellLabel, pickCell } from "./expansionRows";
import { pickLocation, pickNumber, pickSwitch, pickUnitType } from "./chips";
import type { Host } from "./host";
import type { Store } from "./store";
import { STYLE } from "./styles";
import { conditionWords, titleOf } from "./words";
import { isFrameTrigger } from "./frame";
import { memoryCellText } from "./describe";

const PANEL_WIDTH = 520;
const PANEL_HEIGHT = 560;
const LOG_LINES = 120;

export interface SimulatorController {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/** OWNR values that run triggers: a computer or a human, as the editor and the game write them. */
const RUNS_TRIGGERS = new Set([1, 2, 5, 6]);

/** The map as the run needs it, read once at Reset. */
function worldFromMap(api: PluginApi, host: Host, store: Store, everyFrame: boolean): { world: SimWorld; units: { owner: number; unitId: number; x: number; y: number }[] } {
  const scn = api.document.scenario();
  const locations: (SimRect | null)[] = [];
  const w = (scn?.width ?? 64) * 32, h = (scn?.height ?? 64) * 32;
  scn?.locations.forEach((l, i) => {
    if (i === 63 || (l.left === l.right && l.top === l.bottom)) return;
    locations[i + 1] = { left: Math.min(l.left, l.right), top: Math.min(l.top, l.bottom), right: Math.max(l.left, l.right), bottom: Math.max(l.top, l.bottom) };
  });
  locations[64] = { left: 0, top: 0, right: w, bottom: h };
  const players = api.settings.players();
  const active = Array.from({ length: 12 }, (_, p) => p < 8 && RUNS_TRIGGERS.has(players[p]?.type ?? 0));
  const force = Array.from({ length: 12 }, (_, p) => players[p]?.force ?? -1);
  const allied = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => false));
  for (const f of api.settings.forces()) if (f.allied) for (const a of f.players) for (const b of f.players) if (a !== b) allied[a][b] = true;
  const dat = api.data.units();
  const isBuilding = dat ? (id: number) => id < dat.flags.length && (dat.flags[id] & 1) !== 0 : (id: number) => id >= 106 && id <= 201;
  const sc = store.sidecar;
  const unknownCells = new Set<number>();
  const hookCells = new Set<number>();
  const everySlot = (unit: number) => { for (let p = 0; p < 12; p++) unknownCells.add(flat(p, unit)); };
  for (const b of sc.builds) {
    if (b.kind === "scan") unknownCells.add(flat(b.cell[0], b.cell[1]));
    else if ("flag" in b) hookCells.add(flat(b.flag[0], b.flag[1]));
  }
  if (sc.chat) { unknownCells.add(flat(sc.chat.cell[0], sc.chat.cell[1])); if (sc.chat.args) for (const c of [sc.chat.args.pattern, sc.chat.args.number, sc.chat.args.ptr, sc.chat.args.len]) unknownCells.add(flat(c[0], c[1])); }
  if (sc.msqc) {
    for (const u of Object.values(sc.msqc.keys)) everySlot(u);
    for (const u of Object.values(sc.msqc.clicks)) everySlot(u);
    for (const u of Object.values(sc.msqc.mouseIn)) everySlot(u);
    if (sc.msqc.select) { everySlot(sc.msqc.select.ptr); everySlot(sc.msqc.select.type); }
  }
  const world: SimWorld = { locations, active, force, allied, isBuilding, string: (i) => host.string(i), unknownCells, hookCells, everyFrame };
  const units = (scn?.units ?? []).filter((u) => u.owner < 12 && u.unitId !== 214).map((u) => ({ owner: u.owner, unitId: u.unitId, x: u.x, y: u.y }));
  return { world, units };
}

export function createSimulator(api: PluginApi, host: Host, store: Store, everyFrame: () => boolean): SimulatorController {
  let handle: { close(): void; isOpen(): boolean } | null = null;

  const open = () => {
    if (handle?.isOpen()) return;
    handle = api.ui.panel({
      title: api.i18n.t("Magenta: dry run"),
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      resizable: true,
      mount: (body) => mount(body),
      onClose: () => { handle = null; },
    });
  };

  function mount(body: HTMLElement): () => void {
    const el = api.ui.el;
    const t = api.i18n.t;
    const w = api.ui.widgets;
    let world: SimWorld;
    let state: SimState;
    let snapshot: string[] = [];
    let owner = 0;
    let stale = false;

    const reset = () => {
      const made = worldFromMap(api, host, store, everyFrame());
      world = made.world;
      state = newState(world);
      for (const u of made.units) state.units.push({ id: state.nextUnit++, owner: u.owner, unitId: u.unitId, x: u.x, y: u.y });
      snapshot = store.list.map(fingerprint);
      stale = false;
    };
    reset();

    const root = el("div", { className: "mg mg-sim" }, el("style", {}, STYLE));
    body.append(root);

    const namer = () => host.namer(store.sidecar);
    const groups = () => host.playerGroups();
    const playerLabel = (p: number) => groups().find((g) => g.value === p)?.label ?? `P${p + 1}`;
    const seconds = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

    const hidden = (i: number) => store.isRun(i) || (!!store.list[i] && isFrameTrigger(store.list[i]));
    const step = (n: number) => {
      if (stale) return;
      if (n === 1) runCycle(store.list, state, world);
      else run(store.list, state, world, n, 50, (i) => !hidden(i));
      render();
    };

    const render = () => {
      root.replaceChildren(el("style", {}, STYLE));
      const list = store.list;
      stale = list.length !== snapshot.length || list.some((tr, i) => fingerprint(tr) !== snapshot[i]);

      /* ── Toolbar ── */
      const over = isOver(state, world);
      const bar = el("div", { className: "mg-head" },
        w.button(t("Step"), { primary: true, title: t("Run one trigger cycle"), disabled: stale || over, onClick: () => step(1) }),
        w.button(t("Run 10"), { disabled: stale || over, onClick: () => step(10) }),
        w.button(t("Run on"), { title: t("Up to 500 cycles: until someone wins or loses, or nothing has happened for 50 cycles"), disabled: stale || over, onClick: () => step(500) }),
        w.button(t("Reset"), { ghost: true, title: t("Start over from the map as it is now"), onClick: () => { reset(); render(); } }),
        el("span", { className: "grow" }),
        el("span", { className: "mg-sim-clock", title: t("Triggers run {clock}", { clock: world.everyFrame ? t("every frame") : t("every two seconds") }) }, t("cycle {n} · {s} s", { n: state.cycle, s: seconds(Math.round(state.seconds * 10) / 10) })),
      );
      root.append(bar);
      if (stale) root.append(el("div", { className: "mg-problem warn" }, t("The triggers changed since this run started. Reset to run the list as it is now.")));
      else if (over) root.append(el("div", { className: "mg-note" }, t("The game is over for every player.")));

      const scroll = el("div", { className: "mg-sim-body" });
      root.append(scroll);

      /* ── The selected trigger ── */
      const index = store.selected;
      const trigger = index !== null ? list[index] : null;
      const watched = el("div", { className: "mg-section" }, el("div", { className: "mg-section-head" }, t("Selected trigger")));
      if (trigger && index !== null) {
        const owners = Array.from({ length: 8 }, (_, p) => p).filter((p) => world.active[p] && runsFor(trigger, p, world));
        if (!owners.includes(owner)) owner = owners[0] ?? 0;
        const head = el("div", { className: "mg-sim-title" }, el("b", {}, titleOf(api, host, store, index)));
        if (owners.length > 1) {
          const sel = w.select(owners.map((p) => ({ value: p, label: playerLabel(p) })), { value: owner, onChange: (v) => { owner = Number(v); render(); } });
          head.append(el("span", { className: "hint" }, t("as")), sel);
        } else if (owners.length === 1) head.append(el("span", { className: "hint" }, t("as {player}", { player: playerLabel(owners[0]) })));
        watched.append(head);
        if (!owners.length) watched.append(el("div", { className: "mg-note" }, t("No active player runs this trigger, so it cannot fire.")));
        else {
          const fired = state.log.filter((e) => e.kind === "fired" && e.trigger === index && e.player === owner).length;
          const p = state.players[owner];
          const status = p.wait && p.wait.trigger === index ? t("waiting inside its actions") : state.spent.has(index * 16 + owner) ? t("fired and done") : fired ? t("fired {n} times so far", { n: fired }) : t("has not fired yet");
          watched.append(el("div", { className: "mg-note" }, status));
          const words = conditionWords(api, host, store, index, trigger);
          const rows = verdicts(list, index, owner, state, world);
          if (!rows.length) watched.append(el("div", { className: "mg-note" }, t("No conditions: it fires on the first cycle.")));
          for (const { condition, verdict } of rows) {
            if (!words[condition]) continue;
            const c = liveConditions(trigger)[condition];
            const disabled = (c.flags & 2) !== 0;
            const mark = disabled ? "–" : !verdict.known ? "?" : verdict.ok ? "✓" : "✗";
            const kind = disabled ? "" : !verdict.known ? "unknown" : verdict.ok ? "ok" : "no";
            const row = el("div", { className: `mg-sim-verdict ${kind}` }, el("span", { className: "mg-sim-mark" }, mark), el("span", { className: "grow" }, words[condition]));
            if (verdict.have !== undefined && !disabled) row.append(el("span", { className: "hint" }, t("has {n}", { n: verdict.have })));
            if (!verdict.known && verdict.key) row.append(assumeBox(verdict.key));
            watched.append(row);
          }
        }
      } else watched.append(el("div", { className: "mg-note" }, t("Pick a trigger in the Magenta panel to see its conditions decided here.")));
      scroll.append(watched);

      /* ── Cannot tell ── */
      const unknown = [...state.unknown.values()].filter((u) => !hidden(u.trigger));
      if (unknown.length) {
        const sec = el("div", { className: "mg-section" }, el("div", { className: "mg-section-head" }, t("Cannot tell"), el("span", { className: "grow" }), el("span", { className: "hint" }, t("tick to pretend it holds"))));
        for (const u of unknown) {
          const tr = list[u.trigger];
          if (!tr) continue;
          const text = conditionWords(api, host, store, u.trigger, tr)[u.condition] || t("condition {n}", { n: u.condition + 1 });
          const row = el("div", { className: "mg-sim-verdict unknown" }, assumeBox(u.key), el("span", { className: "grow" }, text), el("button", { type: "button", className: "mg-sim-link", onclick: () => store.select(u.trigger) }, titleOf(api, host, store, u.trigger)));
          sec.append(row);
        }
        scroll.append(sec);
      }

      /* ── State ── */
      const st = el("div", { className: "mg-section" }, el("div", { className: "mg-section-head" }, t("State"), el("span", { className: "grow" }), el("span", { className: "hint" }, t("click a value to change it"))));
      // Switches
      const sw = el("div", { className: "mg-sim-line" }, el("span", { className: "mg-sim-label" }, t("Switches set")));
      const names = namer();
      for (const i of [...state.switches].sort((a, b) => a - b)) sw.append(el("button", { type: "button", className: "mg-chip", title: t("Click to clear"), onclick: () => { state.switches.delete(i); render(); } }, names.switch(i)));
      const addSwitch = el("button", { type: "button", className: "mg-chip", title: t("Set a switch") }, "+") as HTMLButtonElement;
      addSwitch.addEventListener("click", () => pickSwitch(api, host, addSwitch, 0, (i) => { state.switches.add(i); render(); }, (i, name) => host.renameSwitch(i, name)));
      sw.append(addSwitch);
      st.append(sw);
      // Counters
      const used = usage(list).cells;
      const cells = [...state.deaths.entries()].filter(([k, v]) => v !== 0 || used.has(k)).sort((a, b) => a[0] - b[0]);
      const ct = el("div", { className: "mg-sim-line" }, el("span", { className: "mg-sim-label" }, t("Counters")));
      for (const [k, v] of cells) {
        const label = k < 228 * 12 ? `${cellLabel(cellOf(k), names)} = ${v}` : memoryCellText(k, v, names, host.extra());
        const chip = el("button", { type: "button", className: "mg-chip counter", title: t("Click to change") }, label) as HTMLButtonElement;
        chip.addEventListener("click", () => pickNumber(api, chip, v, (n) => { state.deaths.set(k, n >>> 0); render(); }, { min: 0, integer: true }));
        ct.append(chip);
      }
      const addCell = el("button", { type: "button", className: "mg-chip", title: t("Set a counter") }, "+") as HTMLButtonElement;
      addCell.addEventListener("click", () => pickCell(api, host, store, addCell, [0, 0], (cell) => pickNumber(api, addCell, state.deaths.get(flat(cell[0], cell[1])) ?? 0, (n) => { state.deaths.set(flat(cell[0], cell[1]), n >>> 0); render(); }, { min: 0, integer: true })));
      ct.append(addCell);
      st.append(ct);
      // Timer and clock
      const timer = el("button", { type: "button", className: "mg-chip", title: t("Click to change") }, `${seconds(Math.floor(state.countdown))} s${state.countdownPaused ? ` (${t("paused")})` : ""}`) as HTMLButtonElement;
      timer.addEventListener("click", () => pickNumber(api, timer, Math.floor(state.countdown), (n) => { state.countdown = n; render(); }, { min: 0, integer: true, unit: "s" }));
      st.append(el("div", { className: "mg-sim-line" }, el("span", { className: "mg-sim-label" }, t("Countdown timer")), timer, el("span", { className: "hint" }, world.everyFrame ? t("24 cycles a second") : t("a cycle is {s} s", { s: seconds(secondsPerCycle(world)) }))));
      // Players
      for (let p = 0; p < 8; p++) {
        if (!world.active[p]) continue;
        const pl = state.players[p];
        const line = el("div", { className: "mg-sim-line" }, el("span", { className: "mg-sim-label" }, playerLabel(p)));
        const res = (label: string, get: () => number, set: (n: number) => void) => {
          const chip = el("button", { type: "button", className: "mg-chip", title: t("Click to change") }, `${label} ${get()}`) as HTMLButtonElement;
          chip.addEventListener("click", () => pickNumber(api, chip, get(), (n) => { set(n); render(); }, { min: 0, integer: true }));
          return chip;
        };
        line.append(res(t("minerals"), () => pl.minerals, (n) => { pl.minerals = n; }), res(t("gas"), () => pl.gas, (n) => { pl.gas = n; }));
        const count = state.units.filter((u) => u.owner === p).length;
        line.append(el("span", { className: "hint" }, t("{n} units", { n: count })));
        if (pl.result) line.append(el("span", { className: `mg-badge ${pl.result === "victory" ? "eud" : "error"}` }, pl.result === "victory" ? t("won") : pl.result === "defeat" ? t("lost") : t("draw")));
        else if (pl.wait) line.append(el("span", { className: "mg-badge" }, t("waiting until {s} s", { s: seconds(Math.round(pl.wait.until * 10) / 10) })));
        st.append(line);
      }
      // Put units
      const put = { owner: 0, unit: 0, location: host.locations()[0]?.value ?? 64, count: 1 };
      const putLine = el("div", { className: "mg-sim-line" }, el("span", { className: "mg-sim-label" }, t("Put units")));
      const ownerChip = el("button", { type: "button", className: "mg-chip" }, playerLabel(put.owner)) as HTMLButtonElement;
      ownerChip.addEventListener("click", () => {
        const items = Array.from({ length: 12 }, (_, p) => ({ value: p, label: playerLabel(p) }));
        const sel = w.select(items, { value: put.owner, onChange: (v) => { put.owner = Number(v); ownerChip.textContent = playerLabel(put.owner); } });
        ownerChip.replaceWith(sel);
      });
      const countChip = el("button", { type: "button", className: "mg-chip" }, String(put.count)) as HTMLButtonElement;
      countChip.addEventListener("click", () => pickNumber(api, countChip, put.count, (n) => { put.count = Math.max(1, n); countChip.textContent = String(put.count); }, { min: 1, integer: true }));
      const unitChip = el("button", { type: "button", className: "mg-chip" }, names.unit(put.unit)) as HTMLButtonElement;
      unitChip.addEventListener("click", () => pickUnitType(api, host, unitChip, put.unit, (v) => { put.unit = v; unitChip.textContent = names.unit(v); }));
      const locChip = el("button", { type: "button", className: "mg-chip" }, names.location(put.location)) as HTMLButtonElement;
      locChip.addEventListener("click", () => pickLocation(api, host, locChip, put.location, (v) => { put.location = v; locChip.textContent = names.location(v); }));
      putLine.append(countChip, unitChip, el("span", { className: "hint" }, t("for")), ownerChip, el("span", { className: "hint" }, t("at")), locChip, w.button(t("Add"), { onClick: () => { putUnits(state, world, put.owner, put.unit, put.count, put.location); render(); } }));
      st.append(putLine);
      scroll.append(st);

      /* ── Log ── */
      const events = state.log.filter((e) => !hidden(e.trigger));
      const log = el("div", { className: "mg-section" }, el("div", { className: "mg-section-head" }, t("Log"), el("span", { className: "grow" }), el("span", { className: "hint" }, events.length > LOG_LINES ? t("last {n} of {total}", { n: LOG_LINES, total: events.length }) : String(events.length))));
      if (!events.length) log.append(el("div", { className: "mg-note" }, t("Nothing has happened yet. Step runs one cycle.")));
      for (const e of events.slice(-LOG_LINES)) log.append(logLine(e, list));
      scroll.append(log);
      // Keep the newest line in view.
      setTimeout(() => { scroll.scrollTop = scroll.scrollHeight; }, 0);
    };

    function assumeBox(key: string) {
      return w.checkbox("", { value: state.assumptions.get(key) ?? false, onChange: (v) => { state.assumptions.set(key, v); render(); } });
    }

    function logLine(e: SimEvent, list: readonly TriggerRecord[]): HTMLElement {
      const who = playerLabel(e.player);
      const link = list[e.trigger] ? el("button", { type: "button", className: "mg-sim-link", onclick: () => store.select(e.trigger) }, titleOf(api, host, store, e.trigger)) : el("span", {}, t("trigger {n}", { n: e.trigger + 1 }));
      const line = el("div", { className: `mg-sim-log ${e.kind}` }, el("span", { className: "mg-sim-cycle" }, String(e.cycle)), el("span", { className: "mg-sim-who" }, who));
      switch (e.kind) {
        case "fired": line.append(t("fires"), " ", link); break;
        case "text": line.append(el("span", { className: "mg-sim-text" }, `“${e.text}”`)); break;
        case "objectives": line.append(t("objectives:"), " ", el("span", { className: "mg-sim-text" }, e.text)); break;
        case "end": line.append(el("b", {}, e.result === "victory" ? t("wins") : e.result === "defeat" ? t("loses") : t("draws")), " · ", link); break;
        case "wait": line.append(t("waits {s} s", { s: seconds(e.seconds) }), " · ", link); break;
        case "note": line.append(el("span", { className: "hint" }, e.text), " · ", link); break;
      }
      return line;
    }

    const unsubscribe = store.subscribe(render);
    render();
    return () => { unsubscribe(); };
  }

  return { open, close: () => handle?.close(), isOpen: () => handle?.isOpen() ?? false };
}
