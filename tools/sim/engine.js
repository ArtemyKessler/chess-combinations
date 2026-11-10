// Headless engine for Chess Combinations v0.3 (rule variants via makeRules options). Board r=0 is rank 8 (black side), as in index.html.
'use strict';
const opp = c => c === 'w' ? 'b' : 'w';
const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const isHome = (col, r) => col === 'w' ? r >= 6 : r <= 1;
const lastRow = col => col === 'w' ? 0 : 7;
const pawnRow = col => col === 'w' ? 6 : 1;

const BASE_CATALOG = [
  { id: 'zastava', rows: ['.N.', 'P.P'], pts: 1, ptsK: 3 },
  { id: 'falanga', rows: ['PPPP'], pts: 3, ptsK: 6 },
  { id: 'pushka', rows: ['R', 'R', 'Q'], pts: 3, ptsK: 5 },
  { id: 'bastion', rows: ['.N.', 'PRP'], pts: 4, ptsK: 6 },
  { id: 'parad', rows: ['RNBQ'], pts: 4, ptsK: 6 },
  { id: 'brigada', rows: ['NN', 'BB'], pts: 5, ptsK: 8 },
  { id: 'stena', rows: ['PPPPPP'], pts: 7, ptsK: 10 },
  { id: 'tsep', rows: ['...P', '..P.', '.P..', 'P...'], pts: 5, ptsK: 8 },
  { id: 'polk', rows: ['NN', 'BB', 'RR'], pts: 11, ptsK: 14 },
  { id: 'kare', rows: ['***', '*o*', '***'], pts: 12, ptsK: 16 },
];
function variants(rows) {
  const base = []; rows.forEach((row, i) => [...row].forEach((ch, j) => { if (ch !== '.') base.push([i, j, ch]); }));
  const T = [(a, b) => [a, b], (a, b) => [a, -b], (a, b) => [-a, b], (a, b) => [-a, -b], (a, b) => [b, a], (a, b) => [b, -a], (a, b) => [-b, a], (a, b) => [-b, -a]];
  const seen = new Set(), out = [];
  for (const f of T) {
    let c = base.map(([a, b, ch]) => { const [x, y] = f(a, b); return [x, y, ch]; });
    const mr = Math.min(...c.map(p => p[0])), mc = Math.min(...c.map(p => p[1]));
    c = c.map(([a, b, ch]) => [a - mr, b - mc, ch]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const k = JSON.stringify(c); if (!seen.has(k)) { seen.add(k); out.push(c); }
  }
  return out;
}

function makeRules(over = {}) {
  const R = Object.assign({
    target: 15, guard: true, kingImmune: true, kingBonus: true, rotations: true,
    catalog: BASE_CATALOG, maxPlies: 300,
  }, over);
  R.catalog = R.catalog.map(p => {
    const vars = R.rotations === false || (Array.isArray(R.rotations) && R.rotations.includes(p.id)) ? null : variants(p.rows);
    return Object.assign({}, p, { vars: vars || orientedVars(p.rows), n: p.rows.join('').replace(/[.o]/g, '').length });
  });
  // placements per pattern (all offsets)
  R.placements = R.catalog.map(p => {
    const out = [];
    for (const v of p.vars) {
      const h = Math.max(...v.map(x => x[0])) + 1, w = Math.max(...v.map(x => x[1])) + 1;
      for (let r0 = 0; r0 + h <= 8; r0++) for (let c0 = 0; c0 + w <= 8; c0++) out.push(v.map(([a, b, ch]) => [r0 + a, c0 + b, ch]));
    }
    return out;
  });
  return R;
}
// Without free rotation: pattern as written is from white's view (first row farthest); mirror left-right allowed; black uses vertical flip.
function orientedVars(rows) {
  const base = []; rows.forEach((row, i) => [...row].forEach((ch, j) => { if (ch !== '.') base.push([i, j, ch]); }));
  const w = Math.max(...rows.map(r => r.length)) - 1;
  const a = base.map(x => x.slice()), b = base.map(([i, j, ch]) => [i, w - j, ch]);
  const out = [], seen = new Set();
  for (const c of [a, b]) { const s = c.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]); const k = JSON.stringify(s); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  out.oriented = true; return out;
}

