'use strict';
const E = require('./engine.js');
const UPGRADE = { zastava: 'bastion', falanga: 'stena', brigada: 'polk' };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

let CUR = null; // {S,R,me}
function attackedCells(g, att) { return g.cells.some(([r, c]) => att[r * 8 + c] && !(CUR && CUR.R.guard && E.attacked(CUR.S, r, c, CUR.me))); }
function disjointTotal(combos) { const used = new Set(); let t = 0;
  for (const g of combos) { const cells = g.king ? g.cells.concat([g.king]) : g.cells; if (cells.some(([r, c]) => used.has(r * 8 + c))) continue; cells.forEach(([r, c]) => used.add(r * 8 + c)); t += g.pts; }
  return t; }
function potential(R, partial) {
  const v = R.catalog.map((p, i) => p.pts * partial[i] * partial[i]).sort((a, b) => b - a);
  return v[0] + 0.5 * (v[1] || 0) + 0.25 * (v[2] || 0);
}

// Evaluate position after `me` has acted (opponent to move next).
function planValue(R, costs, g) {
  const v = R.catalog.map((p, i) => costs[i] >= 99 ? 0 : p.pts * Math.pow(g, costs[i])).sort((a, b) => b - a);
  return v[0] + 0.5 * (v[1] || 0);
}
function evaluate(S, me, R, W, ctx, a) {
  const op = E.opp(me);
  if (S.over) return S.over.winner === me ? 1e6 : S.over.winner === op ? -1e6 : 0;
  CUR = { S, R, me };
  const Am = E.analyze(S, me, R, false), Ao = E.analyze(S, op, R, false);
  const attO = E.attackMap(S, op, R);
  let myC = 0; const used = new Set();
  for (const g of Am.combos) { const cells = g.king ? g.cells.concat([g.king]) : g.cells; if (cells.some(([r, c]) => used.has(r * 8 + c))) continue; cells.forEach(([r, c]) => used.add(r * 8 + c));
    myC += g.pts * (attackedCells(g, attO) ? W.risk : W.safe); }
  const oppNext = disjointTotal(Ao.combos);
  const pm = planValue(R, E.planCosts(S, me, R), W.gamma);
  const po = (a && (a.cap || a.ep)) || !ctx ? planValue(R, E.planCosts(S, op, R), W.gamma) : ctx.oppPlan;
  let v = (S.score[me] - S.score[op]) + myC - W.oppNext * oppNext + W.pot * pm - W.potO * po - W.res * (S.reserve[me].length - S.reserve[op].length);
  if (S.score[op] + oppNext >= R.target && !S.finalFor) v -= W.danger;
  // king: exposure under the check rule, forward base under the banner rule
  const mk = E.kingPos(S, me), ok = E.kingPos(S, op);
  if (R.checkPts) {
    if (mk && attO[mk[0] * 8 + mk[1]] && E.canKnock(S, S.board[mk[0]][mk[1]], mk[0], mk[1], R)) v -= W.kingRisk * (R.checkPts + (R.banner ? 1.5 : 0.5));
    if (ok) { const attM = E.attackMap(S, me, R); if (attM[ok[0] * 8 + ok[1]] && E.canKnock(S, S.board[ok[0]][ok[1]], ok[0], ok[1], R)) v += W.kingThreat * R.checkPts; }
  }
  if (R.banner && mk) { const adv = me === 'w' ? 6 - mk[0] : mk[0] - 1; v += W.kingFwd * Math.max(0, Math.min(3, adv)); }
  return v;
}

function cashPolicy(S, R, bot) {
  const me = S.turn; let cashed = 0;
  for (let guard = 0; guard < 8; guard++) {
    const A = E.analyze(S, me, R, false); if (!A.combos.length) break;
    let pick = null;
    if (bot.cash === 'greedy') pick = A.combos[0];
    else {
      const att = E.attackMap(S, E.opp(me), R); CUR = { S, R, me };
      for (const g of A.combos) {
        if (S.score[me] + g.pts >= R.target) { pick = g; break; }
        if (attackedCells(g, att)) { pick = g; break; }
        if (UPGRADE[g.pid] && upgradeReady(S, me, R, g)) continue;
        if (!g.king && R.kingBonus && kingNear(S, me, g)) continue;
        pick = g; break;
      }
    }
    if (!pick) break;
    E.cashCombo(S, pick, R); cashed++;
  }
  return cashed;
}
function kingNear(S, me, g) {
  // own king outside home and 1 step from a free square adjacent to the combo
  let kr = -1, kc = -1; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = S.board[r][c]; if (p && p.c === me && p.t === 'K') { kr = r; kc = c; } }
  if (kr < 0) return false; const set = g.set;
  for (const [r, c] of g.cells) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const x = r + dr, y = c + dc;
    if (x < 0 || x > 7 || y < 0 || y > 7 || set.has(x * 8 + y) || S.board[x][y] || E.isHome(me, x)) continue;
    if (Math.max(Math.abs(x - kr), Math.abs(y - kc)) === 1) return true; }
  return false;
}
function upgradeReady(S, me, R, g) {
  const pi = R.catalog.findIndex(p => p.id === UPGRADE[g.pid]); if (pi < 0) return false;
  for (const pl of R.placements[pi]) {
    const sqs = pl.map(([r, c]) => r * 8 + c); if (![...g.set].every(k => sqs.includes(k))) continue;
    let missing = 0, bad = false;
    for (const [r, c, ch] of pl) { if (E.isHome(me, r)) { bad = true; break; } const q = S.board[r][c];
      if (q && q.c !== me) { bad = true; break; } if (!q || (ch !== '*' && q.t !== ch)) missing++; }
    if (!bad && missing === 1) return true;
  }
  return false;
}

