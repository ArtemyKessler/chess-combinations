import json,sys,collections,statistics as st
G=[json.loads(l) for f in sys.argv[1:] for l in open(f) if l.strip()]
if not G: sys.exit()
print('games',len(G),'| bots',collections.Counter((g['wBot'],g['bBot']) for g in G))
print('winner',collections.Counter(g['winner'] for g in G),'reason',collections.Counter(g['reason'] for g in G))
print('plies median',st.median(g['plies'] for g in G),'mean',round(st.mean(g['plies'] for g in G)))
print('score mean w/b',round(st.mean(g['score']['w'] for g in G),1),round(st.mean(g['score']['b'] for g in G),1))
cash=collections.Counter(c['pid'] for g in G for c in g['stats']['cash']);kc=sum(c['king'] for g in G for c in g['stats']['cash'])
print('cashes',sum(cash.values()),dict(cash.most_common()),'with king',kc)
print('pts by pattern',{k:sum(c['pts'] for g in G for c in g['stats']['cash'] if c['pid']==k) for k in cash})
print('captures/game',round(st.mean(g['stats']['captures']['w']+g['stats']['captures']['b'] for g in G),1),'places/game',round(st.mean(g['stats']['places']['w']+g['stats']['places']['b'] for g in G),1),'broken/game',round(st.mean(g['stats']['broken']['w']+g['stats']['broken']['b'] for g in G),2),'promos',sum(g['stats']['promos'] for g in G))
print('first cash ply median',st.median([min([c['ply'] for c in g['stats']['cash']] or [999]) for g in G]))
print('king out share',round(st.mean(g['kingOut']['w'] for g in G),2),round(st.mean(g['kingOut']['b'] for g in G),2))
print('captured types',dict(sum((collections.Counter(g['stats']['capturedTypes']) for g in G),collections.Counter())))