function mk(t, c, r, f, moved = false) { const p = { t, c, moved }; if (t === 'B') p.lt = (r + f) % 2 === 0; return p; }
function initState() {
  const B = Array.from({ length: 8 }, () => Array(8).fill(null)), back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) { B[0][f] = mk(back[f], 'b', 0, f); B[1][f] = mk('P', 'b', 1, f); B[6][f] = mk('P', 'w', 6, f); B[7][f] = mk(back[f], 'w', 7, f); }
  return { board: B, reserve: { w: [], b: [] }, score: { w: 0, b: 0 }, turn: 'w', ep: null, finalFor: null, over: null, ply: 0, stats: newStats() };
}
function newStats() { return { cash: [], captures: { w: 0, b: 0 }, capturedTypes: {}, places: { w: 0, b: 0 }, promos: 0, broken: { w: 0, b: 0 }, kingBlocks: 0 }; }
function cloneState(S) {
  return { board: S.board.map(r => r.slice()), reserve: { w: S.reserve.w.slice(), b: S.reserve.b.slice() }, score: { ...S.score }, turn: S.turn, ep: S.ep, finalFor: S.finalFor, over: S.over, ply: S.ply, stats: S.stats };
}


function attacked(S, r, c, col) {
  const B = S.board;
  const d = col === 'w' ? 1 : -1; // white pawn at r+1 attacks r
  for (const dc of [-1, 1]) { const x = r + d, y = c + dc; if (inB(x, y)) { const q = B[x][y]; if (q && q.c === col && q.t === 'P') return true; } }
  for (const [a, b] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const x = r + a, y = c + b; if (inB(x, y)) { const q = B[x][y]; if (q && q.c === col && q.t === 'N') return true; } }
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { if (!a && !b) continue; const x = r + a, y = c + b; if (inB(x, y)) { const q = B[x][y]; if (q && q.c === col && q.t === 'K') return true; } }
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { let x = r + a, y = c + b; const diag = a && b;
    while (inB(x, y)) { const q = B[x][y]; if (q) { if (q.c === col && (q.t === 'Q' || (diag ? q.t === 'B' : q.t === 'R'))) return true; break; } x += a; y += b; } }
  return false;
}
function canKnock(S, t, tr, tc, R) {
  if (R.kingImmune && t.t === 'K') return false;
  if (R.guard && attacked(S, tr, tc, t.c)) return false;
  return true;
}
function genMoves(S, r, c, R) {
  const B = S.board, p = B[r][c], res = [];
  const land = (tr, tc) => { if (!inB(tr, tc)) return false; const t = B[tr][tc];
    if (!t) { res.push({ fr: r, fc: c, r: tr, c: tc }); return true; }
    if (t.c !== p.c && canKnock(S, t, tr, tc, R)) res.push({ fr: r, fc: c, r: tr, c: tc, cap: true }); return false; };
  const slide = ds => ds.forEach(([dr, dc]) => { let tr = r + dr, tc = c + dc; while (land(tr, tc)) { tr += dr; tc += dc; } });
  const step = ds => ds.forEach(([dr, dc]) => land(r + dr, c + dc));
  const O = [[1, 0], [-1, 0], [0, 1], [0, -1]], D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  switch (p.t) {
    case 'R': slide(O); break; case 'B': slide(D); break; case 'Q': slide(O.concat(D)); break;
    case 'N': step([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]); break;
    case 'K': { step(O.concat(D)); const hr = p.c === 'w' ? 7 : 0;
      if (!p.moved && r === hr && c === 4) {
        const rk = B[hr][7]; if (rk && rk.t === 'R' && rk.c === p.c && !rk.moved && !B[hr][5] && !B[hr][6]) res.push({ fr: r, fc: c, r: hr, c: 6, castle: { from: 7, to: 5 } });
        const rq = B[hr][0]; if (rq && rq.t === 'R' && rq.c === p.c && !rq.moved && !B[hr][1] && !B[hr][2] && !B[hr][3]) res.push({ fr: r, fc: c, r: hr, c: 2, castle: { from: 0, to: 3 } });
      } break; }
    case 'P': { const d = p.c === 'w' ? -1 : 1;
      if (inB(r + d, c) && !B[r + d][c]) { res.push({ fr: r, fc: c, r: r + d, c }); if (r === pawnRow(p.c) && !B[r + 2 * d][c]) res.push({ fr: r, fc: c, r: r + 2 * d, c, dbl: true }); }
      for (const dc of [-1, 1]) { const tr = r + d, tc = c + dc; if (!inB(tr, tc)) continue; const t = B[tr][tc];
        if (t && t.c !== p.c && canKnock(S, t, tr, tc, R)) res.push({ fr: r, fc: c, r: tr, c: tc, cap: true });
        if (!t && S.ep && S.ep.r === tr && S.ep.c === tc) { const v = B[r][tc]; if (v && v.t === 'P' && v.c !== p.c) res.push({ fr: r, fc: c, r: tr, c: tc, ep: { r, c: tc } }); } }
      break; }
  }
  return res;
}
// Squares a side attacks (could knock a piece standing there next move).
function attackMap(S, col, R) {
  const A = new Uint8Array(64), B = S.board;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = B[r][c]; if (!p || p.c !== col) continue;
    if (p.t === 'P') { const d = col === 'w' ? -1 : 1; for (const dc of [-1, 1]) if (inB(r + d, c + dc)) A[(r + d) * 8 + c + dc] = 1; continue; }
    for (const m of genMoves(S, r, c, Object.assign({}, R, { kingImmune: false, guard: false }))) if (!m.castle) A[m.r * 8 + m.c] = 1;
  }
  return A;
}
function placeTargets(S, col, o) {
  const rows = o.t === 'P' ? [pawnRow(col)] : (col === 'w' ? [6, 7] : [0, 1]), out = [];
  for (const r of rows) for (let c = 0; c < 8; c++) { if (S.board[r][c]) continue; if (o.t === 'B' && ((r + c) % 2 === 0) !== o.lt) continue; out.push({ r, c }); }
  return out;
}
function toReserve(S, t) { const o = { t: t.t, c: t.c }; if (t.t === 'B') o.lt = t.lt; S.reserve[t.c].push(o); }

