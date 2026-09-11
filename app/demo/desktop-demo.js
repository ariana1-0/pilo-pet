/* Desktop vignette: the parent owns the clock, including cursor and click effects. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PhiloDesktopDemo=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DURATION=14500,SOURCE_AT=4800,PLAIN_AT=9000,EXPLAIN_AT=9650;
  const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{const p=clamp(n);return p*p*(3-2*p);};
  function pose(time){
    const t=Math.max(0,Math.min(DURATION,time)),complete=t>=DURATION;
    const phase=t<1600?'idle':t<SOURCE_AT?'quote':t<PLAIN_AT?'source':t<EXPLAIN_AT?'loading':'plain';
    const click= t>=SOURCE_AT&&t<SOURCE_AT+400?{target:'source',progress:(t-SOURCE_AT)/400}:
      t>=PLAIN_AT&&t<PLAIN_AT+400?{target:'plain',progress:(t-PLAIN_AT)/400}:null;
    const leg=t<7800?'source':'plain';
    return {phase,complete,bubble:smooth((t-1600)/400),source:smooth((t-SOURCE_AT)/300),
      cursor:smooth((t-3600)/250)*(1-smooth((t-10200)/450)),leg,
      travel:leg==='source'?smooth((t-3600)/1000):smooth((t-7800)/1050),click,
      row:phase==='idle'?0:phase==='plain'&&!complete?6:7,
      col:phase==='idle'||complete?0:Math.floor(t/(phase==='plain'?125:166))%6};
  }
  function create(doc,data){
    const $=s=>doc.querySelector(s),q=data.quote;
    const canvas=$('#pet-desktop-canvas'),area=$('#pet-computer-area'),computer=$('#pet-computer');
    let scale=1,designWidth=1000,designHeight=560,lastPhase='';
    $('#pet-quote-text').textContent=q.text;$('#pet-author').textContent='— '+q.author;
    $('#pet-source-locus').textContent=q.locus;$('#pet-source-original').textContent='“'+q.quote+'”';
    function resize(){
      const r=area.getBoundingClientRect(),narrow=r.width<620;
      designWidth=narrow?600:1000;designHeight=narrow?650:560;
      scale=Math.max(.1,Math.min((r.width-30)/designWidth,(r.height-42)/designHeight,1));
      computer.style.width=designWidth*scale+22+'px';
      $('#pet-desktop-screen').style.height=designHeight*scale+'px';
      canvas.style.width=designWidth+'px';canvas.style.height=designHeight+'px';canvas.style.transform=`scale(${scale})`;
      canvas.dataset.narrow=String(narrow);
    }
    function target(id){const a=$(id).getBoundingClientRect(),c=canvas.getBoundingClientRect();return {x:(a.left+a.width*.55-c.left)/scale,y:(a.top+a.height*.5-c.top)/scale};}
    function render(time,staticMode=false){
      const p=pose(staticMode?DURATION:time),plain=p.phase==='plain'||p.phase==='loading';
      const source=p.phase==='source';
      $('#pet-demo-bubble').style.opacity=String(p.bubble);
      $('#pet-demo-bubble').style.transform=`translateY(${(1-p.bubble)*12}px) scale(${.97+.03*p.bubble})`;
      $('#pet-demo-bubble').hidden=p.bubble===0;$('#pet-demo-actions').hidden=p.bubble===0;
      $('#pet-demo-actions').style.opacity=String(p.bubble);
      $('#pet-quote-text').hidden=plain;$('#pet-author').hidden=plain;$('#pet-plain-text').hidden=!plain;
      $('#pet-source-panel').hidden=!source;$('#pet-source-panel').style.opacity=String(p.source);
      $('#pet-plain-button').style.visibility=plain?'hidden':'visible';$('#pet-source-button').style.visibility=plain?'hidden':'visible';$('#pet-return-quote').hidden=!plain;
      if(p.phase!==lastPhase){
        $('#pet-plain-text').textContent=p.phase==='loading'?'我翻一下这张概念卡……':data.plain;
        $('#pet-demo-caption').textContent={idle:'安静待在一角，陪你做自己的事。',quote:'偶尔，一句哲人的话浮现。',source:'点开出处，原话和篇章都在。',loading:'把哲学家的话，放回今天的生活。',plain:'不只读到一句话，也读懂它在说什么。'}[p.phase];lastPhase=p.phase;
      }
      $('#pet-demo-sprite').style.backgroundPosition=`${-192*p.col}px ${-208*p.row}px`;
      $('#pet-demo-sprite').dataset.action=p.phase==='idle'?'idle':p.phase==='plain'&&!p.complete?'talking':'reading';
      // Action buttons keep their anchors while the source grows upward.
      const a=target('#pet-source-button'),b=target('#pet-plain-button');
      const from=p.leg==='source'?{x:designWidth*.4,y:designHeight*.55}:a,to=p.leg==='source'?a:b;
      const x=from.x+(to.x-from.x)*p.travel,y=from.y+(to.y-from.y)*p.travel;
      const cursor=$('#pet-demo-cursor');cursor.style.opacity=String(staticMode?0:p.cursor);
      cursor.style.transform=`translate(${x}px,${y}px)`;
      $('#pet-source-button').dataset.pressed=String(Boolean(p.click?.target==='source'));
      $('#pet-plain-button').dataset.pressed=String(Boolean(p.click?.target==='plain'));
      const ring=$('#pet-click-ring');ring.style.opacity=String(!staticMode&&p.click?1-p.click.progress:0);
      ring.style.transform=`translate(${x}px,${y}px) translate(-50%,-50%) scale(${p.click?.progress*1.5+.5||.5})`;
      return p;
    }
    return {resize,render};
  }
  return {DURATION,SOURCE_AT,PLAIN_AT,EXPLAIN_AT,pose,create};
});
