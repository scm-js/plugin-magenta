/** The panel's stylesheet, scoped under `.mg`; colours and sizes are the editor's tokens. */
export const STYLE = `
.mg { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 8px; font-size: var(--fs-sm, 11.5px); }
.mg .mg-head { display: flex; align-items: center; gap: 6px; }
.mg .mg-head .input { flex: 1; min-width: 80px; }
.mg .mg-split { display: flex; flex: 1; min-height: 0; gap: 10px; }
.mg .mg-list { width: 240px; flex: none; display: flex; flex-direction: column; min-height: 0; background: var(--bg-0); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--bevel-sunken); overflow: auto; outline: none; }
.mg.narrow .mg-list { width: 150px; }
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

.mg .mg-add { display: flex; align-items: center; gap: 6px; padding: 2px 6px; }
.mg .mg-add .input { flex: 1; height: 24px; }
.mg .mg-note { color: var(--text-dim); font-size: var(--fs-xs); padding: 2px 6px; }
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
