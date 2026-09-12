/**
 * The trigger records as Magenta handles them: cloning, a content fingerprint, the
 * disabled bits, and the Comment action that is a trigger's title.
 *
 * The records are the editor's own (`TriggerRecord` and its conditions and actions are
 * plain numbers); nothing here knows what a field means — that is `sentences.ts` and the
 * catalogue.
 */
import { ActionFlag, ActionType, ConditionFlag, ConditionType, type ActionRecord, type ConditionRecord, type TriggerRecord } from "../../vendor/triggers";

export const clone = <T>(value: T): T => structuredClone(value);

/** FNV-1a over the record's numbers: the same trigger hashes the same wherever it sits in the list. */
export function fingerprint(trigger: TriggerRecord): string {
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    // Four bytes of every number, so a u32 field hashes whole.
    for (let i = 0; i < 4; i++) {
      h ^= (n >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const c of trigger.conditions) { mix(c.type); mix(c.location); mix(c.player); mix(c.amount); mix(c.unitId); mix(c.comparison); mix(c.resource); mix(c.flags & ~ConditionFlag.Unknown); mix(c.mask); }
  mix(0xffff);
  for (const a of trigger.actions) { mix(a.type); mix(a.location); mix(a.text); mix(a.wav); mix(a.time); mix(a.player); mix(a.target); mix(a.unitId); mix(a.modifier); mix(a.flags & ~ActionFlag.IgnoreWaitOnce); mix(a.mask); }
  mix(0xfffe);
  mix(trigger.flags & ~0x01);
  for (const p of trigger.players) mix(p);
  return h.toString(16).padStart(8, "0");
}

export const isConditionDisabled = (c: ConditionRecord) => (c.flags & ConditionFlag.Disabled) !== 0;
export const isActionDisabled = (a: ActionRecord) => (a.flags & ActionFlag.Disabled) !== 0;

export function setConditionDisabled(c: ConditionRecord, disabled: boolean): ConditionRecord {
  return { ...c, flags: disabled ? c.flags | ConditionFlag.Disabled : c.flags & ~ConditionFlag.Disabled };
}

export function setActionDisabled(a: ActionRecord, disabled: boolean): ActionRecord {
  return { ...a, flags: disabled ? a.flags | ActionFlag.Disabled : a.flags & ~ActionFlag.Disabled };
}

/** Every condition and action of the trigger disabled (or enabled) — what "disable trigger" means in a file that has no such bit the editors agree on. */
export function setTriggerDisabled(trigger: TriggerRecord, disabled: boolean): TriggerRecord {
  return {
    ...trigger,
    conditions: trigger.conditions.map((c) => (c.type === ConditionType.None ? c : setConditionDisabled(c, disabled))),
    actions: trigger.actions.map((a) => (a.type === ActionType.None ? a : setActionDisabled(a, disabled))),
  };
}

/** Whether every live condition and action is disabled (and there is at least one). */
export function isTriggerDisabled(trigger: TriggerRecord): boolean {
  const live = [...trigger.conditions.filter((c) => c.type !== ConditionType.None).map(isConditionDisabled), ...trigger.actions.filter((a) => a.type !== ActionType.None).map(isActionDisabled)];
  return live.length > 0 && live.every(Boolean);
}

/** The index of the trigger's Comment action, or -1. */
export function commentIndex(trigger: TriggerRecord): number {
  return trigger.actions.findIndex((a) => a.type === ActionType.Comment);
}

/** The live conditions: everything up to the first empty slot, as the game runs them. */
export function liveConditions(trigger: TriggerRecord): ConditionRecord[] {
  const out: ConditionRecord[] = [];
  for (const c of trigger.conditions) { if (c.type === ConditionType.None) break; out.push(c); }
  return out;
}

export function liveActions(trigger: TriggerRecord): ActionRecord[] {
  const out: ActionRecord[] = [];
  for (const a of trigger.actions) { if (a.type === ActionType.None) break; out.push(a); }
  return out;
}

/** The player groups that own the trigger, as `PlayerGroup` values. */
export function owners(trigger: TriggerRecord): number[] {
  const out: number[] = [];
  trigger.players.forEach((on, i) => { if (on) out.push(i); });
  return out;
}

export function setOwners(trigger: TriggerRecord, groups: number[]): TriggerRecord {
  const players = trigger.players.map(() => 0);
  for (const g of groups) if (g >= 0 && g < players.length) players[g] = 1;
  return { ...trigger, players };
}
