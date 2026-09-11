const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const motion = require('./motion.js');
const assets = require('./action-assets.js');
const crypto = require('node:crypto');
const desktop = require('./desktop-demo.js'),desktopData = require('./desktop-data.js');
const craft = require('./craft-demo.js'),craftData = require('./craft-data.js');

test('every existing action receives the same 3-second slot and valid sprite cells',()=>{
  const rowCounts=[6,8,8,4,5,8,6,6,6,8,8];
  for(let i=0;i<motion.actions.length;i++){
    for(let t=0;t<motion.ACTION_MS;t+=83){
      const f=motion.coverFrame(i*motion.ACTION_MS+t);
      assert.equal(f.action,motion.actions[i].name);
      assert.ok(f.row>=0&&f.row<11&&f.col>=0&&f.col<rowCounts[f.row]);
    }
  }
  assert.equal(motion.coverFrame(motion.actions.length*motion.ACTION_MS).action,motion.actions[0].name);
});
test('running transition follows a flat route, grows for two seconds, and blends into the new pose',()=>{
  const from={x:810,y:470,scale:.52},to={x:590,y:420,scale:1.35};
  const start=motion.runTransition(0,from,to),end=motion.runTransition(motion.TRANSITION_MS,from,to);
  assert.equal(start.x,from.x);assert.equal(start.y,from.y);assert.equal(start.scale,from.scale);
  assert.equal(start.coverOpacity,1);assert.equal(start.questionOpacity,0);
  assert.equal(end.x,to.x);assert.ok(Math.abs(end.y-to.y)<1e-8);assert.equal(end.scale,to.scale);
  assert.equal(end.coverOpacity,0);assert.equal(end.questionOpacity,1);assert.equal(end.complete,true);
  const middle=motion.runTransition(motion.TRANSITION_MS*.5,from,to);
  assert.equal(middle.x,700);assert.equal(middle.y,445);assert.ok(middle.scale>from.scale&&middle.scale<to.scale);
  assert.equal(start.coverCatOpacity,1);assert.equal(end.scratchOpacity,1);assert.equal(end.runOpacity,0);
  for(let t=0;t<=2000;t+=25){const p=motion.runTransition(t,from,to);assert.ok(p.y>=420&&p.y<=470);}
});
test('new action frame order and timing preserve the authored loops and original files',()=>{
  assert.equal(assets.run.duration,1000);assert.equal(assets.scratch.duration,5880);
  assert.equal(assets.run.frameCount,12);assert.equal(assets.scratch.frameCount,16);
  assert.equal(assets.scratch.timeline.length,28);
  for(const [name,a] of Object.entries(assets)){
    let time=0;
    for(const step of a.timeline){
      assert.equal(motion.actionFrame(a,time),step.frame);
      assert.equal(motion.actionFrame(a,time+step.duration-1),step.frame);
      time+=step.duration;
    }
    assert.equal(time,a.duration);assert.equal(motion.actionFrame(a,time),a.timeline[0].frame);
    for(const [file,sha] of Object.entries(a.sourceHashes)){
      const original=path.resolve(__dirname,'../..','xiaoshu-new-actions/frames',name,file);
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex'),sha);
    }
  }
});
test('different aspect ratios share the same foot anchor, with no image stretching',()=>{
  for(const a of Object.values(assets)){
    const l=motion.spriteLayout(a);
    assert.ok(Math.abs(l.left+l.originX-96)<1e-8);assert.ok(Math.abs(l.top+l.originY-192)<1e-8);
    assert.ok(Math.abs(l.width/l.height-a.frameWidth/a.frameHeight)<1e-8);
  }
});
test('voices hold long enough to read, converge, then vanish; narrow viewport starts remain inside',()=>{
  for(let i=0;i<motion.thoughts.length;i++){
    const offset=i*motion.VOICE_GAP;
    const start=motion.voice(offset+600,i,350,350,210);
    const held=motion.voice(offset+1400,i,350,350,210);
    const near=motion.voice(offset+3900,i,350,350,210);
    const end=motion.voice(offset+motion.VOICE_MS,i,350,350,210);
    assert.equal(start.opacity,1);assert.equal(held.x,start.x);assert.equal(held.y,start.y);
    assert.ok(start.x>=113&&start.x<=237);assert.ok(near.scale<start.scale);assert.equal(end.opacity,0);
  }
  for(let i=0;i<motion.thoughts.length;i++)assert.equal(motion.voice(22400,i,900,350,230).opacity,0);
});

