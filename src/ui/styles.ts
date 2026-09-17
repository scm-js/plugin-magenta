/** The panel's stylesheet, scoped under `.mg`; colours and sizes are the editor's tokens. */
export const STYLE = `
.mg { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 8px; font-size: var(--fs-sm, 11.5px); }
.mg .mg-notice { display: flex; gap: 10px; align-items: center; padding: 8px 10px; margin: 0 8px 6px; border: 1px solid var(--warn, #c9a227); border-radius: 6px; font-size: var(--fs-sm); line-height: 1.35; }
.mg-notice > span { flex: 1; }
.mg-head { display: flex; align-items: center; gap: 6px; }
.mg .mg-head .btn.warn { color: var(--warn); }
.mg .mg-head .btn.active { color: var(--text); }
.mg .mg-head .input { flex: 1; min-width: 80px; }
.mg .mg-split { display: flex; flex: 1; min-height: 0; }
.mg .mg-divider { flex: none; width: 6px; margin: 0 2px; border-radius: 3px; cursor: col-resize; }
.mg .mg-divider:hover, .mg .mg-divider.dragging { background: var(--border); }
.mg.list-hidden .mg-list, .mg.list-hidden .mg-divider { display: none; }
.mg .mg-preflight { margin: 0; padding: 0 0 0 18px; }
.mg .mg-preflight li { margin: 2px 0; }
.mg .mg-preflight li.error { color: var(--danger); }
.mg .mg-preflight li.warn { color: var(--warn); }
.mg .mg-preflight li.info { color: var(--text-dim); }
.mg .mg-preflight .mg-sim-link { margin-left: 6px; }
.mg .mg-list { width: var(--mg-list, 240px); flex: none; display: flex; flex-direction: column; min-height: 0; background: var(--bg-0); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--bevel-sunken); overflow: auto; outline: none; }
.mg.narrow .mg-list { width: var(--mg-list, 150px); }
/* Stacked (a docked panel): the list over the trigger, the divider horizontal, the head wrapping; these come after the row rules on purpose. */
.mg.stacked .mg-split { flex-direction: column; }
.mg.stacked .mg-list { width: auto; height: var(--mg-list-h, 160px); }
.mg.stacked .mg-divider { width: auto; height: 6px; margin: 2px 0; cursor: row-resize; }
.mg.stacked .mg-head { flex-wrap: wrap; }
.mg.stacked .mg-head .input { flex-basis: 100%; order: -1; }
/* Docked: the dock's body is a scrolling block, so the root takes its full height and the list and the trigger scroll inside it. */
.mg.docked { height: 100%; }
.mg .mg-editor { flex: 1; min-width: 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 4px; }
.mg .mg-empty { color: var(--text-faint); padding: 20px; text-align: center; }

.mg .mg-folder { display: flex; align-items: center; gap: 6px; padding: 4px 6px; color: var(--text-dim); text-transform: uppercase; font-size: var(--fs-xs); letter-spacing: 0.04em; cursor: pointer; user-select: none; border-top: 1px solid var(--border); }
.mg .mg-folder:first-child { border-top: 0; }
.mg .mg-folder .mg-count { margin-left: auto; color: var(--text-faint); text-transform: none; letter-spacing: 0; }
.mg .mg-folder.drop { background: var(--bg-3); }
.mg .mg-item { display: grid; grid-template-columns: 1fr auto; gap: 2px 6px; padding: 4px 8px 4px 14px; cursor: default; border-left: 2px solid transparent; }
.mg .mg-item.top { padding-left: 8px; }
.mg .mg-item:hover { background: var(--bg-3); }
.mg .mg-item.selected { background: var(--sel); color: #fff; border-left-color: #f28ccb; }
.mg .mg-item.selected .mg-sub, .mg .mg-item.selected .mg-badge { color: rgba(255,255,255,0.75); }
.mg .mg-item.drop-before { box-shadow: inset 0 2px 0 var(--teal); }
.mg .mg-item .mg-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mg .mg-item.disabled .mg-title { text-decoration: line-through; color: var(--text-faint); }
.mg .mg-item .mg-sub { grid-column: 1 / -1; color: var(--text-faint); font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mg .mg-badges { display: flex; gap: 4px; align-items: center; }
.mg .mg-badge { font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; padding: 1px 4px; border-radius: 2px; background: var(--bg-3); color: var(--text-dim); }
.mg .mg-badge.eud { background: rgba(79, 209, 197, 0.18); color: var(--teal); }
.mg .mg-badge.warn { background: rgba(224, 165, 69, 0.18); color: var(--warn); }
.mg .mg-badge.error { background: rgba(217, 83, 79, 0.2); color: var(--danger); }
.mg .mg-badge.lock { background: rgba(230, 185, 92, 0.18); color: var(--gold); }

.mg .mg-titlebar { display: flex; align-items: center; gap: 8px; }
.mg .mg-titlebar .input { font-size: var(--fs-lg); font-weight: 600; height: 30px; }
.mg .mg-section { display: flex; flex-direction: column; gap: 4px; }
.mg .mg-section-head { display: flex; align-items: center; gap: 8px; color: var(--text-dim); text-transform: uppercase; font-size: var(--fs-xs); letter-spacing: 0.06em; padding-bottom: 2px; border-bottom: 1px solid var(--border); }
.mg .mg-section-head .grow { flex: 1; }
.mg .mg-players { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

.mg .mg-row { display: flex; align-items: flex-start; gap: 6px; padding: 4px 6px; border-radius: var(--radius); outline: none; }
.mg .mg-row:hover, .mg .mg-row:focus-within { background: var(--bg-2); }
.mg .mg-row:focus-visible { box-shadow: var(--focus); }
.mg .mg-row.disabled .mg-sentence { opacity: 0.45; text-decoration: line-through; }
.mg .mg-row .mg-sentence { flex: 1; min-width: 0; line-height: 24px; word-break: break-word; }
.mg .mg-row .mg-tools { display: none; gap: 2px; flex: none; }
.mg .mg-row:hover .mg-tools, .mg .mg-row:focus-within .mg-tools { display: flex; }
.mg .mg-row .mg-tools .btn { min-width: 20px; height: 20px; padding: 0 4px; font-size: 10px; }
.mg .mg-problem { font-size: var(--fs-xs); padding: 2px 8px 2px 24px; color: var(--warn); }
.mg .mg-problem.error { color: var(--danger); }
.mg .mg-problem.info { color: var(--text-dim); }

.mg .mg-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; height: 20px; padding: 0 6px; margin: 0 1px; vertical-align: middle; border-radius: 3px; border: 1px solid var(--border-strong); background: var(--bg-3); color: var(--text); font: inherit; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: var(--bevel-raised); }
.mg .mg-chip:hover { background: var(--bg-4); border-color: var(--teal-dim); }
.mg .mg-chip:focus-visible { outline: none; box-shadow: var(--bevel-raised), var(--focus); }
.mg .mg-chip.eud { border-color: var(--teal-dim); }
.mg .mg-chip.counter { border-color: var(--gold-dim); color: var(--gold-hi); }
.mg .mg-chip.text { font-style: italic; }
.mg .mg-chip .mg-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; border: 1px solid rgba(0,0,0,0.5); }
.mg .mg-tag { display: inline-block; vertical-align: middle; margin-left: 6px; font-size: 9px; letter-spacing: 0.08em; padding: 1px 4px; border-radius: 2px; background: rgba(79, 209, 197, 0.18); color: var(--teal); cursor: help; }
.mg .mg-tag.ro { background: rgba(224, 165, 69, 0.18); color: var(--warn); }
.mg .mg-tag.unverified { background: transparent; outline: 1px dashed rgba(79, 209, 197, 0.6); outline-offset: -1px; }

.mg .mg-add { display: flex; align-items: center; gap: 6px; padding: 2px 6px; }
.mg .mg-add .input { flex: 1; height: 24px; }
.mg .mg-note { color: var(--text-dim); font-size: var(--fs-xs); padding: 2px 6px; }
.mg .mg-explain { display: flex; flex-direction: column; gap: 6px; padding: 4px 6px; }
.mg .mg-explain p { margin: 0; line-height: 1.45; }
.mg .mg-explain .mg-refs { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--border); padding-top: 6px; color: var(--text-dim); }
.mg .mg-explain .mg-ref { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.mg .mg-explain .mg-ref b { color: var(--text); font-weight: 600; }
.mg .mg-sim-link { border: 0; background: none; padding: 0 2px; color: var(--teal); cursor: pointer; font: inherit; text-decoration: underline dotted; }
.mg .mg-sim-link:hover { color: var(--teal-hi, var(--teal)); }
.mg.mg-sim .mg-head .grow { flex: 1; }
.mg.mg-sim .mg-sim-clock { color: var(--text-dim); font-variant-numeric: tabular-nums; }
.mg.mg-sim .mg-sim-body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 4px; }
.mg.mg-sim .mg-sim-title { display: flex; align-items: center; gap: 6px; padding: 2px 6px; }
.mg.mg-sim .mg-sim-verdict { display: flex; align-items: center; gap: 6px; padding: 2px 6px; line-height: 20px; }
.mg.mg-sim .mg-sim-verdict .grow { flex: 1; min-width: 0; }
.mg.mg-sim .mg-sim-mark { width: 14px; text-align: center; flex: none; font-weight: 700; }
.mg.mg-sim .mg-sim-verdict.ok .mg-sim-mark { color: var(--teal); }
.mg.mg-sim .mg-sim-verdict.no .mg-sim-mark { color: var(--danger); }
.mg.mg-sim .mg-sim-verdict.unknown .mg-sim-mark { color: var(--warn); }
.mg.mg-sim .mg-sim-verdict label { margin: 0; }
.mg.mg-sim .mg-sim-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 2px 6px; }
.mg.mg-sim .mg-sim-label { width: 110px; flex: none; color: var(--text-dim); }
.mg.mg-sim .mg-sim-log { display: flex; align-items: baseline; gap: 6px; padding: 1px 6px; font-variant-numeric: tabular-nums; }
.mg.mg-sim .mg-sim-log .mg-sim-cycle { width: 32px; flex: none; text-align: right; color: var(--text-faint); }
.mg.mg-sim .mg-sim-log .mg-sim-who { width: 64px; flex: none; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mg.mg-sim .mg-sim-log.end { color: var(--gold-hi); }
.mg.mg-sim .mg-sim-log .mg-sim-text { font-style: italic; }
.mg .mg-locked { padding: 10px; border: 1px dashed var(--gold-dim); border-radius: var(--radius); color: var(--text-dim); display: flex; flex-direction: column; gap: 8px; }

.mg-pop { position: fixed; z-index: 60; min-width: 180px; max-width: 360px; max-height: 320px; display: flex; flex-direction: column; gap: 6px; padding: 6px; background: var(--bg-2); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); font-size: var(--fs-sm, 11.5px); color: var(--text); }
.mg-pop .input, .mg-pop .textarea { width: 100%; }
.mg-pop .mg-options { overflow: auto; min-height: 0; display: flex; flex-direction: column; }
.mg-pop .mg-option { flex: none; display: flex; align-items: center; gap: 8px; height: 22px; padding: 0 8px; border: 0; background: none; color: var(--text); text-align: left; cursor: pointer; border-radius: 2px; font: inherit; white-space: nowrap; overflow: hidden; }
.mg-pop .mg-option .grow { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.mg-pop .mg-option .hint { flex: none; }
.mg-pop .mg-option:hover, .mg-pop .mg-option.active { background: var(--bg-4); }
.mg-pop .mg-option.current { color: var(--gold-hi); }
.mg-pop .mg-option.disabled { color: var(--text-faint); }
.mg-pop .mg-option.group { color: var(--text-faint); text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.06em; pointer-events: none; margin-top: 4px; height: 18px; }
.mg-pop .mg-option .mg-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; border: 1px solid rgba(0,0,0,0.5); }
.mg-pop .mg-pop-foot { display: flex; gap: 6px; align-items: center; border-top: 1px solid var(--border); padding-top: 6px; }
.mg-pop .mg-pop-foot .grow { flex: 1; }
.mg-pop .mg-codes { display: flex; flex-wrap: wrap; gap: 3px; }
.mg-pop .mg-code { width: 18px; height: 18px; border-radius: 2px; border: 1px solid var(--border-strong); cursor: pointer; padding: 0; font-size: 9px; }
.mg-pop.menu { gap: 0; max-height: calc(100vh - 16px); overflow-y: auto; }
.mg-pop .mg-menu-item { flex: none; display: flex; align-items: center; gap: 8px; height: 24px; padding: 0 10px; border: 0; background: none; color: var(--text); text-align: left; cursor: pointer; border-radius: 2px; font: inherit; white-space: nowrap; overflow: hidden; }
.mg-pop .mg-menu-item .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.mg-pop .mg-menu-item:hover { background: var(--sel); color: #fff; }
.mg-pop .mg-menu-item .shortcut { flex: none; margin-left: auto; padding-left: 20px; color: var(--text-faint); font-size: var(--fs-xs); }
.mg-pop .mg-menu-item:hover .shortcut { color: rgba(255,255,255,0.7); }
.mg-pop .mg-menu-item[disabled] { color: var(--text-faint); pointer-events: none; }
.mg-pop .mg-menu-sep { height: 1px; background: var(--border); margin: 3px 0; }
.mg-pop .mg-hit-group { margin-left: auto; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
.mg-pop .mg-hit-group.eud { color: var(--teal); }
`;
