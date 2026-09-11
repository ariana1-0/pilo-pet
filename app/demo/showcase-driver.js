(() => {
  'use strict';
  const $=s=>document.querySelector(s),data=window.PhiloShowcaseData,motion=window.PhiloShowcaseMotion;
  const people=data.people,bySlug=new Map(people.map(p=>[p.slug,p]));
  const stream=$('#rt-stream'),empty=stream.querySelector('.roundtable-empty');
  const plan=motion.timeline(data);
  let lastTime=-1,lastMode='',lastPerson=-1,manualScroll=false,ready=false;
  let current={time:0,paused:true};
  const origin=location.protocol==='file:'?'*':location.origin;
  const send=(type,extra={})=>parent.postMessage({type:'philo-showcase-'+type,...extra},origin);
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  // Keep one outgoing surface so the background and paper crossfade together.
  const liveDeep=$('#app');
  liveDeep.querySelectorAll('[id]').forEach(node=>{node.dataset.showcasePart=node.id;});
  const outgoing=document.createElement('div');outgoing.className='showcase-outgoing';outgoing.hidden=true;outgoing.inert=true;outgoing.setAttribute('aria-hidden','true');
  const outgoingBackdrop=$('.backdrop').cloneNode(true),outgoingDeep=liveDeep.cloneNode(true);
  for(const node of [outgoingDeep,...outgoingDeep.querySelectorAll('[id]')])node.removeAttribute('id');
  outgoingDeep.querySelectorAll('[for]').forEach(node=>node.removeAttribute('for'));
  outgoingDeep.removeAttribute('aria-labelledby');outgoingBackdrop.removeAttribute('id');
  outgoing.append(outgoingBackdrop,outgoingDeep);document.body.append(outgoing);
  let outgoingPerson=-1,skippedFade='';
  function picture(person){const n=document.createElement('img');n.src=person.portrait;n.alt=person.name;n.style.objectPosition=person.portraitPosition;return n;}
  function background(person,n=$('.backdrop')){
    n.style.backgroundImage=`url("${person.background}")`;n.style.backgroundPosition=person.backgroundPosition;
    n.style.setProperty('--background-saturation',person.backgroundSaturation??1);
    n.classList.toggle('supplied-background',person.slug!=='marcus-aurelius');
  }
  function mode(name){
    if(lastMode===name)return;
    lastMode=name;document.body.dataset.mode=name;
    $('#app').hidden=name!=='deep';$('#roundtable').hidden=name!=='roundtable';
    for(const link of document.querySelectorAll('[data-mode]'))link.setAttribute('aria-current',link.dataset.mode===name?'page':'false');
    if(name==='roundtable')background(bySlug.get('marcus-aurelius'));
  }
  function deepContent(root,index){
    const p=people[index],part=name=>root.querySelector(`[data-showcase-part="${name}"]`);
    text(part('philosopher-name'),p.name);text(part('latin-name'),p.latinName);
    const portrait=part('portrait');portrait.src=p.portrait;portrait.alt=p.name+'的肖像';portrait.style.objectPosition=p.portraitPosition;
    portrait.style.transform=`scale(${p.portraitScale||1})`;portrait.style.transformOrigin=p.portraitPosition;
    const node=document.createElement('div');node.className='msg philo opening';
    const body=document.createElement('div');body.className='speaker-text';body.textContent=p.opening;node.append(body);
    part('stream').replaceChildren(node);part('stream').scrollTop=0;
    part('btn-philosopher').setAttribute('aria-label','当前为'+p.name+'，选择哲学家');
  }
  function deep(index){
    if(lastPerson===index)return;lastPerson=index;
    deepContent(liveDeep,index);background(people[index]);
  }
  function crossfade(p,seek){
    const key=p.fadeFrom>=0?`${p.mode}:${p.fadeFrom}`:'';
    if(seek||!key)skippedFade=key;
    const visible=Boolean(key)&&key!==skippedFade&&p.fade<1;
    outgoing.hidden=!visible;if(!visible)return;
    if(outgoingPerson!==p.fadeFrom){
      outgoingPerson=p.fadeFrom;deepContent(outgoingDeep,p.fadeFrom);background(people[p.fadeFrom],outgoingBackdrop);
    }
    const rect=$(p.mode==='deep'?'#app':'#roundtable').getBoundingClientRect();
    Object.assign(outgoingDeep.style,{position:'absolute',margin:'0',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
    outgoingDeep.hidden=false;outgoing.style.opacity=String(1-p.fade);
  }
  const user=document.createElement('div');user.className='msg user';user.textContent=data.capture.prompt;stream.append(user);
  const speeches=data.capture.turns.map(turn=>{
    const article=document.createElement('article');article.className='roundtable-message msg';
    const label=document.createElement('div');label.className='speaker-label';const name=document.createElement('span');name.textContent=bySlug.get(turn.slug).name;
    label.append(picture(bySlug.get(turn.slug)),name);
    const body=document.createElement('div');body.className='speaker-text';body.textContent=window.PhiloChat.replyText(turn.text,false);
    article.append(label,body);stream.append(article);return {article,body,characters:Array.from(turn.text)};
  });
  for(const slug of data.capture.participants){
    const p=bySlug.get(slug),seat=document.createElement('div');seat.className='roundtable-seat';
    const frame=document.createElement('div');frame.className='seat-portrait';const img=picture(p);img.style.transform=`scale(${p.portraitScale||1})`;img.style.transformOrigin=p.portraitPosition;frame.append(img);
    const name=document.createElement('span');name.textContent=p.name;seat.append(frame,name);$('#rt-participants').append(seat);
  }
  function discussionHeader(started){
    $('#roundtable').classList.toggle('has-discussion',started);
    $('#rt-participants').hidden=started;$('.roundtable-header .chapter-rule').hidden=started;
    $('#rt-form').hidden=started;
    $('.roundtable-controls').hidden=!started;
    text($('#rt-choose'),started?'新开圆桌':'选择入场者');
  }
  function render(time,paused=false,seek=false){
    current={time,paused};
    if(!ready)return;
    if(seek||(!paused&&time!==lastTime))manualScroll=false;
    const p=motion.pose(time,data,plan);
    mode(p.mode);
    let label;
    if(p.mode==='deep'){
      deep(p.index);
      label='深度聊 · '+people[p.index].name+`　${p.index+1} / ${people.length}`;
    }else{
      lastPerson=-1;
      const intro=p.phase==='intro';discussionHeader(!intro);empty.hidden=!intro;user.hidden=intro;
      $('#rt-input').value=intro?Array.from(data.capture.prompt).slice(0,Math.floor(Array.from(data.capture.prompt).length*p.promptProgress)).join(''):'';
      speeches.forEach((speech,i)=>{
        speech.article.hidden=intro||(p.phase==='speaking'&&i>p.index);
        if(speech.article.hidden)return;
        const partial=p.phase==='speaking'&&i===p.index&&p.progress<1;
        const raw=partial?speech.characters.slice(0,Math.floor(speech.characters.length*p.progress)).join(''):data.capture.turns[i].text;
        text(speech.body,window.PhiloChat.replyText(raw,partial));
      });
      const speaker=p.phase==='speaking'?bySlug.get(data.capture.turns[p.index].slug).name:'';
      text($('#rt-status'),p.phase==='speaking'?speaker+'正在发言…':'先聊到这里。你也可以接着问。');
      if(!manualScroll){
        const distance=Math.max(0,stream.scrollHeight-stream.clientHeight);
        stream.scrollTop=intro?0:distance;
      }
      label=intro?'圆桌派 · 把问题放在桌上':p.phase==='speaking'?`圆桌实录 · ${speaker}　${p.index+1} / ${speeches.length}`:'圆桌实录 · 生成结束';
    }
    crossfade(p,seek);lastTime=time;send('progress',{label,complete:Boolean(p.complete),mode:p.mode});
  }
  function announceReady(){send('ready',{duration:plan.end,deepEnd:plan.deepEnd});}
  function manual(){manualScroll=true;send('pause');}
  for(const node of [stream,$('#stream')]){
    node.addEventListener('wheel',manual,{passive:true});node.addEventListener('touchstart',manual,{passive:true});
    node.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(e.key))manual();});
  }
  for(const form of document.querySelectorAll('form'))form.addEventListener('submit',e=>e.preventDefault());
  for(const input of document.querySelectorAll('textarea')){input.disabled=false;input.readOnly=true;}
  for(const link of document.querySelectorAll('[data-mode]'))link.addEventListener('click',e=>{e.preventDefault();send('chapter',{chapter:link.dataset.mode});});
  $('.wordmark').addEventListener('click',e=>{e.preventDefault();send('chapter',{chapter:'deep'});});
  $('#btn-philosopher').addEventListener('click',()=>{send('pause');$('#philosopher-dialog').showModal();});
  document.querySelector('[data-close="philosopher-dialog"]').addEventListener('click',()=>$('#philosopher-dialog').close());
  people.forEach((p,index)=>{
    const button=document.createElement('button');button.type='button';button.className='person-option';
    const name=document.createElement('strong');name.textContent=p.name;button.append(picture(p),name);
    button.addEventListener('click',()=>{$('#philosopher-dialog').close();send('seek',{time:index*motion.SLOT_MS+400});});$('#philosopher-list').append(button);
  });
  document.addEventListener('keydown',e=>{
    if(e.code==='Space'&&!['TEXTAREA','INPUT','BUTTON'].includes(e.target.tagName)){e.preventDefault();send('toggle');}
    if(e.key==='Escape'&&!$('#philosopher-dialog').open)send('back');
    if(e.key==='ArrowRight'&&!e.repeat&&!['TEXTAREA','INPUT'].includes(e.target.tagName)){e.preventDefault();send('next');}
    if(e.key==='ArrowLeft'&&!e.repeat&&!['TEXTAREA','INPUT'].includes(e.target.tagName)){e.preventDefault();send('back');}
  });
  window.addEventListener('message',e=>{
    if(e.source!==parent||(!['file:'].includes(location.protocol)&&e.origin!==location.origin))return;
    if(e.data?.type==='philo-showcase-render'&&Number.isFinite(e.data.time))render(e.data.time,Boolean(e.data.paused),Boolean(e.data.seek));
    if(e.data?.type==='philo-showcase-ping'&&ready)announceReady();
  });
  window.addEventListener('resize',()=>{if(ready)render(current.time,current.paused);});
  mode('deep');deep(0);
  const sources=new Set(['./assets/paper.jpg',...people.flatMap(p=>[p.portrait,p.background])]);
  Promise.all([...sources].map(src=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>Promise.resolve(image.decode?.()).then(resolve,reject);image.onerror=reject;image.src=src;
  }))).then(()=>document.fonts.ready).then(()=>{ready=true;announceReady();render(current.time,current.paused,true);}).catch(()=>send('error'));
})();