// Exercise the actual controller without a browser or production dependencies.
function harness(reduced=false,{deferImages=false,hash='',deferShowcase=false}={}){
  class Element{
    constructor(name){this.name=name;this.style={};this.dataset={};this.attributes={};this.listeners={};this.children=[];this.offsetWidth=180;this.inert=false;}
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
    append(n){this.children.push(n);}
    focus(){this.focused=true;}
    fire(k,e={}){for(const f of this.listeners[k]||[])f({preventDefault(){},...e});}
    getBoundingClientRect(){return this.name==='#cover-cat-anchor'?{left:800,top:450,width:105,height:114}:this.name==='#question-cat-anchor'?{left:500,top:400,width:250,height:271}:this.name==='#world-cat-anchor'?{left:320,top:460,width:150,height:163}:{left:80,top:300,width:1000,height:350};}
  }
  const nodes=new Map();
  const get=s=>{if(!nodes.has(s))nodes.set(s,new Element(s));return nodes.get(s);};
  const events=new Element('document');
  const document={querySelector:get,createElement:()=>new Element('span'),hidden:false,
    body:{dataset:{},classList:{toggle(){}}},fonts:{ready:Promise.resolve()},
    addEventListener:events.addEventListener.bind(events)};
  const media=new Element('media');media.matches=reduced;
  const windowEvents=new Element('window');
  const window={PhiloMotion:motion,PhiloActionAssets:assets,PhiloDesktopDemo:desktop,PhiloDesktopData:desktopData,PhiloCraftDemo:craft,PhiloCraftData:craftData,innerWidth:1440,innerHeight:900,matchMedia:()=>media,addEventListener:windowEvents.addEventListener.bind(windowEvents)};
  const location={hash,origin:'http://localhost',protocol:'http:'};const history={replaceState(a,b,url){location.hash=url;}};
  const playback=[];get('#showcase-frame').contentWindow={postMessage(message){playback.push(message);}};
  const images=[];
  class MockImage{
    set src(value){this.url=value;images.push(this);if(!deferImages)queueMicrotask(()=>this.onload());}
    decode(){return Promise.resolve();}
  }
  let callbacks=new Map(),id=0,now=0;
  const context={window,document,location,history,Image:MockImage,setTimeout:()=>1,clearTimeout(){},
    requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},cancelAnimationFrame:i=>callbacks.delete(i)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),context);
  function advance(ms){for(let n=0;n<ms;n+=16){now+=16;const ready=[...callbacks.values()];callbacks.clear();ready.forEach(f=>f(now));}}
  let frameReady=false;
  function fromFrame(data){windowEvents.fire('message',{source:get('#showcase-frame').contentWindow,origin:location.origin,data});}
  async function ready(){for(let i=0;i<12;i++)await Promise.resolve();if(!deferShowcase&&!frameReady){frameReady=true;fromFrame({type:'philo-showcase-ready',duration:120000,deepEnd:14500});}}
  return {get,document,location,advance,media,events,windowEvents,ready,images,playback,fromFrame};
}
test('actual controller: running is guarded, paused in place, resumes and finishes with correct accessibility',async()=>{
  const h=harness();await h.ready();h.advance(120);h.get('#begin').fire('click');h.advance(500);
  assert.equal(h.document.body.dataset.page,'transition');
  const first=h.get('#travel-cat').style.transform;h.get('#begin').fire('click');h.advance(32);
  assert.notEqual(h.get('#travel-cat').style.transform,first);
  h.get('#motion-toggle').fire('click');const paused=h.get('#travel-cat').style.transform;
  const frame=h.get('#run-sprite').dataset.frame;
  h.advance(2400);assert.equal(h.get('#travel-cat').style.transform,paused);assert.equal(h.get('#run-sprite').dataset.frame,frame);
  h.get('#motion-toggle').fire('click');h.advance(2000);
  assert.equal(h.document.body.dataset.page,'questions');assert.equal(h.get('#cover').inert,true);
  assert.equal(h.get('#questions').inert,false);assert.equal(h.get('#page-current').textContent,'02');
  assert.ok(h.get('#question-title').focused);assert.equal(h.location.hash,'#questions');
});
test('actual controller: replay, returning during running and repeated navigation clear previous animation state',async()=>{
  const h=harness();await h.ready();h.advance(50);h.get('#begin').fire('click');h.advance(2100);h.advance(9000);
  assert.ok(h.get('#voices').children.some(n=>Number(n.style.opacity)>0));
  h.get('#replay').fire('click');assert.ok(h.get('#voices').children.every(n=>Number(n.style.opacity)===0));
  assert.equal(h.get('#scratch-sprite').dataset.frame,'0');
  h.advance(900);assert.ok(h.get('#voices').children.some(n=>Number(n.style.opacity)>0));
  h.get('#back').fire('click');assert.equal(h.document.body.dataset.page,'cover');
  assert.ok(h.get('#voices').children.every(n=>Number(n.style.opacity)===0));
  assert.ok(h.get('#voices').children.every(n=>n.style.transform===''));
  h.get('#begin').fire('click');h.advance(200);h.events.fire('keydown',{key:'Escape'});h.advance(2100);
  assert.equal(h.document.body.dataset.page,'cover');assert.equal(h.get('#begin').disabled,false);
  h.get('#begin').fire('click');h.advance(2100);assert.equal(h.document.body.dataset.page,'questions');
});
test('actual controller: reduced motion shows a still scratching pose and explicit play works',async()=>{
  const h=harness(true);await h.ready();h.get('#begin').fire('click');
  assert.equal(h.document.body.dataset.page,'questions');
  assert.equal(h.get('#voices').children.filter(n=>Number(n.style.opacity)>0).length,3);
  assert.equal(h.get('#scratch-sprite').dataset.frame,String(assets.scratch.posterFrame));
  const pose=h.get('#travel-cat').style.transform;h.advance(5000);assert.equal(h.get('#travel-cat').style.transform,pose);
  h.get('#motion-toggle').fire('click');h.advance(4000);
  assert.equal(h.get('#motion-toggle').attributes['aria-label'],'暂停动画');
  assert.ok(h.get('#voices').children.some(n=>Number(n.style.opacity)>0));
});
test('actual controller: resize reanchors the cat; a hidden document freezes thoughts and scratching',async()=>{
  const h=harness();await h.ready();h.advance(16);h.get('#begin').fire('click');h.advance(2200);
  h.get('#question-cat-anchor').getBoundingClientRect=()=>({left:140,top:300,width:175,height:190});
  h.windowEvents.fire('resize');h.advance(20);assert.match(h.get('#travel-cat').style.transform,/140px,300px/);
  h.document.hidden=true;const before=h.get('#voices').children.map(n=>n.style.opacity),frame=h.get('#scratch-sprite').dataset.frame;
  h.advance(9000);assert.deepEqual(h.get('#voices').children.map(n=>n.style.opacity),before);assert.equal(h.get('#scratch-sprite').dataset.frame,frame);
});
test('controller waits for decoded assets and returning cancels a queued transition',async()=>{
  const h=harness(false,{deferImages:true});h.advance(20);h.get('#begin').fire('click');h.advance(3000);
  assert.equal(h.document.body.dataset.page,'cover');assert.equal(h.get('#begin').disabled,true);
  h.get('#back').fire('click');h.images.forEach(image=>image.onload());await h.ready();h.advance(2500);
  assert.equal(h.document.body.dataset.page,'cover');assert.equal(h.get('#begin').disabled,false);
  h.get('#begin').fire('click');h.advance(2200);assert.equal(h.document.body.dataset.page,'questions');
});
test('controller recovers a failed preload on retry, without advancing a partly loaded animation',async()=>{
  const h=harness(false,{deferImages:true});h.get('#begin').fire('click');h.images[0].onerror();await h.ready();
  assert.equal(h.get('#begin').disabled,false);assert.equal(h.get('#asset-status').hidden,false);
  h.get('#begin').fire('click');h.images.slice(2).forEach(image=>image.onload());await h.ready();h.advance(2300);
  assert.equal(h.document.body.dataset.page,'questions');assert.equal(h.get('#asset-status').hidden,true);
});
test('controller selects facing direction on narrow layouts and maintains pause while resizing mid-run',async()=>{
  const h=harness();await h.ready();
  h.get('#cover-cat-anchor').getBoundingClientRect=()=>({left:20,top:450,width:80,height:87});
  h.get('#question-cat-anchor').getBoundingClientRect=()=>({left:120,top:420,width:175,height:190});
  h.advance(20);h.get('#begin').fire('click');h.advance(800);
  assert.equal(h.get('#run-sprite').style.transform,'scaleX(-1)');
  h.get('#motion-toggle').fire('click');const pose=h.get('#travel-cat').style.transform;
  h.get('#question-cat-anchor').getBoundingClientRect=()=>({left:450,top:380,width:250,height:270});
  h.windowEvents.fire('resize');h.advance(32);assert.equal(h.get('#travel-cat').style.transform,pose);
  h.get('#motion-toggle').fire('click');h.advance(1500);
  assert.equal(h.document.body.dataset.page,'questions');assert.match(h.get('#travel-cat').style.transform,/450px,380px/);
});
test('direct second-page entry starts the authored action once assets decode',async()=>{
  const h=harness(false,{hash:'#questions',deferImages:true});h.advance(8000);
  h.images.forEach(image=>image.onload());await h.ready();
  assert.equal(h.get('#scratch-sprite').dataset.frame,'0');assert.equal(h.get('#cat-sprite').style.opacity,'0');
  h.advance(1900);assert.notEqual(h.get('#scratch-sprite').dataset.frame,'0');
});

