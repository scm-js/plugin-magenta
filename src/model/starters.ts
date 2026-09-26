/**
 * Whole triggers to start from what is under the pointer on the map: a placed unit, a
 * location. Each starter is a labelled builder; the panel offers the list and inserts
 * the one picked. They are recipes with the map's own objects already in the chips.
 */
import { ActionFlag, ActionType, Comparison, ConditionType, PlayerGroup, SetModifier, UnitClass, emptyAction, emptyCondition, emptyTrigger, type ActionRecord, type ConditionRecord, type TriggerRecord } from "../../vendor/triggers";
import { entry } from "../catalogue";
import { lowerAction } from "./eud";
import { setOwners } from "./records";
import { t } from "../i18n";

export interface Starter {
  id: string;
  label: string;
  /** One line under the label. */
  hint?: string;
  build(intern: (text: string) => number): TriggerRecord[];
}

/** What the starters are about, with the names the labels use. */
export interface StarterSubject {
  unit?: { unitId: number; owner: number; slot: number; name: string; ownerName: string } | null;
  /** The location under the pointer, or the one the unit stands in. */
  location?: { number: number; name: string } | null;
}

const C = ConditionType, A = ActionType, P = PlayerGroup;
const MARINE = 0;

const cond = (type: number, patch: Partial<ConditionRecord> = {}): ConditionRecord => ({ ...emptyCondition(), type, ...patch });
const act = (type: number, patch: Partial<ActionRecord> = {}): ActionRecord => ({ ...emptyAction(), type, ...patch });
const trigger = (intern: (text: string) => number, title: string, owners: number[], conditions: ConditionRecord[], actions: ActionRecord[]): TriggerRecord =>
  setOwners({ ...emptyTrigger(), conditions, actions: [act(A.Comment, { text: intern(title) }), ...actions] }, owners);
const display = (intern: (text: string) => number, text: string) => act(A.DisplayText, { text: intern(text), flags: ActionFlag.AlwaysDisplay });

/** A unit's owner as a trigger owner: its slot when a player can run triggers, else Player 1. */
const ownerOf = (owner: number): number => (owner < 8 ? owner : P.Player1);

export function starters(subject: StarterSubject): Starter[] {
  const out: Starter[] = [];
  const u = subject.unit;
  const l = subject.location;
  if (u) {
    const owner = ownerOf(u.owner);
    out.push({
      id: "unit-dies", label: t("When this {unit} dies", { unit: u.name }), hint: t("{owner}'s deaths of {unit} reach 1 (any {unit} of theirs, not only this one)", { owner: u.ownerName, unit: u.name }),
      build: (intern) => [trigger(intern, `When the ${u.name} dies`, [owner], [cond(C.Deaths, { player: u.owner < 12 ? u.owner : P.CurrentPlayer, unitId: u.unitId, comparison: Comparison.AtLeast, amount: 1 })], [display(intern, `The ${u.name} is gone.`)])],
    });
    if (l) out.push({
      id: "unit-brought", label: t("When this {unit} is at {location}", { unit: u.name, location: l.name }), hint: t("{owner} brings at least 1 {unit} to {location}", { owner: u.ownerName, unit: u.name, location: l.name }),
      build: (intern) => [trigger(intern, `${u.name} at ${l.name}`, [owner], [cond(C.Bring, { player: u.owner < 12 ? u.owner : P.CurrentPlayer, unitId: u.unitId, location: l.number, comparison: Comparison.AtLeast, amount: 1 })], [display(intern, `The ${u.name} is at ${l.name}.`), act(A.PreserveTrigger)])],
    });
    out.push({
      id: "unit-give", label: t("Give this {unit} to the player who comes", { unit: u.name }), hint: l ? t("Whoever brings a unit to {location} gets the {unit}", { location: l.name, unit: u.name }) : t("Needs a location under the unit"),
      build: (intern) => [trigger(intern, `Give the ${u.name}`, [P.AllPlayers], [cond(C.Bring, { player: P.CurrentPlayer, unitId: UnitClass.Any, location: l?.number ?? 0, comparison: Comparison.AtLeast, amount: 1 })], [act(A.GiveUnits, { player: u.owner < 12 ? u.owner : P.NeutralPlayers, target: P.CurrentPlayer, unitId: u.unitId, modifier: 1, location: l?.number ?? 0 }), act(A.PreserveTrigger)])],
    });
    const hp = entry("cunit.hp");
    if (hp) out.push({
      id: "unit-hp", label: t("Set this {unit}'s hit points (EUD)", { unit: u.name }), hint: t("Placed unit slot {n}: the game fills the slots in map order, so the number stays right while no unit is added before it", { n: u.slot }),
      build: (intern) => [trigger(intern, `${u.name}'s hit points`, [P.Player1], [cond(C.Always)], [lowerAction({ entry: hp, args: { index: u.slot }, value: 100, op: SetModifier.SetTo })])],
    });
  }
  if (l) {
    out.push({
      id: "loc-comes", label: t("When a unit comes to {location}", { location: l.name }), hint: t("Any player, any unit; fires again each time"),
      build: (intern) => [trigger(intern, `A unit at ${l.name}`, [P.AllPlayers], [cond(C.Bring, { player: P.CurrentPlayer, unitId: UnitClass.Any, location: l.number, comparison: Comparison.AtLeast, amount: 1 })], [display(intern, `Something is at ${l.name}.`), act(A.PreserveTrigger)])],
    });
    out.push({
      id: "loc-create", label: t("Create units at {location}", { location: l.name }), hint: t("One Marine for Player 1 at the start; change the unit, the count and the player"),
      build: (intern) => [trigger(intern, `Units at ${l.name}`, [P.Player1], [cond(C.Always)], [act(A.CreateUnit, { player: P.Player1, unitId: MARINE, modifier: 1, location: l.number })])],
    });
    out.push({
      id: "loc-clear", label: t("Kill everything at {location}", { location: l.name }), hint: t("Every player's units in the location, on the first cycle"),
      build: (intern) => [trigger(intern, `Clear ${l.name}`, [P.Player1], [cond(C.Always)], [act(A.KillUnitAt, { player: P.AllPlayers, unitId: UnitClass.Any, modifier: 0, location: l.number })])],
    });
  }
  return out;
}
