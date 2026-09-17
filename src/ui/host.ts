/**
 * The seam between the panel and the editor: everything the UI asks of the map goes
 * through here, so the rest of `ui/` knows records, names and a few verbs, not the API.
 */
import type { PluginApi, TriggerRecord, Rect } from "@scm-js/plugin-api";
import { PLAYER_GROUP_COUNT } from "../../vendor/triggers";
import type { Namer } from "../model/names";
import { addressOf } from "../model/eud";
import { keyLabel } from "../model/eudSentence";
import { encodeSidecar, MEMBER, readSidecar, type Sidecar, type SidecarProblem } from "../model/sidecar";
import { slotsOf } from "../model/slots";
import type { ParseNames } from "../model/parse";
import { usage } from "../model/counters";

export interface NamedItem {
  value: number;
  label: string;
  hint?: string;
  /** A location with a name of its own in the map (not the editor's `Location N` default). */
  named?: boolean;
}

export class Host {
  readonly api: PluginApi;
  private sidecarCache: { bytes: Uint8Array | null; value: Sidecar; problem: SidecarProblem | null } | null = null;
  /** The member bytes the user chose to write over, after the panel said they could not be read. */
  private discarded: Uint8Array | null = null;

  constructor(api: PluginApi) {
    this.api = api;
  }

  isOpen(): boolean {
    return this.api.document.isOpen();
  }

  /* ── Reading ── */

  /** The map's revision (Scenario ▸ Map Revision), null with no map open. */
  version() {
    return this.api.settings.version();
  }

  /** Scenario ▸ Map Revision ▸ Remastered 1.21+, with the string table moved to STRx as the dialog does by default. */
  setRemastered(): void {
    this.api.document.update("Map revision", (tx) => { tx.setVersion("remastered"); });
  }

  triggers(): TriggerRecord[] {
    return this.api.triggers.list();
  }

  strings(): (string | null)[] {
    return this.api.document.scenario()?.strings.strings ?? [null];
  }

  string(index: number): string | null {
    return this.api.names.string(index);
  }

  /** The namer the sentences read through: the map's names, the game's, and the sidecar's counters. */
  namer(sidecar: Sidecar): Namer {
    const names = this.api.triggers.names();
    const players = this.api.settings.players();
    return {
      unit: (id) => names.unit(id),
      location: (n) => (n === 0 ? "no location" : names.location(n)),
      switch: (i) => names.switch(i),
      string: (i) => names.string(i),
      player: (v) => (v >= PLAYER_GROUP_COUNT ? `memory at 0x${addressOf(v).toString(16).toUpperCase()}` : this.api.names.playerGroup(v)),
      playerColor: (v) => (v < 12 ? players[v]?.colorHex ?? null : null),
      aiScript: (code) => this.api.names.aiScript(code),
      wav: (i) => (i === 0 ? "no sound" : (names.string(i) ?? `sound ${i}`).split("\\").pop() ?? `sound ${i}`),
      choice: (kind, value) => this.api.triggers.defs.choiceLabel(kind as never, value),
      counter: (player, unit) => sidecar.counters.find((c) => c.player === player && c.unit === unit)?.name ?? null,
    };
  }

  extra() {
    const w = new Map(this.api.names.weapons().map((n) => [n.value, n.label]));
    const u = new Map(this.api.names.upgrades().map((n) => [n.value, n.label]));
    const t = new Map(this.api.names.techs().map((n) => [n.value, n.label]));
    return {
      weapon: (id: number) => (id === 130 ? "no weapon" : w.get(id) ?? `weapon ${id}`),
      upgrade: (id: number) => u.get(id) ?? `upgrade ${id}`,
      tech: (id: number) => t.get(id) ?? `technology ${id}`,
      key: keyLabel,
    };
  }

  units(): NamedItem[] {
    const names = this.api.triggers.names();
    return this.api.names.units().map((n) => ({ value: n.value, label: names.unit(n.value), hint: n.value >= 228 ? "" : n.label !== names.unit(n.value) ? n.label : undefined }));
  }

  weapons(): NamedItem[] { return this.api.names.weapons(); }
  upgrades(): NamedItem[] { return this.api.names.upgrades(); }
  techs(): NamedItem[] { return this.api.names.techs(); }

  playerGroups(): NamedItem[] {
    return this.api.names.playerGroups();
  }

  /** The 12 player slots with their names, colours and kinds, for the player chip. */
  players(): { slot: number; label: string; color: string | null; type: string }[] {
    return this.api.settings.players().map((p) => ({ slot: p.slot, label: this.api.names.playerGroup(p.slot), color: p.colorHex, type: p.typeName }));
  }

  /** Locations that exist, by 1-based number, plus Anywhere. */
  locations(): NamedItem[] {
    const scn = this.api.document.scenario();
    if (!scn) return [];
    const names = this.api.triggers.names();
    const out: NamedItem[] = [];
    scn.locations.forEach((l, i) => {
      const n = i + 1;
      if (i === 63 || l.left !== l.right || l.top !== l.bottom) out.push({ value: n, label: names.location(n), hint: i === 63 ? "" : `${Math.floor(l.left / 32)},${Math.floor(l.top / 32)}`, named: l.nameIndex !== 0 });
    });
    return out;
  }

