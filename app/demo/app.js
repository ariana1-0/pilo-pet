(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const motion = window.PhiloMotion, assets = window.PhiloActionAssets;
  const cat = $('#travel-cat'), sprite = $('#cat-sprite');
  const layers = {run:$('#run-sprite'), scratch:$('#scratch-sprite')};
  const cover = $('#cover'), questions = $('#questions'), stage = $('#thought-stage');
  const world = $('#world'), continueButton = $('#continue'), meetButton = $('#meet');
  const showcase=$('#showcase'),showcaseFrame=$('#showcase-frame');
  const companion=$('#companion'),desktopMotion=window.PhiloDesktopDemo;
  const desktopDemo=desktopMotion.create(document,window.PhiloDesktopData);
  const craft=$('#craft'),craftMotion=window.PhiloCraftDemo;
  const craftDemo=craftMotion.create(document,window.PhiloCraftData);
  const worldSources = ['zhuangzi.png','marcus-aurelius.jpg','nietzsche.jpg','door-frame.png','door-leaf.png'];
  const beginButton = $('#begin'), status = $('#asset-status');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = {page:'cover', phase:'rest', time:0, questionTime:0, transitionTime:0,
    segmentStart:0, lastTime:null, paused:reducedMotion.matches, from:null, pose:null,
    direction:1, raf:0, size:{width:0,height:0}, assets:'loading', pending:null,
    worldAssets:'loading',worldPending:null,worldTime:0,revealTime:0,worldFrom:null,
    worldSegmentStart:motion.WORLD_WALK_START,worldHasPrevious:false,
    showcaseReady:false,showcaseError:false,showcasePending:null,showcaseTime:0,
    showcaseDuration:1,deepEnd:14500,desktopTime:0,desktopAssets:'loading',craftTime:0};
  const voiceNodes = motion.thoughts.map(thought => {
    const node=document.createElement('span');
    node.className='voice'; node.textContent=thought.text; $('#voices').append(node); return node;
  });
  const images = {};
  let voiceWidths=[], lastFrame='', lastActions={}, resizePending=false, loading=null, worldLoading=null;
  let showcaseTimer=null,showcaseAttempt=0,desktopLoading=null;

  function anchorPose(id) {
    const r=$(id).getBoundingClientRect(); return {x:r.left,y:r.top,scale:r.width/192};
  }
  function moveCat(pose) {
    state.pose={x:pose.x,y:pose.y,scale:pose.scale};
    cat.style.transform=`translate3d(${pose.x}px,${pose.y}px,0) scale(${pose.scale})`;
    cat.style.visibility='visible';
  }
  function drawFrame(frame) {
    const key=`${frame.row}:${frame.col}`; if(key===lastFrame)return;
    sprite.style.backgroundPosition=`${-192*frame.col}px ${-208*frame.row}px`; lastFrame=key;
  }
  function drawAction(name,index) {
    if(lastActions[name]===index)return;
    const a=assets[name];
    layers[name].style.backgroundPosition=`${-(index%a.columns)*a.frameWidth*a.renderScale}px ${-Math.floor(index/a.columns)*a.frameHeight*a.renderScale}px`;
    layers[name].dataset.frame=String(index); lastActions[name]=index;
  }
  function opacity(old,run,scratch) {
    sprite.style.opacity=String(old);layers.run.style.opacity=String(run);layers.scratch.style.opacity=String(scratch);
  }
  function setStatus(message='') { status.textContent=message;status.hidden=!message; }
  function readyButton() { beginButton.disabled=false;beginButton.setAttribute('aria-busy','false'); }
  function readyContinue() {continueButton.disabled=false;continueButton.setAttribute('aria-busy','false');}
  function pageAnchor(){return state.page==='world'?'#world-cat-anchor':state.page==='questions'?'#question-cat-anchor':'#cover-cat-anchor';}
  function configureLayers() {
    for(const [name,a] of Object.entries(assets)) {
      const l=motion.spriteLayout(a), node=layers[name];
      Object.assign(node.style,{width:`${l.width}px`,height:`${l.height}px`,left:`${l.left}px`,top:`${l.top}px`,
        backgroundImage:`url("${a.src}")`,backgroundSize:`${l.backgroundWidth}px ${l.backgroundHeight}px`,
        transformOrigin:`${l.originX}px ${l.originY}px`});
      drawAction(name,a.posterFrame);
    }
  }
  function loadImage(name,src) {
    return new Promise((resolve,reject)=>{
      const image=new Image();images[name]=image;
      image.onload=()=>{
        const decoded=typeof image.decode==='function'?image.decode():Promise.resolve();
        decoded.then(resolve,reject);
      };
      image.onerror=()=>reject(new Error(`Could not load ${name} action`));image.src=src;
    });
  }
  function loadAssets() {
    if(loading)return loading;
    state.assets='loading';
    loading=Promise.all(Object.entries(assets).map(([name,a])=>loadImage(name,a.src)))
      .then(()=>{
        configureLayers();state.assets='ready';setStatus();readyButton();
        const pending=state.pending;state.pending=null;
        if(pending==='begin'&&state.page==='cover')begin();
        else if(state.page==='questions')renderQuestion(state.paused&&state.questionTime===0);
        resolveWorldPending();
      }).catch(()=>{
        state.assets='error';readyButton();
        if(state.pending||state.page==='questions')setStatus(state.page==='questions'?'动作暂时未加载，点“再看一次”重试。':'动作暂时未加载，请再点一次按钮。');
        state.pending=null;
        if(state.worldPending){readyContinue();setStatus('小猫的动作暂时未加载，请再点一次重试。');}
      }).finally(()=>{loading=null;});
    return loading;
  }
  function setSceneAccess(page) {
    for(const [name,node] of [['cover',cover],['questions',questions],['world',world],['showcase',showcase],['companion',companion],['craft',craft]]){
      node.inert=name!==page;node.setAttribute('aria-hidden',String(name!==page));
    }
    $('#page-current').textContent={cover:'01',questions:'02',world:'03',showcase:'04',companion:'05',craft:'06'}[page];
    $('#motion-toggle').hidden=['showcase','companion','craft'].includes(page);
  }
  function leaveShowcase(){
    state.showcasePending=null;showcase.style.opacity='0';showcase.style.visibility='hidden';
    cat.style.opacity='1';cat.setAttribute('aria-hidden','false');
    $('.world-bottom').style.opacity='1';$('#world-portal').style.transformOrigin='50% 100%';
  }
  function setPage(page,focus=false) {
    if(page==='craft'){openCraft(focus);return;}
    craft.style.visibility='hidden';craft.style.opacity='0';
    if(page==='companion'){openDesktop(focus);return;}
    companion.style.visibility='hidden';companion.style.opacity='0';
    if(page==='showcase'){openShowcase(focus);return;}
    leaveShowcase();
    if(page==='world'){enterWorld(false,focus);return;}
    state.pending=null;state.page=page;state.phase='rest';state.segmentStart=0;
    state.worldPending=null;state.worldTime=0;state.revealTime=0;state.worldHasPrevious=false;
    world.style.opacity='0';world.style.visibility='hidden';meetButton.hidden=true;readyContinue();
    const first=page==='cover';document.body.dataset.page=page;
    cover.style.opacity=first?'1':'0';cover.style.visibility=first?'visible':'hidden';cover.style.transform='';
    questions.style.opacity=first?'0':'1';questions.style.visibility=first?'hidden':'visible';
    readyButton();setStatus();setSceneAccess(page);
    if(first) {
      voiceNodes.forEach(n=>{n.style.opacity='0';n.style.transform='';});opacity(1,0,0);drawFrame(motion.coverFrame(state.time));
      cat.setAttribute('aria-label','戴着圆眼镜、抱着红书的哲学小猫');
    } else {
      state.questionTime=0;renderQuestion(state.paused);
      if(state.assets!=='ready') {
        setStatus(state.assets==='error'?'动作暂时未加载，点“再看一次”重试。':'小猫准备一下，马上就好。');
      }
    }
    moveCat(anchorPose(first?'#cover-cat-anchor':'#question-cat-anchor'));
    if(location.hash!==`#${page}`)history.replaceState(null,'',`#${page}`);
    if(focus)$(first?'#begin':'#question-title').focus({preventScroll:true});
  }
  function begin() {
    if(state.phase!=='rest'||state.page!=='cover')return;
    if(state.assets!=='ready') {
      state.pending='begin';beginButton.disabled=true;beginButton.setAttribute('aria-busy','true');
      setStatus('小猫准备一下，马上出发。');if(!loading)loadAssets();return;
    }
    if(state.paused){setPage('questions',true);return;}
    state.from=anchorPose('#cover-cat-anchor');state.phase='run';state.transitionTime=0;state.segmentStart=0;
    const to=anchorPose('#question-cat-anchor');
    state.direction=to.x+96*to.scale>=state.from.x+96*state.from.scale?-1:1;
    layers.run.style.transform=`scaleX(${state.direction})`;
    beginButton.disabled=true;cover.inert=true;questions.style.visibility='visible';
    document.body.dataset.page='transition';cat.dataset.action='run';
    cat.setAttribute('aria-label','从电脑屏幕向外奔跑的哲学小猫');renderRun();
  }
  function back(){state.transitionTime=0;setPage('cover',true);}
  function previous(){
    if(state.page==='craft')openDesktop(true);
    else if(state.page==='companion'){openShowcase(true);state.paused=reducedMotion.matches;syncPause();}
    else if(state.page==='showcase'){
      setPage('world',true);
      if(!state.worldPending){state.worldTime=motion.WORLD_MS;state.phase='rest';renderWorld();}
    }else if(state.page==='world')setPage('questions',true);else back();
  }
  function replay(){
    if(state.page!=='questions'||state.phase!=='rest')return;
    state.questionTime=0;voiceNodes.forEach(n=>{n.style.opacity='0';});
    if(state.assets!=='ready'){setStatus('小猫准备一下，马上就好。');loadAssets();}
    renderQuestion(state.paused);
  }
  function measure(){
    const r=stage.getBoundingClientRect();state.size={width:r.width,height:r.height};voiceWidths=voiceNodes.map(n=>n.offsetWidth);
    if(state.phase==='rest'&&!['world','showcase','companion','craft'].includes(state.page))moveCat(anchorPose(pageAnchor()));
    if(state.page==='world'&&state.worldTime>=motion.WORLD_WALK_END)moveCat(anchorPose('#world-cat-anchor'));
    if(state.page==='questions')renderVoices(state.paused&&state.questionTime===0);
  }
  function renderVoices(staticMode=false){
    const {width,height}=state.size;
    voiceNodes.forEach((node,index)=>{
      let pose;
      if(staticMode){
        const x=[.31,.71,.48][index],y=[.14,.85,.02][index];
        pose={opacity:index<3?.8:0,x:(x||0)*width,y:(y||0)*height,scale:1,rotation:0};
        const half=Math.min((voiceWidths[index]||160)/2+6,width/2);pose.x=motion.clamp(pose.x,half,width-half);
      }else pose=motion.voice(state.questionTime,index,width,height,voiceWidths[index]||160);
      node.style.opacity=String(pose.opacity);
      node.style.transform=pose.opacity>0?`translate3d(${pose.x}px,${pose.y}px,0) translate(-50%,-50%) rotate(${pose.rotation}deg) scale(${pose.scale})`:'';
    });
  }
  function renderQuestion(staticMode=false){
    if(state.assets==='ready') {
      drawAction('scratch',staticMode?assets.scratch.posterFrame:motion.actionFrame(assets.scratch,state.questionTime));
      opacity(0,0,1);cat.dataset.action='scratch';cat.setAttribute('aria-label','摘下帽子、反复挠头的哲学小猫');
    } else {drawFrame({row:0,col:0});opacity(1,0,0);}
    renderVoices(staticMode);
  }
  function renderRun(){
    const to=anchorPose('#question-cat-anchor');
    const p=motion.runTransition(state.transitionTime,state.from,to,state.segmentStart);
    moveCat(p);cover.style.opacity=String(p.coverOpacity);cover.style.transform=`translateY(${-18*(1-p.coverOpacity)}px)`;
    questions.style.opacity=String(p.questionOpacity);
    drawAction('run',motion.actionFrame(assets.run,state.transitionTime));
    drawAction('scratch',assets.scratch.timeline[0].frame);
    opacity(p.coverCatOpacity,p.runOpacity,p.scratchOpacity);
    if(p.complete)setPage('questions',true);
  }
  function loadWorldAssets(){
    if(worldLoading)return worldLoading;
    state.worldAssets='loading';
    worldLoading=Promise.all(worldSources.map(name=>loadImage(`world:${name}`,`./assets/world/${name}`)))
      .then(()=>{state.worldAssets='ready';resolveWorldPending();})
      .catch(()=>{state.worldAssets='error';readyContinue();
        if(state.worldPending)setStatus(state.page==='world'?'门后的画面暂时未加载，点“再看一次”重试。':'门后的画面暂时未加载，请再点一次“继续往前走”。');
      }).finally(()=>{worldLoading=null;});
    return worldLoading;
  }
  function resolveWorldPending(){
    if(!state.worldPending||state.assets!=='ready'||state.worldAssets!=='ready')return;
    const pending=state.worldPending;state.worldPending=null;readyContinue();setStatus();
    if(pending==='enter'&&state.page==='questions')startWorld(true,true);
    else if(pending!=='enter'&&state.page==='world')startWorld(false,pending!=='direct');
  }
  function ensureWorld(pending){
    if(state.assets==='ready'&&state.worldAssets==='ready')return true;
    state.worldPending=pending;continueButton.disabled=true;continueButton.setAttribute('aria-busy','true');
    setStatus('小猫准备一下，马上就好。');
    if(state.assets!=='ready'&&!loading)loadAssets();
    if(state.worldAssets!=='ready'&&!worldLoading)loadWorldAssets();
    return false;
  }
  function enterWorld(fromQuestions=true,focus=true){
    if(fromQuestions&&(state.page!=='questions'||state.phase!=='rest'))return;
    if(!fromQuestions){
      leaveShowcase();
      state.pending=null;state.worldPending=null;state.page='world';state.phase='rest';
      state.worldTime=0;state.revealTime=0;state.worldHasPrevious=false;
      state.worldFrom=anchorPose('#question-cat-anchor');
      cover.style.visibility='hidden';questions.style.visibility='hidden';world.style.visibility='visible';world.style.opacity='1';
      document.body.dataset.page='world';setSceneAccess('world');
      moveCat(state.worldFrom);drawFrame({row:9,col:4});opacity(1,0,0);
      renderWorld();
    }
    if(!ensureWorld(fromQuestions?'enter':'direct'))return;
    startWorld(fromQuestions,focus);
  }
  function startWorld(fromQuestions,focus){
    state.worldFrom=fromQuestions?{...state.pose}:anchorPose('#question-cat-anchor');
    leaveShowcase();state.worldSegmentStart=motion.WORLD_WALK_START;state.worldHasPrevious=fromQuestions;
    state.worldPending=null;state.pending=null;state.page='world';state.phase=state.paused?'rest':'story';
    state.worldTime=state.paused?motion.WORLD_MS:0;state.revealTime=0;
    document.body.dataset.page='world';world.style.visibility='visible';world.style.opacity='1';cover.style.visibility='hidden';
    readyContinue();setStatus();setSceneAccess('world');
    if(location.hash!=='#world')history.replaceState(null,'','#world');
    renderWorld();if(focus)$('#world-title').focus({preventScroll:true});
  }
  function replayWorld(){
    if(state.page!=='world')return;
    // A replay stops the old sequence even while a failed asset is being retried.
    state.phase='rest';leaveShowcase();
    if(!ensureWorld('replay'))return;
    startWorld(false,true);
  }
  function meet(){
    if(state.page!=='world'||state.phase!=='rest'||state.worldTime<motion.WORLD_MS||state.revealTime>0||state.worldPending)return;
    if(!state.showcaseReady){
      state.showcasePending='flight';setStatus('门后的世界正在准备，马上就好。');
      if(state.showcaseError)reloadShowcase();return;
    }
    if(state.paused){openShowcase(true);return;}
    state.showcasePending=null;state.showcaseTime=0;state.revealTime=0;state.phase='fly';
    setStatus();showcase.style.visibility='visible';renderShowcase(true);renderFlight();
  }
  function renderWorld(){
    const p=motion.worldTimeline(state.worldTime,state.revealTime);
    questions.style.opacity=String(state.worldHasPrevious?p.previousOpacity:0);
    questions.style.visibility=state.worldHasPrevious&&p.previousOpacity>0?'visible':'hidden';
    if(p.previousOpacity===0)voiceNodes.forEach(n=>{n.style.opacity='0';n.style.transform='';});
    $('#world-heading').style.opacity=String(p.headingOpacity);
    const portal=$('#world-portal');portal.style.opacity=String(p.portalOpacity);
    portal.style.transform=`translateX(-50%) scale(${p.portalScale})`;
    $('#door-left').style.transform=`rotateY(${-p.doorAngle}deg)`;
    $('#door-right').style.transform=`rotateY(${p.doorAngle}deg)`;
    $('.door-frame').style.opacity=String(p.frameOpacity);
    const people=$('#philosophers');people.style.opacity=String(p.peopleOpacity);
    people.style.transform=`scale(${p.peopleScale})`;
    people.setAttribute('aria-hidden','true');
    meetButton.hidden=!p.complete||state.phase==='fly'||Boolean(state.worldPending);
    const to=anchorPose('#world-cat-anchor');
    moveCat(motion.worldJourney(state.worldTime,state.worldFrom||to,to,state.worldSegmentStart));
    const running=p.runOpacity>0;
    const looking=state.worldTime<motion.WORLD_WALK_END;
    drawFrame(looking?{row:9,col:4}:{row:0,col:0});
    if(state.assets==='ready'){
      if(running){
        const from=state.worldFrom;state.direction=to.x+96*to.scale>=from.x+96*from.scale?-1:1;
        layers.run.style.transform=`scaleX(${state.direction})`;
        drawAction('run',motion.actionFrame(assets.run,state.worldTime-motion.WORLD_WALK_START));
      }
      if(!state.worldHasPrevious)drawAction('scratch',assets.scratch.posterFrame);
      const scratch=state.worldHasPrevious?p.scratchOpacity:0;
      opacity((1-p.runOpacity)*(1-scratch),p.runOpacity*(1-scratch),scratch);
    }else opacity(1,0,0);
    cat.dataset.action=running?'run':looking?'lookRight':'idle';
    cat.setAttribute('aria-label',running?'向打开的门跑去的哲学小猫':looking?'望向前方的哲学小猫':'停在哲学家身旁的哲学小猫');
  }
  function renderFlight(){
    renderWorld();
    const portal=$('#world-portal'),rect=portal.getBoundingClientRect();
    const p=motion.portalFlight(state.revealTime,window.innerWidth,window.innerHeight,rect);
    portal.style.transformOrigin='50% 50%';
    portal.style.transform=`translateX(-50%) translate3d(${p.x}px,${p.y}px,0) scale(${p.scale})`;
    $('#door-left').style.transform=`rotateY(${-p.doorAngle}deg)`;$('#door-right').style.transform=`rotateY(${p.doorAngle}deg)`;
    $('#philosophers').style.opacity=String(p.peopleOpacity);
    $('#world-heading').style.opacity=String(p.decorOpacity);$('.world-bottom').style.opacity=String(p.decorOpacity);
    cat.style.opacity=String(p.decorOpacity);world.style.opacity=String(p.worldOpacity);showcase.style.opacity=String(p.showcaseOpacity);
    if(p.complete)openShowcase(true);
  }
  function postShowcase(data){
    showcaseFrame.contentWindow?.postMessage(data,location.protocol==='file:'?'*':location.origin);
  }
  function renderShowcase(seek=false){
    postShowcase({type:'philo-showcase-render',time:state.showcaseTime,
      paused:state.paused||document.hidden||state.page!=='showcase',seek});
  }
  function openShowcase(focus=false){
    state.showcaseTime=0;state.page='showcase';state.phase='rest';state.pending=null;state.worldPending=null;
    state.showcasePending=state.showcaseReady?null:'direct';document.body.dataset.page='showcase';
    for(const scene of [cover,questions,world,companion,craft]){scene.style.opacity='0';scene.style.visibility='hidden';}
    showcase.style.opacity='1';showcase.style.visibility='visible';cat.style.visibility='hidden';cat.setAttribute('aria-hidden','true');
    setSceneAccess('showcase');history.replaceState(null,'','#showcase');
    if(state.showcaseReady)setStatus();else {setStatus('网页版演示正在准备，马上就好。');if(state.showcaseError)reloadShowcase();}
    renderShowcase(true);if(focus)$('#showcase-next').focus({preventScroll:true});
  }
  function loadDesktopAssets(){
    if(desktopLoading)return;
    state.desktopAssets='loading';
    desktopLoading=Promise.all(['wallpaper.jpg','philo-cat-sprites.png'].map(name=>loadImage('desktop-'+name,'./assets/'+name)))
      .then(()=>{state.desktopAssets='ready';if(state.page==='companion'){setStatus();desktopDemo.resize();renderDesktop();}})
      .catch(()=>{state.desktopAssets='error';if(state.page==='companion')setStatus('桌宠素材暂时未加载，点击“重新播放”重试。');})
      .finally(()=>{desktopLoading=null;});
  }
  function openDesktop(focus=false){
    if(state.page==='companion')return;
    state.pending=null;state.worldPending=null;state.showcasePending=null;
    state.page='companion';state.phase='rest';state.desktopTime=0;state.paused=reducedMotion.matches;state.lastTime=null;
    leaveShowcase();
    for(const scene of [cover,questions,world,craft]){scene.style.opacity='0';scene.style.visibility='hidden';}
    companion.style.opacity='1';companion.style.visibility='visible';cat.style.visibility='hidden';cat.setAttribute('aria-hidden','true');
    document.body.dataset.page='companion';setSceneAccess('companion');history.replaceState(null,'','#companion');
    renderShowcase();syncPause();desktopDemo.resize();renderDesktop();
    setStatus(state.desktopAssets==='ready'?'':'桌宠正在准备，马上就好。');
    if(state.desktopAssets==='error')loadDesktopAssets();
    if(focus)$('#companion-title').focus({preventScroll:true});
  }
  function renderDesktop(){
    if(state.page!=='companion')return;
    desktopDemo.render(state.desktopTime,reducedMotion.matches&&state.desktopTime===0);
  }
  function replayDesktop(){
    if(state.page!=='companion')return;
    state.desktopTime=0;state.paused=reducedMotion.matches;syncPause();
    if(state.desktopAssets!=='ready')loadDesktopAssets();
    desktopDemo.resize();renderDesktop();
  }
  function desktopAction(time){
    if(state.page!=='companion')return;
    state.desktopTime=time;state.paused=true;syncPause();renderDesktop();
  }
  function openCraft(focus=false){
    if(state.page==='craft')return;
    state.pending=null;state.worldPending=null;
    state.page='craft';state.phase='rest';state.lastTime=null;
    leaveShowcase();
    for(const scene of [cover,questions,world,companion]){scene.style.opacity='0';scene.style.visibility='hidden';}
    craft.style.opacity='1';craft.style.visibility='visible';cat.style.visibility='hidden';cat.setAttribute('aria-hidden','true');
    document.body.dataset.page='craft';setSceneAccess('craft');history.replaceState(null,'','#craft');
    setStatus();renderShowcase();replayCraft();
    if(focus)$('#craft-title').focus({preventScroll:true});
  }
  function renderCraft(){
    if(state.page==='craft')craftDemo.render(state.craftTime,reducedMotion.matches);
  }
  function replayCraft(){
    if(state.page!=='craft')return;
    state.craftTime=0;state.paused=reducedMotion.matches;state.lastTime=null;
    $('#craft-example').open=false;$('#craft-scroll').scrollTop=0;
    syncPause();renderCraft();
  }
  function seekShowcase(time){
    if(state.page!=='showcase'||!state.showcaseReady)return;
    state.showcaseTime=motion.clamp(time,0,state.showcaseDuration);renderShowcase(true);
  }
  function chapter(name){seekShowcase(name==='roundtable'?(state.paused?state.showcaseDuration:state.deepEnd):0);}
  function showcaseFailed(){
    state.showcaseReady=false;state.showcaseError=true;
    if(state.showcasePending||state.page==='showcase')setStatus('网页版演示暂时未加载，请点击原按钮或“重播”重试。');
  }
  function watchShowcase(){
    clearTimeout(showcaseTimer);showcaseTimer=setTimeout(()=>{if(!state.showcaseReady)showcaseFailed();},20000);
  }
  function reloadShowcase(){
    state.showcaseError=false;state.showcaseReady=false;watchShowcase();
    showcaseFrame.src=`./showcase/index.html?v=roundtable-readonly-1&retry=${++showcaseAttempt}`;
  }
  window.addEventListener('message',event=>{
    if(event.source!==showcaseFrame.contentWindow||event.origin!==(location.protocol==='file:'?'null':location.origin))return;
    const message=event.data;if(!message||typeof message.type!=='string')return;
    if(message.type==='philo-showcase-ready'&&Number.isFinite(message.duration)&&message.duration>0){
      state.showcaseReady=true;state.showcaseError=false;clearTimeout(showcaseTimer);
      state.showcaseDuration=message.duration;state.deepEnd=message.deepEnd;
      if(state.showcasePending==='flight'&&state.page==='world'){state.showcasePending=null;meet();}
      else if(state.page==='showcase'){state.showcasePending=null;setStatus();renderShowcase(true);}
    }else if(message.type==='philo-showcase-error')showcaseFailed();
    else if(state.page==='showcase'){
      if(message.type==='philo-showcase-progress'){
        if(message.complete&&!state.paused){state.paused=true;syncPause();}
      }else if(message.type==='philo-showcase-pause'){state.paused=true;syncPause();}
      else if(message.type==='philo-showcase-toggle'){state.paused=!state.paused;syncPause();}
      else if(message.type==='philo-showcase-chapter')chapter(message.chapter);
      else if(message.type==='philo-showcase-seek'&&Number.isFinite(message.time))seekShowcase(message.time);
      else if(message.type==='philo-showcase-back')previous();
      else if(message.type==='philo-showcase-next')openDesktop(true);
    }
  });
  showcaseFrame.addEventListener('error',showcaseFailed);
  showcaseFrame.addEventListener('load',()=>postShowcase({type:'philo-showcase-ping'}));
  $('#showcase-replay').addEventListener('click',()=>{if(state.page!=='showcase')return;state.paused=reducedMotion.matches;state.showcaseTime=0;syncPause();if(state.showcaseReady)seekShowcase(0);else reloadShowcase();});
  $('#showcase-next').addEventListener('click',()=>{if(state.page==='showcase')openDesktop(true);});
  $('#showcase-back').addEventListener('click',()=>{if(state.page==='showcase')previous();});
  $('#pet-replay').addEventListener('click',replayDesktop);
  $('#pet-back').addEventListener('click',()=>{if(state.page==='companion')previous();});
  $('#pet-next').addEventListener('click',()=>{if(state.page==='companion')openCraft(true);});
  $('#craft-replay').addEventListener('click',replayCraft);
  $('#craft-back').addEventListener('click',()=>{if(state.page==='craft')previous();});
  $('#craft-example').addEventListener('toggle',()=>{
    if(state.page==='craft'&&$('#craft-example').open){state.craftTime=craftMotion.DURATION;state.paused=true;syncPause();renderCraft();}
  });
  $('#pet-source-button').addEventListener('click',()=>desktopAction(desktopMotion.SOURCE_AT+400));
  $('#pet-plain-button').addEventListener('click',()=>desktopAction(desktopMotion.EXPLAIN_AT));
  $('#pet-return-quote').addEventListener('click',()=>desktopAction(2200));
  $('#pet-deep-button').addEventListener('click',()=>{if(state.page==='companion'){openShowcase(true);state.paused=reducedMotion.matches;syncPause();}});
  function tick(time){
    const delta=state.lastTime===null?0:Math.min(time-state.lastTime,64);state.lastTime=time;
    if(!state.paused&&!document.hidden){
      if(state.phase==='run'){state.transitionTime+=delta;renderRun();}
      else if(state.page==='world'){
        if(state.phase==='story'){
          state.worldTime=Math.min(motion.WORLD_MS,state.worldTime+delta);renderWorld();
          if(state.worldTime===motion.WORLD_MS)state.phase='rest';
        }else if(state.phase==='fly'){
          state.revealTime=Math.min(motion.REVEAL_MS,state.revealTime+delta);renderFlight();
        }
      }
      else if(state.page==='showcase'){
        if(state.showcaseReady){state.showcaseTime=Math.min(state.showcaseDuration,state.showcaseTime+delta);renderShowcase();}
      }
      else if(state.page==='companion'){
        if(state.desktopAssets==='ready'){state.desktopTime=Math.min(desktopMotion.DURATION,state.desktopTime+delta);renderDesktop();}
      }
      else if(state.page==='craft'){state.craftTime=Math.min(craftMotion.DURATION,state.craftTime+delta);renderCraft();}
      else if(state.page==='cover'){state.time+=delta;const f=motion.coverFrame(state.time);drawFrame(f);cat.dataset.action=f.action;}
      else if(state.assets==='ready'){state.questionTime+=delta;renderQuestion();}
    }
    state.raf=requestAnimationFrame(tick);
  }
  function syncPause(){
    $('#motion-toggle').setAttribute('aria-pressed',String(state.paused));
    $('#motion-toggle').setAttribute('aria-label',state.paused?'播放动画':'暂停动画');
    $('#motion-label').textContent=state.paused?'播放动画':'暂停动画';document.body.classList.toggle('is-paused',state.paused);
    if(state.page==='showcase')renderShowcase();
  }
  beginButton.addEventListener('click',begin);$('#back').addEventListener('click',back);$('#replay').addEventListener('click',replay);
  continueButton.addEventListener('click',()=>enterWorld());meetButton.addEventListener('click',meet);
  $('#world-back').addEventListener('click',previous);$('#world-replay').addEventListener('click',replayWorld);
  $('.wordmark').addEventListener('click',event=>{event.preventDefault();back();});
  $('#motion-toggle').addEventListener('click',()=>{state.paused=!state.paused;syncPause();});
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
    if(event.key==='Escape'){event.preventDefault();back();}
    else if(event.key==='ArrowLeft'){event.preventDefault();previous();}
    else if(event.key==='ArrowRight'){event.preventDefault();if(state.page==='cover')begin();else if(state.page==='questions')enterWorld();else if(state.page==='showcase')openDesktop(true);else if(state.page==='world')meet();else if(state.page==='companion')openCraft(true);}
    else if(event.code==='Space'&&['showcase','companion','craft'].includes(state.page)&&!['BUTTON','INPUT','TEXTAREA','A','SUMMARY'].includes(event.target?.tagName)){event.preventDefault();state.paused=!state.paused;syncPause();}
  });
  function reanchor(){
    if(state.phase==='run') {
      state.from={...state.pose};state.segmentStart=state.transitionTime;
      const to=anchorPose('#question-cat-anchor');
      state.direction=to.x+96*to.scale>=state.from.x+96*state.from.scale?-1:1;
      layers.run.style.transform=`scaleX(${state.direction})`;
    }
    if(state.page==='world'&&state.worldTime<motion.WORLD_WALK_END&&state.pose){state.worldFrom={...state.pose};state.worldSegmentStart=Math.max(motion.WORLD_WALK_START,state.worldTime);}
    measure();if(state.phase==='run')renderRun();else if(state.phase==='fly')renderFlight();else if(state.page==='world')renderWorld();else if(state.page==='companion'){desktopDemo.resize();renderDesktop();}
  }
  window.addEventListener('resize',()=>{
    if(resizePending)return;resizePending=true;
    requestAnimationFrame(()=>{reanchor();resizePending=false;});
  });
  window.addEventListener('scroll',()=>{if(state.phase==='rest'&&!state.worldPending&&!['showcase','companion','craft'].includes(state.page))moveCat(anchorPose(pageAnchor()));},{passive:true});
  const hashPage=()=>location.hash==='#craft'?'craft':location.hash==='#companion'?'companion':location.hash==='#showcase'?'showcase':location.hash==='#world'?'world':location.hash==='#questions'?'questions':'cover';
  window.addEventListener('hashchange',()=>setPage(hashPage()));
  document.addEventListener('visibilitychange',()=>{state.lastTime=null;if(state.page==='showcase')renderShowcase();});
  reducedMotion.addEventListener('change',event=>{
    state.paused=event.matches;syncPause();
    if(state.paused&&state.phase==='run')setPage('questions');
    else if(state.paused&&state.page==='questions'){state.questionTime=0;renderQuestion(true);}
    else if(state.paused&&state.page==='world'&&!state.worldPending){
      if(state.phase==='fly'){openShowcase(true);return;}
      state.worldTime=motion.WORLD_MS;state.phase='rest';renderWorld();
    }
    else if(state.paused&&state.page==='companion'){state.desktopTime=desktopMotion.DURATION;renderDesktop();}
    else if(state.paused&&state.page==='craft'){state.craftTime=craftMotion.DURATION;renderCraft();}
  });
  document.fonts.ready.then(reanchor);
  window.addEventListener('pagehide',()=>cancelAnimationFrame(state.raf));
  window.addEventListener('pageshow',event=>{if(event.persisted){state.lastTime=null;state.raf=requestAnimationFrame(tick);reanchor();}});
  measure();syncPause();loadAssets();loadWorldAssets();loadDesktopAssets();setPage(hashPage());watchShowcase();postShowcase({type:'philo-showcase-ping'});state.raf=requestAnimationFrame(tick);
})();