test('world runs toward the opening door immediately, has no question interlude, and fills the viewport before fading',()=>{
  assert.equal(motion.worldTimeline(0).previousOpacity,1);
  const opening=motion.worldTimeline(100);
  assert.equal('doubtOpacity' in opening,false);assert.equal('inquiryOpacity' in opening,false);
  assert.ok(opening.portalOpacity>0);assert.ok(opening.doorAngle>0);assert.equal(opening.runOpacity,1);
  assert.equal(motion.worldTimeline(600).previousOpacity,0);
  const stop=motion.worldTimeline(motion.WORLD_MS);
  assert.equal(stop.complete,true);assert.equal(stop.headingOpacity,1);assert.equal(stop.runOpacity,0);
  assert.equal(stop.peopleOpacity,.32);
  const rect={left:390,top:300,width:650,height:448};
  const fill=motion.portalFlight(2100,1440,900,rect);
  assert.ok(rect.width*.78*fill.scale>=1440);assert.ok(rect.height*.72*fill.scale>=900);assert.equal(fill.worldOpacity,1);
  const end=motion.portalFlight(motion.REVEAL_MS,1440,900,rect);assert.equal(end.worldOpacity,0);assert.equal(end.showcaseOpacity,1);assert.equal(end.complete,true);
  const from={x:500,y:400,scale:1.3},to={x:320,y:460,scale:.8};
  assert.ok(motion.worldJourney(100,from,to).x<from.x);
  for(let t=0;t<=6500;t+=25){
    const p=motion.worldJourney(t,from,to);assert.ok(p.x>=320&&p.x<=500);assert.ok(p.y>=400&&p.y<=460);
    if(t<=motion.WORLD_WALK_START)assert.deepEqual(p,from);
    if(t>=motion.WORLD_WALK_END){assert.ok(Math.abs(p.x-to.x)<1e-8);assert.ok(Math.abs(p.scale-to.scale)<1e-8);}
  }
});

test('third page starts from any point in the worry loop, has no automatic reveal and guards repeat clicks',async()=>{
  for(const entry of [0,3100,17000,23400]){
    const h=harness(false,{hash:'#questions'});await h.ready();h.advance(entry+16);
    const before=h.get('#travel-cat').style.transform;
    h.get('#continue').fire('click');assert.equal(h.location.hash,'#world');
    assert.equal(h.get('#travel-cat').style.transform,before);assert.equal(h.get('#questions').inert,true);
    assert.equal(h.get('#world').inert,false);assert.equal(h.get('#page-current').textContent,'03');
    h.advance(100);assert.notEqual(h.get('#travel-cat').style.transform,before);
    assert.equal(h.get('#travel-cat').dataset.action,'run');assert.ok(Number(h.get('#world-portal').style.opacity)>0);
    h.advance(500);assert.equal(h.get('#questions').style.opacity,'0');
    h.get('#continue').fire('click');h.advance(5000);
    assert.equal(h.get('#meet').hidden,false);
    assert.equal(h.get('#philosophers').style.opacity,'0.32');h.advance(9000);
    assert.equal(h.get('#philosophers').style.opacity,'0.32');
    h.get('#meet').fire('click');h.advance(500);const opening=h.get('#philosophers').style.opacity;
    h.get('#meet').fire('click');h.advance(2300);
    assert.ok(Number(opening)>.32&&Number(opening)<1);assert.equal(h.get('#philosophers').style.opacity,'1');
    assert.equal(h.location.hash,'#showcase');assert.equal(h.get('#world').inert,true);assert.equal(h.get('#showcase').inert,false);
  }
});

