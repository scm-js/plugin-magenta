/**
 * Recipes: whole triggers a map maker starts from, picked by name from the New button.
 * Each lands as ordinary rows with its chips left on sensible defaults — Anywhere for a
 * location, Current Player for the player, a Marine for the unit — so the next thing to
 * do is click the chips. A recipe can be several triggers; all are titled.
 */
import { ActionFlag, ActionType, Comparison, ConditionType, PlayerGroup, SetModifier, SwitchAction, SwitchState, UnitClass, emptyAction, emptyCondition, emptyTrigger, type ActionRecord, type ConditionRecord, type TriggerRecord } from "../../vendor/triggers";
import { entry } from "../catalogue";
import { lowerAction, lowerCondition } from "./eud";
import { setOwners } from "./records";

export interface RecipeContext {
  /** Intern a string and answer its index. */
  intern(text: string): number;
  /** A location number to use where the recipe needs one; Anywhere when the map has none. */
  location: number;
  /** A second location (a spawn point) when the map has one. */
  location2: number;
}

export interface Recipe {
  id: string;
  label: string;
  aliases?: string[];
  /** One line under the label: what it does and what to change. */
  description: string;
  /** Needs triggers to run every frame (EUD reads). */
  everyFrame?: boolean;
  build(ctx: RecipeContext): TriggerRecord[];
}

const ANYWHERE = 64;
const MARINE = 0;
const C = ConditionType, A = ActionType, P = PlayerGroup;

const cond = (type: number, patch: Partial<ConditionRecord> = {}): ConditionRecord => ({ ...emptyCondition(), type, ...patch });
const act = (type: number, patch: Partial<ActionRecord> = {}): ActionRecord => ({ ...emptyAction(), type, ...patch });
const always = () => cond(C.Always);
const preserve = () => act(A.PreserveTrigger);
const comment = (ctx: RecipeContext, text: string) => act(A.Comment, { text: ctx.intern(text) });
const display = (ctx: RecipeContext, text: string) => act(A.DisplayText, { text: ctx.intern(text), flags: ActionFlag.AlwaysDisplay });
const bring = (player: number, unit: number, location: number, comparison: number, amount: number) => cond(C.Bring, { player, unitId: unit, location, comparison, amount });
const deaths = (player: number, unit: number, comparison: number, amount: number) => cond(C.Deaths, { player, unitId: unit, comparison, amount });
const setDeaths = (player: number, unit: number, modifier: number, amount: number) => act(A.SetDeaths, { player, unitId: unit, modifier, target: amount });
const trigger = (ctx: RecipeContext, title: string, owners: number[], conditions: ConditionRecord[], actions: ActionRecord[]): TriggerRecord =>
  setOwners({ ...emptyTrigger(), conditions, actions: [comment(ctx, title), ...actions] }, owners);

