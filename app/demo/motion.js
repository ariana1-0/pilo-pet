/* Pure timelines: cover actions, grounded running transition and thoughts. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PhiloMotion=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
  const smooth=(v)=>{const t=clamp(v);return t*t*(3-2*t);};
  const frames=(row,count)=>Array.from({length:count},(_,col)=>[row,col]);
  const pingpong=(row,count)=>[...frames(row,count),...frames(row,count-1).reverse()];
  const ACTION_MS=3000,FRAME_MS=165,TRANSITION_MS=2000,VOICE_MS=5600,VOICE_GAP=1700,CYCLE_MS=23500;
  const actions=[
    {name:'reading',frames:frames(7,6)},
    {name:'wave',frames:pingpong(3,4)},
    {name:'ponder',frames:pingpong(8,6)},
    {name:'stretch',frames:pingpong(5,8)},
    {name:'lookRight',frames:pingpong(9,8)},
    {name:'lookLeft',frames:pingpong(10,8)},
    {name:'hop',frames:pingpong(4,5)},
    {name:'curious',frames:pingpong(8,6)},
    {name:'talking',frames:frames(6,6)},
    {name:'runRight',frames:frames(1,8)},
    {name:'runLeft',frames:frames(2,8)},
    {name:'calm',frames:[[5,0],[5,1],[5,2],[5,1]]},
    {name:'idle',frames:[...Array.from({length:8},()=>[0,0]),...frames(0,6)]}
  ];
  const thoughts=[
    {text:'我比别人慢了',x:.13,y:.22,tilt:-8},
    {text:'我不知道选哪条路',x:.84,y:.25,tilt:6},
    {text:'努力好像没有意义',x:.49,y:.04,tilt:-3},
    {text:'我是不是不够好',x:.12,y:.72,tilt:5},
    {text:'大家都往前走了',x:.88,y:.71,tilt:-6},
    {text:'什么才算成功',x:.31,y:.91,tilt:6},
    {text:'我真的喜欢现在的生活吗',x:.58,y:.06,tilt:-3},
    {text:'如果选错了怎么办',x:.79,y:.89,tilt:-5},
    {text:'我到底想成为什么样的人',x:.22,y:.32,tilt:4}
  ];
  function coverFrame(time){
    const action=actions[Math.floor(Math.max(0,time)/ACTION_MS)%actions.length];
    const local=time % ACTION_MS;
    const frame=local>ACTION_MS-180?[0,0]:action.frames[Math.floor(local/FRAME_MS)%action.frames.length];
    return {action:action.name,row:frame[0],col:frame[1]};
  }
  function runTransition(time,from,to,segmentStart=0){
    const t=clamp(time/TRANSITION_MS);
    const travel=smooth((time-segmentStart)/Math.max(1,TRANSITION_MS-segmentStart));
    return {x:from.x+(to.x-from.x)*travel,y:from.y+(to.y-from.y)*travel,
      scale:from.scale+(to.scale-from.scale)*travel,
      coverOpacity:1-smooth((t-.16)/.42),questionOpacity:smooth((t-.52)/.38),
      // Blend poses at departure and arrival without stopping the running clock.
      runOpacity:smooth(time/120)*(1-smooth((time-1880)/120)),
      coverCatOpacity:1-smooth(time/120),scratchOpacity:smooth((time-1880)/120),complete:t>=1};
  }
  function actionFrame(asset,time){
    let local=((time%asset.duration)+asset.duration)%asset.duration;
    for(const step of asset.timeline){if(local<step.duration)return step.frame;local-=step.duration;}
    return asset.timeline[asset.timeline.length-1].frame;
  }
  function spriteLayout(asset){
    const scale=asset.renderScale;
    return {width:asset.frameWidth*scale,height:asset.frameHeight*scale,
      left:96-asset.anchor[0]*scale,top:192-asset.anchor[1]*scale,
      originX:asset.anchor[0]*scale,originY:asset.anchor[1]*scale,
      backgroundWidth:asset.frameWidth*asset.columns*scale,
      backgroundHeight:asset.frameHeight*asset.rows*scale};
  }
  function voice(time,index,width,height,textWidth){
    const thought=thoughts[index],local=(Math.max(0,time)%CYCLE_MS)-index*VOICE_GAP;
    if(local<0||local>=VOICE_MS)return {opacity:0,x:0,y:0,scale:1,rotation:0,impact:0};
    const half=Math.min(textWidth/2+8,width/2);
    const fromX=clamp(thought.x*width,half,width-half),fromY=clamp(thought.y*height,15,height-15);
    const p=smooth((local-1500)/4100),arc=Math.sin(p*Math.PI)*(index%2?-22:22);
    return {x:fromX+(width*.5-fromX)*p,y:fromY+(height*.54-fromY)*p+arc,
      scale:1-p*.62,rotation:thought.tilt*(1-p),
      opacity:smooth(local/600)*(1-smooth((p-.43)/.46)),impact:Math.max(0,1-Math.abs(p-.77)/.14)};
  }
  const WORLD_WALK_START=0,WORLD_WALK_END=2000,WORLD_MS=2900,REVEAL_MS=2600;
  function worldTimeline(time){
    const t=clamp(time,0,WORLD_MS);
    const arrival=smooth((t-WORLD_WALK_END)/900),open=smooth((t-WORLD_WALK_START)/2000);
    return {previousOpacity:1-smooth(t/600),
      headingOpacity:arrival,portalOpacity:smooth((t-WORLD_WALK_START)/800),
      doorAngle:open*94,frameOpacity:1,
      peopleOpacity:open*.32,peopleScale:.96,portalScale:1,
      scratchOpacity:1-smooth(t/150),
      runOpacity:1-smooth((t-WORLD_WALK_END)/150),
      complete:t>=WORLD_MS};
  }
  function worldJourney(time,from,to,segmentStart=WORLD_WALK_START){
    const p=smooth((time-segmentStart)/Math.max(1,WORLD_WALK_END-segmentStart));
    return {x:from.x+(to.x-from.x)*p,y:from.y+(to.y-from.y)*p,scale:from.scale+(to.scale-from.scale)*p};
  }
  function portalFlight(time,width,height,rect){
    const p=smooth(time/2100),target=Math.max(width/(rect.width*.78),height/(rect.height*.72))*1.12;
    return {scale:1+(target-1)*p,x:(width/2-rect.left-rect.width/2)*p,
      y:(height/2-rect.top-rect.height/2)*p,decorOpacity:1-smooth(time/650),
      peopleOpacity:.32+.68*smooth(time/650),doorAngle:94+16*smooth(time/850),
      worldOpacity:1-smooth((time-2200)/400),showcaseOpacity:smooth((time-2000)/600),complete:time>=REVEAL_MS};
  }
  return {clamp,smooth,actions,thoughts,ACTION_MS,TRANSITION_MS,VOICE_MS,VOICE_GAP,CYCLE_MS,WORLD_WALK_START,WORLD_WALK_END,WORLD_MS,REVEAL_MS,
    coverFrame,runTransition,actionFrame,spriteLayout,voice,worldTimeline,worldJourney,portalFlight};
});