test('whole third-page story and reveal freeze with pause/background, and replay clears the ending',async()=>{
  const h=harness(false,{hash:'#questions'});await h.ready();h.advance(16);h.get('#continue').fire('click');h.advance(900);
  const snapshot=()=>[h.get('#travel-cat').style.transform,h.get('#run-sprite').dataset.frame,h.get('#door-left').style.transform,h.get('#world-heading').style.opacity,h.get('#philosophers').style.opacity];
  h.get('#motion-toggle').fire('click');const frozen=snapshot();h.advance(5000);assert.deepEqual(snapshot(),frozen);
  h.get('#motion-toggle').fire('click');h.advance(500);h.document.hidden=true;h.events.fire('visibilitychange');
  const hidden=snapshot();h.advance(4000);assert.deepEqual(snapshot(),hidden);
  h.document.hidden=false;h.events.fire('visibilitychange');h.advance(3000);h.get('#meet').fire('click');h.advance(450);
  h.get('#motion-toggle').fire('click');const reveal=snapshot();h.advance(3000);assert.deepEqual(snapshot(),reveal);
  h.get('#motion-toggle').fire('click');h.advance(1000);assert.equal(h.get('#philosophers').style.opacity,'1');
  h.get('#world-replay').fire('click');assert.equal(h.get('#meet').hidden,true);assert.equal(h.get('#philosophers').style.opacity,'0');
  h.advance(6700);assert.equal(h.get('#meet').hidden,false);assert.equal(h.get('#philosophers').attributes['aria-hidden'],'true');
});

test('third-page back and keyboard navigation reset the right scene, including during both transitions',async()=>{
  const h=harness(false,{hash:'#questions'});await h.ready();h.advance(16);
  for(const t of [500,1300,3100]){
    h.events.fire('keydown',{key:'ArrowRight'});h.advance(t);h.events.fire('keydown',{key:'ArrowLeft'});
    assert.equal(h.location.hash,'#questions');assert.equal(h.get('#scratch-sprite').dataset.frame,'0');
    assert.equal(h.get('#world').inert,true);assert.equal(h.get('#world').style.visibility,'hidden');
  }
  h.get('#continue').fire('click');h.advance(6800);h.events.fire('keydown',{key:'ArrowRight'});h.advance(600);
  h.get('#world-back').fire('click');h.advance(2000);assert.equal(h.location.hash,'#questions');
  h.get('#continue').fire('click');h.advance(4500);h.events.fire('keydown',{key:'Escape'});h.advance(5000);
  assert.equal(h.location.hash,'#cover');assert.equal(h.get('#cover').inert,false);assert.equal(h.get('#cat-sprite').style.opacity,'1');
});

test('third-page loading failure preserves questions, retries, and a cancelled pending entry cannot reappear',async()=>{
  const h=harness(false,{hash:'#questions',deferImages:true});h.images.slice(0,2).forEach(i=>i.onload());await h.ready();
  h.advance(2500);h.get('#continue').fire('click');assert.equal(h.location.hash,'#questions');
  h.images.find(i=>i.url.endsWith('door-frame.png')).onerror();await h.ready();
  assert.equal(h.get('#continue').disabled,false);assert.equal(h.get('#asset-status').hidden,false);
  const count=h.images.length;h.get('#continue').fire('click');h.get('#back').fire('click');
  h.images.slice(count).forEach(i=>i.onload());await h.ready();h.advance(8000);assert.equal(h.location.hash,'#cover');
  h.get('#begin').fire('click');h.advance(2300);h.get('#continue').fire('click');h.advance(6800);
  assert.equal(h.location.hash,'#world');assert.equal(h.get('#meet').hidden,false);
});

test('direct third-page links wait for decoded assets and reduced motion reaches both still end states',async()=>{
  const h=harness(false,{hash:'#world',deferImages:true});h.advance(9000);
  assert.equal(h.get('#door-left').style.transform,'rotateY(0deg)');
  h.images.forEach(i=>i.onload());await h.ready();h.advance(6800);assert.equal(h.get('#meet').hidden,false);
  const reduced=harness(true,{hash:'#world'});await reduced.ready();
  assert.equal(reduced.get('#meet').hidden,false);assert.equal(reduced.get('#world-heading').style.opacity,'1');
  const cat=reduced.get('#travel-cat').style.transform;reduced.advance(10000);assert.equal(reduced.get('#travel-cat').style.transform,cat);
  reduced.get('#meet').fire('click');assert.equal(reduced.location.hash,'#showcase');assert.equal(reduced.playback.at(-1).paused,true);
  reduced.events.fire('keydown',{key:'ArrowLeft'});
  reduced.get('#world-replay').fire('click');assert.equal(reduced.get('#meet').hidden,false);assert.equal(reduced.get('#philosophers').style.opacity,'0.32');
  reduced.get('#world-back').fire('click');reduced.get('#continue').fire('click');assert.equal(reduced.get('#meet').hidden,false);
});

