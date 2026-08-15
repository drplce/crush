// Single source of truth for the engine *model* used by the headless sims.
// Faithfully mirrors the shipped rotateOnce() in index.html (Engine v2):
//   - pace-relative fairness + tempered win weight (cap 0.6) + squared run-nudge (GK-as-rest) + gentle role balance
//   - minF floor: when short, exclude females from the off-list AND force a bench female in
//   - iterate the off-order until a candidate with a LEGAL replacement is found (never forces an illegal sub)
const clampV=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));

export function mkV2(roleW=0.25, runW=1.0){
  return function rule(ctx){
    const {st,cfg,now,totalGame,fair,fitFor,legal,onCourt,bench,slotZone}=ctx;
    const C=cfg.shiftSec, bias=cfg.bias??0.5, minF=cfg.minF||0;
    const elapsedFrac=now/totalGame;
    const zoneOf=k=>slotZone(k);
    const paceN=id=>clampV((fair*elapsedFrac-st[id].sec)/C, -2, 2);
    const w=0.4*Math.sqrt(clampV(bias,0,1));
    const fitGain=1+bias*0.3;
    const fitN=(p,z)=>((fitFor(p,z)-3)/2)*fitGain;
    const stamF=p=>1+(3-clampV((p&&p.rat&&p.rat.fit)||3,1,5))*0.15;
    const runN=id=>clampV(st[id].run/(C*3)*stamF(ctx.players.find(p=>p.id===id)),0,2);
    const ctN=id=>clampV((st[id].onCt||0)/(C*3)*stamF(ctx.players.find(p=>p.id===id)),0,2);   // unbroken on-court time (goal included)
    const minRest=Math.max(45,C);
    const zAcc=(id,z)=>st[id].z[z];
    const meanZ=z=>{ const all=ctx.players; let s=0; all.forEach(p=>s+=zAcc(p.id,z)); return s/(all.length||1); };
    const offScore=p=>{ const z=zoneOf(st[p.id].pos), r=runN(p.id), c=ctN(p.id); return (1-w)*(-paceN(p.id)) + w*(-fitN(p,z)) + runW*(r*r) + 0.8*(c*c); };
    const inScore=(b,z)=>{ const roleBal=(z==='def'||z==='att')?clampV((meanZ(z)-zAcc(b.id,z))/(C*2),-1,1):0; return (1-w)*paceN(b.id)+w*fitN(b,z)+roleW*roleBal; };

    const bp=bench(); if(!bp.length) return null;
    const femOn=()=>onCourt().filter(p=>p.sex==='f').length;
    const mustFixFem = minF>0 && femOn()<minF && bp.some(b=>b.sex==='f');
    let outs=onCourt().filter(p=>zoneOf(st[p.id].pos)!=='goal'||(st[p.id].onCt||0)>=C*3);
    if(mustFixFem) outs=outs.filter(p=>p.sex!=='f');
    if(!outs.length) return null;
    const offOrder=outs.slice().sort((a,b)=>offScore(b)-offScore(a)||st[b.id].run-st[a.id].run||a.id-b.id);
    for(const out of offOrder){ const z=zoneOf(st[out.id].pos);
      let pool=(mustFixFem?bp.filter(b=>b.sex==='f'):bp).filter(b=>legal(b,out));
      if(z==='goal'){ const ok=pool.filter(b=>b.gkOK!==false); pool=ok; }   // coming straight into goal — respect the opt-out
      if(!pool.length) continue;
      const rested=pool.filter(b=>st[b.id].rest>=minRest); if(rested.length)pool=rested;
      pool.sort((a,b)=>inScore(b,z)-inScore(a,z)||st[b.id].rest-st[a.id].rest||a.id-b.id);
      return {off:out.id, in:pool[0].id};
    }
    return null;
  };
}