// All legal actions for side to move (no cashing). Promotion choice is folded into the move.
function actions(S, R) {
  const col = S.turn, out = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = S.board[r][c]; if (!p || p.c !== col) continue;
    for (const m of genMoves(S, r, c, R)) {
      if (p.t === 'P' && m.r === lastRow(col)) {
        const kinds = [...new Set(S.reserve[col].filter(x => x.t !== 'P').map(x => x.t + (x.t === 'B' ? (x.lt ? 'l' : 'd') : '')))];
        if (kinds.length) kinds.forEach(k => out.push(Object.assign({ type: 'move', promo: k }, m)));
        out.push(Object.assign({ type: 'move' }, m));
      } else out.push(Object.assign({ type: 'move' }, m));
    }
    if (p.t === 'P' && r === lastRow(col)) {
      const kinds = [...new Set(S.reserve[col].filter(x => x.t !== 'P').map(x => x.t + (x.t === 'B' ? (x.lt ? 'l' : 'd') : '')))];
      kinds.forEach(k => out.push({ type: 'latepromo', r, c, promo: k }));
    }
  }
  const seenKinds = new Set();
  S.reserve[col].forEach((o, i) => { const k = o.t + (o.t === 'B' ? (o.lt ? 'l' : 'd') : ''); if (seenKinds.has(k)) return; seenKinds.add(k);
    for (const t of placeTargets(S, col, o)) out.push({ type: 'place', i, r: t.r, c: t.c }); });
  return out;
}
function doPromo(S, r, c, kind) {
  const col = S.turn, i = S.reserve[col].findIndex(x => x.t + (x.t === 'B' ? (x.lt ? 'l' : 'd') : '') === kind);
  const o = S.reserve[col].splice(i, 1)[0]; toReserve(S, S.board[r][c]);
  const p = { t: o.t, c: col, moved: true }; if (o.t === 'B') p.lt = (r + c) % 2 === 0; S.board[r][c] = p; S.stats.promos++;
}
function applyAction(S, a, R, track = true) {
  const B = S.board, col = S.turn;
  if (a.type === 'move') {
    const p = Object.assign({}, B[a.fr][a.fc]);
    if (a.cap) { const t = B[a.r][a.c]; toReserve(S, t); if (track) { S.stats.captures[col]++; S.stats.capturedTypes[t.t] = (S.stats.capturedTypes[t.t] || 0) + 1; } }
    if (a.ep) { toReserve(S, B[a.ep.r][a.ep.c]); B[a.ep.r][a.ep.c] = null; if (track) S.stats.captures[col]++; }
    B[a.r][a.c] = p; B[a.fr][a.fc] = null; p.moved = true;
    if (R.bump && (a.cap || a.ep)) { toReserve(S, p); B[a.r][a.c] = null; }
    if (a.castle) { const rk = Object.assign({}, B[a.fr][a.castle.from]); B[a.fr][a.castle.to] = rk; B[a.fr][a.castle.from] = null; rk.moved = true; }
    S.ep = a.dbl ? { r: (a.fr + a.r) / 2, c: a.fc } : null;
    if (a.promo && B[a.r][a.c]) doPromo(S, a.r, a.c, a.promo);
  } else if (a.type === 'place') {
    const o = S.reserve[col].splice(a.i, 1)[0]; const p = { t: o.t, c: col, moved: o.t !== 'P' }; if (o.t === 'B') p.lt = o.lt;
    B[a.r][a.c] = p; S.ep = null; if (track) S.stats.places[col]++;
  } else if (a.type === 'latepromo') { doPromo(S, a.r, a.c, a.promo); S.ep = null; }
}
function endTurn(S) {
  S.ply++;
  if (S.finalFor === S.turn) { const w = S.score.w, b = S.score.b; S.over = { winner: w > b ? 'w' : b > w ? 'b' : null, reason: 'score' }; return; }
  S.turn = opp(S.turn);
}