test('resizing mid-story preserves the cat position and faces the new destination; motion preference settles the scene',async()=>{
  const h=harness(false,{hash:'#world'});await h.ready();h.advance(900);h.get('#motion-toggle').fire('click');
  const before=h.get('#travel-cat').style.transform;
  h.get('#world-cat-anchor').getBoundingClientRect=()=>({left:640,top:430,width:100,height:108});
  h.windowEvents.fire('resize');h.advance(32);assert.equal(h.get('#travel-cat').style.transform,before);
  assert.equal(h.get('#run-sprite').style.transform,'scaleX(-1)');
  h.get('#motion-toggle').fire('click');h.advance(2600);assert.match(h.get('#travel-cat').style.transform,/640px,430px/);
  h.get('#meet').fire('click');h.advance(450);h.media.fire('change',{matches:true});
  assert.equal(h.location.hash,'#showcase');assert.equal(h.get('#motion-toggle').attributes['aria-pressed'],'true');
});

test('showcase waits for its own assets, cancelled entrances stay cancelled, and failed loading is retryable',async()=>{
  const h=harness(false,{hash:'#world',deferShowcase:true});await h.ready();h.advance(5500);h.get('#meet').fire('click');
  h.advance(5000);assert.equal(h.location.hash,'#world');
  h.fromFrame({type:'philo-showcase-error'});assert.equal(h.get('#asset-status').hidden,false);
  h.get('#meet').fire('click');assert.match(h.get('#showcase-frame').src,/retry=1/);
  h.get('#world-back').fire('click');h.fromFrame({type:'philo-showcase-ready',duration:120000,deepEnd:14500});
  h.advance(5000);assert.equal(h.location.hash,'#questions');
  h.get('#continue').fire('click');h.advance(5500);h.get('#meet').fire('click');h.advance(2800);assert.equal(h.location.hash,'#showcase');
});

test('native showcase shares pause/background clock, supports chapter jumps, philosopher selection, replay and return',async()=>{
  const h=harness(false,{hash:'#showcase'});await h.ready();h.advance(1200);
  const current=()=>h.playback.filter(p=>p.type==='philo-showcase-render').at(-1);
  assert.ok(current().time>0);h.get('#motion-toggle').fire('click');const frozen=current().time;
  h.advance(2000);assert.equal(current().time,frozen);
  h.get('#motion-toggle').fire('click');h.document.hidden=true;h.events.fire('visibilitychange');h.advance(4000);assert.equal(current().time,frozen);
  h.document.hidden=false;h.events.fire('visibilitychange');h.advance(600);assert.ok(current().time>frozen);
  h.fromFrame({type:'philo-showcase-chapter',chapter:'roundtable'});assert.equal(current().time,14500);
  h.fromFrame({type:'philo-showcase-pause'});assert.equal(current().paused,true);
  h.fromFrame({type:'philo-showcase-seek',time:1400});assert.equal(current().time,1400);assert.equal(current().seek,true);
  h.get('#showcase-replay').fire('click');assert.equal(current().time,0);
  assert.equal(current().paused,false);
  h.fromFrame({type:'philo-showcase-pause'});h.fromFrame({type:'philo-showcase-chapter',chapter:'roundtable'});assert.equal(current().time,120000);
  h.events.fire('keydown',{key:'ArrowLeft'});assert.equal(h.location.hash,'#world');assert.equal(h.get('#meet').hidden,false);
});

test('showcase rejects messages from unrelated windows and limits playback at the ending',async()=>{
  const h=harness(false,{hash:'#showcase'});await h.ready();h.advance(1000);
  const before=h.playback.at(-1).time;
  h.windowEvents.fire('message',{source:{},origin:h.location.origin,data:{type:'philo-showcase-seek',time:88000}});
  assert.equal(h.playback.at(-1).time,before);
  h.fromFrame({type:'philo-showcase-progress',label:'圆桌实录 · 完整对话',mode:'roundtable',complete:true});
  assert.equal(h.get('#motion-toggle').attributes['aria-pressed'],'true');
});

test('six real speeches and all six source openings are retained in the native presentation',()=>{
  const capture=JSON.parse(fs.readFileSync(path.join(__dirname,'assets/showcase/roundtable.json'),'utf8'));
  const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'showcase/data.js'),'utf8'),ctx);
  const data=ctx.window.PhiloShowcaseData;
  assert.equal(capture.prompt,'你们怎么看待亲密关系？');assert.equal(capture.turns.length,6);
  assert.deepEqual(JSON.parse(JSON.stringify(data.capture.turns)),capture.turns);
  const originals=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/philosophers.json'),'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(data.people)),originals);
  const originalCSS=fs.readFileSync(path.join(__dirname,'../web/styles.css'),'utf8');
  assert.equal(fs.readFileSync(path.join(__dirname,'showcase/styles.css'),'utf8'),originalCSS);
  const html=fs.readFileSync(path.join(__dirname,'showcase/index.html'),'utf8');
  assert.ok(!html.includes('src="./app.js'));assert.ok(!html.includes('src="./roundtable.js'));
  const story=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert.ok(!story.includes('我想过一种怎样的生活'));
  assert.ok(!story.includes('我不知道自己该走哪条路'));
  assert.ok(!story.includes('world-question'));assert.ok(!story.includes('world-doubt'));
  assert.ok(!story.includes('showcase-seek'));assert.ok(!story.includes('type="range"'));
  assert.ok(!story.includes('showcase-toolbar'));assert.ok(story.includes('id="showcase-back"'));assert.ok(!story.includes('id="show-deep"'));
  const controls=story.split('aria-label="演示操作"')[1].split('</div>')[0];
  assert.equal((controls.match(/<button/g)||[]).length,3);assert.ok(controls.includes('重新播放'));assert.ok(controls.includes('继续看'));
});

