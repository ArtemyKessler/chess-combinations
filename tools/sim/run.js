'use strict';
// usage: node run.js <wBot> <bBot> <games> <seed0> [rulesJSON]  -> prints JSON lines per game
const E = require('./engine.js'), { BOTS, playGame } = require('./bots.js');
const [wB, bB, n, s0, rj] = process.argv.slice(2);
const over = rj ? JSON.parse(rj) : {};
if (over.catalogPts) { over.catalog = E.BASE_CATALOG.map(p => Object.assign({}, p, over.catalogPts[p.id] || {})); delete over.catalogPts; }
if (over.dropPatterns) { over.catalog = (over.catalog || E.BASE_CATALOG).filter(p => !over.dropPatterns.includes(p.id)); delete over.dropPatterns; }
const R = E.makeRules(over);
for (let i = 0; i < +n; i++) {
  const t0 = Date.now(); const g = playGame(R, BOTS[wB], BOTS[bB], (+s0) + i * 7919);
  g.ms = Date.now() - t0; g.wBot = wB; g.bBot = bB; console.log(JSON.stringify(g));
}