export const RECIPES: Recipe[] = [
  {
    id: "beacon-give", label: "Give units at a beacon", aliases: ["shop", "buy", "hero pick", "capture"],
    description: "A player who brings a unit to the location is given the units standing on it. Change the location, the unit and its owner.",
    build: (ctx) => [trigger(ctx, "Give units at the beacon", [P.AllPlayers],
      [bring(P.CurrentPlayer, UnitClass.Any, ctx.location, Comparison.AtLeast, 1)],
      [act(A.GiveUnits, { player: P.Player8, target: P.CurrentPlayer, unitId: UnitClass.Any, modifier: 0, location: ctx.location }), preserve()])],
  },
  {
    id: "countdown-end", label: "Countdown that ends the game", aliases: ["timer", "time limit", "survive"],
    description: "A ten-minute countdown, then victory for everyone still in. Change the seconds, or Victory to Defeat.",
    build: (ctx) => [
      trigger(ctx, "Start the countdown", [P.AllPlayers], [always()], [act(A.SetCountdownTimer, { modifier: SetModifier.SetTo, time: 600 })]),
      trigger(ctx, "Countdown over", [P.AllPlayers], [cond(C.CountdownTimer, { comparison: Comparison.AtMost, amount: 0 })], [act(A.Victory)]),
    ],
  },
  {
    id: "respawn", label: "Respawn a unit when it dies", aliases: ["hero", "revive", "resurrect"],
    description: "When the player's unit dies, wait five seconds and create it again at the location. Change the unit and the location.",
    build: (ctx) => [trigger(ctx, "Respawn", [P.AllPlayers],
      [deaths(P.CurrentPlayer, MARINE, Comparison.AtLeast, 1)],
      [act(A.Wait, { time: 5000 }), act(A.CreateUnit, { player: P.CurrentPlayer, unitId: MARINE, modifier: 1, location: ctx.location2 }), setDeaths(P.CurrentPlayer, MARINE, SetModifier.SetTo, 0), preserve()])],
  },
  {
    id: "cash-for-kills", label: "Minerals for each kill", aliases: ["bounty", "reward", "money per kill"],
    description: "Every enemy unit that dies pays the players 50 minerals. Change the enemy player and the unit, or the amount.",
    build: (ctx) => [trigger(ctx, "Bounty", [P.AllPlayers],
      [deaths(P.Player8, UnitClass.Any, Comparison.AtLeast, 1)],
      [act(A.SetResources, { player: P.CurrentPlayer, modifier: SetModifier.Add, target: 50, unitId: 0 }), setDeaths(P.Player8, UnitClass.Any, SetModifier.Subtract, 1), preserve()])],
  },
  {
    id: "waves", label: "Reinforcements every minute", aliases: ["spawn", "waves", "periodic", "timer spawn"],
    description: "Every sixty seconds four Marines appear at the location for Player 8. Change the unit, the count, the player and the location.",
    build: (ctx) => [
      trigger(ctx, "Wave timer", [P.AllPlayers], [always()], [act(A.SetCountdownTimer, { modifier: SetModifier.SetTo, time: 60 })]),
      trigger(ctx, "Wave", [P.AllPlayers], [cond(C.CountdownTimer, { comparison: Comparison.AtMost, amount: 0 })],
        [act(A.CreateUnit, { player: P.Player8, unitId: MARINE, modifier: 4, location: ctx.location2 }), act(A.SetCountdownTimer, { modifier: SetModifier.SetTo, time: 60 }), preserve()]),
    ],
  },
  {
    id: "hold-to-win", label: "Win by holding a location", aliases: ["king of the hill", "capture point", "control"],
    description: "A player with a unit at the location for thirty seconds wins. Uses a switch as the clock; change the location and the seconds.",
    build: (ctx) => [
      trigger(ctx, "Holding: start the clock", [P.AllPlayers], [bring(P.CurrentPlayer, UnitClass.Any, ctx.location, Comparison.AtLeast, 1), cond(C.Switch, { resource: 0, comparison: SwitchState.Cleared })],
        [act(A.SetCountdownTimer, { modifier: SetModifier.SetTo, time: 30 }), act(A.SetSwitch, { target: 0, modifier: SwitchAction.Set }), preserve()]),
      trigger(ctx, "Holding: lost it", [P.AllPlayers], [bring(P.CurrentPlayer, UnitClass.Any, ctx.location, Comparison.Exactly, 0), cond(C.Switch, { resource: 0, comparison: SwitchState.Set })],
        [act(A.SetSwitch, { target: 0, modifier: SwitchAction.Clear }), preserve()]),
      trigger(ctx, "Holding: won", [P.AllPlayers], [bring(P.CurrentPlayer, UnitClass.Any, ctx.location, Comparison.AtLeast, 1), cond(C.CountdownTimer, { comparison: Comparison.AtMost, amount: 0 }), cond(C.Switch, { resource: 0, comparison: SwitchState.Set })],
        [act(A.Victory)]),
    ],
  },
  {
    id: "defeat-when-dead", label: "Defeat when nothing is left", aliases: ["lose", "elimination", "game over"],
    description: "A player with no units and no buildings left is defeated.",
    build: (ctx) => [trigger(ctx, "Eliminated", [P.AllPlayers], [cond(C.Command, { player: P.CurrentPlayer, unitId: UnitClass.Any, comparison: Comparison.AtMost, amount: 0 })], [act(A.Defeat)])],
  },
  {
    id: "intro", label: "Message at the start", aliases: ["welcome", "intro", "instructions", "text"],
    description: "One message to everyone when the game begins. Change the text.",
    build: (ctx) => [trigger(ctx, "Intro", [P.AllPlayers], [always()], [display(ctx, "Welcome. Change this text.")])],
  },
  {
    id: "key-minerals", label: "A key gives minerals", aliases: ["keyboard", "hotkey", "cheat key", "press"], everyFrame: true,
    description: "Pressing M gives the player at that computer 100 minerals. An EUD read; needs triggers every frame, and runs only on the computer where the key was pressed. Change the key.",
    build: (ctx) => [trigger(ctx, "M for minerals", [P.AllPlayers],
      [lowerCondition({ entry: entry("game.key")!, args: { key: 0x4d }, value: 1, op: Comparison.Exactly })],
      [act(A.SetResources, { player: P.CurrentPlayer, modifier: SetModifier.Add, target: 100, unitId: 0 }), preserve()])],
  },
  {
    id: "buff-unit", label: "Change a unit type's stats", aliases: ["balance", "mod", "stats", "hp armor damage"],
    description: "At the start, set the Marine's max hit points to 80 and its armor to 2. EUD writes; add rows for other stats.",
    build: (ctx) => [trigger(ctx, "Unit stats", [P.AllPlayers], [always()],
      [lowerAction({ entry: entry("unit.maxHp")!, args: { unit: MARINE }, value: 80, op: SetModifier.SetTo }), lowerAction({ entry: entry("unit.armor")!, args: { unit: MARINE }, value: 2, op: SetModifier.SetTo })])],
  },
];

export const recipe = (id: string): Recipe | undefined => RECIPES.find((r) => r.id === id);

/** A context over a string table and the map's locations: the first two named locations, else Anywhere. */
export function recipeContext(intern: (text: string) => number, locations: number[]): RecipeContext {
  return { intern, location: locations[0] ?? ANYWHERE, location2: locations[1] ?? locations[0] ?? ANYWHERE };
}