  /** 0-based location slots nothing uses, highest first, for MSQC's own locations. */
  freeLocationSlots(): number[] {
    const scn = this.api.document.scenario();
    if (!scn) return [];
    const out: number[] = [];
    for (let i = 62; i >= 0; i--) { const l = scn.locations[i]; if (l && l.left === l.right && l.top === l.bottom && l.nameIndex === 0) out.push(i); }
    return out;
  }

  locationExists(n: number): boolean {
    const scn = this.api.document.scenario();
    if (!scn) return true;
    const l = scn.locations[n - 1];
    return !!l && (n === 64 || l.left !== l.right || l.top !== l.bottom);
  }

  locationRect(n: number): Rect | null {
    const l = this.api.document.scenario()?.locations[n - 1];
    if (!l) return null;
    return { x0: Math.floor(Math.min(l.left, l.right) / 32), y0: Math.floor(Math.min(l.top, l.bottom) / 32), x1: Math.ceil(Math.max(l.left, l.right) / 32), y1: Math.ceil(Math.max(l.top, l.bottom) / 32) };
  }

  switches(): NamedItem[] {
    return this.api.triggers.switchNames().map((label, value) => ({ value, label }));
  }

  sounds(): NamedItem[] {
    return this.api.settings.sounds().map((s) => ({ value: s.stringIndex, label: s.path.split("\\").pop() ?? s.path, hint: s.present ? undefined : "missing" }));
  }

  /** Seconds of a PCM WAV in the archive, from its header; null when it is not there or not plain PCM. */
  wavSeconds(path: string): number | null {
    const bytes = this.api.document.extras.get(path) ?? this.api.document.extras.get(path.replace(/\//g, "\\"));
    if (!bytes || bytes.length < 44) return null;
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.subarray(8, 12)) !== "WAVE") return null;
    let at = 12, rate = 0, block = 0;
    while (at + 8 <= bytes.length) {
      const id = String.fromCharCode(...bytes.subarray(at, at + 4));
      const size = v.getUint32(at + 4, true);
      if (id === "fmt ") { rate = v.getUint32(at + 12, true); block = v.getUint16(at + 20, true); }
      if (id === "data" && rate && block) return size / (rate * block);
      at += 8 + size + (size & 1);
    }
    return null;
  }

  /** The 1-based number of a location by exact name, making an empty one when the map has none; null when every slot is taken. */
  ensureLocation(name: string): number | null {
    const scn = this.api.document.scenario();
    if (!scn) return null;
    const names = this.api.triggers.names();
    for (let i = 0; i < 63; i++) if (names.location(i + 1) === name && this.locationExists(i + 1)) return i + 1;
    let made = -1;
    this.api.document.edit(`Add ${name}`, (tx) => { made = tx.addLocation({ left: 0, top: 0, right: 64, bottom: 64 }, name); });
    return made >= 0 ? made + 1 : null;
  }

  /** The 0-based index of a switch by exact name, naming a free one when the map has none; null when all 256 are used. */
  ensureSwitch(name: string): number | null {
    const names = this.api.triggers.switchNames();
    const at = names.indexOf(name);
    if (at >= 0) return at;
    const used = usage(this.api.triggers.list()).switches;
    let free = -1;
    for (let i = 0; i < 256; i++) { const n = names[i] ?? ""; if (!used.has(i) && (n === "" || /^Switch \d+$/.test(n))) { free = i; break; } }
    if (free < 0) return null;
    this.api.document.update(`Name switch ${name}`, (tx) => { tx.switches.setName(free, name); });
    return free;
  }

  /** `PlayerType` per 0-based slot (0 is Inactive). */
  playerTypes(): number[] {
    return this.api.settings.players().map((p) => p.type);
  }

  playerTypeName(slot: number): string {
    return this.api.settings.players()[slot]?.typeName ?? String(slot + 1);
  }

  /** The slots that own at least one placed unit. */
  placedOwners(): Set<number> {
    return new Set((this.api.document.scenario()?.units ?? []).map((u) => u.owner));
  }

  /** Every location slot, 0-based: empty (zero size) and whether it has a name of its own. */
  locationSlots(): { empty: boolean; named: boolean }[] {
    return (this.api.document.scenario()?.locations ?? []).map((l) => ({ empty: l.left === l.right && l.top === l.bottom, named: l.nameIndex !== 0 }));
  }