/* Analysis: complete combos (with king bonus, dominance filter) and partial progress per pattern. */
function analyze(S, col, R, wantPartial = true) {
  const B = S.board, found = new Map(), best = new Float64Array(R.catalog.length);
  const flip = col === 'b';
  R.catalog.forEach((p, pi) => {
    for (const pl of R.placements[pi]) {
      let filled = 0, blocked = false; const cells = [];
      if (p.vars.oriented && flip) { /* handled by mapping rows */ }
      for (let k = 0; k < pl.length; k++) {
        let [r, c, ch] = pl[k]; if (p.vars.oriented && flip) r = 7 - r;
        if (isHome(col, r)) { blocked = true; break; }
        const q = B[r][c];
        if (ch === 'o') { if (q && q.c !== col) { blocked = true; break; } if (!q) filled++; continue; }
        if (!q) continue;
        if (q.c !== col) { blocked = true; break; }
        if (q.t === 'K') continue; // own king in slot: movable, not filled
        if (ch === '*' || q.t === ch) { filled++; cells.push([r, c]); }
      }
      if (blocked) continue;
      const frac = filled / pl.length;
      if (frac === 1) {
        const key = p.id + ':' + cells.map(([r, c]) => r * 8 + c).sort((a, b) => a - b).join(',');
        if (found.has(key)) continue;
        const inSet = new Set(pl.map(([r, c]) => ((p.vars.oriented && flip) ? 7 - r : r) * 8 + c)); let king = null;
        if (R.kingBonus) for (const [r, c] of cells) { for (let dr = -1; dr <= 1 && !king; dr++) for (let dc = -1; dc <= 1 && !king; dc++) { const x = r + dr, y = c + dc;
          if (inB(x, y) && !inSet.has(x * 8 + y)) { const q = B[x][y]; if (q && q.c === col && q.t === 'K' && !isHome(col, x)) king = [x, y]; } } if (king) break; }
        found.set(key, { pid: p.id, cells, king, pts: king ? p.ptsK : p.pts, set: new Set(cells.map(([r, c]) => r * 8 + c)) });
      } else if (wantPartial && frac > best[pi]) best[pi] = frac;
    }
  });
  const list = [...found.values()];
  const combos = list.filter(a => !list.some(b => b !== a && b.set.size > a.set.size && [...a.set].every(k => b.set.has(k)))).sort((a, b) => b.pts - a.pts);
  return { combos, partial: best };
}

function cashCombo(S, g, R) {
  const cells = g.king ? g.cells.concat([g.king]) : g.cells;
  cells.forEach(([r, c]) => { toReserve(S, S.board[r][c]); S.board[r][c] = null; });
  S.score[S.turn] += g.pts; S.stats.cash.push({ col: S.turn, pid: g.pid, king: !!g.king, pts: g.pts, ply: S.ply });
  if (!S.finalFor && S.score[S.turn] >= R.target) S.finalFor = opp(S.turn);
}

module.exports = { attacked, makeRules, initState, cloneState, actions, applyAction, endTurn, analyze, attackMap, cashCombo, opp, isHome, BASE_CATALOG, genMoves };

