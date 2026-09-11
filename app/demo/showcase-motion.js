/* Deterministic native playback; all displayed speeches come from the saved capture. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PhiloShowcaseMotion=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  const smooth=v=>{const p=clamp(v);return p*p*(3-2*p);};
  const HOLD_MS=2000,FADE_MS=500,SLOT_MS=HOLD_MS+FADE_MS,ROUND_INTRO_MS=5000;
  function timeline(data){
    const deepEnd=data.people.length*HOLD_MS+Math.max(0,data.people.length-1)*FADE_MS;
    let cursor=deepEnd+ROUND_INTRO_MS;
    const turns=data.capture.turns.map(turn=>{
      const duration=Math.max(3000,Array.from(turn.text).length/85*1000),start=cursor;
      cursor+=duration+1600;return {start,end:start+duration,holdEnd:cursor};
    });
    return {deepEnd,turns,end:turns.at(-1)?.end??cursor};
  }
  function pose(time,data,plan){
    const t=Math.max(0,time);
    if(t<plan.deepEnd){
      const index=Math.min(data.people.length-1,Math.floor(t/SLOT_MS)),local=t%SLOT_MS;
      const blending=local>=HOLD_MS&&index<data.people.length-1;
      return {mode:'deep',index:blending?index+1:index,fadeFrom:blending?index:-1,
        fade:blending?smooth((local-HOLD_MS)/FADE_MS):1,phase:'opening',local};
    }
    const local=t-plan.deepEnd;
    if(local<ROUND_INTRO_MS)return {mode:'roundtable',phase:'intro',promptProgress:clamp((local-1300)/2200),
      fadeFrom:local<FADE_MS?data.people.length-1:-1,fade:smooth(local/FADE_MS),local};
    if(t<plan.end){
      const index=plan.turns.findIndex(turn=>t<turn.holdEnd),turn=plan.turns[index];
      return {mode:'roundtable',phase:'speaking',index,progress:clamp((t-turn.start)/(turn.end-turn.start)),local};
    }
    return {mode:'roundtable',phase:'complete',complete:true,local};
  }
  return {HOLD_MS,FADE_MS,SLOT_MS,ROUND_INTRO_MS,clamp,smooth,timeline,pose};
});
