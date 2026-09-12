/**
 * The pickers behind the chips: a filtered list of choices, a number, a text with the
 * colour codes, a location or unit with "Pick on map". Each is a popover on the chip and
 * answers through `onPick`; the row's editor writes the record.
 */
import type { PluginApi } from "@scm-js/plugin-api";
import { PLAYER_GROUP_COUNT } from "../../vendor/triggers";
import { addressOf, epd } from "../model/eud";
import { KEYS } from "../model/eudSentence";
import type { Host, NamedItem } from "./host";
import { openPopover, type PopoverHandle } from "./popover";

export interface ChoiceOption {
  value: number;
  label: string;
  hint?: string;
  color?: string | null;
  disabled?: boolean;
  /** A heading row rather than a choice. */
  group?: boolean;
}

export interface ChoiceOptions {
  current?: number;
  /** Rows under the list: Pick on map, New counter…, Rename…. */
  actions?: { label: string; run: (handle: PopoverHandle) => void; ghost?: boolean }[];
  /** Show the filter field even for a short list. */
  searchable?: boolean;
  placeholder?: string;
  /** Called as the pointer moves over a choice (a location chip flashes it). */
  onHover?: (value: number) => void;
  width?: number;
}

const norm = (s: string) => s.toLowerCase();

/** A list of choices with a filter field, arrow keys and Enter. */
export function pickChoice(api: PluginApi, anchor: HTMLElement, items: ChoiceOption[], onPick: (value: number) => void, options: ChoiceOptions = {}): PopoverHandle {
  const el = api.ui.el;
  return openPopover(anchor, (handle) => {
    const list = el("div", { className: "mg-options" });
    const filter = el("input", { className: "input", placeholder: options.placeholder ?? api.i18n.t("Filter…"), type: "text" });
    const showFilter = options.searchable || items.filter((i) => !i.group).length > 8;
    let active = -1;
    let shown: ChoiceOption[] = [];
    const render = () => {
      const q = norm(filter.value.trim());
      shown = items.filter((i) => (i.group ? !q : !q || norm(i.label).includes(q) || (i.hint ? norm(i.hint).includes(q) : false)));
      list.replaceChildren();
      active = -1;
      shown.forEach((item, idx) => {
        const row = el("button", { type: "button", className: `mg-option${item.group ? " group" : ""}${item.value === options.current ? " current" : ""}${item.disabled ? " disabled" : ""}`, title: item.disabled ? item.hint ?? "" : "" },
          item.color !== undefined && item.color !== null ? el("span", { className: "mg-dot", style: `background:${item.color}` }) : null,
          el("span", { className: "grow" }, item.label),
          item.hint ? el("span", { className: "hint" }, item.hint) : null,
        ) as HTMLButtonElement;
        if (!item.group && !item.disabled) {
          row.addEventListener("click", () => { onPick(item.value); handle.close(); });
          row.addEventListener("pointerenter", () => { options.onHover?.(item.value); setActive(idx); });
        }
        list.append(row);
        if (item.value === options.current && !item.group) { active = idx; row.classList.add("active"); }
      });
      const activeEl = list.children[active] as HTMLElement | undefined;
      activeEl?.scrollIntoView({ block: "nearest" });
    };
    const setActive = (idx: number) => {
      const prev = list.children[active] as HTMLElement | undefined;
      prev?.classList.remove("active");
      active = idx;
      const next = list.children[active] as HTMLElement | undefined;
      next?.classList.add("active");
      next?.scrollIntoView({ block: "nearest" });
    };
    const move = (delta: number) => {
      let idx = active;
      for (let n = 0; n < shown.length; n++) {
        idx = (idx + delta + shown.length) % shown.length;
        if (!shown[idx].group && !shown[idx].disabled) break;
      }
      setActive(idx);
      if (shown[idx]) options.onHover?.(shown[idx].value);
    };
    filter.addEventListener("input", render);
    const keys = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const item = shown[active] ?? shown.find((i) => !i.group && !i.disabled);
        if (item) { onPick(item.value); handle.close(); }
      }
    };
    filter.addEventListener("keydown", keys);
    list.addEventListener("keydown", keys);
    render();
    const foot = options.actions?.length ? el("div", { className: "mg-pop-foot" }, ...options.actions.map((a) => api.ui.widgets.button(a.label, { ghost: a.ghost !== false, onClick: () => a.run(handle) }))) : null;
    return [showFilter ? filter : el("div", { tabIndex: 0, style: "outline:none", onkeydown: keys }), list, foot].filter(Boolean) as HTMLElement[];
  }, { width: options.width });
}

