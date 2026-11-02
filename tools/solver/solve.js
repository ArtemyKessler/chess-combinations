// Minimal own-move count to build a pattern (opponent passive). Board y=0 is own back rank.
const PATS = require('./patterns.js');
const INF = 99;
const idx = (x, y) => y * 8 + x;

// ---- empty-board distances per type
function bfs(type, from) {
  const d = Array(64).fill(INF); d[from] = 0; const q = [from];
  while (q.length) { const s = q.shift(), x = s % 8, y = (s / 8) | 0;
    for (const t of stepsEmpty(type, x, y)) if (d[t] === INF) { d[t] = d[s] + 1; q.push(t); } }
  return d;
}
function stepsEmpty(type, x, y) {
  const out = [], add = (a, b) => { if (a >= 0 && a < 8 && b >= 0 && b < 8) out.push(idx(a, b)); };
  const O = [[1,0],[-1,0],[0,1],[0,-1]], D = [[1,1],[1,-1],[-1,1],[-1,-1]];
  const slide = ds => ds.forEach(([dx, dy]) => { for (let k = 1; k < 8; k++) add(x + dx*k, y + dy*k); });
  if (type === 'R') slide(O); else if (type === 'B') slide(D); else if (type === 'Q') slide(O.concat(D));
  else if (type === 'N') [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([a,b]) => add(x+a, y+b));
  else if (type === 'K') { O.concat(D).forEach(([a,b]) => add(x+a, y+b)); }
  else if (type === 'P') { add(x, y + 1); if (y === 1) add(x, y + 2); }
  return out;
}
const DIST = {}; for (const t of 'PNBRQK') { DIST[t] = []; for (let s = 0; s < 64; s++) DIST[t][s] = bfs(t, s); }
const ANY = ['N','B','R','Q','P'];

// ---- placements
function cellsOf(rows) {
  const h = rows.length, out = [];
  rows.forEach((row, i) => [...row].forEach((ch, x) => { if (ch !== '.') out.push({ x, y: h - 1 - i, ch }); }));
  return out;
}
function syms(cells) {
  const T = [(x,y)=>[x,y],(x,y)=>[-x,y],(x,y)=>[x,-y],(x,y)=>[-x,-y],(x,y)=>[y,x],(x,y)=>[-y,x],(x,y)=>[y,-x],(x,y)=>[-y,-x]];
  const seen = new Set(), res = [];
  for (const f of T) {
    let c = cells.map(p => { const [a, b] = f(p.x, p.y); return { x: a, y: b, ch: p.ch }; });
    const mx = Math.min(...c.map(p => p.x)), my = Math.min(...c.map(p => p.y));
    c = c.map(p => ({ x: p.x - mx, y: p.y - my, ch: p.ch })).sort((a, b) => a.x - b.x || a.y - b.y);
    const k = JSON.stringify(c); if (!seen.has(k)) { seen.add(k); res.push(c); }
  }
  return res;
}
function placements(rows, minY = 2) {
  const out = [];
  for (const s of syms(cellsOf(rows))) {
    const w = Math.max(...s.map(p => p.x)) + 1, h = Math.max(...s.map(p => p.y)) + 1;
    for (let ox = 0; ox + w <= 8; ox++) for (let oy = minY; oy + h <= 8; oy++)
      out.push(s.map(p => ({ s: idx(p.x + ox, p.y + oy), ch: p.ch })));
  }
  return out;
}

// ---- Hungarian (min-cost assignment, rows <= cols)
function hungarian(a) {
  const n = a.length, m = a[0].length, u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) { p[0] = i; let j0 = 0; const minv = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
    do { used[j0] = true; const i0 = p[j0]; let d = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]) { const cur = a[i0-1][j-1] - u[i0] - v[j]; if (cur < minv[j]) { minv[j] = cur; way[j] = j0; } if (minv[j] < d) { d = minv[j]; j1 = j; } }
      for (let j = 0; j <= m; j++) if (used[j]) { u[p[j]] += d; v[j] -= d; } else minv[j] -= d; j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  let cost = 0; for (let j = 1; j <= m; j++) if (p[j]) cost += a[p[j]-1][j-1]; return cost;
}