function chooseAction(S, R, bot, rand) {
  const acts = E.actions(S, R); if (!acts.length) return null;
  if (bot.kind === 'random') return acts[Math.floor(rand() * acts.length)];
  const me = S.turn; let scored = [];
  const ctx = { oppPlan: planValue(R, E.planCosts(S, E.opp(me), R), bot.W.gamma) };
  for (const a of acts) { const T = E.cloneState(S); E.applyAction(T, a, R, false);
    // emulate end of turn for final-move rule
    if (T.finalFor === me) { const w = T.score.w, b = T.score.b; T.over = { winner: w > b ? 'w' : b > w ? 'b' : null }; }
    scored.push([evaluate(T, me, R, bot.W, ctx, a) + (rand() - 0.5) * bot.noise, a]); }
  scored.sort((x, y) => y[0] - x[0]);
  return scored[0][1];
}

const W_BASE = { risk: 0.25, safe: 0.85, oppNext: 1.0, pot: 0.8, potO: 0.6, res: 0.05, danger: 30, gamma: 0.7, kingRisk: 0.9, kingThreat: 0.3, kingFwd: 0.35 };
const BOTS = {
  random: { kind: 'random', cash: 'greedy' },
  greedy: { kind: 'heur', cash: 'greedy', W: W_BASE, noise: 0.3 },
  patient: { kind: 'heur', cash: 'patient', W: W_BASE, noise: 0.3 },
  defender: { kind: 'heur', cash: 'patient', W: Object.assign({}, W_BASE, { oppNext: 1.6, potO: 1.1, pot: 0.5 }), noise: 0.3 },
  builder: { kind: 'heur', cash: 'patient', W: Object.assign({}, W_BASE, { oppNext: 0.7, potO: 0.2, pot: 1.1 }), noise: 0.3 },
};

function playGame(R, wBot, bBot, seed) {
  const rand = rng(seed), S = E.initState(); const bots = { w: wBot, b: bBot };
  const lastCombos = { w: new Set(), b: new Set() }; const kingOut = { w: 0, b: 0 }; let turns = { w: 0, b: 0 };
  while (!S.over && S.ply < R.maxPlies) {
    const me = S.turn, bot = bots[me];
    // broken detection: combos I left last turn that no longer exist
    const now = new Set(E.analyze(S, me, R, false).combos.map(g => g.pid + ':' + [...g.set].sort().join(',')));
    S.stats.surv = S.stats.surv || {};
    for (const k of lastCombos[me]) { const pid = k.split(':')[0]; const o = S.stats.surv[pid] = S.stats.surv[pid] || [0, 0];
      o[0]++; if (now.has(k)) o[1]++; else S.stats.broken[me]++; }
    cashPolicy(S, R, bot);
    const a = chooseAction(S, R, bot, rand);
    if (a) E.applyAction(S, a, R, true);
    { const after = E.analyze(S, me, R, false).combos.map(g => g.pid + ':' + [...g.set].sort().join(',')); const prevNow = now; lastCombos[me] = new Set(after.filter(k => !prevNow.has(k) || true)); }
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = S.board[r][c]; if (p && p.c === me && p.t === 'K' && !E.isHome(me, r)) kingOut[me]++; }
    turns[me]++;
    E.endTurn(S);
  }
  if (!S.over) S.over = { winner: S.score.w > S.score.b ? 'w' : S.score.b > S.score.w ? 'b' : null, reason: 'cap' };
  return { winner: S.over.winner, reason: S.over.reason, plies: S.ply, score: S.score, stats: S.stats, kingOut: { w: kingOut.w / Math.max(1, turns.w), b: kingOut.b / Math.max(1, turns.b) } };
}

module.exports = { BOTS, playGame, W_BASE };