/** A number, with its unit and the modifier's meaning shown; Enter commits. */
export function pickNumber(api: PluginApi, anchor: HTMLElement, current: number, onPick: (value: number) => void, options: { min?: number; max?: number; step?: number; unit?: string; hint?: string; integer?: boolean } = {}): PopoverHandle {
  const el = api.ui.el;
  return openPopover(anchor, (handle) => {
    const input = el("input", { className: "input mono", type: "number", value: String(current), min: options.min ?? 0, max: options.max ?? 4294967295, step: options.step ?? 1 }) as HTMLInputElement;
    const commit = () => {
      const n = Number(input.value);
      if (!Number.isFinite(n)) return;
      const v = options.integer === false ? n : Math.round(n);
      onPick(Math.min(options.max ?? 4294967295, Math.max(options.min ?? 0, v)));
      handle.close();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } });
    return [
      el("div", { className: "row" }, input, options.unit ? el("span", { className: "hint" }, options.unit) : null),
      options.hint ? el("div", { className: "hint" }, options.hint) : null,
      el("div", { className: "mg-pop-foot" }, el("span", { className: "grow" }), api.ui.widgets.button(api.i18n.t("OK"), { primary: true, onClick: commit })),
    ].filter(Boolean) as HTMLElement[];
  }, { width: 220 });
}

/** Text with the colour and effect codes as buttons; Ctrl+Enter or OK commits. */
export function pickText(api: PluginApi, anchor: HTMLElement, current: string, onPick: (text: string) => void, options: { title?: string } = {}): PopoverHandle {
  const el = api.ui.el;
  return openPopover(anchor, (handle) => {
    const area = el("textarea", { className: "textarea", rows: 5, spellcheck: false }) as HTMLTextAreaElement;
    area.value = current;
    const commit = () => { onPick(area.value); handle.close(); };
    area.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); } });
    const codes = el("div", { className: "mg-codes" }, ...api.text.insertable().map((c) => {
      const b = el("button", { type: "button", className: "mg-code", title: `${c.label} ${c.code}`, style: c.rgb ? `background:${c.rgb}` : "" }, c.rgb ? "" : c.label.slice(0, 1)) as HTMLButtonElement;
      b.addEventListener("click", () => {
        const at = area.selectionStart ?? area.value.length;
        area.setRangeText(api.text.escape(c.byte), at, area.selectionEnd ?? at, "end");
        area.focus();
      });
      return b;
    }));
    return [
      options.title ? el("div", { className: "hint" }, options.title) : null,
      area,
      codes,
      el("div", { className: "mg-pop-foot" }, el("span", { className: "hint grow" }, api.i18n.t("Ctrl+Enter to apply")), api.ui.widgets.button(api.i18n.t("OK"), { primary: true, onClick: commit })),
    ].filter(Boolean) as HTMLElement[];
  }, { width: 340 });
}

/* ── The kinds ── */

export function pickPlayer(api: PluginApi, host: Host, anchor: HTMLElement, current: number, onPick: (value: number) => void, options: { eud?: boolean } = {}): PopoverHandle {
  const players = host.players();
  const groups = host.playerGroups();
  const items: ChoiceOption[] = groups.map((g) => ({ value: g.value, label: g.label, color: g.value < 12 ? players[g.value]?.color ?? null : undefined, hint: g.value < 12 ? players[g.value]?.type : undefined }));
  const actions = options.eud === false ? [] : [{
    label: current >= PLAYER_GROUP_COUNT ? api.i18n.t("Address 0x{hex}…", { hex: addressOf(current).toString(16).toUpperCase() }) : api.i18n.t("Memory address…"),
    run: (h: PopoverHandle) => {
      h.close();
      void api.ui.prompt(api.i18n.t("Hex address the player value should reach through the deaths table (Deaths and Set Deaths only)"), { title: api.i18n.t("EUD player"), value: current >= PLAYER_GROUP_COUNT ? addressOf(current).toString(16).toUpperCase() : "" }).then((text) => {
        if (text === null || text === undefined) return;
        const n = parseInt(String(text).replace(/^0x/i, ""), 16);
        if (Number.isFinite(n)) onPick(epd(n));
      });
    },
  }];
  return pickChoice(api, anchor, items, onPick, { current, actions, width: 240 });
}