test('showcase holds each opening for two seconds, crossfades, and stops when the final speech finishes',()=>{
  const native=require('./showcase-motion.js'),capture=JSON.parse(fs.readFileSync(path.join(__dirname,'assets/showcase/roundtable.json'),'utf8'));
  const people=JSON.parse(fs.readFileSync(path.join(__dirname,'../web/philosophers.json'),'utf8')),data={people,capture};
  const plan=native.timeline(data);
  assert.equal(native.HOLD_MS,2000);assert.equal(native.FADE_MS,500);assert.equal(plan.deepEnd,14500);
  for(let i=0;i<6;i++){
    for(const offset of [0,1000,1999]){
      const held=native.pose(i*native.SLOT_MS+offset,data,plan);
      assert.equal(held.index,i);assert.equal(held.fade,1);assert.equal(held.fadeFrom,-1);
    }
    if(i<5){
      const start=native.pose(i*native.SLOT_MS+2000,data,plan);
      const middle=native.pose(i*native.SLOT_MS+2250,data,plan);
      const almost=native.pose(i*native.SLOT_MS+2499,data,plan);
      assert.equal(start.fadeFrom,i);assert.equal(start.index,i+1);assert.equal(start.fade,0);
      assert.equal(middle.fadeFrom,i);assert.equal(middle.index,i+1);assert.equal(middle.fade,.5);
      assert.ok(almost.fade>.99);assert.ok(almost.fade<1);
    }
  }
  const roundStart=native.pose(plan.deepEnd,data,plan),roundMiddle=native.pose(plan.deepEnd+250,data,plan);
  assert.equal(roundStart.mode,'roundtable');assert.equal(roundStart.fadeFrom,5);assert.equal(roundStart.fade,0);
  assert.equal(roundMiddle.fade,.5);assert.equal(native.pose(plan.deepEnd+500,data,plan).fadeFrom,-1);
  assert.equal(native.pose(plan.deepEnd+3800,data,plan).promptProgress,1);
  plan.turns.forEach((t,i)=>{
    const partial=native.pose(t.end-1,data,plan);assert.equal(partial.index,i);assert.ok(partial.progress<1);
    if(i<plan.turns.length-1){const p=native.pose(t.end,data,plan);assert.equal(p.index,i);assert.equal(p.progress,1);}
  });
  assert.equal(plan.end,plan.turns.at(-1).end);
  for(const offset of [0,1000,60000]){
    const end=native.pose(plan.end+offset,data,plan);
    assert.equal(end.phase,'complete');assert.equal(end.complete,true);assert.equal('scrollProgress' in end,false);
  }
});

test('roundtable completion pauses playback at its endpoint without a review phase',async()=>{
  const h=harness(false,{hash:'#showcase'});await h.ready();h.advance(120100);
  const current=()=>h.playback.filter(p=>p.type==='philo-showcase-render').at(-1);
  assert.equal(current().time,120000);
  h.fromFrame({type:'philo-showcase-progress',mode:'roundtable',label:'圆桌实录 · 生成结束',complete:true});
  assert.equal(current().paused,true);h.advance(60000);assert.equal(current().time,120000);
  assert.equal(h.get('#motion-toggle').attributes['aria-pressed'],'true');
});

test('continue skips loading, any opening, or any roundtable moment and ignores late iframe messages',async()=>{
  for(const entry of [0,2250,14500,22000,90000,120000]){
    const h=harness(false,{hash:'#showcase',deferShowcase:entry===0});await h.ready();h.advance(entry);
    h.get('#showcase-next').fire('click');assert.equal(h.location.hash,'#companion');
    assert.equal(h.get('#showcase').inert,true);assert.equal(h.get('#companion').inert,false);
    assert.equal(h.get('#motion-toggle').hidden,true);assert.ok(h.get('#companion-title').focused);
    h.advance(800);const before=h.get('#pet-demo-bubble').style.opacity;
    h.get('#showcase-next').fire('click');assert.equal(h.get('#pet-demo-bubble').style.opacity,before);
    h.fromFrame({type:'philo-showcase-ready',duration:120000,deepEnd:14500});
    h.fromFrame({type:'philo-showcase-progress',complete:true});h.advance(2100);
    assert.equal(h.location.hash,'#companion');assert.equal(h.get('#pet-demo-bubble').style.opacity,'1');
    assert.equal(h.get('#motion-toggle').attributes['aria-pressed'],'false');
    h.get('#pet-back').fire('click');assert.equal(h.location.hash,'#showcase');
    h.get('#pet-back').fire('click');assert.equal(h.location.hash,'#showcase');
    h.get('#showcase-back').fire('click');assert.equal(h.location.hash,'#world');
    assert.equal(h.get('#showcase').inert,true);assert.equal(h.get('#meet').hidden,false);
    h.get('#showcase-back').fire('click');assert.equal(h.location.hash,'#world');
    h.fromFrame({type:'philo-showcase-progress',complete:true});assert.equal(h.location.hash,'#world');
  }
});

test('desktop demonstrates idle, quote, source click and explanation, then stops',()=>{
  assert.equal(desktop.pose(1000).phase,'idle');assert.equal(desktop.pose(1000).bubble,0);
  assert.equal(desktop.pose(2200).phase,'quote');assert.equal(desktop.pose(2200).bubble,1);
  assert.equal(desktop.pose(4700).click,null);assert.equal(desktop.pose(4850).click.target,'source');
  assert.equal(desktop.pose(5200).phase,'source');assert.equal(desktop.pose(5200).source,1);
  assert.equal(desktop.pose(8500).leg,'plain');assert.equal(desktop.pose(9050).click.target,'plain');
  assert.equal(desktop.pose(9300).phase,'loading');assert.equal(desktop.pose(10000).phase,'plain');
  assert.equal(desktop.pose(10000).row,6);
  const end=desktop.pose(desktop.DURATION);assert.equal(end.complete,true);assert.equal(end.cursor,0);
  assert.deepEqual(desktop.pose(desktop.DURATION+5000),end);
});