// pieces: [{t, s}] ; returns lower bound cost to fill placement
function placeCost(pl, pieces, withKing) {
  let total = 0;
  const groups = {};
  const anyCells = [];
  for (const c of pl) { if (c.ch === 'o') continue; if (c.ch === '*') anyCells.push(c.s); else (groups[c.ch] = groups[c.ch] || []).push(c.s); }
  const used = []; // only typed groups; '*' handled with all non-king pieces (rough but admissible-ish when no overlap)
  if (anyCells.length) {
    const cand = pieces.filter(p => p.t !== 'K');
    if (cand.length < anyCells.length) return INF;
    const m = anyCells.map(s => cand.map(p => DIST[p.t][p.s][s]));
    total += hungarian(m);
  }
  for (const t in groups) {
    const cand = pieces.filter(p => p.t === t), cells = groups[t];
    if (cand.length < cells.length) return INF;
    const m = cells.map(s => cand.map(p => DIST[t][p.s][s]));
    total += hungarian(m);
    if (total >= INF) return INF;
  }
  for (const c of pl) if (c.ch === 'o' && pieces.some(p => p.s === c.s)) total += 1;
  if (withKing) {
    const k = pieces.find(p => p.t === 'K'); let best = INF;
    const cs = new Set(pl.map(c => c.s));
    for (const c of pl) { if (c.ch === 'o') continue; const x = c.s % 8, y = (c.s / 8) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = x + dx, b = y + dy;
        if ((dx || dy) && a >= 0 && a < 8 && b >= 2 && b < 8 && !cs.has(idx(a, b))) best = Math.min(best, DIST.K[k.s][idx(a, b)]); } }
    total += best;
  }
  return total >= INF ? INF : total;
}

function goalMet(pl, occ, withKing) {
  for (const c of pl) { const p = occ[c.s];
    if (c.ch === 'o') { if (p) return false; continue; }
    if (!p) return false; if (c.ch === '*') { if (p === 'K') return false; } else if (p !== c.ch) return false; }
  if (withKing) { const cs = new Set(pl.map(c => c.s));
    for (const c of pl) { if (c.ch === 'o') continue; const x = c.s % 8, y = (c.s / 8) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = x + dx, b = y + dy;
        if ((dx || dy) && a >= 0 && a < 8 && b >= 2 && b < 8 && !cs.has(idx(a, b)) && occ[idx(a, b)] === 'K') return true; } }
    return false; }
  return true;
}

// ---- real move generation (own pieces only; enemy squares fixed, blocking)
function genMoves(pieces, enemy) {
  const occ = Array(64).fill(null); pieces.forEach(p => occ[p.s] = p.t);
  const out = [];
  pieces.forEach((p, i) => { const x = p.s % 8, y = (p.s / 8) | 0;
    const free = (a, b) => a >= 0 && a < 8 && b >= 0 && b < 8 && !occ[idx(a,b)] && !enemy[idx(a,b)];
    const add = (a, b) => out.push([i, idx(a, b)]);
    const slide = ds => ds.forEach(([dx, dy]) => { let a = x + dx, b = y + dy; while (free(a, b)) { add(a, b); a += dx; b += dy; } });
    const O = [[1,0],[-1,0],[0,1],[0,-1]], D = [[1,1],[1,-1],[-1,1],[-1,-1]];
    if (p.t === 'R') slide(O); else if (p.t === 'B') slide(D); else if (p.t === 'Q') slide(O.concat(D));
    else if (p.t === 'N') [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([a,b]) => { if (free(x+a, y+b)) add(x+a, y+b); });
    else if (p.t === 'K') O.concat(D).forEach(([a,b]) => { if (free(x+a, y+b)) add(x+a, y+b); });
    else if (p.t === 'P') { if (free(x, y+1)) { add(x, y+1); if (y === 1 && free(x, y+2)) add(x, y+2); } }
  });
  return out;
}