export function pickUnitType(api: PluginApi, host: Host, anchor: HTMLElement, current: number, onPick: (value: number) => void, options: { classes?: boolean } = {}): PopoverHandle {
  const units = host.units();
  const items: ChoiceOption[] = [];
  if (options.classes !== false) {
    items.push({ value: -1, label: api.i18n.t("Classes"), group: true });
    for (const u of units) if (u.value >= 228) items.push(u);
  }
  items.push({ value: -2, label: api.i18n.t("Units"), group: true });
  for (const u of units) if (u.value < 228) items.push(u);
  return pickChoice(api, anchor, items, onPick, {
    current, searchable: true, width: 280, placeholder: api.i18n.t("Unit name…"),
    actions: [{ label: api.i18n.t("Pick on map"), run: (h) => { h.close(); void host.pickUnit(api.i18n.t("Click a unit to take its type")).then((u) => { if (u) onPick(u.unitId); }); } }],
  });
}

export function pickLocation(api: PluginApi, host: Host, anchor: HTMLElement, current: number, onPick: (value: number) => void): PopoverHandle {
  const items: ChoiceOption[] = [{ value: 0, label: api.i18n.t("No location") }, ...host.locations()];
  return pickChoice(api, anchor, items, onPick, {
    current, searchable: true, width: 260,
    onHover: (n) => host.flashLocation(n),
    actions: [
      { label: api.i18n.t("Pick on map"), run: (h) => { h.close(); void host.pickLocation(api.i18n.t("Click a location")).then((n) => { if (n !== null) onPick(n); }); } },
      ...(current > 0 && current < 64 ? [{ label: api.i18n.t("Show"), run: (h: PopoverHandle) => { h.close(); host.revealLocation(current); host.flashLocation(current); } }] : []),
    ],
  });
}

export function pickSwitch(api: PluginApi, host: Host, anchor: HTMLElement, current: number, onPick: (value: number) => void, onRename: (index: number, name: string) => void): PopoverHandle {
  const items: ChoiceOption[] = host.switches().map((s) => ({ value: s.value, label: s.label, hint: `#${s.value + 1}` }));
  return pickChoice(api, anchor, items, onPick, {
    current, searchable: true, width: 260,
    actions: [{ label: api.i18n.t("Rename…"), run: (h) => { h.close(); void api.ui.prompt(api.i18n.t("Name for switch {n}", { n: current + 1 }), { title: api.i18n.t("Rename switch"), value: host.switches()[current]?.label ?? "" }).then((name) => { if (typeof name === "string") onRename(current, name); }); } }],
  });
}

export function pickSound(api: PluginApi, host: Host, anchor: HTMLElement, current: number, onPick: (value: number) => void): PopoverHandle {
  const items: ChoiceOption[] = [{ value: 0, label: api.i18n.t("No sound") }, ...host.sounds()];
  return pickChoice(api, anchor, items, onPick, { current, searchable: true, width: 280 });
}

export function pickNamed(api: PluginApi, anchor: HTMLElement, items: NamedItem[], current: number, onPick: (value: number) => void, width = 260): PopoverHandle {
  return pickChoice(api, anchor, items, onPick, { current, searchable: true, width });
}

export function pickKey(api: PluginApi, anchor: HTMLElement, current: number, onPick: (value: number) => void): PopoverHandle {
  return pickChoice(api, anchor, KEYS.map((k) => ({ value: k.code, label: k.label, hint: `0x${k.code.toString(16).toUpperCase()}` })), onPick, { current, searchable: true, width: 200 });
}

/** A placed unit by the unit-table slot it takes in the game: the map's units with their slots, and pick-on-map. */
export function pickPlacedUnit(api: PluginApi, host: Host, anchor: HTMLElement, current: number, onPick: (value: number) => void): PopoverHandle {
  const names = api.triggers.names();
  const placed = host.placedUnits();
  const items: ChoiceOption[] = placed.map((u) => ({ value: u.slot, label: `${names.unit(u.unitId)} (slot ${u.slot})`, hint: `P${u.owner + 1} · ${Math.floor(u.x / 32)},${Math.floor(u.y / 32)}` }));
  const byIndex = new Map(placed.map((u) => [u.index, u]));
  return pickChoice(api, anchor, items, onPick, {
    current, searchable: true, width: 320,
    onHover: (slot) => { const u = placed.find((p) => p.slot === slot); if (u) host.flashUnit(u.index); },
    actions: [{ label: api.i18n.t("Pick on map"), run: (h) => { h.close(); void host.pickUnit(api.i18n.t("Click a placed unit")).then((u) => { const p = u && byIndex.get(u.index); if (p) onPick(p.slot); }); } }],
  });
}