test('desktop cursor, sprite and panels share pause/background clock, replay and keyboard navigation',async()=>{
  const h=harness(false,{hash:'#companion'});await h.ready();h.advance(4100);
  const snapshot=()=>[h.get('#pet-demo-cursor').style.transform,h.get('#pet-demo-sprite').style.backgroundPosition,h.get('#pet-demo-bubble').style.opacity,h.get('#pet-source-panel').hidden];
  h.events.fire('keydown',{code:'Space'});const paused=snapshot();h.advance(4000);assert.deepEqual(snapshot(),paused);
  h.events.fire('keydown',{code:'Space'});h.document.hidden=true;h.events.fire('visibilitychange');const hidden=snapshot();h.advance(5000);assert.deepEqual(snapshot(),hidden);
  h.document.hidden=false;h.events.fire('visibilitychange');h.advance(1300);assert.equal(h.get('#pet-source-panel').hidden,false);
  h.advance(4600);assert.equal(h.get('#pet-plain-text').textContent,desktopData.plain);assert.equal(h.get('#pet-source-panel').hidden,true);
  h.get('#pet-replay').fire('click');assert.equal(h.get('#pet-demo-bubble').hidden,true);assert.equal(h.get('#pet-demo-cursor').style.opacity,'0');
  h.get('#pet-source-button').fire('click');assert.equal(h.get('#pet-source-panel').hidden,false);
  h.get('#pet-plain-button').fire('click');assert.equal(h.get('#pet-plain-text').hidden,false);
  h.get('#pet-return-quote').fire('click');assert.equal(h.get('#pet-quote-text').hidden,false);
  h.events.fire('keydown',{key:'ArrowLeft'});assert.equal(h.location.hash,'#showcase');
  h.events.fire('keydown',{key:'ArrowRight'});assert.equal(h.location.hash,'#companion');
  h.windowEvents.fire('resize');h.advance(32);assert.equal(h.get('#travel-cat').style.visibility,'hidden');
  h.events.fire('keydown',{key:'Escape'});assert.equal(h.location.hash,'#cover');assert.equal(h.get('#motion-toggle').hidden,false);
});

test('desktop assets retry independently; reduced motion renders a still explanation',async()=>{
  const h=harness(false,{hash:'#companion',deferImages:true});h.advance(10000);assert.equal(h.get('#pet-demo-bubble').hidden,true);
  const desktopImages=h.images.filter(i=>/assets\/(wallpaper.jpg|philo-cat-sprites.png)$/.test(i.url));
  desktopImages[0].onerror();desktopImages[1].onload();await h.ready();assert.match(h.get('#asset-status').textContent,/重新播放/);
  const count=h.images.length;h.get('#pet-replay').fire('click');h.images.slice(count).forEach(i=>i.onload());await h.ready();h.advance(2400);
  assert.equal(h.get('#pet-demo-bubble').style.opacity,'1');assert.equal(h.get('#asset-status').hidden,true);
  const r=harness(true,{hash:'#companion'});await r.ready();
  assert.equal(r.get('#pet-plain-text').hidden,false);assert.equal(r.get('#pet-demo-cursor').style.opacity,'0');
  const frame=r.get('#pet-demo-sprite').style.backgroundPosition;r.advance(12000);assert.equal(r.get('#pet-demo-sprite').style.backgroundPosition,frame);
});

test('desktop quote, source and plain explanation are preserved from the existing knowledge card',()=>{
  const quotes=JSON.parse(fs.readFileSync(path.join(__dirname,'../../distill/packages/laozi/build/quotes.json'),'utf8'));
  assert.deepEqual(desktopData.quote,quotes.find(q=>q.id===desktopData.quote.id));
  const card=fs.readFileSync(path.join(__dirname,'../..',desktopData.sourceCard));
  assert.equal(crypto.createHash('sha256').update(card).digest('hex'),desktopData.sourceSHA256);
  assert.ok(card.toString().includes(desktopData.plainFull));assert.ok(desktopData.plainFull.startsWith(desktopData.plain));
});

test('knowledge snapshot traces the displayed scale and Laozi example to actual package files',()=>{
  const repo=path.resolve(__dirname,'../..');
  for(const [file,sha] of Object.entries(craftData.sources))
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,file))).digest('hex'),sha,file);
  const people=JSON.parse(fs.readFileSync(path.join(repo,'app/web/philosophers.json'),'utf8'));
  assert.deepEqual(craftData.packages.map(p=>p.slug),people.map(p=>p.slug));
  const totals={people:people.length,corpus:0,frameworks:0,concepts:0,exemplars:0};
  for(const person of people){
    const base=path.join(repo,'distill/packages',person.slug);
    const entries=fs.readdirSync(path.join(base,'corpus')).filter(f=>f.endsWith('.jsonl'))
      .flatMap(f=>fs.readFileSync(path.join(base,'corpus',f),'utf8').split('\n').filter(s=>s.trim()).map(s=>JSON.parse(s)));
    totals.corpus+=new Set(entries.map(e=>e.id)).size;
    for(const folder of ['frameworks','concepts','exemplars'])totals[folder]+=fs.readdirSync(path.join(base,folder)).filter(f=>f.endsWith('.md')).length;
  }
  assert.deepEqual(craftData.totals,totals);
  assert.equal(craftData.example.quote,desktopData.quote.quote);assert.equal(craftData.example.plain,desktopData.plain);
  assert.ok(craftData.example.materials.every(p=>p in craftData.sources));
  const prompt=fs.readFileSync(path.join(repo,'distill/packages/laozi/build/system-prompt.md'),'utf8');
  assert.ok(prompt.includes(craftData.example.quote));assert.ok(prompt.includes(craftData.example.framework));
});