class Heap { constructor() { this.a = []; } push(v) { const a = this.a; a.push(v); let i = a.length - 1; while (i) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2*i+1, r = l+1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } } return top; }
  get size() { return this.a.length; } }

function startPieces() {
  const back = 'RNBQKBNR', ps = [];
  for (let x = 0; x < 8; x++) { ps.push({ t: back[x], s: idx(x, 0) }); ps.push({ t: 'P', s: idx(x, 1) }); }
  return ps;
}
function startEnemy() { const e = Array(64).fill(false); for (let x = 0; x < 8; x++) { e[idx(x, 6)] = true; e[idx(x, 7)] = true; } return e; }

function solve(rows, withKing, limit = 400000) {
  const pls = placements(rows);
  const enemy = startEnemy();
  const h = ps => { let b = INF; for (const pl of pls) { const c = placeCost(pl, ps, withKing); if (c < b) b = c; } return b; };
  const key = ps => ps.map(p => p.t + p.s).sort().join(',');
  const s0 = startPieces();
  const heap = new Heap(), best = new Map();
  heap.push([h(s0), 0, s0]); best.set(key(s0), 0);
  let n = 0;
  while (heap.size) {
    const [f, g, ps] = heap.pop(); if (best.get(key(ps)) < g) continue;
    const occ = Array(64).fill(null); ps.forEach(p => occ[p.s] = p.t);
    if (pls.some(pl => goalMet(pl, occ, withKing))) return { T: g, nodes: n };
    if (++n > limit) return { T: null, lb: f, nodes: n };
    for (const [i, to] of genMoves(ps, enemy)) {
      const nps = ps.map((p, j) => j === i ? { t: p.t, s: to } : p), k = key(nps), ng = g + 1;
      if (best.has(k) && best.get(k) <= ng) continue; best.set(k, ng);
      const hv = h(nps); if (hv >= INF) continue; heap.push([ng + hv, ng, nps]);
    }
  }
  return { T: null };
}

// Mid-game metric: all pattern pieces start in reserve, board otherwise empty.
// cost = n placements + moves from best home square (y 0..1; pawn y=1; bishop by colour, both colours available)
function reserveCost(rows, withKing) {
  let best = INF;
  for (const pl of placements(rows)) {
    let c = 0;
    for (const cell of pl) { if (cell.ch === 'o') continue;
      const types = cell.ch === '*' ? ANY : [cell.ch];
      let m = INF;
      for (const t of types) for (let s = 0; s < 16; s++) { if (t === 'P' && s < 8) continue; m = Math.min(m, 1 + DIST[t][s][cell.s]); }
      c += m; }
    if (withKing) { const cs = new Set(pl.map(q => q.s)); let km = INF;
      for (const cell of pl) { const x = cell.s % 8, y = (cell.s / 8) | 0;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = x + dx, b = y + dy;
          if ((dx || dy) && a >= 0 && a < 8 && b >= 2 && b < 8 && !cs.has(idx(a, b))) for (let s = 0; s < 16; s++) km = Math.min(km, 1 + DIST.K[s][idx(a, b)]); } }
      c += km; }
    best = Math.min(best, c);
  }
  return best;
}

module.exports = { solve, reserveCost, PATS };
if (require.main === module) {
  const only = process.argv[2];
  for (const [id, p] of Object.entries(PATS)) {
    if (only && id !== only) continue;
    const n = p.rows.join('').replace(/[.o]/g, '').length;
    const t0 = Date.now(), a = solve(p.rows, false), b = solve(p.rows, true);
    console.log(JSON.stringify({ id, name: p.name, n, T: a.T, Tk: b.T, R: reserveCost(p.rows, false), Rk: reserveCost(p.rows, true), nodes: [a.nodes, b.nodes], ms: Date.now() - t0 }));
  }
}