/* ---- planning: empty-board move distances ---- */
const DIST = (() => {
  const D = {};
  const steps = (t, r, c) => { const out = [], add = (a, b) => { if (inB(a, b)) out.push(a * 8 + b); };
    const O = [[1, 0], [-1, 0], [0, 1], [0, -1]], Dg = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const slide = ds => ds.forEach(([dr, dc]) => { for (let k = 1; k < 8; k++) add(r + dr * k, c + dc * k); });
    if (t === 'R') slide(O); else if (t === 'B') slide(Dg); else if (t === 'Q') slide(O.concat(Dg));
    else if (t === 'N') [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].forEach(([a, b]) => add(r + a, c + b));
    else if (t === 'K') O.concat(Dg).forEach(([a, b]) => add(r + a, c + b));
    return out; };
  for (const t of 'RBQNK') { D[t] = []; for (let s = 0; s < 64; s++) { const d = new Uint8Array(64).fill(99); d[s] = 0; const q = [s];
    while (q.length) { const x = q.shift(); for (const y of steps(t, (x / 8) | 0, x % 8)) if (d[y] === 99) { d[y] = d[x] + 1; q.push(y); } } D[t][s] = d; } }
  return D;
})();
function pieceDist(t, col, r, c, tr, tc) {
  if (t === 'P') { if (tc !== c) return 99; const fwd = col === 'w' ? r - tr : tr - r; if (fwd < 0) return 99; if (fwd >= 2 && r === pawnRow(col)) return fwd - 1; return fwd; }
  return DIST[t][r * 8 + c][tr * 8 + tc];
}
function reserveDist(o, col, tr, tc) {
  if (o.t === 'P') return 1 + pieceDist('P', col, pawnRow(col), tc, tr, tc);
  let best = 99; const rows = col === 'w' ? [6, 7] : [0, 1];
  for (const r of rows) for (let c = 0; c < 8; c++) { if (o.t === 'B' && ((r + c) % 2 === 0) !== o.lt) continue; const d = DIST[o.t][r * 8 + c][tr * 8 + tc]; if (d < best) best = d; }
  return 1 + best;
}
// Best plan values: for each pattern, min estimated moves to complete (greedy assignment).
function planCosts(S, col, R) {
  const B = S.board, pcs = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = B[r][c]; if (p && p.c === col && p.t !== 'K') pcs.push({ t: p.t, r, c, lt: p.lt, res: false }); }
  S.reserve[col].forEach(o => pcs.push({ t: o.t, lt: o.lt, res: true, o }));
  const out = new Float64Array(R.catalog.length).fill(99);
  R.catalog.forEach((p, pi) => {
    let best = 99;
    for (const pl of R.placements[pi]) {
      let cost = 0, ok = true; const used = new Uint8Array(pcs.length);
      for (const [r0, c, ch] of pl) {
        const r = (p.vars.oriented && col === 'b') ? 7 - r0 : r0;
        if (isHome(col, r)) { ok = false; break; }
        const q = B[r][c];
        if (ch === 'o') { if (q) cost += q.c === col ? 1 : 2; continue; }
        if (q && q.c !== col) cost += q.t === 'K' && R.kingImmune ? 6 : 2; // enemy in slot: knock it first
        else if (q && q.c === col && (ch === '*' ? q.t !== 'K' : q.t === ch)) { // already right: claim it
          const k = pcs.findIndex((x, i) => !used[i] && !x.res && x.r === r && x.c === c); if (k >= 0) { used[k] = 1; continue; } }
        else if (q && q.c === col) cost += 1; // own wrong piece must step aside
        let bd = 99, bi = -1;
        for (let i = 0; i < pcs.length; i++) { if (used[i]) continue; const x = pcs[i];
          if (ch !== '*' && x.t !== ch) continue; if (ch === '*' && x.t === 'P' && false) continue;
          if (x.t === 'B' && ((r + c) % 2 === 0) !== x.lt) continue;
          const d = x.res ? reserveDist(x.o, col, r, c) : pieceDist(x.t, col, x.r, x.c, r, c);
          if (d < bd) { bd = d; bi = i; } }
        if (bi < 0 || bd >= 99) { ok = false; break; }
        used[bi] = 1; cost += bd; if (cost >= best) { ok = false; break; }
      }
      if (ok && cost < best) best = cost;
    }
    out[pi] = best;
  });
  return out;
}
module.exports.planCosts = planCosts;