test('craft sequence reveals sources before distilled cards, knowledge and dialogue, and stays complete',()=>{
  for(const t of [0,600,1450,2300,3150,3950,4400]){
    const p=craft.pose(t);
    assert.ok(p.steps.every(s=>s.opacity>=0&&s.opacity<=1));
    for(let i=1;i<4;i++)assert.ok(p.steps[i].opacity<=p.steps[i-1].opacity);
    assert.ok(p.evidence<=p.steps[3].opacity);
  }
  assert.ok(craft.pose(4400).steps.every(s=>s.opacity===1));
  assert.equal(craft.pose(4400).evidence,1);assert.deepEqual(craft.pose(99999),craft.pose(4400));
});

test('desktop can continue to knowledge at any time, including loading; late callbacks cannot steal the scene',async()=>{
  for(const entry of [0,1500,4800,9300,14500]){
    const h=harness(false,{hash:'#companion',deferImages:entry===0,deferShowcase:true});await h.ready();h.advance(entry);
    h.get('#pet-next').fire('click');assert.equal(h.location.hash,'#craft');
    assert.equal(h.get('#page-current').textContent,'06');assert.ok(h.get('#craft-title').focused);
    for(const page of ['cover','questions','world','showcase','companion'])assert.equal(h.get('#'+page).inert,true);
    assert.equal(h.get('#craft').inert,false);assert.equal(h.get('#motion-toggle').hidden,true);
    h.advance(800);const before=h.get('#craft-step-0').style.opacity;
    h.get('#pet-next').fire('click');assert.equal(h.get('#craft-step-0').style.opacity,before);
    if(entry===0){h.images.forEach(i=>i.onload());await h.ready();}
    h.fromFrame({type:'philo-showcase-ready',duration:120000,deepEnd:14500});h.fromFrame({type:'philo-showcase-progress',complete:true});
    h.advance(4400);assert.equal(h.location.hash,'#craft');assert.equal(h.get('#craft-evidence').style.opacity,'1');
    assert.equal(h.get('#motion-toggle').attributes['aria-pressed'],'false');assert.equal(h.get('#asset-status').hidden,true);
  }
});

test('craft uses shared pause/background clock, replay resets disclosure, and resize never restores the story cat',async()=>{
  const h=harness(false,{hash:'#craft'});await h.ready();h.advance(1600);
  const snapshot=()=>[0,1,2,3].map(i=>h.get('#craft-step-'+i).style.opacity).concat(h.get('#craft-evidence').style.opacity);
  h.events.fire('keydown',{code:'Space'});const before=snapshot();h.advance(5000);assert.deepEqual(snapshot(),before);
  h.events.fire('keydown',{code:'Space'});h.document.hidden=true;h.events.fire('visibilitychange');h.advance(5000);assert.deepEqual(snapshot(),before);
  h.document.hidden=false;h.events.fire('visibilitychange');h.advance(500);assert.notDeepEqual(snapshot(),before);
  h.windowEvents.fire('resize');h.windowEvents.fire('scroll');h.advance(32);assert.equal(h.get('#travel-cat').style.visibility,'hidden');
  h.get('#craft-example').open=true;h.get('#craft-example').fire('toggle');
  assert.equal(h.get('#craft-evidence').style.opacity,'1');assert.equal(h.get('#motion-toggle').attributes['aria-pressed'],'true');
  h.get('#craft-scroll').scrollTop=600;h.get('#craft-replay').fire('click');
  assert.equal(h.get('#craft-example').open,false);assert.equal(h.get('#craft-scroll').scrollTop,0);assert.equal(h.get('#craft-evidence').style.opacity,'0');
  h.advance(4700);assert.equal(h.get('#craft-evidence').style.opacity,'1');
  h.get('#craft-back').fire('click');assert.equal(h.location.hash,'#companion');assert.equal(h.get('#craft').style.visibility,'hidden');
  h.events.fire('keydown',{key:'ArrowRight'});assert.equal(h.location.hash,'#craft');
  h.events.fire('keydown',{key:'ArrowLeft'});assert.equal(h.location.hash,'#companion');
  h.events.fire('keydown',{key:'ArrowRight'});h.events.fire('keydown',{key:'Escape'});
  assert.equal(h.location.hash,'#cover');assert.equal(h.get('#craft').style.visibility,'hidden');assert.equal(h.get('#travel-cat').style.visibility,'visible');
});

test('craft reduced motion settles immediately and direct routes retain all six story scenes',async()=>{
  const h=harness(true,{hash:'#craft'});await h.ready();
  assert.equal(h.get('#craft-evidence').style.opacity,'1');h.advance(5000);assert.equal(h.get('#craft-step-3').style.opacity,'1');
  h.get('#craft-replay').fire('click');assert.equal(h.get('#craft-evidence').style.opacity,'1');
  h.location.hash='#world';h.windowEvents.fire('hashchange');assert.equal(h.get('#craft').style.visibility,'hidden');assert.equal(h.location.hash,'#world');
  h.location.hash='#craft';h.windowEvents.fire('hashchange');h.get('.wordmark').fire('click');assert.equal(h.location.hash,'#cover');
  const live=harness(false,{hash:'#craft'});await live.ready();live.advance(600);
  live.media.matches=true;live.media.fire('change',{matches:true});assert.equal(live.get('#craft-step-3').style.opacity,'1');
  const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  for(const id of ['cover','questions','world','showcase','companion','craft'])assert.ok(html.includes('id="'+id+'"'));
  assert.ok(html.includes('id="pet-back"'));
  assert.equal((html.split('aria-label="技术展示操作"')[1].split('</div>')[0].match(/<button/g)||[]).length,2);
});
