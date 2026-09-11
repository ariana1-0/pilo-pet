/* A short, deterministic reveal of the actual knowledge-to-dialogue pipeline. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PhiloCraftDemo=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DURATION=4400;
  const smooth=v=>{const p=Math.min(1,Math.max(0,v));return p*p*(3-2*p);};
  function pose(time){
    const t=Math.min(DURATION,Math.max(0,time));
    return {steps:Array.from({length:4},(_,i)=>{const p=smooth((t-250-i*850)/650);return {opacity:p,y:(1-p)*14,link:smooth((t-650-i*850)/650)};}),
      evidence:smooth((t-3250)/700),complete:t>=DURATION};
  }
  function create(doc,data){
    const $=s=>doc.querySelector(s);
    for(const [key,value] of Object.entries(data.totals))if(key!=='exemplars')$('#craft-count-'+key).textContent=value.toLocaleString('en-US');
    $('#craft-example-quote').textContent=data.example.quote;
    $('#craft-example-locus').textContent=data.example.locus+' · '+data.example.corpusId;
    $('#craft-example-concept').textContent=data.example.concept;
    $('#craft-example-plain').textContent=data.example.plain;
    $('#craft-example-framework').textContent=data.example.framework;
    $('#craft-example-framework-text').textContent=data.example.frameworkSummary;
    $('#craft-example-persona').textContent=data.example.persona;
    $('#craft-example-dilemmas').textContent=data.example.dilemmas;
    function render(time,staticMode=false){
      const p=pose(staticMode?DURATION:time);
      p.steps.forEach((step,i)=>{
        const node=$('#craft-step-'+i);node.style.opacity=String(step.opacity);node.style.transform=`translateY(${step.y}px)`;
        if(i<3)$('#craft-link-'+i).style.transform=`scaleX(${step.link})`;
      });
      $('#craft-evidence').style.opacity=String(p.evidence);
      // The material drawer is available immediately, including while the reveal plays.
      return p;
    }
    return {render};
  }
  return {DURATION,pose,create};
});
