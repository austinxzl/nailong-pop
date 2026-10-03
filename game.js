(() => {
  'use strict';
  const $=id=>document.getElementById(id), canvas=$('board'),ctx=canvas.getContext('2d');
  const levels=[
    {name:'呆萌奶龙',file:2,color:'#ffe991'},
    {name:'元气奶龙',file:5,color:'#ffdb70'},
    {name:'比心奶龙',file:3,color:'#ffd263'},
    {name:'圆滚奶龙',file:1,color:'#ffc354'},
    {name:'功夫奶龙',file:4,color:'#ffaf48'},
    {name:'大笑奶龙',file:6,color:'#ffdc65'}
  ];
  const loadPreference=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const savePreference=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
  const imagePath=l=>`assets/dragon-${levels[l].file}.png`;
  const storedScores=loadPreference('nailong-pop-personal-scores',[]);
  let personalScores=Array.isArray(storedScores)?storedScores.filter(s=>s&&Number.isFinite(s.score)&&s.score>0&&typeof s.date==='string').sort((a,b)=>b.score-a.score).slice(0,5):[];
  let recorded=false;
  let score=0,best=Number(loadPreference('nailong-pop-best',0))||0,charge=0,current=0,next=1,aim=210;
  let ready=false,ended=false,paused=false,won=false,drops=0,lastDrop=-1,lastMerge=-10,combo=0,comboUntil=0,shakeUntil=0;
  let sound=Boolean(loadPreference('nailong-pop-sound',true)),audioContext=null,modalKind=null,lastFrame=0,accumulator=0,pointer=null;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particles=[],rings=[],discovered=new Set(),images=levels.map(()=>new Image());
  const world=new PopWorld(merge);
  const format=n=>n.toLocaleString('zh-CN');
  $('best').textContent=format(best);
  $('evolution').innerHTML=levels.map((l,i)=>`<li id="level-${i}"><div class="portrait"><img src="${imagePath(i)}" alt="${l.name}"></div><div class="level-name">${l.name}<small>LV.0${i+1}</small></div></li>`).join('');
  function announce(message){$('announcer').textContent=message;}
  function renderLeaderboard(){
    $('personal-scores').replaceChildren();
    personalScores.forEach((entry,i)=>{const li=document.createElement('li'),rank=document.createElement('span'),date=document.createElement('time'),points=document.createElement('b');rank.textContent=String(i+1).padStart(2,'0');date.textContent=entry.date;points.textContent=format(entry.score);li.append(rank,date,points);$('personal-scores').append(li);});
    $('leaderboard-empty').hidden=personalScores.length>0;
  }
  function recordRound(){
    if(recorded||score<=0)return;recorded=true;
    const now=new Date(),date=`${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
    personalScores.push({score,date});personalScores.sort((a,b)=>b.score-a.score);personalScores=personalScores.slice(0,5);savePreference('nailong-pop-personal-scores',personalScores);renderLeaderboard();
  }
  function unlock(level){discovered.add(level);$(`level-${level}`).classList.add('discovered');$('progress-count').textContent=`${discovered.size} / 6`;}
  function update(){
    $('score').textContent=format(score);$('best').textContent=format(best);
    $('charge-label').textContent=charge>=100?'已蓄满':`${charge} / 100`;
    $('charge-fill').style.width=`${charge}%`;$('shake').disabled=charge<100||paused||ended||!ready;
    $('next-image').src=imagePath(next);$('next-image').alt=`下一只：${levels[next].name}`;
  }
  function audio(freq=440,duration=.1,type='sine',volume=.07){
    if(!sound)return;
    try{if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();
      const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime;
      oscillator.type=type;oscillator.frequency.setValueAtTime(freq,t);oscillator.frequency.exponentialRampToValueAtTime(freq*.7,t+duration);
      gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(t);oscillator.stop(t+duration);
    }catch{}
  }
  function chooseNext(){const roll=Math.random();return roll<.54?0:roll<.88?1:2;}
  function drop(){
    if(!ready||paused||ended||world.time-lastDrop<.38)return;
    audio(230,.07,'sine',.035);world.spawn(current,aim,49);unlock(current);drops++;lastDrop=world.time;
    current=next;next=chooseNext();aim=Math.max(POP_RADII[current]+7,Math.min(413-POP_RADII[current],aim));
    $('board-hint').classList.add('hidden');update();
  }
  function burst(x,y,color,count=16){
    rings.push({x,y,r:12,life:.6,maxLife:.6,color});
    if(reducedMotion)return;
    for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=45+Math.random()*130;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-30,life:.55+Math.random()*.3,color,r:2+Math.random()*2});}
  }
  function merge(m){
    combo=world.time-lastMerge<2.7?Math.min(combo+1,5):1;lastMerge=world.time;comboUntil=world.time+1.25;
    const value=m.level===5?800:[12,28,64,140,300][m.level];score+=value*combo;
    charge=Math.min(100,charge+12+m.level*5);
    if(score>best){best=score;savePreference('nailong-pop-best',best);}
    burst(m.x,m.y,levels[Math.min(5,m.level+1)].color,m.level===5?40:16);
    audio(380+Math.min(m.level,5)*115,.16,'sine',.06);
    if(combo>1){$('combo').innerHTML=`<small>快乐连击</small>× ${combo}`;$('combo').classList.add('show');}
    if(m.level<5)unlock(m.level+1);
    announce(`合成${levels[Math.min(5,m.level+1)].name}，当前得分${score}`);update();
    if(m.level===4&&!won){won=true;showModal('win');}
    if(m.level===5){shakeUntil=world.time+.4;announce('双倍大笑，获得欢乐礼花奖励');}
  }
  function reset(){
    world.reset();particles.length=0;rings.length=0;discovered.clear();levels.forEach((_,i)=>$(`level-${i}`).classList.remove('discovered'));
    score=0;charge=0;current=0;next=1;aim=210;ended=false;paused=false;won=false;drops=0;lastDrop=-1;lastMerge=-10;combo=0;pointer=null;recorded=false;
    $('board-hint').classList.remove('hidden');$('danger').classList.remove('show');$('combo').classList.remove('show');$('progress-count').textContent='0 / 6';
    syncPause();update();
  }
  function syncSound(){
    $('sound').classList.toggle('muted',!sound);$('sound').setAttribute('aria-label',sound?'关闭音效':'开启音效');$('sound').title=sound?'关闭音效':'开启音效';
    $('sound').innerHTML=sound?'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>':'<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6"/></svg>';
  }
  function syncPause(){
    $('pause').setAttribute('aria-label',paused?'继续游戏':'暂停游戏');$('pause').innerHTML=paused?'<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';
    update();
  }
  function closeModal(){
    const kind=modalKind;modalKind=null;$('dialog').close();
    if(kind!=='over'){paused=false;syncPause();}
    canvas.focus({preventScroll:true});
  }
  function showModal(kind){
    if(kind==='over')recordRound();
    pointer=null;modalKind=kind;paused=true;syncPause();
    const content=$('dialog-content');
    if(kind==='help')content.innerHTML='<div class="dialog-kicker">HOW TO PLAY</div><h2>碰出一只大笑奶龙</h2><p>相同形态碰在一起，会合成下一种奶龙。连续合成还能触发连击加分。</p><p>手机上拖动瞄准、松手投放；电脑上移动鼠标、点击投放，也可以用 <kbd>←</kbd> <kbd>→</kbd> 和 <kbd>空格</kbd>。</p><p>合成会积攒欢乐值。攒满后点「震一震」，让挤在一起的奶龙重新碰撞。奶龙超过警戒线持续 3 秒，本局结束。</p><p>最后一张捧腹大笑的奶龙是终极形态。两只终极形态碰撞，会化成礼花并奖励 800 基础分。</p><button class="primary" id="modal-primary">知道了，继续玩</button>';
    if(kind==='pause')content.innerHTML='<div class="dialog-kicker">TAKE A BREAK</div><h2>快乐暂停一下</h2><p>奶龙会乖乖等你回来。</p><button class="primary" id="modal-primary">继续游戏</button>';
    if(kind==='restart')content.innerHTML='<h2>重新开一局？</h2><p>本局进度会清空，最高纪录会保留。</p><button class="primary" id="modal-primary">重新开始</button><button class="secondary" id="modal-secondary">继续这局</button>';
    if(kind==='win')content.innerHTML=`<img class="dialog-image" src="${imagePath(5)}" alt="捧腹大笑的最终形态"><div class="dialog-kicker">HAPPINESS UNLOCKED</div><h2>快乐终于绷不住了！</h2><p>你合出了最终形态「大笑奶龙」。继续挑战，两只大笑奶龙碰撞还有礼花奖励。</p><button class="primary" id="modal-primary">继续冲高分</button>`;
    if(kind==='over')content.innerHTML=`<div class="dialog-kicker">WELL PLAYED</div><h2>装满了一盒快乐</h2><p>本局得分</p><div class="result-score">${format(score)}</div><p>最高纪录 ${format(best)} · 已发现 ${discovered.size} / 6 种形态</p><button class="primary" id="modal-primary">再来一局</button>`;
    $('dialog-close').hidden=kind==='over';
    $('modal-primary').onclick=()=>{if(kind==='over'||kind==='restart'){recordRound();closeModal();reset();canvas.focus({preventScroll:true});}else closeModal();};
    if($('modal-secondary'))$('modal-secondary').onclick=closeModal;
    if(!$('dialog').open)$('dialog').showModal();
  }
  function point(e){const rect=canvas.getBoundingClientRect();aim=Math.max(POP_RADII[current]+7,Math.min(413-POP_RADII[current],(e.clientX-rect.left)/rect.width*420));}
  canvas.addEventListener('pointerdown',e=>{if(!ready||paused||ended||pointer!==null)return;pointer=e.pointerId;point(e);canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});
  canvas.addEventListener('pointermove',e=>{if(pointer!==null&&e.pointerId!==pointer)return;if(!paused&&!ended)point(e);});
  canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer)return;point(e);pointer=null;drop();});
  canvas.addEventListener('click',e=>{if(e.detail===0)return;point(e);drop();});
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  canvas.addEventListener('lostpointercapture',()=>{pointer=null;});
  document.addEventListener('keydown',e=>{
    if($('dialog').open||e.target.closest('button,a,input,textarea'))return;
    if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();aim=Math.max(POP_RADII[current]+7,Math.min(413-POP_RADII[current],aim+(e.code==='ArrowLeft'?-12:12)));}
    if(e.code==='Space'){e.preventDefault();if(!e.repeat)drop();}
    if(e.code==='KeyP'&&!ended){e.preventDefault();if(paused)closeModal();else showModal('pause');}
  });
  $('sound').onclick=()=>{sound=!sound;savePreference('nailong-pop-sound',sound);syncSound();if(sound)audio(650,.1);};
  $('help').onclick=()=>showModal('help');$('pause').onclick=()=>{if(!ready||ended)return;if(paused)closeModal();else showModal('pause');};
  $('restart').onclick=()=>{if(drops&&!ended)showModal('restart');else reset();};$('dialog-close').onclick=closeModal;
  $('dialog').addEventListener('cancel',e=>{e.preventDefault();if(modalKind!=='over')closeModal();});
  $('shake').onclick=()=>{if(charge<100||paused||ended)return;charge=0;world.shake();shakeUntil=world.time+.45;burst(210,480,'#8ee4d8',30);audio(140,.25,'triangle',.05);update();announce('欢乐震场！');};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready&&!ended&&!paused&&drops)showModal('pause');lastFrame=0;accumulator=0;});
  function drawBody(b,ghost=false){
    const l=levels[b.level],img=images[b.level],r=b.r;
    ctx.save();ctx.translate(b.x,b.y);ctx.rotate(ghost?0:Math.sin(b.angle)*.16);ctx.globalAlpha=ghost?.76:1;
    const fill=ctx.createRadialGradient(-r*.25,-r*.4,r*.05,0,0,r);fill.addColorStop(0,'#fff8d6');fill.addColorStop(1,l.color);
    ctx.fillStyle=fill;ctx.shadowColor='#c5893335';ctx.shadowBlur=ghost?0:6;ctx.shadowOffsetY=3;ctx.beginPath();ctx.arc(0,0,r-.7,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
    ctx.strokeStyle=b.level===5?'#da9740':'#daac5470';ctx.lineWidth=b.level===5?2:1;ctx.stroke();
    if(img.complete&&img.naturalWidth){const max=r*1.8,scale=Math.min(max/img.naturalWidth,max/img.naturalHeight);ctx.drawImage(img,-img.naturalWidth*scale/2,-img.naturalHeight*scale/2,img.naturalWidth*scale,img.naturalHeight*scale);}
    ctx.restore();
  }
  function render(){
    ctx.clearRect(0,0,420,600);ctx.save();
    if(world.time<shakeUntil&&!reducedMotion)ctx.translate(Math.sin(world.time*70)*3,Math.cos(world.time*60)*2);
    const bg=ctx.createLinearGradient(0,0,0,600);bg.addColorStop(0,'#f5f7fc');bg.addColorStop(1,'#e8eef8');ctx.fillStyle=bg;ctx.fillRect(0,0,420,600);
    ctx.fillStyle='#dce5f1';for(let x=20;x<420;x+=24)for(let y=135;y<580;y+=24){ctx.beginPath();ctx.arc(x,y,.9,0,Math.PI*2);ctx.fill();}
    const danger=world.overflow>.1;
    ctx.strokeStyle=danger?'#df7079':'#b8c5d8';ctx.setLineDash([5,7]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(14,109);ctx.lineTo(406,109);ctx.stroke();ctx.setLineDash([]);
    ctx.font='11px system-ui, sans-serif';ctx.textAlign='right';ctx.fillStyle=danger?'#cb4c59':'#95a5bc';ctx.fillText(danger?`${Math.max(0,3-world.overflow).toFixed(1)}s`:'警戒线',402,100);
    if(!ended){
      const r=POP_RADII[current];let end=585;
      for(const b of world.bodies){const dx=Math.abs(b.x-aim);if(dx<b.r+r){const y=b.y-Math.sqrt((b.r+r)**2-dx**2);if(y>49&&y<end)end=y;}}
      ctx.strokeStyle='#91a8bf66';ctx.setLineDash([3,7]);ctx.beginPath();ctx.moveTo(aim,49+r);ctx.lineTo(aim,end);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#b4c4d955';ctx.beginPath();ctx.ellipse(aim,Math.min(583,end+r),r*.58,3,0,0,Math.PI*2);ctx.fill();
      if(world.time-lastDrop>.18)drawBody({level:current,r,x:aim,y:49,angle:0},true);
    }
    for(const b of world.bodies)drawBody(b);
    for(const ring of rings){ctx.globalAlpha=Math.max(0,ring.life/ring.maxLife);ctx.strokeStyle=ring.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(ring.x,ring.y,ring.r,0,Math.PI*2);ctx.stroke();}
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/.8);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;ctx.restore();
  }
  function frame(timestamp){
    if(!lastFrame)lastFrame=timestamp;const elapsed=Math.min(.05,(timestamp-lastFrame)/1000);lastFrame=timestamp;
    if(ready&&!paused&&!ended){
      accumulator+=elapsed;
      while(accumulator>=1/120){const over=world.step(1/120);accumulator-=1/120;if(over){ended=true;showModal('over');break;}if(paused)break;}
      if(paused||ended)accumulator=0;
      for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=elapsed;p.x+=p.vx*elapsed;p.y+=p.vy*elapsed;p.vy+=160*elapsed;if(p.life<=0)particles.splice(i,1);}
      for(let i=rings.length-1;i>=0;i--){rings[i].life-=elapsed;rings[i].r+=110*elapsed;if(rings[i].life<=0)rings.splice(i,1);}
      $('danger').classList.toggle('show',world.overflow>.1);if(world.time>comboUntil)$('combo').classList.remove('show');
    }else accumulator=0;
    render();requestAnimationFrame(frame);
  }
  function resize(){const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=420*dpr;canvas.height=600*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
  window.addEventListener('resize',resize);resize();syncSound();update();renderLeaderboard();requestAnimationFrame(frame);
  Promise.all(images.map((img,i)=>new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error(`无法加载${levels[i].name}`));img.src=imagePath(i);}))).then(()=>{ready=true;$('loading').classList.add('hidden');update();}).catch(()=>{$('loading').innerHTML='<p>奶龙没能集合成功</p><p style="font-size:13px">请检查网络后重试</p><button id="reload-assets">重新加载</button>';$('reload-assets').onclick=()=>location.reload();});
})();