  soundPresent(path: string): boolean {
    const want = path.replace(/\//g, "\\");
    return this.api.settings.sounds().some((s) => s.path.replace(/\//g, "\\") === want && s.present);
  }

  /** What of the map a build reads besides the triggers — locations, placed units, the strings — as strings for the source revision. */
  revisionExtra(): string[] {
    const scn = this.api.document.scenario();
    if (!scn) return [];
    return [
      JSON.stringify(scn.locations.map((l) => [l.left, l.top, l.right, l.bottom, l.nameIndex])),
      JSON.stringify(scn.units.map((u) => [u.unitId, u.owner, u.x, u.y])),
      (scn.strings.strings ?? []).map((s) => s ?? "").join("\0"),
    ];
  }

  wavPresent(index: number): boolean {
    const row = this.api.settings.sounds().find((s) => s.stringIndex === index);
    return !row || row.present;
  }

  stringExists(index: number): boolean {
    return index === 0 || this.api.names.string(index) !== null;
  }

  placedUnitIds(): Set<number> {
    return new Set((this.api.document.scenario()?.units ?? []).map((u) => u.unitId));
  }

  /** The placed units with the unit-table slot each takes in the game, for the placed-unit chip. Start locations are left out. */
  placedUnits(): { index: number; slot: number; unitId: number; owner: number; x: number; y: number }[] {
    const units = this.api.document.scenario()?.units ?? [];
    const slots = slotsOf(units.map((u) => u.unitId));
    return units.map((u, index) => ({ index, slot: slots[index], unitId: u.unitId, owner: u.owner, x: u.x, y: u.y })).filter((u) => u.slot >= 0);
  }

  /** Everything the add row's parser can name. */
  parseNames(): ParseNames {
    const names = this.api.triggers.names();
    const players = this.api.names.playerGroups().map((g) => ({ value: g.value, label: g.label, aliases: g.value < 12 ? [`p${g.value + 1}`] : g.value === 17 ? ["everyone", "all"] : g.value === 13 ? ["me", "current"] : undefined }));
    return {
      units: this.api.names.units().map((n) => ({ value: n.value, label: names.unit(n.value), aliases: n.label !== names.unit(n.value) ? [n.label] : undefined })),
      locations: this.locations().map((l) => ({ value: l.value, label: l.label })),
      switches: this.switches(),
      weapons: this.weapons(),
      upgrades: this.upgrades(),
      techs: this.techs(),
      players,
    };
  }

  claims(list?: TriggerRecord[]) {
    return this.api.triggers.claims(list);
  }

  /* ── The map ── */

  async pickLocation(prompt: string): Promise<number | null> {
    const picked = await this.api.ui.pickObject({ kinds: ["location"], prompt });
    return picked ? picked.index + 1 : null;
  }

  async pickUnit(prompt: string): Promise<{ index: number; unitId: number } | null> {
    const picked = await this.api.ui.pickObject({ kinds: ["unit"], prompt });
    if (!picked) return null;
    const u = this.api.document.scenario()?.units[picked.index];
    return u ? { index: picked.index, unitId: u.unitId } : null;
  }

  flashLocation(n: number): void {
    if (n > 0 && n < 64) this.api.view.flash({ locations: [n - 1], kind: "attention" });
  }

  flashUnit(index: number): void {
    this.api.view.flash({ units: [index], kind: "attention" });
  }

  revealLocation(n: number): void {
    const rect = this.locationRect(n);
    if (rect) void this.api.view.reveal(rect, { fit: true });
  }

  /* ── Writing ── */

  /** Replace the trigger list, interning any strings the builder asks for first. */
  write(build: (intern: (text: string) => number, strings: (string | null)[]) => TriggerRecord[]): void {
    this.api.document.update("Magenta", (tx) => {
      const list = build((text) => tx.strings.intern(text), tx.strings.list());
      tx.triggers.set(list);
    });
  }

  renameSwitch(index: number, name: string): void {
    this.api.document.update("Rename switch", (tx) => { tx.switches.setName(index, name); });
  }

  /* ── The sidecar ── */

  sidecar(): Sidecar {
    return this.readSidecar().value;
  }

  /** Why the map's member could not be read, or null; a problem the user discarded is null too. */
  sidecarProblem(): SidecarProblem | null {
    const r = this.readSidecar();
    return r.bytes !== null && r.bytes === this.discarded ? null : r.problem;
  }

  /** Write over the unreadable member from now on: the next change replaces it. */
  discardSidecar(): void {
    this.discarded = this.api.document.extras.get(MEMBER);
  }

  private readSidecar(): { bytes: Uint8Array | null; value: Sidecar; problem: SidecarProblem | null } {
    const bytes = this.api.document.extras.get(MEMBER);
    if (this.sidecarCache && this.sidecarCache.bytes === bytes) return this.sidecarCache;
    const { sidecar, problem } = readSidecar(bytes);
    this.sidecarCache = { bytes, value: sidecar, problem };
    return this.sidecarCache;
  }

  saveSidecar(sidecar: Sidecar): void {
    const empty = sidecar.folders.length === 0 && sidecar.counters.length === 0 && sidecar.expansions.length === 0 && sidecar.builds.length === 0 && !sidecar.chat && !sidecar.msqc && Object.keys(sidecar.settings).length === 0;
    if (empty) { this.api.document.extras.remove(MEMBER); this.sidecarCache = null; return; }
    const bytes = encodeSidecar(sidecar);
    this.api.document.extras.set(MEMBER, bytes);
    this.sidecarCache = { bytes: this.api.document.extras.get(MEMBER), value: sidecar, problem: null };
  }
}
