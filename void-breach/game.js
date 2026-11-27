// =============================================================================
// =============================================================================
'use strict';
const W=960,H=640;
const canvas=document.getElementById('gameCanvas');
const ctx=canvas.getContext('2d');
const IS_TOUCH=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
const buzz=p=>{try{if(IS_TOUCH&&navigator.vibrate)navigator.vibrate(p);}catch(e){}};
// On touch devices: say TAP instead of CLICK, and hide hints that only make sense with a keyboard.
if(IS_TOUCH){const _ft=ctx.fillText;ctx.fillText=function(t,x,y,w){if(typeof t==='string'){t=t.replace(/CLICK\s+or\s+ENTER/gi,'TAP').replace(/\bCLICK\b/g,'TAP').replace(/\bClick\b/g,'Tap');if(/\bENTER\b|\bESC\b|Press P|\bF2\b|\bH = /.test(t))return;}return _ft.call(this,t,x,y,w);};}
// ── Local browser storage ────────────────────────────────────────────────────
const STORE={
  getItem(k){try{return localStorage.getItem(k);}catch(e){return null;}},
  setItem(k,v){try{localStorage.setItem(k,String(v));}catch(e){}},
  removeItem(k){try{localStorage.removeItem(k);}catch(e){}},
  clear(){try{localStorage.clear();}catch(e){}},
};
canvas.width=W; canvas.height=H;

// ── Utils ─────────────────────────────────────────────────────────────────────
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand =(a,b)=>Math.random()*(b-a)+a;
const rInt =(a,b)=>Math.floor(rand(a,b+1));
const dist =(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
const shuf =a=>[...a].sort(()=>Math.random()-.5);
const lerp =(a,b,t)=>a+(b-a)*t;
const easeOut=t=>1-Math.pow(1-t,3);

// ── Storage ───────────────────────────────────────────────────────────────────
let HS=0;
try{HS=parseInt(STORE.getItem('vb_hs')||'0');}catch(e){}
const saveHS=s=>{try{if(s>HS){HS=s;STORE.setItem('vb_hs',s);}}catch(e){}};
let privOK=false;
try{privOK=STORE.getItem('vb_p')==='1';}catch(e){}
const acceptPrivacy=()=>{try{STORE.setItem('vb_p','1');}catch(e){}privOK=true;};

// Graphics quality: 0=low, 1=medium, 2=high
let GQ=IS_TOUCH?1:2,GQmax=IS_TOUCH?1:2;
try{const sv=parseInt(STORE.getItem('vb_gq'));if(sv>=0&&sv<=3)GQ=sv;}catch(e){}
GQmax=GQ;
let AUTO=true;try{AUTO=STORE.getItem('vb_auto')!=='0';}catch(e){}
const GQN=['LOW','MED','HIGH','OVERCLOCK'];
// Touch-only aim response: 0=LOW, 1=MED, 2=HIGH.
let TOUCH_AIM_SENS=1;
try{const v=parseInt(STORE.getItem('vb_touch_aim_sens'));if(v>=0&&v<=2)TOUCH_AIM_SENS=v;}catch(e){}
const AUTO_DESC=['Lowers graphics when the game lags,','raises them again when it runs smooth.'];
const saveGQ=v=>{GQ=GQmax=clamp(v,0,3);try{STORE.setItem('vb_gq',GQ);}catch(e){}};
const GQP=n=>GQ===0?Math.ceil(n*.3):GQ===1?Math.ceil(n*.65):GQ===2?n:Math.ceil(n*1.5); // particle count scaler
const GQS=v=>GQ===0?0:GQ===1?v*.6:v;                            // shadow-blur scaler
const GQL=()=>GQ>=2;                                            // dynamic lighting on?

// ── Visual helpers ────────────────────────────────────────────────────────────
const FILT=(()=>{try{const t=document.createElement('canvas').getContext('2d');t.filter='blur(1px)';return t.filter==='blur(1px)';}catch(e){return false;}})();
const _gs=new Map();
function rgbOf(h){if(!h||h[0]!=='#')return '255,255,255';h=h.slice(1);if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];return parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16);}
function glowSprite(col){let s=_gs.get(col);if(s)return s;s=document.createElement('canvas');s.width=s.height=64;const g=s.getContext('2d'),r=rgbOf(col),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,`rgba(${r},.9)`);gr.addColorStop(.35,`rgba(${r},.35)`);gr.addColorStop(1,`rgba(${r},0)`);g.fillStyle=gr;g.fillRect(0,0,64,64);_gs.set(col,s);return s;}
function glass(c,x,y,w,h,col,hot=0){
  c.save();const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'rgba(14,24,46,.97)');g.addColorStop(1,'rgba(4,8,18,.98)');
  c.shadowBlur=18+hot*34;c.shadowColor=col;c.fillStyle=g;c.fillRect(x,y,w,h);c.shadowBlur=0;
  if(hot>0){c.globalAlpha=Math.min(.22,hot*.2);c.fillStyle=col;c.fillRect(x,y,w,h);c.globalAlpha=1;}
  const tg=c.createLinearGradient(0,y,0,y+h*.4);tg.addColorStop(0,'rgba(255,255,255,.08)');tg.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=tg;c.fillRect(x,y,w,h*.4);
  c.strokeStyle=col;c.globalAlpha=.3+Math.min(1,hot)*.5;c.lineWidth=1;c.strokeRect(x+.5,y+.5,w-1,h-1);
  c.globalAlpha=.95;c.lineWidth=2;const L=Math.min(16,w/4,h/4);c.beginPath();
  [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]].forEach(([a,b,sx,sy])=>{c.moveTo(a+sx*L,b);c.lineTo(a,b);c.lineTo(a,b+sy*L);});c.stroke();c.restore();}
function fancyBar(c,x,y,w,h,r,col){
  r=clamp(r,0,1);c.fillStyle='rgba(4,8,16,.92)';c.fillRect(x,y,w,h);
  if(r>0){c.save();c.shadowBlur=GQ>=1?12:0;c.shadowColor=col;c.fillStyle=col;c.fillRect(x,y,w*r,h);c.shadowBlur=0;
    const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,'#fff');g.addColorStop(.3,col);g.addColorStop(1,col);c.globalAlpha=.5;c.fillStyle=g;c.fillRect(x,y,w*r,h);
    c.globalAlpha=.16;c.fillStyle='#fff';c.fillRect(x,y,w*r,h*.4);
    if(GQ>=2){const sx=x+((performance.now()/1100)%1.5-.25)*w,x0=clamp(sx,x,x+w*r),x1=clamp(sx+22,x,x+w*r);if(x1>x0){c.globalAlpha=.3;c.fillRect(x0,y,x1-x0,h);}}
    c.restore();}
  c.strokeStyle='rgba(255,255,255,.07)';c.lineWidth=1;for(let i=1;i<10;i++){c.beginPath();c.moveTo(x+w*i/10,y);c.lineTo(x+w*i/10,y+h);c.stroke();}}
function drawTitle(c,txt,x,y,size,t){
  c.save();c.font=`bold ${size}px "Courier New"`;c.textAlign='center';
  const o=2+Math.sin(t*.05)*1.2+(Math.random()<.02?5:0);
  c.globalCompositeOperation='lighter';c.globalAlpha=.55;c.fillStyle='#ff2255';c.fillText(txt,x-o,y);c.fillStyle='#2255ff';c.fillText(txt,x+o,y);
  c.globalCompositeOperation='source-over';c.globalAlpha=1;
  const g=c.createLinearGradient(0,y-size*.8,0,y+size*.1);g.addColorStop(0,'#ffffff');g.addColorStop(.45,'#7ffcff');g.addColorStop(1,'#0090d8');
  c.shadowBlur=GQ>=1?50:20;c.shadowColor='#00f5ff';c.fillStyle=g;c.fillText(txt,x,y);
  c.shadowBlur=0;c.globalAlpha=.6;c.lineWidth=1;c.strokeStyle='rgba(255,255,255,.7)';c.strokeText(txt,x,y);c.restore();}
let CUR=null;
const OPT={shake:true,nums:true,fps:false};try{Object.assign(OPT,JSON.parse(STORE.getItem('vb_opt')||'{}'));}catch(e){}
const saveOpt=()=>{try{STORE.setItem('vb_opt',JSON.stringify(OPT));}catch(e){}};
function segDist(b,e){const dx=b.x-b.px,dy=b.y-b.py,l=dx*dx+dy*dy;let t=l?((e.x-b.px)*dx+(e.y-b.py)*dy)/l:0;t=t<0?0:t>1?1:t;return Math.hypot(e.x-(b.px+dx*t),e.y-(b.py+dy*t));}
const PUD={heal:{col:'#44ff88',ch:'+',lbl:'REPAIR +30'},rapid:{col:'#ffe14a',ch:'»',lbl:'RAPID FIRE!'},quad:{col:'#ff44dd',ch:'×2',lbl:'DOUBLE DAMAGE!'},nova:{col:'#44e0ff',ch:'◈',lbl:'NOVA +40%'}};
class Pickup{
  constructor(x,y,t){this.x=x;this.y=y;this.t=t;this.age=0;this.life=11;this.taken=false;this.vx=rand(-70,70);this.vy=rand(-70,70);}
  update(dt,p){this.age+=dt;this.life-=dt;this.x+=this.vx*dt;this.y+=this.vy*dt;this.vx*=.94;this.vy*=.94;
    this.x=clamp(this.x,AR.x+12,AR.x+AR.w-12);this.y=clamp(this.y,AR.y+12,AR.y+AR.h-12);
    const d=dist(this,p);if(d<170&&!p.dead){const k=Math.min(1,300*dt/Math.max(d,1));this.x+=(p.x-this.x)*k;this.y+=(p.y-this.y)*k;}
    if(d<p.sz+14&&!p.dead){this.taken=true;return true;}return false;}
  draw(c){const d=PUD[this.t];if(this.life<3&&Math.floor(this.age*8)%2)return;c.save();c.translate(this.x,this.y+Math.sin(this.age*5)*3);
    if(GQ>=1){c.globalCompositeOperation='lighter';c.globalAlpha=.7;c.drawImage(glowSprite(d.col),-26,-26,52,52);c.globalCompositeOperation='source-over';c.globalAlpha=1;}
    c.rotate(this.age*2);c.shadowBlur=14;c.shadowColor=d.col;c.fillStyle='#0a1220';c.strokeStyle=d.col;c.lineWidth=2;c.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;c.lineTo(Math.cos(a)*12,Math.sin(a)*12);}c.closePath();c.fill();c.stroke();
    c.rotate(-this.age*2);c.fillStyle=d.col;c.shadowBlur=6;c.font='bold 13px "Courier New"';c.textAlign='center';c.textBaseline='middle';c.fillText(d.ch,0,1);c.restore();}
}
let SAVE={kills:0,bosses:0,wins:0,deathless:0,bestWave:0,bank:0,owned:[],sel:'vanguard',forge:{},guns:['pistol'],gun:'pistol'};
try{Object.assign(SAVE,JSON.parse(STORE.getItem('vb_save')||'{}'));}catch(e){}
const persist=()=>{try{STORE.setItem('vb_save',JSON.stringify(SAVE));}catch(e){}};
const fixSave=()=>{SAVE.forge=SAVE.forge&&typeof SAVE.forge==='object'?SAVE.forge:{};const g=Array.isArray(SAVE.guns)?SAVE.guns:[];SAVE.guns=g.includes('pistol')?g:['pistol',...g];if(!SAVE.gun)SAVE.gun='pistol';};fixSave();
// ── VOID FORGE: permanent upgrades (bought with banked coins). Capped so they help, never trivialise the game. ──
const FORGE=[
 {id:'hull',  name:'HULL PLATING',    icon:'🛡',max:5,cost:[70,120,190,280,420], desc:l=>`+${10*l} max HP`,                       apply:(p,l)=>{p.maxHp+=10*l;p.hp=p.maxHp;}},
 {id:'reactor',name:'REACTOR CORE',   icon:'⚛️',max:5,cost:[100,170,270,400,600],desc:l=>`+${4*l}% damage`,                       apply:(p,l)=>{p.dmgMult*=1+.04*l;}},
 {id:'thrust',name:'THRUSTER TUNING', icon:'💨',max:4,cost:[50,90,150,230],      desc:l=>`+${3*l}% move speed`,                   apply:(p,l)=>{p.spdMult*=1+.03*l;}},
 {id:'phase', name:'PHASE CAPACITOR', icon:'⚡',max:4,cost:[60,100,160,250],     desc:l=>`-${7*l}% dash cooldown`,                apply:(p,l)=>{p.dashMult*=1-.07*l;}},
 {id:'nova',  name:'NOVA CELL',       icon:'🔋',max:4,cost:[80,130,210,320],     desc:l=>`+${12*l}% charge, start ${8*l}% charged`,apply:(p,l)=>{p.novaMult*=1+.12*l;p.nova=8*l;}},
 {id:'scav',  name:'SCAVENGER',       icon:'💰',max:5,cost:[90,150,240,360,520], desc:l=>`+${8*l}% coins from kills`},
 {id:'shield',name:'SHIELD EMITTER',  icon:'🔰',max:3,cost:[110,220,380],        desc:l=>`start each run with ${15*l} shield`,    apply:(p,l)=>{p.shield+=15*l;p.shieldMax+=15*l;}},
 {id:'luck',  name:'LUCKY STAR',      icon:'🍀',max:4,cost:[90,160,260,400],     desc:l=>`+${2.5*l}% rare & epic card odds`},
];
// Starting guns: COMMON-TIER ONLY on purpose. Rare, epic and legendary weapons can only be found during a run.
const START_GUNS=[
 {id:'pistol', cost:0,  desc:'Accurate single shots. Reliable at any range.'},
 {id:'twin',   cost:250,desc:'Two parallel bolts per shot. Great vs swarms.'},
 {id:'burst',  cost:250,desc:'3-bolt spread per trigger pull. Hard to miss.'},
 {id:'shotgun',cost:450,desc:'7 pellets. Deadly up close, weak at range.'},
 {id:'smg',    cost:550,desc:'Rapid-fire stream. Low damage, high volume.'}];
const forgeLv=id=>(SAVE.forge&&SAVE.forge[id])||0;
const SRC={common:'#6ab8c8',rare:'#9060ff',epic:'#ffb030',legendary:'#ff3030'};
const SKINS=[
 {id:'vanguard',name:'VANGUARD',rar:'common',body:'#00d4e8',dark:'#006688',glow:'#00f5ff',thr:['#00d8ff','#8af4ff'],shape:0,how:'Default ship'},
 {id:'crimson',name:'CRIMSON FANG',rar:'common',body:'#ff4a5e',dark:'#8a0f22',glow:'#ff2244',thr:['#ff3355','#ffaa88'],shape:0,how:'Kill 75 enemies',prog:()=>[SAVE.kills,75]},
 {id:'toxin',name:'TOXIN',rar:'common',body:'#4dff7a',dark:'#0a7a30',glow:'#39ff14',thr:['#39ff14','#c8ffb0'],shape:1,how:'Reach wave 5',prog:()=>[SAVE.bestWave,5]},
 {id:'solar',name:'SOLAR FLARE',rar:'rare',body:'#ffb030',dark:'#a04a00',glow:'#ff9000',thr:['#ff7a00','#ffe08a'],shape:2,how:'Buy with bank coins',cost:400},
 {id:'amethyst',name:'AMETHYST',rar:'rare',body:'#b07cff',dark:'#4a1c9a',glow:'#9060ff',thr:['#9060ff','#e0ccff'],shape:1,how:'Defeat a boss',prog:()=>[SAVE.bosses,1]},
 {id:'wraith',name:'WRAITH',rar:'epic',body:'#d8fff6',dark:'#2a8a7a',glow:'#88ffdd',thr:['#88ffdd','#ffffff'],shape:2,flick:true,how:'Clear a wave, take 0 damage',prog:()=>[unlockedAch.has('nodmg')?1:0,1]},
 {id:'voidlord',name:'VOID LORD',rar:'epic',body:'#3a0812',dark:'#ff2200',glow:'#ff2200',thr:['#ff2200','#ffaa00'],shape:1,cock:['rgba(255,220,200,1)','rgba(255,60,20,.9)','rgba(120,0,0,.6)'],how:'Beat the game',prog:()=>[SAVE.wins,1]},
 {id:'hrr',name:'HRR STUDIOS',rar:'legendary',body:'#e9ddd0',dark:'#7a0f0f',glow:'#ff2a2a',thr:['#ff2a2a','#ffb070'],shape:2,cock:['rgba(255,240,230,1)','rgba(255,70,50,.9)','rgba(120,0,0,.6)'],how:'Beat the game without dying',prog:()=>[SAVE.deathless,1]},
];
const curSkin=()=>SKINS.find(k=>k.id===SAVE.sel)||SKINS[0];
const ownedSkin=k=>k.id==='vanguard'||SAVE.owned.includes(k.id);
function drawShip(c,K,sz,hf,sf,wcol){
  const P=K.shape===1?[[1.05,0],[-.8,.9],[-.3,0],[-.8,-.9]]:K.shape===2?[[1.3,0],[-.7,.5],[-.2,0],[-.7,-.5]]:[[1,0],[-.72,.68],[-.36,0],[-.72,-.68]];
  if(K.flick)c.globalAlpha*=.7+.25*Math.sin(performance.now()/90);
  c.shadowBlur=20;c.shadowColor=hf?'#ff2244':sf?'#00ccff':K.glow;c.fillStyle=hf?'#ff6677':sf?'#88ddff':K.body;
  c.beginPath();P.forEach((q,i)=>i?c.lineTo(q[0]*sz,q[1]*sz):c.moveTo(q[0]*sz,q[1]*sz));c.closePath();c.fill();
  const ga=c.globalAlpha;c.fillStyle=hf?'#aa0022':sf?'#0088aa':K.dark;c.globalAlpha=ga*.7;
  [1,-1].forEach(m=>{c.beginPath();c.moveTo(-sz*.18,m*sz*.38);c.lineTo(-sz*.62,m*sz*.62);c.lineTo(-sz*.62,m*sz*.28);c.closePath();c.fill();});
  c.globalAlpha=ga;const ck=K.cock||['rgba(200,240,255,1)','rgba(100,200,255,.8)','rgba(0,100,200,.5)'];
  const g=c.createRadialGradient(sz*.18,-sz*.06,0,sz*.18,0,sz*.35);g.addColorStop(0,ck[0]);g.addColorStop(.6,ck[1]);g.addColorStop(1,ck[2]);
  c.fillStyle=g;c.shadowBlur=8;c.shadowColor=K.glow;c.beginPath();c.ellipse(sz*.18,0,sz*.30,sz*.17,0,0,Math.PI*2);c.fill();
  if(K.id==='hrr'){c.strokeStyle='#ff2a2a';c.lineWidth=1.6;c.shadowBlur=8;c.shadowColor='#f00';for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(-sz*.6,i*sz*.26-sz*.14);c.lineTo(sz*.3,i*sz*.26+sz*.14);c.stroke();}}
  c.fillStyle=wcol;c.shadowBlur=12;c.shadowColor=wcol;c.beginPath();c.arc(P[0][0]*sz*.9,0,2.8,0,Math.PI*2);c.fill();
}
function makeNoise(){const n=document.createElement('canvas');n.width=n.height=128;const g=n.getContext('2d'),d=g.createImageData(128,128);for(let i=0;i<d.data.length;i+=4){const v=Math.random()<.5?0:255;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=Math.random()*255;}g.putImageData(d,0,0);return n;}
function makeScan(){const n=document.createElement('canvas');n.width=4;n.height=3;const g=n.getContext('2d');g.fillStyle='rgba(0,0,0,.5)';g.fillRect(0,2,4,1);return n;}

// Top-5 local leaderboard
let leaderboard=[];
try{leaderboard=JSON.parse(STORE.getItem('vb_lb')||'[]');}catch(e){}
let _runId=0; // unique per game session — incremented in Game.start()
function saveToLeaderboard(score,wave,kills){
  // A run may call this multiple times if the player revives (death, then win, etc).
  // Replace any earlier entry from THIS run instead of stacking duplicates.
  leaderboard=leaderboard.filter(e=>e.runId!==_runId);
  leaderboard.push({score,wave,kills,runId:_runId});
  leaderboard.sort((a,b)=>b.score-a.score);
  leaderboard=leaderboard.slice(0,5);
  try{STORE.setItem('vb_lb',JSON.stringify(leaderboard));}catch(e){}
  return leaderboard.findIndex(e=>e.runId===_runId);
}

// ── Rotate overlay ────────────────────────────────────────────────────────────
// Studio splash logo
const hrrLogo=new Image();
hrrLogo.src='hrr_logo.png';

const rotEl=document.createElement('div');
Object.assign(rotEl.style,{display:'none',position:'fixed',inset:'0',zIndex:'9999',
  background:'#05080f',color:'#00f5ff',flexDirection:'column',justifyContent:'center',
  alignItems:'center',textAlign:'center',fontFamily:'"Courier New",monospace',padding:'24px'});
rotEl.innerHTML=`<div style="font-size:68px;animation:rs 2s linear infinite">🔄</div>
<div style="font-size:22px;font-weight:bold;margin:16px 0 8px;text-shadow:0 0 20px #00f5ff">ROTATE YOUR DEVICE</div>
<div style="font-size:13px;color:#4a8ab0;line-height:1.8">VOID BREACH requires<br><strong style="color:#00f5ff">LANDSCAPE MODE</strong></div>
<style>@keyframes rs{to{transform:rotate(360deg)}}</style>`;
document.body.appendChild(rotEl);
const chkOri=()=>{const port=IS_TOUCH&&innerHeight>innerWidth;rotEl.style.display=port?'flex':'none';try{if(port&&CUR&&(CUR.state===ST.PLAY||CUR.state===ST.BOSS)&&!CUR.paused){CUR.paused=true;GAME_HOOKS.gameplayStop();}}catch(e){}};
addEventListener('resize',chkOri);addEventListener('orientationchange',()=>{chkOri();setTimeout(()=>{try{resize();}catch(e){}},250);});chkOri();

// ── Standalone game lifecycle ─────────────────────────────────────────────────
const GAME_HOOKS={
  _sdkMuted:false,_pct:-1,showLoginBtn:false,user:null,_dbg:false,
  onMenu(){},loadingStart(){},loadingStop(){},gameplayStart(){},gameplayStop(){},
  setContext(){},clearContext(){},happyTime(){},reportProgress(){},submitScore(){},
};

// Global wave counter
let currentWave=1;

// ── Audio ─────────────────────────────────────────────────────────────────────
let AC=null, MG=null, SG=null, MFilter=null, audioOn=true, _userMuted=false;
try{_userMuted=STORE.getItem('vb_mute')==='1';audioOn=!_userMuted;}catch(e){}
const _saveMute=()=>{try{STORE.setItem('vb_mute',_userMuted?'1':'0');}catch(e){}};
let _mNodes=[], _mMode='', _mGen=0, _desiredMusicMode='normal';

let _audioFailed=false;
const initAudio=()=>{ if(AC||_audioFailed)return; try{ _initAudio(); }catch(e){ _audioFailed=true; AC=null; audioOn=false; console.warn('[audio] unavailable',e); } };
const _initAudio=()=>{
  if(AC)return;
  AC=new(window.AudioContext||window.webkitAudioContext)();
  // Lowpass filter softens the harsh upper harmonics of the music bus
  // (this is what was causing the constant background "buzzing").
  MFilter=AC.createBiquadFilter();MFilter.type='lowpass';MFilter.frequency.value=850;MFilter.Q.value=0.6;
  MG=AC.createGain();MG.gain.value=0.17;const comp=AC.createDynamicsCompressor();comp.threshold.value=-14;comp.knee.value=12;comp.ratio.value=5;comp.attack.value=.003;comp.release.value=.2;comp.connect(AC.destination);
  MG.connect(MFilter);MFilter.connect(comp);
  SG=AC.createGain();SG.gain.value=0.50;SG.connect(comp);
  const dl=AC.createDelay(1),fb=AC.createGain(),wet=AC.createGain();dl.delayTime.value=.17;fb.gain.value=.28;wet.gain.value=.16;SG.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(wet);wet.connect(comp);
  _startMusic('normal');
};

// iOS: resume AudioContext after system interruption (docs requirement)
document.addEventListener('touchend',()=>{
  if(AC&&AC.state==='suspended')AC.resume();
},{passive:true});

function _t(f,type,dur,vol=0.22,d=0,dest=null){
  if(!AC||!audioOn)return;
  try{
    const o=AC.createOscillator(),g=AC.createGain();
    o.connect(g);g.connect(dest||SG);o.type=type;
    o.frequency.setValueAtTime(dest?f:f*(1+(Math.random()-.5)*.05),AC.currentTime+d);
    g.gain.setValueAtTime(0.0001,AC.currentTime+d);g.gain.linearRampToValueAtTime(vol,AC.currentTime+d+.004);
    g.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+d+dur);
    o.start(AC.currentTime+d);o.stop(AC.currentTime+d+dur+0.01);
  }catch(e){}
}

// Sustained drone oscillator with a smooth fade-in (no click/pop on start)
function _drone(freq,type,vol,attack=0.6){
  try{
    const o=AC.createOscillator(),g=AC.createGain();
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(0.0001,AC.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(vol,0.001),AC.currentTime+attack);
    o.connect(g);g.connect(MG);o.start();
    return{osc:o,gain:g};
  }catch(e){return null;}
}
// Fades a drone out smoothly before stopping it (no abrupt cutoff)
function _killDrone(d,release=0.5){
  if(!d)return;
  try{
    const now=AC.currentTime;
    d.gain.gain.cancelScheduledValues(now);
    d.gain.gain.setValueAtTime(Math.max(d.gain.gain.value,0.0001),now);
    d.gain.gain.exponentialRampToValueAtTime(0.0001,now+release);
    d.osc.stop(now+release+0.05);
  }catch(e){}
}

function _stopMusic(){
  _mNodes.forEach(x=>{ if(x.drone)_killDrone(x.drone); clearTimeout(x.id); });
  _mNodes=[];_mMode='';
}

// mode: 'normal' = calm ambient exploration theme, 'boss' = intense boss theme.
// Switching modes crossfades: old drones fade out while new ones fade in.
function _startMusic(mode='normal'){
  if(!AC||!audioOn)return;
  if(_mMode===mode&&_mNodes.length>0)return; // already playing this mode
  _stopMusic();
  _mMode=mode;
  const gen=++_mGen;

  if(mode==='boss'){
    MFilter.frequency.cancelScheduledValues(AC.currentTime);
    MFilter.frequency.linearRampToValueAtTime(1250,AC.currentTime+.5);
    _mNodes.push({drone:_drone(41.2,'triangle',0.11,0.3)});   // driving low E
    _mNodes.push({drone:_drone(82.4,'sawtooth',0.040,0.3)});  // bite, but filtered
    _mNodes.push({drone:_drone(123.5,'sine',0.026,0.3)});
    const scale=[220,233,277,293,349,370,440];let ni=0;
    const arp=()=>{
      if(_mGen!==gen||!AC||!audioOn)return;
      _t(scale[ni%scale.length],'sine',0.13,0.05,0,MG);
      if(ni%2===0)_t(scale[ni%scale.length]/2,'triangle',0.18,0.035,0,MG);
      ni++;
      _mNodes.push({id:setTimeout(arp,130+rand(-12,12))});
    };
    _mNodes.push({id:setTimeout(arp,250)});
  } else {
    MFilter.frequency.cancelScheduledValues(AC.currentTime);
    MFilter.frequency.linearRampToValueAtTime(850,AC.currentTime+.6);
    _mNodes.push({drone:_drone(55,   'triangle',0.050,0.8)});
    _mNodes.push({drone:_drone(110,  'sine',    0.028,0.8)});
    _mNodes.push({drone:_drone(165,  'sine',    0.016,0.8)});
    const sc=[220,247,262,294,330,370,392,440,494];let ni=0,st=0;
    const arp=()=>{
      if(_mGen!==gen||!AC||!audioOn)return;
      _t(sc[ni%sc.length]*(st%16<8?1:2),'sine',0.16,0.030,0,MG);
      ni+=st%4===0?2:1;st++;
      _mNodes.push({id:setTimeout(arp,200+rand(-18,18))});
    };
    _mNodes.push({id:setTimeout(arp,500)});
  }
}
const sfx={

  pistol: ()=>{_t(1100,'square',.04,.10);_t(550,'sawtooth',.06,.06);},
  shotgun:()=>{[0,.01,.018].forEach(d=>_t(rand(180,600),'sawtooth',.12,.09,d));_t(75,'square',.22,.17);},
  smg:    ()=>_t(1400,'square',.028,.05),
  lance:  ()=>{_t(155,'sawtooth',.28,.14);_t(78,'sine',.34,.09,.05);},
  rocket: ()=>{_t(105,'sawtooth',.32,.18);_t(52,'square',.40,.14);},
  star:   ()=>{_t(1760,'sine',.35,.14);_t(2640,'sine',.3,.1,.03);_t(70,'square',.45,.2);_t(140,'sawtooth',.3,.14,.02);},
  seeker: ()=>{_t(520,'sawtooth',.08,.1);_t(780,'square',.06,.07,.03);_t(300,'sawtooth',.1,.05,.05);},
  blackhole:()=>{_t(70,'sawtooth',.5,.2);_t(40,'sine',.6,.2,.02);_t(900,'sine',.3,.06,.04);},
  twin:   ()=>sfx.pistol&&sfx.pistol(),
  burst:  ()=>sfx.pistol&&sfx.pistol(),
  tesla:  ()=>{_t(900,'sawtooth',.06,.09);_t(1500,'square',.05,.07,.02);_t(420,'sawtooth',.08,.06,.03);},
  rail:   ()=>{_t(110,'sawtooth',.3,.2);_t(2600,'sine',.2,.12,.01);_t(60,'square',.4,.14,.02);},
  flame:  ()=>{if(Math.random()<.5)_t(120+Math.random()*90,'sawtooth',.06,.04);},
  explode:()=>{[200,140,90,50].forEach((f,i)=>_t(f,'sawtooth',.28,.18,i*.05));},
  hit:    ()=>{const n=performance.now();if(n-(sfx._lh||0)<40)return;sfx._lh=n;_t(180,'sawtooth',.07,.14);},
  death:  ()=>[220,155,88,44].forEach((f,i)=>_t(f,'sawtooth',.22,.15,i*.055)),
  player: ()=>{_t(195,'square',.12,.22);_t(95,'sawtooth',.16,.17);},
  upg:    ()=>[380,500,640,820].forEach((f,i)=>_t(f,'sine',.16,.17,i*.08)),
  epic:   ()=>[280,400,550,700,880,1060].forEach((f,i)=>_t(f,'sine',.20,.19,i*.062)),
  dash:   ()=>{_t(660,'sine',.08,.11);_t(1010,'sine',.06,.08,.04);},
  boss:   ()=>[52,40,34,28].forEach((f,i)=>_t(f,'sawtooth',.55,.22,i*.08)),
  combo:  ()=>{_t(700,'sine',.09,.13);_t(880,'sine',.07,.11,.05);},
  wave:   ()=>[330,440,550,660].forEach((f,i)=>_t(f,'sine',.13,.15,i*.065)),
  achieve:()=>[440,550,660,880,1100].forEach((f,i)=>_t(f,'sine',.18,.18,i*.055)),
  shield: ()=>{_t(800,'sine',.18,.12);_t(600,'sine',.14,.09,.06);},
  pause:  ()=>_t(440,'sine',.07,.09),
  resume: ()=>{_t(550,'sine',.07,.08);_t(660,'sine',.055,.07,.06);},
};

// ── Constants ─────────────────────────────────────────────────────────────────
const AR={x:60,y:80,w:840,h:520};
const ACX=AR.x+AR.w/2, ACY=AR.y+AR.h/2;
const DC=document.createElement('canvas');DC.width=AR.w;DC.height=AR.h;const dc=DC.getContext('2d');
function stamp(x,y,r,col){const X=x-AR.x,Y=y-AR.y;dc.save();const g=dc.createRadialGradient(X,Y,0,X,Y,r);g.addColorStop(0,'rgba(0,0,0,.4)');g.addColorStop(1,'rgba(0,0,0,0)');dc.fillStyle=g;dc.beginPath();dc.arc(X,Y,r,0,6.283);dc.fill();dc.globalCompositeOperation='lighter';dc.globalAlpha=.14;dc.drawImage(glowSprite(col),X-r,Y-r,r*2,r*2);dc.restore();}

const WEAPONS={
  pistol: {name:'PULSE PISTOL',   col:'#00f5ff',dmg:25,rate:.30,spd:730,spread:.04,sz:4,pierce:false,pel:1,ex:false,icon:'🔫'},
  shotgun:{name:'SCATTER CANNON', col:'#ff6b00',dmg:19,rate:.78,spd:610,spread:.24,sz:5,pierce:false,pel:7,ex:false,icon:'💥'},
  smg:    {name:'NEURAL SMG',     col:'#39ff14',dmg:13,rate:.09,spd:790,spread:.11,sz:3,pierce:false,pel:1,ex:false,icon:'⚡'},
  lance:  {name:'VOID LANCE',     col:'#df00ff',dmg:90,rate:1.08,spd:950,spread:.01,sz:6,pierce:true, pel:1,ex:false,icon:'🔮'},
  tesla:  {name:'TESLA ARC',      col:'#58c8ff',dmg:30,rate:.22,spd:900,spread:.03,sz:4,pierce:false,pel:1,ex:false,icon:'🌩',chain:3},
  rail:   {name:'RAILGUN',        col:'#ffee66',dmg:200,rate:1.35,spd:2000,spread:0,sz:4,pierce:true,pel:1,ex:false,icon:'🎯',life:.9,shake:6},
  flame:  {name:'PLASMA FLAMER',  col:'#ff7a1a',dmg:6,rate:.04,spd:430,spread:.2,sz:6,pierce:true,pel:1,ex:false,icon:'🔥',life:.36},
  star:   {name:'STAR FLASH',     col:'#ffe14a',dmg:1000,rate:1.7,spd:520,spread:.16,sz:10,pierce:false,pel:2,ex:true,icon:'⭐',star:true,shake:8},
  twin:   {name:'TWIN PULSE',     col:'#7ae8ff',dmg:14,rate:.34,spd:730,spread:.05,sz:4,pierce:false,pel:2,ex:false,icon:'🔫'},
  burst:  {name:'TRI-BURST',      col:'#b6ff6a',dmg:11,rate:.42,spd:760,spread:.07,sz:3.5,pierce:false,pel:3,ex:false,icon:'🔰'},
  seeker: {name:'SEEKER SWARM',   col:'#ff8aef',dmg:20,rate:.55,spd:380,spread:.45,sz:4,pierce:false,pel:3,ex:false,icon:'🚀',life:2.2,home:true},
  blackhole:{name:'BLACK HOLE',   col:'#a060ff',dmg:5,rate:2.4,spd:360,spread:.02,sz:9,pierce:false,pel:1,ex:false,icon:'🌀',life:.8,bh:true,shake:4},
  rocket: {name:'ROCKET CANNON',  col:'#ff4400',dmg:60,rate:.98,spd:490,spread:.05,sz:7,pierce:false,pel:1,ex:true, icon:'🚀'},
};

// ── Sky / nebula ──────────────────────────────────────────────────────────────
class Sky{
  constructor(){
    this.stars=Array.from({length:160},()=>({x:rand(0,W),y:rand(0,H),r:rand(.3,1.9),b:rand(0,Math.PI*2),spd:rand(.06,.32),tw:rand(.015,.04)}));
    this.clouds=Array.from({length:8},()=>({x:rand(0,W),y:rand(0,H),rx:rand(100,250),ry:rand(60,140),hue:rInt(180,290),a:rand(.025,.065),spd:rand(.03,.10)}));
    this.shooters=[];this.shooterT=rand(2,5);
  }
  update(dt){
    this.stars.forEach(s=>{s.x-=s.spd*dt*16;if(s.x<0)s.x=W;s.b+=s.tw;});
    this.clouds.forEach(c=>{c.x-=c.spd*dt*8;if(c.x<-c.rx*2)c.x=W+c.rx;});
    this.shooterT-=dt;
    if(this.shooterT<=0){this.shooterT=rand(3,7);this.shooters.push({x:rand(0,W),y:rand(0,H*.4),vx:rand(80,180),vy:rand(20,60),life:1.0,trail:[]});}
    this.shooters=this.shooters.filter(s=>{s.trail.push({x:s.x,y:s.y});if(s.trail.length>12)s.trail.shift();s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt*1.5;return s.life>0;});
  }
  draw(c){
    c.fillStyle='#04070f';c.fillRect(0,0,W,H);
    this.clouds.forEach(cl=>{
      c.save();const g=c.createRadialGradient(cl.x,cl.y*cl.rx/cl.ry,0,cl.x,cl.y*cl.rx/cl.ry,cl.rx);
      g.addColorStop(0,`hsla(${cl.hue},75%,45%,${cl.a*2.2})`);g.addColorStop(.55,`hsla(${cl.hue},65%,35%,${cl.a})`);g.addColorStop(1,'transparent');
      c.scale(1,cl.ry/cl.rx);c.fillStyle=g;c.beginPath();c.arc(cl.x,cl.y*cl.rx/cl.ry,cl.rx,0,Math.PI*2);c.fill();c.restore();
    });
    this.stars.forEach(s=>{const a=.28+.72*Math.abs(Math.sin(s.b));c.globalAlpha=a*.75;c.fillStyle='#fff';c.beginPath();c.arc(s.x,s.y,s.r,0,Math.PI*2);c.fill();if(GQ>=2&&s.r>1.3){c.globalAlpha=a*.4;c.drawImage(glowSprite('#9fd8ff'),s.x-9,s.y-9,18,18);}});
    this.shooters.forEach(s=>{for(let i=0;i<s.trail.length;i++){c.globalAlpha=(i/s.trail.length)*s.life*.7;c.fillStyle='#aaddff';c.beginPath();c.arc(s.trail[i].x,s.trail[i].y,1.2,0,Math.PI*2);c.fill();}});
    c.globalAlpha=1;
  }
}

// ── Dynamic light canvas ──────────────────────────────────────────────────────
const LC=document.createElement('canvas');
LC.width=AR.w;LC.height=AR.h;
const lc=LC.getContext('2d');
function renderLights(entities,player,fc){
  if(!GQL())return; // dynamic lighting is a HIGH-quality-only effect
  lc.clearRect(0,0,AR.w,AR.h);
  lc.fillStyle='rgba(0,0,0,0.88)';lc.fillRect(0,0,AR.w,AR.h);
  lc.globalCompositeOperation='lighter';
  const px=player.x-AR.x,py=player.y-AR.y;
  const pg=lc.createRadialGradient(px,py,0,px,py,90);
  pg.addColorStop(0,'rgba(0,200,255,0.22)');pg.addColorStop(1,'transparent');
  lc.fillStyle=pg;lc.beginPath();lc.arc(px,py,90,0,Math.PI*2);lc.fill();
  entities.forEach(e=>{
    if(e.dead)return;
    const ex=e.x-AR.x,ey=e.y-AR.y,r=e.type==='boss'?140:70,inten=e.type==='boss'?.28:.14;
    const hex=e.col.replace('#','');
    const er=parseInt(hex.slice(0,2),16),eg=parseInt(hex.slice(2,4),16),eb=parseInt(hex.slice(4,6),16);
    const g=lc.createRadialGradient(ex,ey,0,ex,ey,r);
    g.addColorStop(0,`rgba(${er},${eg},${eb},${inten})`);g.addColorStop(1,'transparent');
    lc.fillStyle=g;lc.beginPath();lc.arc(ex,ey,r,0,Math.PI*2);lc.fill();
  });
  lc.globalCompositeOperation='source-over';
}

// ── Particle ──────────────────────────────────────────────────────────────────
class Particle{
  constructor(x,y,vx,vy,col,life,sz=3,glow=false,sq=false){Object.assign(this,{x,y,vx,vy,col,life,ml:life,sz,glow,sq,rot:rand(0,Math.PI*2)});}
  update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;const f=Math.pow(.89,dt*60);this.vx*=f;this.vy*=f;this.life-=dt;this.rot+=dt*3;}
  draw(c){
    const a=clamp(this.life/this.ml,0,1);c.save();c.globalAlpha=a;if(GQ>=3)c.globalCompositeOperation='lighter';
    if(this.glow){c.shadowBlur=10;c.shadowColor=this.col;}c.fillStyle=this.col;
    if(this.sq){c.translate(this.x,this.y);c.rotate(this.rot);c.fillRect(-this.sz*a/2,-this.sz*a/2,this.sz*a,this.sz*a);}
    else{c.beginPath();c.arc(this.x,this.y,this.sz*a,0,Math.PI*2);c.fill();}
    c.restore();
  }
}
class Shockwave{
  constructor(x,y,col='#fff',maxR=80){Object.assign(this,{x,y,col,maxR,r:4,life:1.0});}
  update(dt){this.r=lerp(this.r,this.maxR,dt*7);this.life-=dt*2.5;}
  draw(c){if(this.life<=0)return;c.save();c.globalAlpha=this.life*.6;c.strokeStyle=this.col;c.lineWidth=3*(1-this.r/this.maxR)+.5;c.shadowBlur=12;c.shadowColor=this.col;c.beginPath();c.arc(this.x,this.y,this.r,0,Math.PI*2);c.stroke();c.restore();}
}
// Rising ember particle used by the studio splash screen
class FireParticle{
  constructor(cx,cy,spreadX){this.reset(cx,cy,spreadX);}
  reset(cx,cy,spreadX){
    this.x=cx+rand(-spreadX,spreadX);this.y=cy+rand(-8,12);
    this.vx=rand(-14,14);this.vy=-rand(35,95);
    this.life=rand(.7,1.5);this.ml=this.life;this.sz=rand(2,5.5);
    this.flick=rand(0,Math.PI*2);
  }
  update(dt){this.x+=this.vx*dt;this.y+=this.vy*dt;this.vx*=.985;this.vy*=.99;this.life-=dt;this.flick+=dt*9;}
  draw(c){
    const t=clamp(this.life/this.ml,0,1);if(t<=0)return;
    const r=255,g=Math.floor(90+130*t),b=Math.floor(20*t*t);
    const flicker=.75+.25*Math.sin(this.flick);
    c.save();c.globalAlpha=t*.8*flicker;c.shadowBlur=12;c.shadowColor=`rgb(${r},${g},${b})`;
    c.fillStyle=`rgb(${r},${g},${b})`;
    c.beginPath();c.arc(this.x,this.y,this.sz*t,0,Math.PI*2);c.fill();
    c.restore();
  }
}

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet{
  constructor(x,y,vx,vy,dmg,col,sz,pierce,fromPlayer,explode=false){
    Object.assign(this,{x,y,vx,vy,dmg,col,sz,pierce,fromPlayer,explode,dead:false});
    this.trail=[];this.hits=new Set();this.life=3.5;this.px=x;this.py=y;
  }
  update(dt){
    this.trail.push({x:this.x,y:this.y});if(this.trail.length>10)this.trail.shift();
    if(this.home)this._steer(dt);
    this.px=this.x;this.py=this.y;this.x+=this.vx*dt;this.y+=this.vy*dt;this.life-=dt;
    const out=this.x<AR.x||this.x>AR.x+AR.w||this.y<AR.y||this.y>AR.y+AR.h||this.life<=0;
    if(out&&this.bh&&!this._w&&!this.dead){this._w=true;if(CUR)CUR._well(clamp(this.x,AR.x+20,AR.x+AR.w-20),clamp(this.y,AR.y+20,AR.y+AR.h-20));}
    if(out)this.dead=true;
  }
  _steer(dt){
    if(!CUR)return;let best=null,bd=1e9;
    for(const e of CUR.enemies){if(e.dead)continue;const d=(e.x-this.x)*(e.x-this.x)+(e.y-this.y)*(e.y-this.y);if(d<bd){bd=d;best=e;}}
    if(!best)return;const sp=Math.hypot(this.vx,this.vy),a=Math.atan2(this.vy,this.vx);let da=Math.atan2(best.y-this.y,best.x-this.x)-a;
    while(da>Math.PI)da-=6.2832;while(da<-Math.PI)da+=6.2832;const na=a+clamp(da,-dt*5.5,dt*5.5);this.vx=Math.cos(na)*sp;this.vy=Math.sin(na)*sp;
  }
  draw(c){
    if(this.star){c.save();c.translate(this.x,this.y);c.rotate(performance.now()/300);c.globalCompositeOperation='lighter';c.strokeStyle='#fff7b0';c.lineWidth=2;c.shadowBlur=16;c.shadowColor='#ffe14a';for(let k=0;k<4;k++){c.rotate(Math.PI/2);c.beginPath();c.moveTo(0,0);c.lineTo(0,-this.sz*2.3);c.stroke();}c.restore();}
    if(this.beam&&this.trail.length>1){c.save();c.globalCompositeOperation='lighter';c.strokeStyle=this.col;c.lineWidth=this.sz*1.6;c.shadowBlur=18;c.shadowColor=this.col;c.globalAlpha=.8;c.beginPath();c.moveTo(this.trail[0].x,this.trail[0].y);c.lineTo(this.x,this.y);c.stroke();c.lineWidth=1.6;c.strokeStyle='#fff';c.stroke();c.restore();}
    for(let i=0;i<this.trail.length;i++){c.save();c.globalAlpha=(i/this.trail.length)*.4;c.fillStyle=this.col;c.beginPath();c.arc(this.trail[i].x,this.trail[i].y,this.sz*(i/this.trail.length)*.85,0,Math.PI*2);c.fill();c.restore();}
    if(GQ>=2){c.save();c.globalCompositeOperation='lighter';c.globalAlpha=GQ>=3?.75:.5;const hs=this.sz*(this.explode?7:5);c.drawImage(glowSprite(this.col),this.x-hs,this.y-hs,hs*2,hs*2);c.restore();}c.save();c.shadowBlur=this.explode?22:12;c.shadowColor=this.col;c.fillStyle=this.col;c.beginPath();c.arc(this.x,this.y,this.sz,0,Math.PI*2);c.fill();c.fillStyle='rgba(255,255,255,.75)';c.beginPath();c.arc(this.x-this.sz*.28,this.y-this.sz*.28,this.sz*.32,0,Math.PI*2);c.fill();c.restore();
  }
}

// ── Obstacle ──────────────────────────────────────────────────────────────────
class Obstacle{
  constructor(x,y,w,h){this.x=x;this.y=y;this.w=w;this.h=h;}
  draw(c){
    c.save();c.fillStyle='rgba(0,0,0,.45)';c.fillRect(this.x+5,this.y+7,this.w,this.h);c.restore();
    const g=c.createLinearGradient(this.x,this.y,this.x,this.y+this.h);g.addColorStop(0,'#141e32');g.addColorStop(1,'#0b1220');
    c.fillStyle=g;c.fillRect(this.x,this.y,this.w,this.h);
    c.save();c.globalAlpha=.08;c.strokeStyle='#00f5ff';c.lineWidth=.8;for(let yy=this.y+5;yy<this.y+this.h;yy+=8){c.beginPath();c.moveTo(this.x+2,yy);c.lineTo(this.x+this.w-2,yy);c.stroke();}c.restore();
    c.save();c.shadowBlur=6;c.shadowColor='#002a50';c.strokeStyle='#1a406a';c.lineWidth=1.5;c.strokeRect(this.x,this.y,this.w,this.h);c.restore();c.save();c.strokeStyle='rgba(0,245,255,.22)';c.lineWidth=1;c.strokeRect(this.x+2.5,this.y+2.5,this.w-5,this.h-5);c.fillStyle='rgba(140,210,255,.22)';c.fillRect(this.x,this.y,this.w,2);c.restore();
    [[this.x+5,this.y+5],[this.x+this.w-5,this.y+5],[this.x+5,this.y+this.h-5],[this.x+this.w-5,this.y+this.h-5]].forEach(([bx,by])=>{c.fillStyle='#1a3858';c.beginPath();c.arc(bx,by,4.5,0,Math.PI*2);c.fill();c.fillStyle='#2a5888';c.beginPath();c.arc(bx-1,by-1,1.8,0,Math.PI*2);c.fill();});
  }
}

// ── Enemy ─────────────────────────────────────────────────────────────────────
const EB={
  crawler: {hp:30, spd:142,sz:13,dmg:10,col:'#ff3355',score:50,  coins:1,name:'CRAWLER'},
  sentinel:{hp:70, spd:78, sz:19,dmg:18,col:'#ff8800',score:100, coins:2,name:'SENTINEL'},
  warden:  {hp:180,spd:48, sz:27,dmg:32,col:'#aa00ff',score:200, coins:4,name:'WARDEN'},
  spawn:   {hp:45, spd:126,sz:15,dmg:14,col:'#ff00aa',score:150, coins:3,name:'SPAWN'},
  ghost:   {hp:55, spd:148,sz:14,dmg:16,col:'#88ffdd',score:175, coins:3,name:'GHOST'},
  boss:    {hp:600,spd:58, sz:40,dmg:36,col:'#ff2200',score:2500,coins:25,name:'VOID LORD'},
};
class Enemy{
  constructor(x,y,type,mult=1){
    this.x=x;this.y=y;this.type=type;this.angle=0;this.dead=false;
    this.flash=0;this.shootT=rand(.5,1.8);this.moveT=0;this.dx=0;this.dy=0;
    this.teleT=0;this.phaseT=0;this.ghostA=1;this.spin=rand(0,Math.PI*2);this.innerSpin=0;
    this.hurtT=0;this.spawnT=.35;this._hpD=0;
    const b=EB[type];
    this.maxHp=this.hp=Math.ceil(b.hp*mult);this._hpD=this.hp;
    this.spd=Math.min(b.spd*(1+(mult-1)*.28),190);
    this.sz=b.sz;this.dmg=b.dmg*(1+(mult-1)*.32);
    this.col=b.col;this.score=Math.ceil(b.score*mult);this.coins=b.coins;this.name=b.name;
  }
  update(dt,player,bullets,parts){
    if(this.dead)return;if(this.flash>0)this.flash-=dt;if(this.hurtT>0)this.hurtT-=dt;
    if(this.spawnT>0){this.spawnT-=dt;return;}
    this.spin+=dt*.9;this.innerSpin+=dt*2.4;this._hpD=lerp(this._hpD,this.hp,dt*8);
    const dx=player.x-this.x,dy=player.y-this.y,d=Math.hypot(dx,dy)||1;
    this.angle=Math.atan2(dy,dx);const T=this.type;
    if(T==='crawler'){
      this.moveT-=dt;if(this.moveT<=0){this.moveT=rand(.2,.55);this.dx=(dx/d)*this.spd+rand(-52,52);this.dy=(dy/d)*this.spd+rand(-52,52);}
      this.x+=this.dx*dt;this.y+=this.dy*dt;
    }else if(T==='sentinel'){
      if(d>145){this.x+=(dx/d)*this.spd*dt;this.y+=(dy/d)*this.spd*dt;}
      this.shootT-=dt;if(this.shootT<=0&&d<455){this.shootT=rand(1.1,2.0);for(let i=-1;i<=1;i++)this._f(bullets,this.angle+i*.13,300,4,'#ffaa00');sfx.smg();}
    }else if(T==='warden'){
      this.x+=(dx/d)*this.spd*dt;this.y+=(dy/d)*this.spd*dt;
      this.shootT-=dt;if(this.shootT<=0&&d<560){this.shootT=rand(.9,1.5);for(let i=-2;i<=2;i++)this._f(bullets,this.angle+i*.15,365,5,'#ff4400');sfx.shotgun();}
    }else if(T==='spawn'){
      this.teleT-=dt;
      if(this.teleT<=0){
        this.teleT=rand(1.8,3.0);
        for(let i=0;i<16;i++)parts.push(new Particle(this.x,this.y,rand(-125,125),rand(-125,125),this.col,.34,4,true));
        const ta=rand(0,Math.PI*2),tr=rand(80,190);
        this.x=clamp(player.x+Math.cos(ta)*tr,AR.x+35,AR.x+AR.w-35);
        this.y=clamp(player.y+Math.sin(ta)*tr,AR.y+35,AR.y+AR.h-35);
        for(let i=0;i<16;i++)parts.push(new Particle(this.x,this.y,rand(-125,125),rand(-125,125),this.col,.34,4,true));
      }
      this.moveT-=dt;if(this.moveT<=0){this.moveT=rand(.14,.38);this.dx=(dx/d)*this.spd;this.dy=(dy/d)*this.spd;}
      this.x+=this.dx*dt;this.y+=this.dy*dt;
    }else if(T==='ghost'){
      this.phaseT+=dt;this.ghostA=.25+.75*Math.abs(Math.sin(this.phaseT*1.25));
      this.x+=((dx/d)*this.spd+Math.sin(this.phaseT*2.9)*68)*dt;
      this.y+=((dy/d)*this.spd+Math.cos(this.phaseT*2.9)*68)*dt;
      this.shootT-=dt;if(this.shootT<=0&&d<395){this.shootT=rand(.7,1.3);this._f(bullets,this.angle+rand(-.2,.2),348,4,this.col);sfx.smg();}
    }else if(T==='boss'){
      const hr=this.hp/this.maxHp;
      this.x+=(dx/d)*this.spd*(1+(1-hr)*1.9)*dt;this.y+=(dy/d)*this.spd*(1+(1-hr)*1.9)*dt;
      this.shootT-=dt;const fr=hr>.65?.82:hr>.4?.50:.28;
      if(this.shootT<=0){
        this.shootT=fr;const n=hr>.65?8:hr>.4?13:20;
        for(let i=0;i<n;i++){const a=(Math.PI*2/n)*i+this.spin;bullets.push(new Bullet(this.x,this.y,Math.cos(a)*308,Math.sin(a)*308,this.dmg,this.col,5,false,false));}
        if(hr<.4){this._f(bullets,this.angle+rand(-.08,.08),510,7,'#ffff00');}sfx.shotgun();
      }
    }
    this.x=clamp(this.x,AR.x+this.sz,AR.x+AR.w-this.sz);this.y=clamp(this.y,AR.y+this.sz,AR.y+AR.h-this.sz);
  }
  _f(bullets,angle,spd,sz,col){bullets.push(new Bullet(this.x,this.y,Math.cos(angle)*spd,Math.sin(angle)*spd,this.dmg,col,sz,false,false));}
  damage(dmg,parts){
    this.hp-=dmg;this.flash=.10;this.hurtT=.09;sfx.hit();
    for(let i=0;i<5;i++)parts.push(new Particle(this.x+rand(-12,12),this.y+rand(-12,12),rand(-145,145),rand(-145,145),this.col,.26,3,true));
    if(this.hp<=0)this.die(parts);
  }
  die(parts){
    this.dead=true;sfx.death();if(GQ>=1)stamp(this.x,this.y,this.type==='boss'?70:this.sz*1.7,this.col);const n=GQP(this.type==='boss'?80:26);
    for(let i=0;i<n;i++){parts.push(new Particle(this.x+rand(-this.sz,this.sz),this.y+rand(-this.sz,this.sz),rand(-250,250),rand(-250,250),this.col,rand(.4,1.1),rand(2,9),true,i%4===0));}
    for(let i=0;i<GQP(14);i++)parts.push(new Particle(this.x,this.y,rand(-170,170),rand(-170,170),'#fff',.22,rand(3,8)));
  }
  draw(c){
    if(this.dead)return;
    const spA=this.spawnT>0?easeOut(1-this.spawnT/.35):1;
    const al=(this.type==='ghost'?this.ghostA:1)*spA;
    if(GQ>=2&&this.spawnT<=0){c.save();c.globalCompositeOperation='lighter';c.globalAlpha=(this.type==='ghost'?this.ghostA:1)*(GQ>=3?.55:.35);const hs=this.sz*(this.type==='boss'?3.2:2.6);c.drawImage(glowSprite(this.col),this.x-hs,this.y-hs,hs*2,hs*2);c.restore();}
    c.save();c.globalAlpha=al;
    const fc=this.hurtT>0?'#fff':this.col;
    c.shadowBlur=this.hurtT>0?30:18;c.shadowColor=this.hurtT>0?'#fff':this.col;
    c.fillStyle=fc;c.strokeStyle=fc;c.translate(this.x,this.y);
    const T=this.type,s=this.sz;
    if(T==='crawler'){
      c.rotate(this.spin*1.5);
      for(let i=0;i<4;i++){c.save();c.rotate(Math.PI/2*i);c.fillStyle=fc;c.globalAlpha=al*.7;c.beginPath();c.moveTo(s*.6,-s*.2);c.lineTo(s*1.15,0);c.lineTo(s*.6,s*.2);c.closePath();c.fill();c.restore();}
      c.globalAlpha=al;c.fillStyle=fc;c.beginPath();c.arc(0,0,s*.7,0,Math.PI*2);c.fill();
      c.rotate(-this.spin*3);c.fillStyle='#fff';c.globalAlpha=al*.6+.2*Math.sin(this.spin*4);c.beginPath();c.arc(0,0,s*.32,0,Math.PI*2);c.fill();
    }else if(T==='sentinel'){
      c.lineWidth=2.5;c.globalAlpha=al*.5;c.beginPath();c.arc(0,0,s*1.08,0,Math.PI*2);c.stroke();c.globalAlpha=al;
      c.fillStyle=fc;c.beginPath();for(let i=0;i<5;i++){const a=(Math.PI*2/5)*i-Math.PI/2;c.lineTo(Math.cos(a)*s*.85,Math.sin(a)*s*.85);}c.closePath();c.fill();
      c.rotate(this.innerSpin*.6);c.strokeStyle='rgba(255,255,255,.4)';c.lineWidth=1.5;c.beginPath();for(let i=0;i<5;i++){const a=(Math.PI*2/5)*i;c.lineTo(Math.cos(a)*s*.48,Math.sin(a)*s*.48);}c.closePath();c.stroke();
      c.rotate(-this.innerSpin*.6);c.fillStyle='#fff';c.beginPath();c.arc(s*.14,0,s*.2,0,Math.PI*2);c.fill();c.fillStyle='#000';c.beginPath();c.arc(s*.18,0,s*.10,0,Math.PI*2);c.fill();
    }else if(T==='warden'){
      c.rotate(this.spin*.22);c.fillStyle=fc;c.beginPath();for(let i=0;i<6;i++){const a=(Math.PI*2/6)*i;c.lineTo(Math.cos(a)*s,Math.sin(a)*s);}c.closePath();c.fill();
      c.rotate(-this.spin*.5);c.strokeStyle='rgba(255,255,255,.35)';c.lineWidth=1.5;c.beginPath();for(let i=0;i<6;i++){const a=(Math.PI*2/6)*i+.5;c.lineTo(Math.cos(a)*s*.6,Math.sin(a)*s*.6);}c.closePath();c.stroke();
      c.rotate(this.spin*.22);c.fillStyle=fc;c.globalAlpha=al*.6;
      for(let i=0;i<3;i++){c.save();c.rotate(Math.PI*2/3*i);c.fillRect(s*.55,-s*.1,s*.5,s*.2);c.restore();}
      c.globalAlpha=al;c.fillStyle='#fff';c.beginPath();c.arc(0,0,s*.24,0,Math.PI*2);c.fill();
    }else if(T==='spawn'){
      c.rotate(this.spin*.55);c.fillStyle=fc;c.beginPath();for(let i=0;i<8;i++){const a=(Math.PI*2/8)*i,r=i%2===0?s:s*.45;c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();
      c.rotate(-this.spin*1.2);c.strokeStyle='rgba(255,255,255,.35)';c.lineWidth=1.5;c.globalAlpha=al*(.45+.25*Math.sin(this.spin*3));c.beginPath();c.arc(0,0,s*1.1,0,Math.PI*2);c.stroke();
    }else if(T==='ghost'){
      c.rotate(this.spin*.5);
      for(let blade=0;blade<3;blade++){c.save();c.rotate((Math.PI*2/3)*blade);c.fillStyle=fc;c.beginPath();c.moveTo(s,0);c.lineTo(s*.42,s*.38);c.lineTo(-s*.22,0);c.lineTo(s*.42,-s*.38);c.closePath();c.fill();c.restore();}
      c.strokeStyle=`rgba(255,255,255,${.4*this.ghostA})`;c.lineWidth=1.5;c.beginPath();c.arc(0,0,s*.42,0,Math.PI*2);c.stroke();
    }else if(T==='boss'){
      for(let r=0;r<4;r++){c.save();c.rotate(this.spin*(r%2===0?.28:-.22));const radius=s*(.42+r*.18);c.strokeStyle=fc;c.lineWidth=r===0?3:1.5;c.globalAlpha=al*(.2+r*.16);c.beginPath();const pts=8-r;for(let i=0;i<pts;i++){const a=(Math.PI*2/pts)*i+r*.5;c.lineTo(Math.cos(a)*radius,Math.sin(a)*radius);}c.closePath();c.stroke();c.restore();}
      const cg=c.createRadialGradient(-s*.1,-s*.1,s*.05,-s*.1,-s*.1,s*.62);cg.addColorStop(0,'#ff6644');cg.addColorStop(.6,'#cc1100');cg.addColorStop(1,'#440000');
      c.fillStyle=cg;c.globalAlpha=al;c.beginPath();c.arc(0,0,s*.62,0,Math.PI*2);c.fill();
      c.rotate(this.innerSpin*.45);for(let i=0;i<6;i++){c.save();c.rotate((Math.PI*2/6)*i);c.fillStyle=this.col;c.globalAlpha=al*.75;c.beginPath();c.moveTo(s*.66,0);c.lineTo(s*.95,s*.11);c.lineTo(s*.95,-s*.11);c.closePath();c.fill();c.restore();}
      c.rotate(-this.innerSpin*.45);c.globalAlpha=al;c.fillStyle='#fff';c.beginPath();c.arc(s*.22,0,s*.18,0,Math.PI*2);c.fill();c.fillStyle='#200';c.beginPath();c.arc(s*.26,s*.02,s*.10,0,Math.PI*2);c.fill();c.fillStyle='#f00';c.shadowBlur=8;c.shadowColor='#f00';c.beginPath();c.arc(s*.28,s*.03,s*.044,0,Math.PI*2);c.fill();
    }
    c.restore();
    if(T!=='crawler'){
      const bw=s*2.9,bh=6,bx=this.x-bw/2,by=this.y-s-16,r=this._hpD/this.maxHp;
      const hc=r>.5?'#00ff88':r>.25?'#ffaa00':'#ff2200';
      c.save();c.globalAlpha=al*.9;c.fillStyle='rgba(5,9,18,.9)';c.fillRect(bx-1,by-1,bw+2,bh+2);c.fillStyle='#0d1828';c.fillRect(bx,by,bw,bh);c.shadowBlur=6;c.shadowColor=hc;c.fillStyle=hc;c.fillRect(bx,by,bw*r,bh);if(this.hurtT>0){c.fillStyle=`rgba(255,255,255,${this.hurtT*9})`;c.fillRect(bx,by,bw*r,bh);}c.restore();
    }
  }
}

// ── Player ────────────────────────────────────────────────────────────────────
class Player{
  constructor(){
    this.x=ACX;this.y=ACY;this.sz=17;this.spd=232;this.angle=0;
    this.hp=100;this.maxHp=100;this.dead=false;this.inv=0;
    this.dashCD=0;this.dashDur=0;this.dashVx=0;this.dashVy=0;
    this.weapon='pistol';this.shootT=0;this.trail=[];
    this.dmgMult=1;this.spdMult=1;this.piercing=false;this.fireRateMult=1;this.spreadMult=1;this.phoenix=false;
    this.regen=0;this.regenT=0;this.shield=0;this.shieldMax=0;this.orbs=0;this.orbA=0;this.orbSpd=1;this.lifesteal=0;this.dashMult=1;this.novaMult=1;this.chainBonus=0;this.nova=0;this.novaCD=0;this.novaCDm=1;this.buffRapid=0;this.buffQuad=0;
    this.thruster=0;this.hurtF=0;this.shieldF=0;this._hpD=100;this._shD=0;
  }
  gun(){const w={...WEAPONS[this.weapon]};w.dmg=Math.floor(w.dmg*this.dmgMult);w.rate=w.rate/this.fireRateMult;w.spread=w.spread*this.spreadMult;if(this.piercing)w.pierce=true;if(this.buffRapid>0)w.rate/=1.6;if(this.buffQuad>0)w.dmg*=2;return w;}
  update(dt,keys,ax,ay,shooting,bullets,parts){
    if(this.dead)return;
    if(this.inv>0)this.inv-=dt;if(this.shootT>0)this.shootT-=dt;if(this.dashCD>0)this.dashCD-=dt;
    if(this.hurtF>0)this.hurtF-=dt;if(this.shieldF>0)this.shieldF-=dt;if(this.novaCD>0)this.novaCD-=dt;if(this.buffRapid>0)this.buffRapid-=dt;if(this.buffQuad>0)this.buffQuad-=dt;
    this._hpD=lerp(this._hpD,this.hp,dt*7);this._shD=lerp(this._shD,this.shield,dt*7);
    if(this.regen>0){this.regenT-=dt;if(this.regenT<=0){this.regenT=1;this.hp=Math.min(this.maxHp,this.hp+this.regen);}}
    let mx=0,my=0;
    if(this.dashDur>0){this.dashDur-=dt;mx=this.dashVx;my=this.dashVy;}
    else{
      if(keys['KeyW']||keys['ArrowUp'])my-=1;if(keys['KeyS']||keys['ArrowDown'])my+=1;
      if(keys['KeyA']||keys['ArrowLeft'])mx-=1;if(keys['KeyD']||keys['ArrowRight'])mx+=1;
      if(keys._jx){mx+=keys._jx;my+=keys._jy;}
      const mag=Math.hypot(mx,my);if(mag>0){mx/=mag;my/=mag;}
      const sp=this.spd*this.spdMult;mx*=sp;my*=sp;
    }
    this.thruster=lerp(this.thruster,Math.hypot(mx,my)>18?1:0,dt*9);
    if((keys['ShiftLeft']||keys['ShiftRight']||keys._dash)&&this.dashCD<=0){
      const mag=Math.hypot(mx,my);
      if(mag>0){
        this.dashDur=.13;this.dashVx=(mx/mag)*770;this.dashVy=(my/mag)*770;
        this.dashCD=1.4*this.dashMult;this.inv=.22;sfx.dash();
        for(let i=0;i<14;i++)parts.push(new Particle(this.x,this.y,-(mx/mag)*rand(70,185)+rand(-45,45),-(my/mag)*rand(70,185)+rand(-45,45),'#00f5ff',.26,rand(2,4),true));
        keys._dash=false;
      }
    }
    this.trail.push({x:this.x,y:this.y});if(this.trail.length>14)this.trail.shift();
    if(GQ>=1&&this.thruster>.5&&Math.random()<(GQ>=3?.9:.5)){const bx=this.x-Math.cos(this.angle)*(this.sz+4),by=this.y-Math.sin(this.angle)*(this.sz+4);parts.push(new Particle(bx,by,-Math.cos(this.angle)*rand(60,130)+rand(-25,25),-Math.sin(this.angle)*rand(60,130)+rand(-25,25),Math.random()<.5?curSkin().thr[0]:curSkin().thr[1],.28,rand(2,3.6),true));}
    this.x+=mx*dt;this.y+=my*dt;
    this.x=clamp(this.x,AR.x+this.sz,AR.x+AR.w-this.sz);this.y=clamp(this.y,AR.y+this.sz,AR.y+AR.h-this.sz);
    this.angle=Math.atan2(ay-this.y,ax-this.x);
    const w=this.gun();if(shooting&&this.shootT<=0){this.shootT=w.rate;this._shoot(bullets,parts);}
  }
  _shoot(bullets,parts){
    const w=this.gun();sfx[this.weapon]?.();if(w.shake&&CUR)CUR.fx.addShake(w.shake,.12);
    const ox=Math.cos(this.angle)*(this.sz+8),oy=Math.sin(this.angle)*(this.sz+8);
    for(let p=0;p<w.pel;p++){
      const a=this.angle+rand(-w.spread,w.spread);
      const bl=new Bullet(this.x+ox,this.y+oy,Math.cos(a)*w.spd,Math.sin(a)*w.spd,w.dmg,w.col,w.sz,w.pierce,true,w.ex);if(w.life)bl.life=w.life;if(w.chain)bl.chain=w.chain+this.chainBonus;if(this.weapon==='rail')bl.beam=true;if(w.star)bl.star=true;if(w.bh)bl.bh=true;if(w.home)bl.home=true;bullets.push(bl);
    }
    for(let i=0,np=this.weapon==='flame'?2:7;i<np;i++){const a=this.angle+rand(-.65,.65);parts.push(new Particle(this.x+ox*1.3,this.y+oy*1.3,Math.cos(a)*rand(65,150),Math.sin(a)*rand(65,150),w.col,.095,rand(2,4.5),true));}
    parts.push(new Particle(this.x+ox,this.y+oy,0,0,'#fff',.055,w.sz*1.6,true));
  }
  hit(dmg){
    if(this.inv>0||this.dashDur>0)return;
    if(this.shield>0){this.shield=Math.max(0,this.shield-dmg);this.shieldF=.35;this.inv=.34;sfx.shield();return;}
    this.hp-=dmg;this.inv=.52;this.hurtF=.4;sfx.player();
    if(this.hp<=0){
      if(this.phoenix){this.phoenix=false;this.hp=Math.ceil(this.maxHp*0.5);this.inv=1.3;sfx.epic();}
      else{this.hp=0;this.dead=true;}
    }
  }
  draw(c){
    if(this.dashDur>0){for(let i=0;i<this.trail.length;i++){c.save();c.globalAlpha=(i/this.trail.length)*.35;c.shadowBlur=10;c.shadowColor='#00f5ff';c.fillStyle='#00f5ff';c.beginPath();c.arc(this.trail[i].x,this.trail[i].y,this.sz*.68,0,Math.PI*2);c.fill();c.restore();}}
    if(this.inv>0&&Math.floor(this.inv*14)%2===0)return;
    if(this.thruster>.08){
      const tx=this.x-Math.cos(this.angle)*(this.sz+5),ty=this.y-Math.sin(this.angle)*(this.sz+5);
      const tg=c.createRadialGradient(tx,ty,0,tx,ty,this.sz*.9);tg.addColorStop(0,`rgba(${rgbOf(curSkin().thr[0])},${this.thruster*.55})`);tg.addColorStop(1,'transparent');
      c.save();c.fillStyle=tg;c.beginPath();c.arc(tx,ty,this.sz*.9,0,Math.PI*2);c.fill();c.restore();
    }
    if(GQ>=1){c.save();c.globalCompositeOperation='lighter';c.globalAlpha=GQ>=3?.5:.28;c.drawImage(glowSprite(curSkin().glow),this.x-this.sz*2.6,this.y-this.sz*2.6,this.sz*5.2,this.sz*5.2);c.restore();}
    c.save();c.translate(this.x,this.y);c.rotate(this.angle);
    drawShip(c,curSkin(),this.sz,this.hurtF>0,this.shieldF>0,WEAPONS[this.weapon].col);
    c.restore();
    if(this.orbs>0){for(let i=0;i<this.orbs;i++){const a=this.orbA+i*6.283/this.orbs,ox=this.x+Math.cos(a)*58,oy=this.y+Math.sin(a)*58;
      c.save();c.globalCompositeOperation='lighter';c.strokeStyle='rgba(150,230,255,.28)';c.lineWidth=3;c.beginPath();c.arc(this.x,this.y,58,a-.55,a);c.stroke();
      if(GQ>=1)c.drawImage(glowSprite('#9fe8ff'),ox-20,oy-20,40,40);c.globalCompositeOperation='source-over';c.translate(ox,oy);c.rotate(a*2);c.shadowBlur=12;c.shadowColor='#9fe8ff';c.fillStyle='#fff';c.beginPath();c.moveTo(0,-9);c.lineTo(5,0);c.lineTo(0,9);c.lineTo(-5,0);c.closePath();c.fill();c.restore();}}
    if(this.shieldMax>0&&(this._shD>0||this.shieldF>0)){
      const sr=Math.max(0,this._shD)/this.shieldMax,sa=this.shieldF>0?.85+.15*Math.sin(this.shieldF*30):.38+sr*.44;
      c.save();c.strokeStyle=`rgba(0,210,255,${sa})`;c.lineWidth=2.5;c.shadowBlur=14;c.shadowColor='#00ccff';c.beginPath();c.arc(this.x,this.y,this.sz+9,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(sr,.04));c.stroke();c.restore();
    }
    if(this.dashCD>0){const r=1-this.dashCD/(1.4*this.dashMult);c.save();c.strokeStyle='rgba(0,245,255,.28)';c.lineWidth=2;c.beginPath();c.arc(this.x,this.y,this.sz+6,-Math.PI/2,-Math.PI/2+Math.PI*2*r);c.stroke();c.restore();}
  }
}

// ── Upgrades ──────────────────────────────────────────────────────────────────
const UPGRADES=[
  {name:'OVERCLOCK',       desc:'+35% damage output',              icon:'⚡',r:'common',apply:p=>p.dmgMult*=1.35},
  {name:'QUANTUM DRIVE',   desc:'+25% movement speed',             icon:'💨',r:'common',apply:p=>p.spdMult*=1.25},
  {name:'NANO MEDS',       desc:'+50 max HP, heal 25 HP',          icon:'🩺',r:'common',apply:p=>{p.maxHp+=50;p.hp=Math.min(p.maxHp,p.hp+25);}},
  {name:'STIM PACK',       desc:'Restore 60 HP instantly',         icon:'💊',r:'common',apply:p=>{p.hp=Math.min(p.maxHp,p.hp+60);}},
  {name:'SCATTER CANNON',  desc:'Equip 7-pellet shotgun',          icon:'💥',r:'common',apply:p=>p.weapon='shotgun'},
  {name:'NEURAL SMG',      desc:'Equip rapid-fire SMG',            icon:'🔫',r:'common',apply:p=>p.weapon='smg'},
  {name:'PULSE PISTOL',    desc:'Balanced pistol +10% dmg',        icon:'🔫',r:'common',apply:p=>{p.weapon='pistol';p.dmgMult*=1.10;}},
  {name:'CRITICAL MATRIX', desc:'+40% damage, -5% speed',          icon:'🎯',r:'common',apply:p=>{p.dmgMult*=1.40;p.spdMult*=0.95;}},
  {name:'BATTLE HARDENED', desc:'+100 maximum HP',                 icon:'💪',r:'common',apply:p=>p.maxHp+=100},
  {name:'REGEN NODE',      desc:'Regenerate 1 HP per second',      icon:'♻️',r:'common',apply:p=>p.regen=Math.min(p.regen+1,4)},
  {name:'STEADY HANDS',    desc:'-20% bullet spread (more accurate)', icon:'🧘',r:'common',apply:p=>p.spreadMult*=0.80},
  {name:'VOID CORE',       desc:'+65% damage output',              icon:'☢️',r:'rare',  apply:p=>p.dmgMult*=1.65},
  {name:'PHASE SHIFT',     desc:'+45% movement speed',             icon:'🌀',r:'rare',  apply:p=>p.spdMult*=1.45},
  {name:'FULL RESTORE',    desc:'Full HP + +30 max HP',            icon:'❤️',r:'rare',  apply:p=>{p.maxHp+=30;p.hp=p.maxHp;}},
  {name:'PENETRATOR',      desc:'Bullets pierce all enemies',      icon:'🔱',r:'rare',  apply:p=>p.piercing=true},
  {name:'VOID LANCE',      desc:'Equip piercing Void Lance',       icon:'🔮',r:'rare',  apply:p=>p.weapon='lance'},
  {name:'ROCKET CANNON',   desc:'Equip explosive rockets',         icon:'🚀',r:'rare',  apply:p=>p.weapon='rocket'},
  {name:'NANO SHIELD',     desc:'Gain 80 HP energy shield',        icon:'🛡',r:'rare',  apply:p=>{p.shield+=80;p.shieldMax+=80;}},
  {name:'OVERCHARGE',      desc:'+50% weapon fire rate',           icon:'⏩',r:'rare',  apply:p=>p.fireRateMult*=1.5},
  {name:'ADRENALINE RUSH', desc:'+20% fire rate, +15% speed',      icon:'💉',r:'rare',  apply:p=>{p.fireRateMult*=1.20;p.spdMult*=1.15;}},
  {name:'DEEP REGEN',      desc:'Regenerate 3 HP per second',      icon:'🌿',r:'rare',  apply:p=>p.regen=Math.min(p.regen+3,5)},
  {name:'PLASMA FLAMER',    desc:'Equip short-range flamethrower',  icon:'🔥',r:'common',apply:p=>p.weapon='flame'},
  {name:'AFTERBURNER',     desc:'Dash recharges 40% faster',       icon:'🚀',r:'common',apply:p=>p.dashMult*=0.6},
  {name:'TESLA ARC',       desc:'Chain lightning jumps between foes',icon:'🌩',r:'rare',apply:p=>p.weapon='tesla'},
  {name:'RAILGUN',         desc:'Hypersonic piercing beam, huge dmg',icon:'🎯',r:'rare',apply:p=>p.weapon='rail'},
  {name:'ORBITAL BLADES',  desc:'+2 blades orbit and slice enemies',icon:'🌀',r:'rare',apply:p=>p.orbs=Math.min(p.orbs+2,8)},
  {name:'VAMPIRIC ROUNDS', desc:'Heal 2 HP on every kill',         icon:'🩸',r:'rare',  apply:p=>p.lifesteal+=2},
  {name:'NOVA BATTERY',    desc:'Nova charges 60% faster, cooldown -20%',    icon:'🔋',r:'rare',  apply:p=>{p.novaMult*=1.6;p.novaCDm=Math.max(.5,p.novaCDm*.8);}},
  {name:'STORM LORD',      desc:'Tesla Arc +60% dmg, +2 chains',   icon:'⛈',r:'epic',  apply:p=>{p.weapon='tesla';p.dmgMult*=1.6;p.chainBonus+=2;}},
  {name:'SINGULARITY BEAM',desc:'Railgun + 90% damage',            icon:'☄️',r:'epic',  apply:p=>{p.weapon='rail';p.dmgMult*=1.9;}},
  {name:'BLADE STORM',     desc:'+3 blades, faster orbit',         icon:'⚔️',r:'epic',  apply:p=>{p.orbs=Math.min(p.orbs+3,8);p.orbSpd*=1.3;}},
  {name:'STAR FLASH',       desc:'2 exploding stars · 1000 dmg each',icon:'⭐',r:'legendary',apply:p=>p.weapon='star'},
  {name:'SEEKER SWARM',     desc:'3 homing missiles hunt your enemies',icon:'🚀',r:'rare',apply:p=>p.weapon='seeker'},
  {name:'BLACK HOLE',       desc:'Gravity well drags & crushes (wave 7+)',icon:'🌀',r:'epic',apply:p=>p.weapon='blackhole'},
  {name:'OMEGA CORE',      desc:'+100% damage output',             icon:'💥',r:'epic',  apply:p=>p.dmgMult*=2.0},
  {name:'HYPER REACTOR',   desc:'+70% damage, +20% speed',         icon:'⚛️',r:'epic',  apply:p=>{p.dmgMult*=1.70;p.spdMult*=1.20;}},
  {name:'IMMORTALITY CHIP',desc:'+200 max HP, full restore',       icon:'🧬',r:'epic',  apply:p=>{p.maxHp+=200;p.hp=p.maxHp;}},
  {name:'TOTAL WAR',       desc:'+80% dmg, pierce, +30% speed',   icon:'🔥',r:'epic',  apply:p=>{p.dmgMult*=1.80;p.piercing=true;p.spdMult*=1.30;}},
  {name:'VOID MATRIX',     desc:'Void Lance + +60% damage',        icon:'🌌',r:'epic',  apply:p=>{p.weapon='lance';p.dmgMult*=1.60;}},
  {name:'FORTRESS CORE',   desc:'+120HP, 80 shield, regen 3/s',   icon:'🏰',r:'epic',  apply:p=>{p.maxHp+=120;p.hp=Math.min(p.maxHp,p.hp+80);p.shield+=80;p.shieldMax+=80;p.regen=Math.min(p.regen+3,5);}},
  {name:'PHOENIX CORE',    desc:'Auto-revive once at 50% HP',      icon:'🔥',r:'epic',  apply:p=>p.phoenix=true},
];
(()=>{
  const by=n=>UPGRADES.find(u=>u.name===n);
  by('RAILGUN').r='epic';by('RAILGUN').desc='Hypersonic piercing beam (wave 6+)';
  by('PLASMA FLAMER').r='rare';
  const MINW={'ROCKET CANNON':3,'TESLA ARC':3,'PLASMA FLAMER':3,'VOID LANCE':4,'ORBITAL BLADES':3,'RAILGUN':6,'VOID MATRIX':6,'STORM LORD':7,'SINGULARITY BEAM':8,'BLADE STORM':6,'OMEGA CORE':5,'TOTAL WAR':6,'HYPER REACTOR':6,'IMMORTALITY CHIP':5,'FORTRESS CORE':5,'PHOENIX CORE':4,'VOID CORE':3,'STAR FLASH':9,'SEEKER SWARM':3,'BLACK HOLE':7};
  UPGRADES.forEach(u=>{u.minWave=MINW[u.name]??(u.r==='epic'?4:u.r==='rare'?2:1);});
})();
const RC={common:'#4a9aaa',rare:'#7040e8',epic:'#ff9000',legendary:'#ffcc00'};
const RG={common:'#00f5ff',rare:'#9060ff',epic:'#ffb030',legendary:'#ffe14a'};
function pickUpgrades(wave){
  const lk=forgeLv('luck')*.025,ec=wave<4?0:Math.min(.04+(wave-3)*.03,.30)+lk*.5,rc=wave<2?0:Math.min(.14+wave*.035,.50)+lk;
  const pool=shuf(UPGRADES),chosen=[],used=new Set();
  for(let slot=0;slot<3;slot++){
    const lc=wave<9?0:Math.min(.02+(wave-9)*.01,.05);
    for(const[t,ch]of[['legendary',lc],['epic',ec],['rare',rc],['common',1]]){
      if(Math.random()<ch){const m=pool.filter(u=>u.r===t&&u.minWave<=wave&&!used.has(u.name));if(m.length){const p=m[rInt(0,m.length-1)];chosen.push(p);used.add(p.name);break;}}
    }
    if(chosen.length<=slot){const fb=pool.filter(u=>u.minWave<=wave&&!used.has(u.name));if(!fb.length)fb.push(...pool.filter(u=>u.r==='common'&&!used.has(u.name)));if(fb.length){chosen.push(fb[0]);used.add(fb[0].name);}}
  }
  return chosen;
}

// ── Touch Controls ────────────────────────────────────────────────────────────
class Touch{
  // Twin-stick layout: LEFT thumb moves, RIGHT thumb aims + fires (a plain tap auto-aims at the nearest enemy).
  constructor(){
    this.js={active:false,id:null,bx:0,by:0,dx:0,dy:0};
    this.aim={active:false,id:null,bx:0,by:0,dx:0,dy:0,ang:0};
    this.fire={active:false};                                   // true while the aim thumb is down
    this.dash={x:W-62,y:H-212,r:40,active:false,id:null};
    this.nova={x:W-62,y:H-308,r:34,active:false,id:null};
    this.isMobile=IS_TOUCH;
    if(this.isMobile)this._bind();
  }
  _sc(t){const r=canvas.getBoundingClientRect();return{x:(t.clientX-r.left)*(W/r.width),y:(t.clientY-r.top)*(H/r.height)};}
  _bind(){
    const o={passive:false};
    canvas.addEventListener('touchstart', e=>{e.preventDefault();for(const t of e.changedTouches)this._s(t);},o);
    canvas.addEventListener('touchmove',  e=>{e.preventDefault();for(const t of e.changedTouches)this._m(t);},o);
    canvas.addEventListener('touchend',   e=>{e.preventDefault();for(const t of e.changedTouches)this._e(t);try{initAudio();}catch(_){}},o);
    canvas.addEventListener('touchcancel',e=>{e.preventDefault();for(const t of e.changedTouches)this._e(t);},o);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
  }
  reset(){
    this.js={active:false,id:null,bx:0,by:0,dx:0,dy:0};
    this.aim.active=false;this.aim.id=null;this.aim.dx=0;this.aim.dy=0;this.fire.active=false;
    this.dash.active=false;this.dash.id=null;this.nova.active=false;this.nova.id=null;
  }
  _s(t){
    const{x,y}=this._sc(t),g=CUR;
    if(g&&g.touchUi(x,y)){g._tapAt(t.clientX,t.clientY);return;}      // menus, cards, pause… behave like a mouse click
    if(Math.hypot(x-this.nova.x,y-this.nova.y)<this.nova.r+16){this.nova.active=true;this.nova.id=t.identifier;}
    else if(Math.hypot(x-this.dash.x,y-this.dash.y)<this.dash.r+16){this.dash.active=true;this.dash.id=t.identifier;}
    else if(x<W*.5){if(!this.js.active)this.js={active:true,id:t.identifier,bx:x,by:y,dx:0,dy:0};}
    else if(!this.aim.active){this.aim={active:true,id:t.identifier,bx:x,by:y,dx:0,dy:0,ang:this.aim.ang};this.fire.active=true;}
  }
  _m(t){
    const{x,y}=this._sc(t),max=60,mv=s=>{const dx=x-s.bx,dy=y-s.by,mag=Math.hypot(dx,dy);s.dx=mag>max?dx/mag:dx/max;s.dy=mag>max?dy/mag:dy/max;};
    if(t.identifier===this.js.id)mv(this.js);
    if(t.identifier===this.aim.id)mv(this.aim);
  }
  _e(t){
    if(t.identifier===this.js.id)this.js={active:false,id:null,bx:0,by:0,dx:0,dy:0};    if(t.identifier===this.aim.id){this.aim.active=false;this.aim.id=null;this.aim.dx=0;this.aim.dy=0;this.fire.active=false;}
    if(t.identifier===this.dash.id){this.dash.active=false;this.dash.id=null;}
    if(t.identifier===this.nova.id){this.nova.active=false;this.nova.id=null;}
  }
  inject(keys,mouse){
    if(!this.isMobile)return;
    keys._jx=this.js.dx;keys._jy=this.js.dy;keys._dash=this.dash.active;keys._nova=this.nova.active;
    const g=CUR,p=g&&g.player;if(!p)return;
    if(!mouse._ta)mouse._ta={x:p.x+220,y:p.y};
    if(this.aim.active){
      let a=this.aim.ang;
      if(Math.hypot(this.aim.dx,this.aim.dy)>.22){const target=Math.atan2(this.aim.dy,this.aim.dx),delta=Math.atan2(Math.sin(target-a),Math.cos(target-a)),response=[.22,.42,.72][TOUCH_AIM_SENS];a+=delta*response;}
      else{let best=null,bd=1e9;for(const e of g.enemies){if(e.dead)continue;const d=(e.x-p.x)*(e.x-p.x)+(e.y-p.y)*(e.y-p.y);if(d<bd){bd=d;best=e;}}if(best&&bd<560*560)a=Math.atan2(best.y-p.y,best.x-p.x);}   // existing light touch aim assist
      this.aim.ang=a;mouse._ta={x:p.x+Math.cos(a)*220,y:p.y+Math.sin(a)*220};
    }else if(Math.hypot(this.js.dx,this.js.dy)>.25){mouse._ta={x:p.x+this.js.dx*220,y:p.y+this.js.dy*220};}   // not aiming: face where you move
  }
  draw(c){
    if(!this.isMobile)return;
    const g=CUR,p=g&&g.player;if(!g||(g.state!==ST.PLAY&&g.state!==ST.BOSS)||g.paused)return;
    c.save();c.textAlign='center';c.textBaseline='middle';
    if(!this.js.active){c.globalAlpha=.22;c.strokeStyle='#00f5ff';c.lineWidth=2;c.beginPath();c.arc(118,H-108,56,0,6.283);c.stroke();c.fillStyle='#00f5ff';c.font='bold 11px "Courier New"';c.fillText('MOVE',118,H-108);}
    if(!this.aim.active){c.globalAlpha=.24;c.strokeStyle='#ff6a3a';c.lineWidth=2;c.beginPath();c.arc(W-176,H-108,56,0,6.283);c.stroke();c.fillStyle='#ff6a3a';c.font='bold 10px "Courier New"';c.fillText('AIM + FIRE',W-176,H-108);}
    const stick=(st,col)=>{c.globalAlpha=.2;c.fillStyle='#fff';c.beginPath();c.arc(st.bx,st.by,60,0,6.283);c.fill();c.globalAlpha=.45;c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.arc(st.bx,st.by,60,0,6.283);c.stroke();
      c.globalAlpha=.85;c.shadowBlur=14;c.shadowColor=col;c.fillStyle=col;c.beginPath();c.arc(st.bx+st.dx*60,st.by+st.dy*60,24,0,6.283);c.fill();c.shadowBlur=0;};
    if(this.js.active)stick(this.js,'#00f5ff');
    if(this.aim.active)stick(this.aim,'#ff6a3a');
    const btn=(b,col,fill,glyph,frac,ready)=>{
      c.globalAlpha=b.active?.95:ready?.8:.5;c.shadowBlur=ready||b.active?18:6;c.shadowColor=col;c.fillStyle=b.active?fill[1]:fill[0];c.beginPath();c.arc(b.x,b.y,b.r,0,6.283);c.fill();
      c.shadowBlur=0;c.strokeStyle=col;c.lineWidth=2.5;c.beginPath();c.arc(b.x,b.y,b.r,0,6.283);c.stroke();
      if(frac<1){c.globalAlpha=.9;c.lineWidth=4;c.beginPath();c.arc(b.x,b.y,b.r-5,-Math.PI/2,-Math.PI/2+6.283*frac);c.stroke();}
      c.globalAlpha=1;c.fillStyle='#fff';c.font=`bold ${Math.round(b.r*.6)}px sans-serif`;c.fillText(glyph,b.x,b.y+1);};
    if(p){
      btn(this.dash,'#00aaff',['#001a44','#003899'],'⚡',Math.max(0,Math.min(1,1-p.dashCD/(1.4*p.dashMult))),p.dashCD<=0);
      const nr=p.nova>=100&&p.novaCD<=0;btn(this.nova,'#7ffcff',[nr?'#0a4a5a':'#06202a','#0d6a80'],'◈',p.novaCD>0?1-p.novaCD/(20*p.novaCDm):p.nova/100,nr);
    }
    c.textBaseline='alphabetic';c.restore();
  }
}

// ── Combo ─────────────────────────────────────────────────────────────────────
class Combo{
  constructor(){this.count=0;this.timer=0;this.max=4.5;this.pop=0;this.label='';}
  kill(){this.count++;this.timer=this.max;this.pop=.55;if(this.count===5){this.label='NICE!';sfx.combo();}else if(this.count===10){this.label='INSANE!';sfx.combo();}else if(this.count===15){this.label='GODLIKE!';sfx.combo();}else if(this.count>=20&&this.count%5===0){this.label='VOID LORD!';sfx.combo();}}
  update(dt){if(this.timer>0){this.timer-=dt;if(this.timer<=0)this.count=0;}if(this.pop>0)this.pop-=dt;}
  get mult(){return this.count<3?1:this.count<6?1.5:this.count<10?2.0:this.count<15?3.0:4.0;}
  draw(c){
    if(this.count<3)return;const a=Math.min(1,this.timer/this.max);const ps=1+easeOut(Math.max(0,this.pop/.55))*.42;
    const col=this.count>=15?'#ff9000':this.count>=10?'#9060ff':this.count>=6?'#ff4466':'#00f5ff';
    c.save();c.globalAlpha=a;c.translate(AR.x+10,AR.y-30);c.scale(ps,ps);c.shadowBlur=this.pop>.1?22:8;c.shadowColor=col;c.fillStyle=col;c.font=`bold ${12+Math.min(this.count,10)}px "Courier New"`;c.textAlign='left';c.fillText(`${this.count}× COMBO  ×${this.mult.toFixed(1)}`,0,0);
    if(this.label&&this.pop>0){c.globalAlpha=a*easeOut(this.pop/.55);c.font='bold 16px "Courier New"';c.fillText(this.label,0,-20);}
    c.globalAlpha=a*.65;c.fillStyle='#111';c.fillRect(0,5,190,4);c.fillStyle=col;c.shadowBlur=5;c.fillRect(0,5,190*(this.timer/this.max),4);c.restore();
  }
}
class FloatText{
  constructor(x,y,txt,col,sz=14){Object.assign(this,{x,y,txt,col,sz,life:1.1,vy:-68});}
  update(dt){this.y+=this.vy*dt;this.vy*=.91;this.life-=dt*1.2;}
  draw(c){const a=Math.max(0,this.life*.9);c.save();c.globalAlpha=a;c.shadowBlur=9;c.shadowColor=this.col;c.fillStyle=this.col;c.font=`bold ${this.sz}px "Courier New"`;c.textAlign='center';c.fillText(this.txt,this.x,this.y);c.restore();}
}

// ── Achievement popup ─────────────────────────────────────────────────────────
const ACHIEVEMENTS=[
  {id:'first_blood',name:'FIRST BLOOD',   desc:'Get your first kill',       icon:'🩸',check:g=>g.totalKills>=1},
  {id:'combo5',     name:'COMBO KILLER',  desc:'Reach a 5x combo',          icon:'🔥',check:g=>g.combo.count>=5},
  {id:'combo15',    name:'UNSTOPPABLE',   desc:'Reach a 15x combo',         icon:'💀',check:g=>g.combo.count>=15},
  {id:'wave5',      name:'SURVIVOR',      desc:'Reach wave 5',              icon:'⭐',check:g=>g.wave>=5},
  {id:'wave10',     name:'ELITE PILOT',   desc:'Reach wave 10',             icon:'🌟',check:g=>g.wave>=10},
  {id:'score10k',   name:'HIGH ROLLER',   desc:'Score over 10,000',         icon:'💰',check:g=>g.score>=10000},
  {id:'boss1',      name:'BOSS SLAYER',   desc:'Defeat your first boss',    icon:'⚡',check:g=>g.bossKills>=1},
  {id:'nodmg',      name:'UNTOUCHABLE',   desc:'Complete a wave unharmed',  icon:'🛡',check:g=>g._wavePerfect&&g.wave>0},
];
let unlockedAch=new Set();
try{unlockedAch=new Set(JSON.parse(STORE.getItem('vb_ach')||'[]'));}catch(e){}
const saveAch=()=>{try{STORE.setItem('vb_ach',JSON.stringify([...unlockedAch]));}catch(e){}};
class AchPop{
  constructor(){this.q=[];this.cur=null;this.t=0;}
  trigger(a){if(!this.q.find(x=>x.id===a.id)&&!unlockedAch.has(a.id)){this.q.push(a);}}
  update(dt){if(this.t>0){this.t-=dt;return;}if(this.q.length>0){this.cur=this.q.shift();this.t=3.0;sfx.achieve();}else this.cur=null;}
  draw(c){
    if(!this.cur||this.t<=0)return;
    const a=this.t<.6?this.t/.6:this.t>2.6?1-(this.t-2.6)/.4:1;
    const sl=this.t>2.6?easeOut(1-(this.t-2.6)/.4)*280:this.t<.6?easeOut(this.t/.6)*280:280;
    c.save();c.globalAlpha=a;c.translate(W-sl-18,AR.y+AR.h+8);
    c.fillStyle='rgba(5,12,28,.96)';c.strokeStyle='#ffd700';c.lineWidth=2;c.shadowBlur=18;c.shadowColor='#ffd700';
    c.fillRect(0,0,262,46);c.strokeRect(0,0,262,46);c.fillStyle='#ffd700';c.fillRect(0,0,262,2.5);
    c.font='9px "Courier New"';c.textAlign='left';c.fillStyle='#aa8020';c.fillText('ACHIEVEMENT UNLOCKED',10,14);
    c.font='bold 13px "Courier New"';c.fillStyle='#ffd700';c.shadowBlur=8;c.shadowColor='#ffd700';c.fillText(`${this.cur.icon}  ${this.cur.name}`,10,32);
    c.font='9px "Courier New"';c.fillStyle='#886020';c.shadowBlur=0;c.fillText(this.cur.desc,160,32);
    c.restore();
  }
}

// ── Screen FX ─────────────────────────────────────────────────────────────────
class SFX{
  constructor(){this.shake={x:0,y:0,i:0,d:0};this.flash={a:0,col:'#fff'};this.chroma=0;this.freeze=0;this.zoom=0;}
  addShake(i,d){if(!OPT.shake)return;this.shake.i=Math.max(this.shake.i,i);this.shake.d=Math.max(this.shake.d,d);this.shake.m=Math.max(this.shake.m||.01,this.shake.d);}
  addFlash(col,a=.35){this.flash.col=col;this.flash.a=Math.min(1,this.flash.a+a);}
  addChroma(v){this.chroma=Math.max(this.chroma,v);}
  addFreeze(d){this.freeze=Math.max(this.freeze,d);}
  addZoom(v){if(Math.abs(v)>Math.abs(this.zoom))this.zoom=v;}
  update(dt){
    if(this.freeze>0){this.freeze-=dt;return;}
    if(this.shake.d>0){this.shake.d-=dt;const k=Math.max(0,this.shake.d/this.shake.m),a=this.shake.i*k*k;this.shake.x=rand(-a,a);this.shake.y=rand(-a,a);if(this.shake.d<=0){this.shake.x=0;this.shake.y=0;this.shake.i=0;this.shake.m=.01;}}
    this.flash.a=Math.max(0,this.flash.a-dt*4.5);this.chroma=Math.max(0,this.chroma-dt*6);this.zoom*=Math.exp(-dt*9);
  }
  applyFlash(c){if(this.flash.a<.01)return;c.save();c.globalAlpha=this.flash.a;c.fillStyle=this.flash.col;c.fillRect(0,0,W,H);c.restore();}
  applyVignette(c,hp,maxHp){const r=hp/maxHp;const v=r<.35?lerp(.72,.18,r/.35):r<.65?.18*(1-(r-.35)/.3):0;if(v<.01)return;const g=c.createRadialGradient(W/2,H/2,W*.22,W/2,H/2,W*.72);g.addColorStop(0,'transparent');g.addColorStop(1,`rgba(180,0,0,${v})`);c.save();c.fillStyle=g;c.fillRect(0,0,W,H);c.restore();}
  applyChromatic(c){if(this.chroma<.01)return;const o=Math.round(this.chroma*5*RS);c.save();c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='lighter';c.globalAlpha=Math.min(.35,this.chroma*.3);c.drawImage(canvas,o,0);c.drawImage(canvas,-o,0);c.restore();}
}

// ── Wave Stats ────────────────────────────────────────────────────────────────
class WStats{
  constructor(){this.kills=0;this.fired=0;this.hit=0;this.t=Date.now();this.wt=0;this.dmgTaken=0;}
  reset(){this.kills=0;this.fired=0;this.hit=0;this.t=Date.now();this.wt=0;this.dmgTaken=0;}
  get acc(){return this.fired>0?Math.round((this.hit/this.fired)*100):100;}
  get bonus(){return Math.floor(this.kills*12+(this.acc>=80?200:this.acc>=50?80:0)+Math.max(0,(50-this.wt)*10)+(this.dmgTaken===0?500:0));}
}

// ── Game States ───────────────────────────────────────────────────────────────
const ST={SPLASH:-1,LOADING:0,MENU:1,PLAY:2,BOSS:3,STATS:4,UPGRADE:5,OVER:6,WIN:7,SETTINGS:8,SKINS:9,FORGE:10};

// ── GAME ──────────────────────────────────────────────────────────────────────
class Game{
  constructor(){
    CUR=this;this.state=ST.SPLASH; this.keys={}; this.mouse={x:W/2,y:H/2,down:false};
    this.fx=new SFX(); this.sky=new Sky();
    this.parts=[];this.shockwaves=[];this.bullets=[];this.enemies=[];this.obs=[];this.floats=[];this.bolts=[];this.pickups=[];this.wells=[];this.endless=false;
    this.score=0;this.coins=0;this.wave=0;this.totalKills=0;this.bossKills=0;
    this.player=new Player();this.combo=new Combo();this.touch=new Touch();
    this.wStats=new WStats();this.achPop=new AchPop();
    this.upgChoices=[];this.bossT=0;
    this.msgTxt='';this.msgT=0;this.msgCol='#00f5ff';this.msgScale=1;
    this.waveTrans=0;this.TOTAL=12;this.fc=0;
    this.paused=false;this.loadPct=0;this.loadPhase=0;
    this.bootLines=['CALIBRATING NEURAL LINK...','LOADING WEAPON SYSTEMS...','SYNCING VOID COORDINATES...','INITIALIZING ENEMY AI...','SYSTEMS ONLINE'];
    this.showPrivacy=!privOK;this.rewardVisible=false;this.deathCount=0;this._lbRank=-1;
    this.clearBonus=0;this.clearPhase=0;this.clearPhaseT=0;this.earned=0;this._bk=0;this.newSkin=null;this._bestCombo=0;this._runT=0;
    this._wavePerfect=false;this._prevHp=100;
    // Tutorial: show on first play
    this.showTutorial=true;this.tutorialT=0;this.tutorialStep=0;
    this.PAUSE_BTN=IS_TOUCH?{x:W-122,y:6,w:110,h:42}:{x:W-104,y:9,w:92,h:36};
    this.MUTE_BTN= IS_TOUCH?{x:W-122,y:52,w:110,h:34}:{x:W-104,y:50,w:92,h:26};
    // Studio splash screen state
    this.splashT=0;this.fireParts=[];this._splashLogoSound=false;this._splashTextSound=false;
    GAME_HOOKS.loadingStart();
    {const done=()=>GAME_HOOKS.loadingStop();if(hrrLogo.complete)setTimeout(done,0);else{hrrLogo.addEventListener('load',done);hrrLogo.addEventListener('error',done);}setTimeout(done,5000);}   // assets loaded = loading finished (splash intro is gameplay-side)
    this._bind();
  }

  _skipSplash(){
    if(this.state!==ST.SPLASH)return;
    this.state=ST.LOADING;this.fireParts=[];this._load();
  }

  _updateSplash(dt){
    this.splashT+=dt;
    const t=this.splashT;
    // Spawn rising embers while the logo is fading in/holding/fading out
    if(t<3.1){
      for(let i=0;i<2;i++)this.fireParts.push(new FireParticle(W/2,H/2+150,200));
    }
    this.fireParts=this.fireParts.filter(p=>{p.update(dt);return p.life>0;});
    if(!this._splashLogoSound&&t>=0.15){this._splashLogoSound=true;_t(170,'sawtooth',.5,.12,0,SG);_t(85,'sine',.6,.10,0,SG);}
    if(!this._splashTextSound&&t>=3.4){this._splashTextSound=true;sfx.wave();}
    if(t>=6.1){this.state=ST.LOADING;this._load();}
  }

  _drawSplash(c){
    c.fillStyle='#000';c.fillRect(0,0,W,H);
    const t=this.splashT;
    const env=(tt,inEnd,holdEnd,outEnd,inStart=0)=>{
      if(tt<inStart)return 0;
      if(tt<inEnd)return easeOut((tt-inStart)/(inEnd-inStart));
      if(tt<holdEnd)return 1;
      if(tt<outEnd)return 1-easeOut((tt-holdEnd)/(outEnd-holdEnd));
      return 0;
    };
    const logoA=env(t,1.0,2.4,3.1,0);
    const textA=env(t,4.1,5.4,6.1,3.4);

    // Rising embers, drawn behind the logo
    this.fireParts.forEach(p=>p.draw(c));

    if(logoA>0.01){
      c.save();c.globalAlpha=logoA;
      if(hrrLogo.complete&&hrrLogo.naturalWidth>0){
        const dw=420,dh=dw*(hrrLogo.naturalHeight/hrrLogo.naturalWidth);
        const sc=0.94+logoA*0.06;
        c.translate(W/2,H/2-10);c.scale(sc,sc);
        c.drawImage(hrrLogo,-dw/2,-dh/2,dw,dh);
      } else {
        // Fallback if the image hasn't loaded yet
        c.textAlign='center';c.textBaseline='middle';c.font='bold 54px "Courier New"';
        c.shadowBlur=18;c.shadowColor='#ff6600';c.fillStyle='#ff7700';
        c.fillText('HRR STUDIOS',W/2,H/2-10);
      }
      c.restore();
    }

    if(textA>0.01){
      c.save();c.globalAlpha=textA;c.textAlign='center';
      c.shadowBlur=14;c.shadowColor='#ff2222';c.fillStyle='rgba(235,235,235,1)';
      c.font='bold 22px "Courier New"';c.fillText('MADE BY HRR STUDIOS',W/2,H/2-6);
      c.shadowBlur=10;c.shadowColor='#ff2222';c.fillStyle='rgba(255,60,60,1)';
      c.font='bold 16px "Courier New"';c.fillText('ENJOY!',W/2,H/2+24);
      c.restore();
    }

    // Skip hint, fades in shortly after the splash begins
    if(t>0.8){
      c.save();c.globalAlpha=Math.min(1,(t-0.8)*.7)*.45;
      c.fillStyle='rgba(255,255,255,1)';c.font='10px "Courier New"';c.textAlign='center';
      c.fillText('click to skip',W/2,H-22);c.restore();
    }
  }

  _load(){
    let t=0;
    const go=()=>{
      t+=.014+rand(0,.012);this.loadPct=Math.min(t,1);
      this.loadPhase=t<.25?0:t<.6?1:2;
      t<1?requestAnimationFrame(go):(this.state=ST.MENU,GAME_HOOKS.loadingStop());
    };
    requestAnimationFrame(go);
  }

  _bind(){
    addEventListener('keydown',e=>{
      this.keys[e.code]=true;
      // Docs: Avoid Escape — it closes fullscreen on web. Use P only.
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      initAudio();
      if(this.state===ST.SPLASH){this._skipSplash();return;}
      if(this.state===ST.LOADING)return;
      if(this.showPrivacy){if(e.code==='Enter'||e.code==='Space'){acceptPrivacy();this.showPrivacy=false;}return;}
      if(this.state===ST.MENU&&(e.code==='Enter'||e.code==='Space'))this.start();
      if((this.state===ST.SETTINGS||this.state===ST.SKINS||this.state===ST.FORGE)&&(e.code==='Escape'||e.code==='Backspace')){this.state=ST.MENU;return;}
      if(this.state===ST.OVER){if(e.code==='Enter')this.start();else if(e.code==='KeyH'||e.code==='Escape')this._goHome();}
      if(this.state===ST.WIN){if(e.code==='Enter')this.start();else if(e.code==='KeyE')this._startEndless();else if(e.code==='KeyH'||e.code==='Escape')this._goHome();}
      if(e.code==='KeyP'&&[ST.PLAY,ST.BOSS,ST.STATS,ST.UPGRADE].includes(this.state)){
        const live=[ST.PLAY,ST.BOSS].includes(this.state);
        this.paused=!this.paused;
        if(this.paused){sfx.pause();if(live)GAME_HOOKS.gameplayStop();}
        else{sfx.resume();if(live)GAME_HOOKS.gameplayStart();}
      }
      if(e.code==='KeyM'){_userMuted=!_userMuted;audioOn=!_userMuted;_saveMute();if(!audioOn)_stopMusic();else if(AC)_startMusic(_desiredMusicMode);}
    });
    addEventListener('keyup',e=>this.keys[e.code]=false);
    canvas.addEventListener('mousemove',e=>{const r=canvas.getBoundingClientRect();this.mouse.x=(e.clientX-r.left)*(W/r.width);this.mouse.y=(e.clientY-r.top)*(H/r.height);});
    canvas.addEventListener('mousedown',e=>this._press(e));
    canvas.addEventListener('mouseup',e=>{if(e.button===0)this.mouse.down=false;});
    // Settings button in menu (bottom-left)
    this._settingsBtnRect=this._mb(0);
  }

  _privBtn(){return{x:W/2-100,y:H/2+80,w:200,h:44};}
  _revBtn(){return{x:W/2-130,y:H/2+92,w:260,h:IS_TOUCH?44:38};}
  _coinRevBtn(){return{x:W/2-130,y:H/2+92,w:260,h:IS_TOUCH?44:38};}

  _qualityBtnRect(i){return{x:W/2-188+i*96,y:H/2-26,w:88,h:42};}
  _soundToggleRect(){return IS_TOUCH?{x:W/2-90,y:H/2+190,w:180,h:38}:{x:W/2-90,y:H/2+124,w:180,h:30};}
  _autoRect(){return{x:W/2-120,y:H/2+34,w:240,h:46};}
  _aimSensRect(i){return{x:W/2-120+i*82,y:H/2+100,w:74,h:34};}
  _shakeRect(){return IS_TOUCH?{x:W/2-120,y:H/2+136,w:116,h:38}:{x:W/2-120,y:H/2+88,w:116,h:30};}
  _numsRect(){return IS_TOUCH?{x:W/2+4,y:H/2+136,w:116,h:38}:{x:W/2+4,y:H/2+88,w:116,h:30};}
  _settingsBackRect(){return IS_TOUCH?{x:W/2-90,y:H/2+246,w:180,h:42}:{x:W/2-90,y:H/2+162,w:180,h:32};}

  _clickSettings(e){
    const r=canvas.getBoundingClientRect();
    const mx=(e.clientX-r.left)*(W/r.width),my=(e.clientY-r.top)*(H/r.height);
    const hit=rect=>mx>=rect.x&&mx<=rect.x+rect.w&&my>=rect.y&&my<=rect.y+rect.h;
    for(let i=0;i<4;i++){if(hit(this._qualityBtnRect(i))){saveGQ(i);(i===3?sfx.epic:sfx.upg)();return;}}
    if(IS_TOUCH){for(let i=0;i<3;i++){if(hit(this._aimSensRect(i))){TOUCH_AIM_SENS=i;try{STORE.setItem('vb_touch_aim_sens',i);}catch(e){}sfx.upg();return;}}}
    if(hit(this._resetRect())){if(this._rst>0){this._rst=0;this._resetAll();}else{this._rst=3;sfx.hit();}return;}
    if(hit(this._shakeRect())){OPT.shake=!OPT.shake;saveOpt();sfx.upg();return;}
    if(hit(this._numsRect())){OPT.nums=!OPT.nums;saveOpt();sfx.upg();return;}
    if(hit(this._autoRect())){AUTO=!AUTO;if(!AUTO)GQ=GQmax;try{STORE.setItem('vb_auto',AUTO?'1':'0');}catch(e){}sfx.upg();return;}
    if(hit(this._soundToggleRect())){
      _userMuted=!_userMuted;audioOn=!_userMuted;_saveMute();
      if(!audioOn)_stopMusic();else if(AC)_startMusic(_desiredMusicMode);
      sfx.upg();return;
    }
    if(hit(this._settingsBackRect())){this.state=ST.MENU;return;}
  }

  _coinRevive(){
    this.coins-=this._reviveCost();this.player.dead=false;this.player.hp=Math.ceil(this.player.maxHp*.5);
    this.player.inv=2.8;this.state=ST.PLAY;this.rewardVisible=false;this.fx.addFlash('#ffd700',.5);GAME_HOOKS.gameplayStart();
    _desiredMusicMode=this.enemies.some(e=>e.type==='boss'&&!e.dead)?'boss':'normal';if(audioOn)_startMusic(_desiredMusicMode);
  }

  start(){
    _runId++;
    this.state=ST.PLAY;this.player=new Player();this.combo=new Combo();this.fx=new SFX();
    this.score=0;this.coins=0;this.wave=0;this.totalKills=0;this.bossKills=0;
    this.bullets=[];this.enemies=[];this.parts=[];this.shockwaves=[];this.floats=[];this.bolts=[];this.pickups=[];this.wells=[];this.endless=false;this._nr=false;
    this.paused=false;this.rewardVisible=false;this.deathCount=0;this._lbRank=-1;this.earned=0;this._bk=0;this.newSkin=null;
    this.wStats.reset();this._wavePerfect=false;this._cf=0;this._applyForge();this._prevHp=this.player.hp;this._bestCombo=0;this._runT=0;
    this.showTutorial=true;this.tutorialT=0;this.tutorialStep=0;
    this._nextWave();
  }

  _sc(){return 1+(this.wave-1)*.20+(this.wave>12?(this.wave-12)*.10:0);}

  _nextWave(){
    this.wave++;currentWave=this.wave;GAME_HOOKS.reportProgress((this.wave-1)/this.TOTAL*100);
    if(this.wave>this.TOTAL&&!this.endless){SAVE.wins++;if(this.deathCount===0)SAVE.deathless++;this._endRun();GAME_HOOKS.happyTime();saveHS(this.score);this._lbRank=saveToLeaderboard(this.score,this.wave,this.totalKills);GAME_HOOKS.submitScore(this.score);this.state=ST.WIN;_stopMusic();return;}
    this._theme=null;this.bullets=[];this.enemies=[];this.obs=this._genObs();dc.clearRect(0,0,AR.w,AR.h);this.bolts=[];this.pickups=[];this.wells=[];
    if(this.wave%4===0){this.state=ST.BOSS;this.bossT=3.4;sfx.boss();_desiredMusicMode='boss';if(AC&&audioOn)_startMusic('boss');}
    else{this.state=ST.PLAY;this._spawnWave();_desiredMusicMode='normal';if(AC&&audioOn)_startMusic('normal');}
    this._msg(`WAVE  ${this._wl()}`+(this._theme&&this._theme.n!=='STANDARD'?`  ·  ${this._theme.n}`:''),2.4,this._theme?this._theme.col:'#00f5ff');
    this.wStats.reset();this._wavePerfect=true;this._prevHp=this.player.hp;this.fx.addZoom(-.05);
    sfx.wave();
    // Tutorial only on wave 1
    if(this.wave===1){this.showTutorial=true;this.tutorialT=6.0;this.tutorialStep=0;}
  }

  _spawnWave(){
    GAME_HOOKS.gameplayStart(); // signal: player is now in live gameplay
    try{GAME_HOOKS.setContext({wave:this.wave});}catch(e){}
    const w=this.wave,sc=this._sc();
    const pos=()=>{let x,y,ok,t=0;do{ok=true;const s=rInt(0,3);if(s===0){x=rand(AR.x,AR.x+AR.w);y=AR.y+42;}else if(s===1){x=rand(AR.x,AR.x+AR.w);y=AR.y+AR.h-42;}else if(s===2){x=AR.x+42;y=rand(AR.y,AR.y+AR.h);}else{x=AR.x+AR.w-42;y=rand(AR.y,AR.y+AR.h);}if(dist({x,y},this.player)<175)ok=false;t++;}while(!ok&&t<20);return{x,y};};
    const cnts={crawler:Math.min(3+Math.floor(w*1.6),18),sentinel:Math.max(0,Math.floor((w-1)*1.1)),warden:Math.max(0,Math.floor((w-2)*.7)),spawn:w>=3?Math.floor((w-2)*.8):0,ghost:w>=4?Math.floor((w-3)*.9):0};
    const th=this._pickTheme(w);this._theme=th;this._lastTheme=th?th.n:'STANDARD';
    const ring=()=>{const a=rand(0,6.283),d=rand(250,330);return{x:clamp(this.player.x+Math.cos(a)*d,AR.x+34,AR.x+AR.w-34),y:clamp(this.player.y+Math.sin(a)*d,AR.y+34,AR.y+AR.h-34)};};
    const list=[];
    for(const[t,n0]of Object.entries(cnts)){let n=n0*((th&&th.m[t])||1)*rand(.88,1.14);n=Math.round(n);if(th&&th.n==='ELITE SQUAD'&&w>=3&&(t==='warden'||t==='sentinel'))n=Math.max(1,n);for(let i=0;i<n;i++)list.push(t);}
    while(list.length>75)list.splice(rInt(0,list.length-1),1);
    list.forEach(t=>{const q=th&&th.ring?ring():pos();const e=new Enemy(q.x,q.y,t,sc);if(th&&th.spd)e.spd*=th.spd;this.enemies.push(e);});
  }

  _pickTheme(w){
    if(w<2)return null;
    const T=[
      {n:'STANDARD',col:'#00f5ff',w:2,m:{}},
      {n:'SWARM',col:'#ff4466',w:2,m:{crawler:2.2,sentinel:.5,warden:.4,spawn:.5,ghost:.5}},
      {n:'ELITE SQUAD',col:'#aa44ff',w:2,min:3,m:{crawler:.3,sentinel:1.5,warden:1.8,spawn:.7,ghost:.7}},
      {n:'AMBUSH',col:'#ffaa22',w:2,ring:true,m:{}},
      {n:'GHOST NIGHT',col:'#88ffdd',w:1.5,min:4,m:{crawler:.5,sentinel:.6,warden:.6,spawn:.6,ghost:3.2}},
      {n:'HIVE',col:'#ff00aa',w:1.5,min:3,m:{crawler:.6,sentinel:.7,warden:.6,spawn:3.2,ghost:.6}},
      {n:'BLITZ',col:'#ffee44',w:2,spd:1.3,m:{crawler:.75,sentinel:.75,warden:.75,spawn:.75,ghost:.75}},
      {n:'FLOOD',col:'#44aaff',w:1.5,min:2,m:{crawler:1.6,sentinel:1.4,warden:1.3,spawn:1.4,ghost:1.4}},
    ].filter(t=>(t.min||0)<=w&&t.n!==this._lastTheme);
    let r=Math.random()*T.reduce((a,t)=>a+t.w,0);for(const t of T){r-=t.w;if(r<=0)return t;}return T[0];
  }
  _spawnBoss(){
    GAME_HOOKS.gameplayStart(); // signal: player is now in live boss gameplay
    try{GAME_HOOKS.setContext({wave:this.wave,boss:'VOID LORD'});}catch(e){}
    const sc=this._sc();
    this.enemies.push(new Enemy(ACX,ACY-80,'boss',sc));
    const ex=Math.floor(this.wave/4);
    const ne=Math.min(ex*2,14);for(let i=0;i<ne;i++){const a=(Math.PI*2/ne)*i;this.enemies.push(new Enemy(ACX+Math.cos(a)*125,ACY-80+Math.sin(a)*125,i%2===0?'warden':'ghost',sc));}
  }

  _genObs(){
    const obs=[];for(let i=0;i<14;i++){const ow=rand(42,92),oh=rand(42,92);const x=rand(AR.x+95,AR.x+AR.w-ow-95),y=rand(AR.y+95,AR.y+AR.h-oh-95);if(Math.abs(x+ow/2-ACX)<118&&Math.abs(y+oh/2-ACY)<98)continue;obs.push(new Obstacle(x,y,ow,oh));}return obs;
  }

  _msg(txt,dur,col='#00f5ff'){this.msgTxt=txt;this.msgT=dur;this.msgCol=col;this.msgScale=1.3;}

  _explode(x,y,dmg,parts,col,rad){
    const big=!!col;col=col||'#ff6600';rad=rad||82;
    for(let i=0;i<GQP(big?48:26);i++)parts.push(new Particle(x,y,rand(-210,210)*(big?1.5:1),rand(-210,210)*(big?1.5:1),col,rand(.3,.75),rand(3,9),true,i%5===0));
    for(let i=0;i<GQP(big?18:10);i++)parts.push(new Particle(x,y,rand(-90,90),rand(-90,90),'#ffdd00',rand(.5,1.1),rand(6,13),true));
    parts.push(new Particle(x,y,0,0,'#fff',.09,big?70:44,true));
    this.shockwaves.push(new Shockwave(x,y,col,rad+6));if(big)this.shockwaves.push(new Shockwave(x,y,'#fff',rad*.7));
    this.enemies.forEach(e=>{if(!e.dead&&dist({x,y},e)<rad+e.sz)e.damage(dmg*.62,parts);});
    this.fx.addShake(big?13:9,.24);this.fx.addFlash(col,big?.32:.22);this.fx.addZoom(.018);if(GQ>=1)stamp(x,y,54,'#ff6600');sfx.explode();
  }

  _offerStats(){
    GAME_HOOKS.gameplayStop(); // player is no longer in live gameplay
    this._skinCheck();persist();
    _desiredMusicMode='normal';if(AC&&audioOn)_startMusic('normal');
    this.clearBonus=this.wStats.bonus;
    this.clearPhase=0;this.clearPhaseT=4.0; // show stats for 4s or click to skip
    this.state=ST.STATS;
    this.upgChoices=pickUpgrades(this.wave);
    if(this.upgChoices.some(u=>u.r==='legendary')){sfx.epic();sfx.combo();this.fx.addFlash('#ffe14a',.4);this.fx.addShake(7,.3);this.fx.addChroma(.5);}
  }

  _advanceToUpgrades(){
    this.state=ST.UPGRADE;sfx.wave();
  }

  _cardRects(){
    const cw=242,ch=172,gap=18,total=cw*3+gap*2,sx=(W-total)/2,sy=H/2-ch/2+8;
    return[{x:sx,y:sy,w:cw,h:ch},{x:sx+cw+gap,y:sy,w:cw,h:ch},{x:sx+(cw+gap)*2,y:sy,w:cw,h:ch}];
  }

  _clickUpgrade(e){
    const r=canvas.getBoundingClientRect();const mx=(e.clientX-r.left)*(W/r.width),my=(e.clientY-r.top)*(H/r.height);
    for(let i=0;i<3;i++){const{x,y,w,h}=this._cardRects()[i];if(mx>=x&&mx<=x+w&&my>=y&&my<=y+h){const u=this.upgChoices[i];if(!u)return;u.apply(this.player);u.r==='epic'?sfx.epic():(u.r==='rare'?sfx.achieve():sfx.upg());this.score+=this.clearBonus;this.waveTrans=.35;this._nextWave();return;}}
  }

  _checkAchievements(){
    ACHIEVEMENTS.forEach(a=>{if(!unlockedAch.has(a.id)&&a.check(this)){unlockedAch.add(a.id);saveAch();this.achPop.trigger(a);}});
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  update(dt){
    this.fc++;
    if(this.state===ST.SPLASH){this._updateSplash(dt);return;}
    if(this.state===ST.LOADING)return;
    this.sky.update(dt);
    // Hit-stop freeze must always tick down in real time, regardless of pause,
    // otherwise it can get stuck and permanently halt all game logic.
    if(this.fx.freeze>0){
      this.fx.freeze=Math.max(0,this.fx.freeze-dt);
      return;
    }
    if(this.paused)return;
    this.fx.update(dt);
    if(this.msgT>0){this.msgT-=dt;this.msgScale=lerp(this.msgScale,1,dt*8);}
    this.combo.update(dt);this.achPop.update(dt);
    this.floats=this.floats.filter(f=>{f.update(dt);return f.life>0;});
    this.shockwaves=this.shockwaves.filter(s=>{s.update(dt);return s.life>0;});
    if(this.tutorialT>0)this.tutorialT-=dt;

    if(this.state===ST.STATS){
      this.parts=this.parts.filter(p=>{p.update(dt);return p.life>0;});
      this.clearPhaseT-=dt;if(this.clearPhaseT<=0)this._advanceToUpgrades();
      return;
    }
    if(this.state===ST.UPGRADE){this.parts=this.parts.filter(p=>{p.update(dt);return p.life>0;});return;}
    if(this.state===ST.BOSS){
      this.bossT-=dt;this.parts=this.parts.filter(p=>{p.update(dt);return p.life>0;});
      if(this.bossT<=0){this.state=ST.PLAY;this._spawnBoss();}return;
    }
    if(this.state!==ST.PLAY)return;
    if(this.waveTrans>0){this.waveTrans-=dt;return;}
    this.wStats.wt=(Date.now()-this.wStats.t)/1000;
    this.touch.inject(this.keys,this.mouse);
    this.mouse._bx=this.player.x;this.mouse._by=this.player.y;
    const ax=this.mouse._ta?.x??this.mouse.x,ay=this.mouse._ta?.y??this.mouse.y;
    const shooting=this.mouse.down||this.touch.fire.active;
    const{player:p,bullets:bs,enemies:es,parts:ps,floats:fl}=this;
    const prevLen=bs.length;
    p.update(dt,this.keys,ax,ay,shooting,bs,ps);
    if(p.novaCD<=0&&p.nova>=100&&!this._nr){this._nr=true;this.floats.push(new FloatText(p.x,p.y-34,'NOVA READY!','#7ffcff',16));sfx.combo();}else if(p.nova<100||p.novaCD>0)this._nr=false;
    const nk=!!(this.keys['KeyQ']||this.keys._nova);if(nk&&!this._nk)this._fireNova();this._nk=nk;
    if(bs.length>prevLen)this.wStats.fired+=bs.length-prevLen;
    if(p.hp<this._prevHp){this._wavePerfect=false;this.wStats.dmgTaken+=this._prevHp-p.hp;}
    this._prevHp=p.hp;
    es.forEach(e=>e.update(dt,p,bs,ps));
    if(p.orbs>0&&!p.dead){p.orbA+=dt*3.4*p.orbSpd;for(let i=0;i<p.orbs;i++){const a=p.orbA+i*6.283/p.orbs,ox=p.x+Math.cos(a)*58,oy=p.y+Math.sin(a)*58;es.forEach(e=>{if(e.dead||e._ob>0)return;if(Math.hypot(e.x-ox,e.y-oy)<e.sz+9){e._ob=.28;e.damage(14+p.dmgMult*6,ps);}});}}
    es.forEach(e=>{if(e._ob>0)e._ob-=dt;});
    this.bolts.forEach(b=>b.life-=dt);this.bolts=this.bolts.filter(b=>b.life>0);
    this.wells.forEach(w=>{w.t-=dt;w.age+=dt;w.tick-=dt;const hurt=w.tick<=0;if(hurt)w.tick=.25;
      es.forEach(e=>{if(e.dead)return;const dx=w.x-e.x,dy=w.y-e.y,d=Math.hypot(dx,dy);if(d>=w.r)return;
        if(d>10){const pull=(e.type==='boss'?.22:1)*(110+(1-d/w.r)*210)*dt;e.x+=dx/d*pull;e.y+=dy/d*pull;}
        if(hurt)e.damage(w.dmg,ps);});});
    this.wells=this.wells.filter(w=>w.t>0);
    this.pickups.forEach(u=>{if(u.update(dt,p))this._collect(u);});this.pickups=this.pickups.filter(u=>!u.taken&&u.life>0);
    bs.filter(b=>!b.dead).forEach(b=>b.update(dt));
    ps.filter(q=>q.life>0).forEach(q=>q.update(dt));
    bs.forEach(b=>{
      if(!b.fromPlayer)return;
      es.forEach(e=>{
        if(e.dead||b.dead||b.hits.has(e))return;
        if(segDist(b,e)<e.sz){
          this.wStats.hit++;e.damage(b.dmg,ps);if(GQ>0&&OPT.nums&&fl.length<36)fl.push(new FloatText(e.x+rand(-10,10),e.y-e.sz-4,String(Math.floor(b.dmg)),'#fff',11));
          if(b.chain)this._chain(e,b.dmg*.7,b.chain,ps);
          if(b.bh){this._well(b.x,b.y);b.dead=true;}else if(b.explode){this._explode(b.x,b.y,b.dmg,ps,b.star?'#ffe14a':null,b.star?125:0);b.dead=true;}else if(b.pierce){b.hits.add(e);}else{b.dead=true;for(let i=0;i<5;i++)ps.push(new Particle(b.x,b.y,rand(-95,95),rand(-95,95),b.col,.14,2));}
        }
      });
    });
    bs.forEach(b=>{if(b.fromPlayer||b.dead||p.dead)return;if(dist(b,p)<p.sz-4){p.hit(b.dmg);b.dead=true;this.fx.addShake(5,.16);this.fx.addFlash('#ff2244',.24);this.fx.addZoom(.02);buzz(40);this.fx.addChroma(.4);for(let i=0;i<12;i++)ps.push(new Particle(p.x,p.y,rand(-125,125),rand(-125,125),'#ff4466',.32,3));}});
    es.forEach(e=>{if(!e.dead&&dist(e,p)<e.sz+p.sz-5){p.hit(e.dmg*dt*2.2);this.fx.addShake(4,.09);}});
    es.forEach(e=>{if(e.dead&&!e._rew){e._rew=true;this._kill(e);}});
    this.enemies=es.filter(e=>!e.dead);this.bullets=bs.filter(b=>!b.dead);this.parts=ps.filter(q=>q.life>0);
    this._checkAchievements();
    if(p.dead){
      GAME_HOOKS.clearContext();this._endRun();saveHS(this.score);this._lbRank=saveToLeaderboard(this.score,this.wave,this.totalKills);GAME_HOOKS.submitScore(this.score);
      this.fx.addShake(18,.8);this.fx.addFlash('#ff0000',.8);this.fx.addChroma(1);this.fx.addFreeze(.12);
      for(let i=0;i<GQP(50);i++)ps.push(new Particle(p.x,p.y,rand(-250,250),rand(-250,250),'#00f5ff',rand(.6,1.6),rand(3,11),true,i%3===0));
      this.shockwaves.push(new Shockwave(p.x,p.y,'#00f5ff',100));
      this.deathCount++;this.rewardVisible=true;this.state=ST.OVER;_stopMusic();
      GAME_HOOKS.gameplayStop();
      // Can't combine midgame + rewarded on same death screen.
    }
    if(this.enemies.length===0&&this.state===ST.PLAY)this._offerStats();
  }

  // ── DRAW HELPERS ──────────────────────────────────────────────────────────
  _drawArena(c){
    const g=c.createRadialGradient(ACX,ACY,55,ACX,ACY,AR.w*.74);g.addColorStop(0,'rgba(11,22,44,.98)');g.addColorStop(1,'rgba(4,8,18,.98)');c.fillStyle=g;c.fillRect(AR.x,AR.y,AR.w,AR.h);
    c.strokeStyle='rgba(20,36,60,.65)';c.lineWidth=1;for(let x=AR.x;x<=AR.x+AR.w;x+=40){c.beginPath();c.moveTo(x,AR.y);c.lineTo(x,AR.y+AR.h);c.stroke();}for(let y=AR.y;y<=AR.y+AR.h;y+=40){c.beginPath();c.moveTo(AR.x,y);c.lineTo(AR.x+AR.w,y);c.stroke();}
    this._arenaFX(c);
    if(GQL()){c.save();c.globalAlpha=.82;c.globalCompositeOperation='multiply';c.drawImage(LC,AR.x,AR.y);c.globalCompositeOperation='source-over';c.restore();}
    c.save();c.shadowBlur=22;c.shadowColor='#0a5099';c.strokeStyle='#1a4888';c.lineWidth=4;c.strokeRect(AR.x,AR.y,AR.w,AR.h);c.shadowColor='#00f5ff18';c.strokeStyle='#0a3060';c.lineWidth=1;c.strokeRect(AR.x+5,AR.y+5,AR.w-10,AR.h-10);c.restore();
    const p=.7+.3*Math.sin(this.fc*.04);[[AR.x,AR.y,1,1],[AR.x+AR.w,AR.y,-1,1],[AR.x,AR.y+AR.h,1,-1],[AR.x+AR.w,AR.y+AR.h,-1,-1]].forEach(([cx,cy,sx,sy])=>{c.save();c.strokeStyle=`rgba(42,96,180,${p})`;c.lineWidth=2.5;c.shadowBlur=8;c.shadowColor='#1a4888';c.beginPath();c.moveTo(cx+sx*3,cy);c.lineTo(cx+sx*26,cy);c.moveTo(cx,cy+sy*3);c.lineTo(cx,cy+sy*26);c.stroke();c.fillStyle=`rgba(55,120,200,${p})`;c.beginPath();c.arc(cx,cy,4.5,0,Math.PI*2);c.fill();c.restore();});
  }

  _drawBossBar(c){
    const boss=this.enemies.find(e=>e.type==='boss'&&!e.dead);if(!boss)return;
    const r=boss._hpD/boss.maxHp;const bw=580,bh=22,bx=(W-bw)/2,by=AR.y-36;
    c.save();c.shadowBlur=14;c.shadowColor='#aa0000';c.fillStyle='rgba(8,3,3,.96)';c.fillRect(bx-3,by-3,bw+6,bh+6);c.fillStyle='#110508';c.fillRect(bx,by,bw,bh);
    const hg=c.createLinearGradient(bx,0,bx+bw*r,0);hg.addColorStop(0,'#ff5500');hg.addColorStop(.5,'#ff2200');hg.addColorStop(1,'#cc0000');c.fillStyle=hg;c.fillRect(bx,by,bw*r,bh);
    if(r<.35){c.fillStyle=`rgba(255,255,0,${.45*Math.abs(Math.sin(this.fc*.18))})`;c.fillRect(bx,by,bw*r,bh);}
    c.strokeStyle='rgba(0,0,0,.5)';c.lineWidth=1;for(let i=1;i<10;i++){c.beginPath();c.moveTo(bx+bw*.1*i,by);c.lineTo(bx+bw*.1*i,by+bh);c.stroke();}
    c.strokeStyle='#550000';c.lineWidth=1.5;c.strokeRect(bx,by,bw,bh);
    c.fillStyle='#ff8866';c.font='bold 11px "Courier New"';c.textAlign='center';c.shadowBlur=6;c.shadowColor='#ff2200';c.fillText(`⚠  ${boss.name}  —  ${Math.max(0,Math.ceil(boss._hpD))} / ${boss.maxHp}  ⚠`,W/2,by+15);c.restore();
  }

  _drawTutorial(c){
    if(!this.showTutorial||this.tutorialT<=0)return;
    const steps=this.touch.isMobile?
      [['LEFT THUMB','Move your ship'],['RIGHT THUMB','Aim + shoot (auto-aims)'],['⚡ BUTTON','Dash to dodge'],['◈ BUTTON','Void Nova blast']]  :
      [['WASD / ARROWS','Move your ship'],['MOUSE','Aim your weapon'],['LEFT CLICK','Shoot enemies'],['SHIFT','Dash to dodge'],['Q','Void Nova blast']];
    const a=Math.min(1,this.tutorialT/1.5);const ox=AR.x+12,oy=AR.y+AR.h-12-steps.length*24;
    c.save();c.globalAlpha=a;
    c.fillStyle='rgba(4,10,22,.88)';c.strokeStyle='rgba(0,245,255,.4)';c.lineWidth=1;
    c.fillRect(ox-8,oy-14,220,steps.length*24+18);c.strokeRect(ox-8,oy-14,220,steps.length*24+18);
    steps.forEach(([k,v],i)=>{
      c.fillStyle='rgba(0,245,255,.9)';c.font='bold 11px "Courier New"';c.textAlign='left';c.fillText(k,ox,oy+i*24);
      c.fillStyle='rgba(200,230,240,.85)';c.font='11px "Courier New"';c.fillText('— '+v,ox+1,oy+i*24+14);
    });
    c.fillStyle='rgba(0,245,255,.55)';c.font='9px "Courier New"';c.textAlign='left';c.fillText('P to pause  ·  M to mute',ox,oy+steps.length*24+4);
    c.restore();
  }

  _drawHUD(c){
    const p=this.player;
    const bg=c.createLinearGradient(0,0,0,62);bg.addColorStop(0,'rgba(3,6,15,.97)');bg.addColorStop(1,'rgba(5,9,20,.92)');c.fillStyle=bg;c.fillRect(0,0,W,62);
    {const lg=c.createLinearGradient(0,0,W,0);lg.addColorStop(0,'rgba(0,245,255,0)');lg.addColorStop(.5,'rgba(0,245,255,.55)');lg.addColorStop(1,'rgba(0,245,255,0)');c.fillStyle=lg;c.fillRect(0,61,W,2);}
    // HP
    const hr=p._hpD/p.maxHp,hc=hr>.5?'#00ff88':hr>.25?'#ffaa00':'#ff2244';
    fancyBar(c,18,9,212,17,hr,hc);
    if(p.hurtF>0){c.fillStyle=`rgba(255,255,255,${p.hurtF*2.5})`;c.fillRect(18,9,212*hr,17);}
    c.strokeStyle='rgba(28,50,90,.8)';c.lineWidth=1;c.strokeRect(18,9,212,17);
    c.fillStyle='rgba(225,240,250,1)';c.font='bold 11px "Courier New"';c.textAlign='left';c.fillText(`HP  ${Math.ceil(p._hpD)} / ${p.maxHp}`,22,22);
    if(p.shieldMax>0){const sr=p._shD/p.shieldMax;fancyBar(c,18,28,212,7,sr,'#00ccff');if(p.shieldF>0){c.fillStyle=`rgba(255,255,255,${p.shieldF*2.2})`;c.fillRect(18,28,212*sr,7);}c.fillStyle='rgba(100,200,220,1)';c.font='10px "Courier New"';c.fillText(`SHIELD  ${Math.ceil(p._shD)}`,22,44);}
    // Weapon
    const w=WEAPONS[p.weapon];c.fillStyle='rgba(160,210,230,1)';c.font='bold 10px "Courier New"';c.textAlign='center';c.fillText('WEAPON',W/2,11);
    c.save();c.shadowBlur=12;c.shadowColor=w.col;c.fillStyle=w.col;c.font='bold 15px "Courier New"';c.fillText(`${w.icon}  ${w.name}`,W/2,27);c.restore();
    const mods=[];if(p.piercing)mods.push('◈PIERCE');if(p.dmgMult>1)mods.push(`DMG×${p.dmgMult.toFixed(1)}`);if(p.spdMult>1)mods.push(`SPD×${p.spdMult.toFixed(1)}`);if(p.fireRateMult>1)mods.push(`RATE×${p.fireRateMult.toFixed(1)}`);if(p.regen>0)mods.push(`♻${p.regen}/s`);if(p.phoenix)mods.push('🔥REVIVE');
    if(mods.length){c.fillStyle='rgba(100,210,110,1)';c.font='bold 10px "Courier New"';c.fillText(mods.join('  '),W/2,42);}
    {const bf=[];if(p.buffRapid>0)bf.push(['» RAPID FIRE '+p.buffRapid.toFixed(1)+'s','#ffe14a']);if(p.buffQuad>0)bf.push(['×2 DAMAGE '+p.buffQuad.toFixed(1)+'s','#ff44dd']);bf.forEach((q,i)=>{c.save();c.textAlign='center';c.font='bold 11px "Courier New"';c.shadowBlur=10;c.shadowColor=q[1];c.fillStyle=q[1];c.fillText(q[0],W/2,58+i*13);c.restore();});}
    // Score
    c.fillStyle='rgba(160,210,230,1)';c.font='bold 10px "Courier New"';c.textAlign='right';c.fillText('SCORE',W-108,11);
    c.save();c.shadowBlur=9;c.shadowColor='#ffd700';c.fillStyle='#ffd700';c.font='bold 16px "Courier New"';c.fillText(this.score.toLocaleString(),W-108,27);c.restore();
    c.fillStyle='rgba(180,150,50,1)';c.font='bold 10px "Courier New"';c.fillText(`BEST  ${HS.toLocaleString()}`,W-108,40);
    c.fillStyle='rgba(210,175,55,1)';c.fillText(`◆ ${this.coins}`,W-108,53);
    // Wave + kills
    c.fillStyle='rgba(100,165,210,1)';c.font='bold 11px "Courier New"';c.textAlign='right';c.fillText(`WAVE ${this._wl()}`,AR.x+AR.w,AR.y+AR.h+20);
    c.fillStyle='rgba(200,100,100,1)';c.font='bold 10px "Courier New"';c.textAlign='left';c.fillText(`ENEMIES: ${this.enemies.length}`,AR.x+4,AR.y+AR.h+20);
    c.fillStyle='rgba(100,175,210,1)';c.font='10px "Courier New"';c.fillText(`KILLS: ${this.totalKills}  |  P:PAUSE  M:MUTE`,AR.x+4,AR.y+AR.h+32);
    // Pause btn
    const pb=this.PAUSE_BTN,ph=this.mouse.x>=pb.x&&this.mouse.x<=pb.x+pb.w&&this.mouse.y>=pb.y&&this.mouse.y<=pb.y+pb.h;
    c.save();c.fillStyle=this.paused?'rgba(10,30,55,.95)':ph?'rgba(8,22,40,.95)':'rgba(4,10,20,.92)';c.strokeStyle=this.paused||ph?'#00f5ff':'rgba(22,45,85,.8)';if(ph||this.paused){c.shadowBlur=14;c.shadowColor='#00f5ff';}c.lineWidth=1.5;c.fillRect(pb.x,pb.y,pb.w,pb.h);c.strokeRect(pb.x,pb.y,pb.w,pb.h);c.restore();
    c.fillStyle=this.paused?'#00f5ff':ph?'#90d8f0':'rgba(70,130,145,.9)';c.font='bold 11px "Courier New"';c.textAlign='center';c.fillText(this.paused?'▶  RESUME':'⏸  PAUSE',pb.x+pb.w/2,pb.y+pb.h/2+4);
    // Mute btn
    const mb=this.MUTE_BTN,mh=this.mouse.x>=mb.x&&this.mouse.x<=mb.x+mb.w&&this.mouse.y>=mb.y&&this.mouse.y<=mb.y+mb.h;
    c.save();c.fillStyle=mh?'rgba(8,22,40,.95)':'rgba(4,10,20,.9)';c.strokeStyle=mh?'rgba(0,245,255,.35)':'rgba(22,45,85,.6)';c.lineWidth=1;c.fillRect(mb.x,mb.y,mb.w,mb.h);c.strokeRect(mb.x,mb.y,mb.w,mb.h);c.restore();
    c.fillStyle=audioOn?'rgba(55,130,145,.9)':'rgba(200,60,60,.9)';c.font='9px "Courier New"';c.textAlign='center';c.fillText(audioOn?'🔊 SOUND':'🔇 MUTED',mb.x+mb.w/2,mb.y+mb.h/2+3);
    this._drawBossBar(c);
  }

  _drawCrosshair(c){
    if(this.touch.isMobile)return;
    const aiming=[ST.PLAY,ST.BOSS].includes(this.state)&&!this.paused;
    if(!aiming){this._drawPointer(c);return;}
    const{x,y}=this.mouse,wc=WEAPONS[this.player.weapon].col;
    c.save();c.strokeStyle=wc;c.lineWidth=1.5;c.globalAlpha=.8;c.shadowBlur=8;c.shadowColor=wc;
    const s=9,g=5;c.beginPath();c.moveTo(x-s-g,y);c.lineTo(x-g,y);c.moveTo(x+g,y);c.lineTo(x+s+g,y);c.moveTo(x,y-s-g);c.lineTo(x,y-g);c.moveTo(x,y+g);c.lineTo(x,y+s+g);c.stroke();c.fillStyle=wc;c.beginPath();c.arc(x,y,2.2,0,Math.PI*2);c.fill();c.restore();
  }

  // Friendly arrow-style pointer, used anywhere the player is clicking
  // buttons/menus rather than aiming a weapon (menu, settings, pause).
  _drawPointer(c){
    if(this.touch.isMobile)return;
    const{x,y}=this.mouse;
    c.save();c.translate(x,y);
    c.shadowBlur=9;c.shadowColor='#00f5ff';
    c.fillStyle='rgba(0,245,255,.96)';c.strokeStyle='rgba(0,15,25,.85)';c.lineWidth=1.4;
    c.beginPath();
    c.moveTo(0,0);c.lineTo(0,15);c.lineTo(3.6,11.6);c.lineTo(6.2,17.2);
    c.lineTo(8.4,16.1);c.lineTo(5.9,10.6);c.lineTo(10.4,10.4);
    c.closePath();c.fill();c.stroke();
    c.restore();
  }

  _drawStats(c){
    c.fillStyle='rgba(0,0,0,.90)';c.fillRect(0,0,W,H);
    const pw=520,ph=360,px=W/2-pw/2,py=H/2-ph/2-10;
    glass(c,px,py,pw,ph,'#00f5ff',.3);
    const tg=c.createLinearGradient(px,py,px+pw,py);tg.addColorStop(0,'transparent');tg.addColorStop(.35,'rgba(0,245,255,.6)');tg.addColorStop(.65,'rgba(0,245,255,.6)');tg.addColorStop(1,'transparent');c.fillStyle=tg;c.fillRect(px,py,pw,4);
    c.save();c.shadowBlur=28;c.shadowColor='#00f5ff';c.fillStyle='#00f5ff';c.font='bold 30px "Courier New"';c.textAlign='center';c.fillText('WAVE COMPLETE',W/2,py+46);c.restore();
    c.fillStyle='rgba(140,215,230,1)';c.font='bold 13px "Courier New"';c.textAlign='center';c.fillText(`WAVE ${this.endless?this.wave:this.wave+' OF '+this.TOTAL} CLEARED`,W/2,py+70);
    c.strokeStyle='rgba(0,245,255,.2)';c.lineWidth=1;c.beginPath();c.moveTo(px+24,py+82);c.lineTo(px+pw-24,py+82);c.stroke();
    const rows=[
      ['ENEMIES KILLED',`${this.wStats.kills}`,'rgba(255,180,140,1)'],
      ['SHOT ACCURACY', `${this.wStats.acc}%`, this.wStats.acc>=80?'rgba(68,255,136,1)':this.wStats.acc>=50?'rgba(255,204,68,1)':'rgba(255,100,100,1)'],
      ['WAVE TIME',     `${this.wStats.wt.toFixed(1)}s`, this.wStats.wt<30?'rgba(68,255,136,1)':'rgba(255,204,68,1)'],
      ['PERFECT WAVE',  this._wavePerfect?'✓  NO DAMAGE  +500':'—', this._wavePerfect?'rgba(68,255,136,1)':'rgba(150,150,150,1)'],
      ['WAVE BONUS',    `+${this.clearBonus.toLocaleString()}`, this.clearBonus>600?'rgba(255,215,0,1)':'rgba(200,200,200,1)'],
    ];
    rows.forEach(([l,v,col],i)=>{
      const ry=py+96+i*44;c.fillStyle='rgba(10,20,38,.9)';c.fillRect(px+22,ry,pw-44,36);c.strokeStyle='rgba(30,60,100,.7)';c.lineWidth=1;c.strokeRect(px+22,ry,pw-44,36);
      c.fillStyle='rgba(160,215,235,1)';c.font='bold 13px "Courier New"';c.textAlign='left';c.fillText(l,px+36,ry+23);
      c.save();c.shadowBlur=6;c.shadowColor=col;c.fillStyle=col;c.font='bold 15px "Courier New"';c.textAlign='right';c.fillText(v,px+pw-36,ry+23);c.restore();
    });
    const prog=Math.max(0,1-this.clearPhaseT/4.0);
    c.fillStyle='rgba(8,16,30,.9)';c.fillRect(px+22,py+ph-44,pw-44,8);
    c.save();c.shadowBlur=8;c.shadowColor='#00f5ff';c.fillStyle='#00f5ff';c.fillRect(px+22,py+ph-44,(pw-44)*prog,8);c.restore();
    if(Math.floor(this.fc*.04)%2===0){c.save();c.shadowBlur=14;c.shadowColor='#00f5ff';c.fillStyle='rgba(0,245,255,1)';c.font='bold 14px "Courier New"';c.textAlign='center';c.fillText('[ CLICK or WAIT FOR UPGRADES ]',W/2,py+ph-18);c.restore();}
  }

  _drawUpgrades(c){
    c.fillStyle='rgba(0,0,0,.90)';c.fillRect(0,0,W,H);
    const pw=W-70,ph=H-70,px=35,py=35;
    c.save();c.fillStyle='rgba(5,10,22,.97)';c.strokeStyle='rgba(0,245,255,.35)';c.lineWidth=2;c.fillRect(px,py,pw,ph);c.strokeRect(px,py,pw,ph);c.restore();
    const tg=c.createLinearGradient(px,py,px+pw,py);tg.addColorStop(0,'transparent');tg.addColorStop(.4,'rgba(0,245,255,.5)');tg.addColorStop(.6,'rgba(0,245,255,.5)');tg.addColorStop(1,'transparent');c.fillStyle=tg;c.fillRect(px,py,pw,4);
    c.save();c.shadowBlur=26;c.shadowColor='#00f5ff';c.fillStyle='rgba(0,245,255,1)';c.font='bold 26px "Courier New"';c.textAlign='center';c.fillText('CHOOSE YOUR UPGRADE',W/2,py+42);c.restore();
    c.fillStyle='rgba(140,215,230,1)';c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText(`WAVE ${this._wl()}  ·  SCORE: ${this.score.toLocaleString()}  ·  BONUS: +${this.clearBonus.toLocaleString()}`,W/2,py+64);
    const cards=this._cardRects();const{x:mx,y:my}=this.mouse;
    cards.forEach((card,i)=>{
      const u=this.upgChoices[i];if(!u)return;
      const hov=mx>=card.x&&mx<=card.x+card.w&&my>=card.y&&my<=card.y+card.h;
      const gc=RG[u.r],rc=RC[u.r];this._hv=this._hv||[0,0,0];const hv=this._hv[i]=lerp(this._hv[i],hov?1:0,.22);c.save();c.translate(card.x+card.w/2,card.y+card.h/2);c.scale(1+hv*.045,1+hv*.045);c.translate(-card.x-card.w/2,-card.y-card.h/2-hv*7);
      glass(c,card.x,card.y,card.w,card.h,gc,hv+(u.r==='legendary'?.7+.3*Math.sin(this.fc*.13):u.r==='epic'?.3+.2*Math.sin(this.fc*.08):u.r==='rare'?.1:0));
      c.fillStyle=rc;c.fillRect(card.x,card.y,card.w,4);c.fillStyle=rc;c.font='bold 10px "Courier New"';c.textAlign='center';c.fillText(u.r.toUpperCase(),card.x+card.w/2,card.y+18);
      c.font='32px serif';c.fillText(u.icon,card.x+card.w/2,card.y+52);
      c.save();c.shadowBlur=hov?16:5;c.shadowColor=gc;c.fillStyle=hov?'rgba(255,255,255,1)':rc;c.font='bold 13px "Courier New"';c.textAlign='center';c.fillText(u.name,card.x+card.w/2,card.y+70);c.restore();
      c.fillStyle='rgba(200,225,240,1)';c.font='11px "Courier New"';c.textAlign='center';
      const wds=u.desc.split(' ');let ln='',lns=[],mw=card.w-22;wds.forEach(wd=>{const t=ln+wd+' ';if(c.measureText(t).width>mw&&ln){lns.push(ln.trim());ln=wd+' ';}else ln=t;});if(ln)lns.push(ln.trim());lns.forEach((l,li)=>c.fillText(l,card.x+card.w/2,card.y+88+li*16));
      if(hov){c.save();c.fillStyle='rgba(6,16,32,.95)';c.fillRect(card.x+4,card.y+card.h-26,card.w-8,20);c.fillStyle=gc;c.shadowBlur=8;c.shadowColor=gc;c.font='bold 10px "Courier New"';c.textAlign='center';c.fillText('▶  SELECT THIS UPGRADE',card.x+card.w/2,card.y+card.h-12);c.restore();}c.restore();
    });
  }

  _drawBossIntro(c){
    const t=1-(this.bossT/3.4);c.fillStyle=`rgba(0,0,0,${.55+t*.32})`;c.fillRect(0,0,W,H);
    c.save();c.globalAlpha=.04;c.fillStyle='#88ffff';for(let y=0;y<H;y+=3)c.fillRect(0,y,W,1);c.restore();
    c.save();const pulse=1+Math.sin(this.fc*.18)*.055;c.translate(W/2,H/2);c.scale(pulse,pulse);c.shadowBlur=60+t*30;c.shadowColor='#ff2200';c.fillStyle='rgba(255,34,0,1)';c.font='bold 64px "Courier New"';c.textAlign='center';c.fillText('⚠  BOSS  ⚠',0,0);c.restore();
    c.fillStyle='rgba(200,70,70,1)';c.font='15px "Courier New"';c.textAlign='center';c.fillText('VOID ENTITY DETECTED — WEAPONS FREE',W/2,H/2+56);
    c.fillStyle='rgba(160,80,80,1)';c.font='11px "Courier New"';c.fillText(`THREAT LEVEL: ${this._sc().toFixed(1)}×  |  WAVE ${this._wl()}`,W/2,H/2+78);
  }

  _pBtns(){const x=W/2-135,w=270;let y=IS_TOUCH?H/2-34:H/2-26;return(IS_TOUCH?[['resume',44],['gfx',44],['auto',56],['fps',44],['home',44]]:[['resume',34],['gfx',34],['auto',50],['fps',34],['home',34]]).map(([id,h])=>{const b={id,x,y,w,h};y+=h+8;return b;});}
  _clickPause(e){
    const r=canvas.getBoundingClientRect(),mx=(e.clientX-r.left)*(W/r.width),my=(e.clientY-r.top)*(H/r.height);
    const b=this._pBtns().find(q=>mx>=q.x&&mx<=q.x+q.w&&my>=q.y&&my<=q.y+q.h);if(!b)return;
    const live=[ST.PLAY,ST.BOSS].includes(this.state);
    if(b.id==='resume'){this.paused=false;sfx.resume();if(live)GAME_HOOKS.gameplayStart();}
    else if(b.id==='gfx'){saveGQ((GQ+1)%4);this._lows=0;sfx.upg();}
    else if(b.id==='auto'){AUTO=!AUTO;if(!AUTO)GQ=GQmax;try{STORE.setItem('vb_auto',AUTO?'1':'0');}catch(e){}sfx.upg();}
    else if(b.id==='fps'){OPT.fps=!OPT.fps;saveOpt();sfx.upg();}
    else if(b.id==='home'){
      if(this._homeArm>0){this.paused=false;this._homeArm=0;GAME_HOOKS.gameplayStop();GAME_HOOKS.clearContext();this.state=ST.MENU;_desiredMusicMode='normal';if(AC&&audioOn)_startMusic('normal');this.bullets=[];this.enemies=[];this.pickups=[];this.bolts=[];sfx.resume();}
      else{this._homeArm=3;sfx.hit();}
    }
  }
  _drawPause(c){
    if(this._homeArm>0)this._homeArm-=.016;
    c.fillStyle='rgba(0,0,0,.82)';c.fillRect(0,0,W,H);
    c.save();c.shadowBlur=36;c.shadowColor='#00f5ff';c.fillStyle='#00f5ff';c.font='bold 48px "Courier New"';c.textAlign='center';c.fillText('PAUSED',W/2,H/2-88);c.restore();
    c.fillStyle='rgba(80,140,175,1)';c.font='11px "Courier New"';c.textAlign='center';c.fillText(`WAVE ${this._wl()}  |  SCORE: ${this.score.toLocaleString()}  |  HP: ${Math.ceil(this.player.hp)}/${this.player.maxHp}`,W/2,H/2-58);
    this._pBtns().forEach(b=>{
      const hov=this.mouse.x>=b.x&&this.mouse.x<=b.x+b.w&&this.mouse.y>=b.y&&this.mouse.y<=b.y+b.h;
      let label,col='#00f5ff',on=true;
      if(b.id==='resume')label='▶  RESUME';
      else if(b.id==='gfx'){label='GRAPHICS: '+GQN[GQ]+(GQ!==GQmax?'  (auto-adjusted)':'')+'  ▸';col=GQ===3?'#ff9a2e':'#00f5ff';}
      else if(b.id==='auto'){label='⚡ AUTO PERFORMANCE: '+(AUTO?'ON':'OFF');on=AUTO;}
      else if(b.id==='fps'){label='FPS COUNTER: '+(OPT.fps?'ON':'OFF');on=OPT.fps;}
      else{const arm=this._homeArm>0;label=arm?'⚠ CLICK AGAIN — ENDS THIS RUN':'⌂  GO HOME';col=arm?'#ff5a5a':'#9fb4c8';}
      c.save();c.fillStyle=hov?'rgba(10,28,48,.97)':'rgba(4,10,20,.9)';c.strokeStyle=on?col:'rgba(120,130,150,.5)';c.lineWidth=hov?2:1.5;if(hov){c.shadowBlur=12;c.shadowColor=col;}
      c.fillRect(b.x,b.y,b.w,b.h);c.strokeRect(b.x,b.y,b.w,b.h);c.restore();
      c.fillStyle=on?col:'rgba(150,160,175,.9)';c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText(label,b.x+b.w/2,b.id==='auto'?b.y+19:b.y+b.h/2+4);
      if(b.id==='auto'){c.fillStyle='rgba(130,170,195,.85)';c.font='9px "Courier New"';c.fillText(AUTO_DESC[0],b.x+b.w/2,b.y+32);c.fillText(AUTO_DESC[1],b.x+b.w/2,b.y+43);}
    });
    c.fillStyle='rgba(80,140,175,.8)';c.font='10px "Courier New"';c.fillText('Press P to resume  ·  Graphics changes apply instantly',W/2,H/2+216);
  }

  _drawPrivacy(c){
    c.fillStyle='rgba(0,0,0,.92)';c.fillRect(0,0,W,H);
    const pw=500,ph=295,px=W/2-pw/2,py=H/2-ph/2;
    c.save();c.shadowBlur=30;c.shadowColor='rgba(0,245,255,.18)';c.fillStyle='rgba(5,10,22,.98)';c.strokeStyle='rgba(18,50,95,.9)';c.lineWidth=2;c.fillRect(px,py,pw,ph);c.strokeRect(px,py,pw,ph);c.restore();
    const tg=c.createLinearGradient(px,py,px+pw,py);tg.addColorStop(0,'transparent');tg.addColorStop(.5,'rgba(0,245,255,.55)');tg.addColorStop(1,'transparent');c.fillStyle=tg;c.fillRect(px,py,pw,3);
    c.save();c.shadowBlur=18;c.shadowColor='#00f5ff';c.fillStyle='rgba(0,245,255,1)';c.font='bold 18px "Courier New"';c.textAlign='center';c.fillText('PRIVACY NOTICE',W/2,py+38);c.restore();
    c.strokeStyle='rgba(15,38,65,.9)';c.lineWidth=1;c.beginPath();c.moveTo(px+22,py+50);c.lineTo(px+pw-22,py+50);c.stroke();
    ['VOID BREACH saves your progress and best score','in this browser using local storage.','','No account is required. No gameplay data is','sent to an external platform.'].forEach((l,i)=>{c.fillStyle='rgba(190,225,240,1)';c.font='12px "Courier New"';c.textAlign='center';c.fillText(l,W/2,py+78+i*24);});
    const b=this._privBtn();const bh=this.mouse.x>=b.x&&this.mouse.x<=b.x+b.w&&this.mouse.y>=b.y&&this.mouse.y<=b.y+b.h;
    c.save();c.fillStyle=bh?'rgba(12,40,22,.98)':'rgba(6,18,10,.96)';c.strokeStyle=bh?'rgba(68,255,136,1)':'rgba(22,110,55,.8)';if(bh){c.shadowBlur=20;c.shadowColor='rgba(68,255,136,1)';}c.lineWidth=2;c.fillRect(b.x,b.y,b.w,b.h);c.strokeRect(b.x,b.y,b.w,b.h);c.restore();
    c.fillStyle=bh?'rgba(136,255,170,1)':'rgba(65,200,95,.9)';c.font='bold 13px "Courier New"';c.textAlign='center';c.fillText('✓  ACCEPT & PLAY',b.x+b.w/2,b.y+b.h/2+5);
  }

  _drawLoading(c){
    this.sky.draw(c);
    c.save();c.globalAlpha=.04;c.fillStyle='#88ffff';for(let y=0;y<H;y+=3)c.fillRect(0,y,W,1);c.restore();

    if(this.loadPhase===0){
      // Phase 0: dark void, pulsing core, no title yet
      const pulse=.5+.5*Math.abs(Math.sin(this.fc*.07));
      c.save();c.shadowBlur=40;c.shadowColor='#00f5ff';c.globalAlpha=.25+pulse*.35;
      c.strokeStyle='#00f5ff';c.lineWidth=2;c.beginPath();c.arc(W/2,H/2-40,30+pulse*14,0,Math.PI*2);c.stroke();
      c.beginPath();c.arc(W/2,H/2-40,14+pulse*6,0,Math.PI*2);c.fillStyle='#00f5ff';c.globalAlpha=.5+pulse*.4;c.fill();
      c.restore();
      c.fillStyle='rgba(0,245,255,.55)';c.font='13px "Courier New"';c.textAlign='center';
      c.fillText('ESTABLISHING VOID CONNECTION',W/2,H/2+30);
    } else if(this.loadPhase===1){
      // Phase 1: title typing in letter by letter, slight glitch flicker
      const pct=(this.loadPct-.25)/.35,title='VOID BREACH';
      const shown=Math.floor(clamp(pct,0,1)*title.length);
      const glitch=Math.random()<.04;
      c.save();c.shadowBlur=glitch?14:40;c.shadowColor=glitch?'#ff2244':'#00f5ff';
      c.fillStyle=glitch?'rgba(255,60,90,1)':'rgba(0,245,255,1)';
      c.font='bold 72px "Courier New"';c.textAlign='left';
      const tw=c.measureText(title).width,startX=W/2-tw/2;
      for(let i=0;i<shown;i++){
        const a=i===shown-1?clamp(pct*title.length-i,0,1):1;
        c.globalAlpha=a;
        c.fillText(title[i],startX+c.measureText(title.slice(0,i)).width,H/2-20);
      }
      // Blinking cursor at the typing edge
      if(shown<title.length&&Math.floor(this.fc*.15)%2===0){
        c.globalAlpha=1;c.fillRect(startX+c.measureText(title.slice(0,shown)).width+2,H/2-54,4,40);
      }
      c.restore();
      c.fillStyle='rgba(40,140,175,.85)';c.font='12px "Courier New"';c.textAlign='center';
      c.fillText('ROGUELIKE TOP-DOWN SHOOTER',W/2,H/2+18);
    } else {
      // Phase 2: full logo settled, pulsing glow, ready for progress sweep
      const pulse=1+Math.sin(this.fc*.07)*.025;
      c.save();c.translate(W/2,H/2-30);c.scale(pulse,pulse);
      c.shadowBlur=55;c.shadowColor='#00f5ff';c.fillStyle='rgba(0,245,255,1)';
      c.font='bold 72px "Courier New"';c.textAlign='center';c.fillText('VOID BREACH',0,0);
      c.globalAlpha=.25;c.fillStyle='#fff';c.fillText('VOID BREACH',2,2);
      c.restore();
      c.fillStyle='rgba(40,140,175,1)';c.font='13px "Courier New"';c.textAlign='center';
      c.fillText('ROGUELIKE TOP-DOWN SHOOTER',W/2,H/2+10);
    }

    // Progress bar — present from phase 1 onward
    if(this.loadPhase>=1){
      const a=this.loadPhase===1?clamp((this.loadPct-.25)/.1,0,1):1;
      const bw=340,bh=20,bx=W/2-bw/2,by=H/2+58;
      c.save();c.globalAlpha=a;
      c.fillStyle='rgba(5,10,22,.95)';c.fillRect(bx-2,by-2,bw+4,bh+4);
      c.fillStyle='rgba(8,16,32,.95)';c.fillRect(bx,by,bw,bh);
      const lg=c.createLinearGradient(bx,0,bx+bw,0);lg.addColorStop(0,'#0055aa');lg.addColorStop(.5,'#00f5ff');lg.addColorStop(1,'#0044aa');
      c.shadowBlur=14;c.shadowColor='#00f5ff';c.fillStyle=lg;c.fillRect(bx,by,bw*this.loadPct,bh);
      // Traveling energy highlight sweeping across the filled portion
      const sweepX=bx+bw*this.loadPct;
      c.shadowBlur=0;c.globalAlpha=a*(.5+.5*Math.sin(this.fc*.2));c.fillStyle='#ffffff';
      c.fillRect(Math.max(bx,sweepX-10),by,6,bh);
      c.globalAlpha=a;c.shadowBlur=0;c.strokeStyle='rgba(20,50,90,.8)';c.lineWidth=1;c.strokeRect(bx,by,bw,bh);
      c.fillStyle='rgba(80,190,215,1)';c.font='11px "Courier New"';c.textAlign='center';
      c.fillText(`${Math.floor(this.loadPct*100)}%`,W/2,by+bh+18);
      c.restore();

      // Boot sequence log lines, revealed progressively
      const logY=by+bh+38;
      const linesShown=Math.min(this.bootLines.length,Math.floor(this.loadPct*this.bootLines.length*1.05)+1);
      c.save();c.font='10px "Courier New"';c.textAlign='center';
      for(let i=0;i<linesShown;i++){
        const isLast=i===linesShown-1&&this.loadPct<1;
        c.fillStyle=isLast?'rgba(0,245,255,.9)':'rgba(40,120,150,.6)';
        c.fillText((isLast?'▸ ':'✓ ')+this.bootLines[i],W/2,logY+i*16);
      }
      c.restore();
    }
  }

  _kill(e){
    const ps=this.parts,fl=this.floats,p=this.player;
            if(e.type==='boss'){this.bossKills++;SAVE.bosses++;GAME_HOOKS.happyTime();this.fx.addFlash('#ff2200',.32);this.fx.addChroma(.6);this.shockwaves.push(new Shockwave(e.x,e.y,'#ff2200',120));}
            const pts=Math.floor(e.score*this.combo.mult);this.score+=pts;{this._cf=(this._cf||0)+e.coins*(1+.08*forgeLv('scav'));const cg=Math.floor(this._cf);this._cf-=cg;this.coins+=cg;this.earned+=cg;}this.totalKills++;SAVE.kills++;this.wStats.kills++;this.combo.kill();if(this.combo.count>this._bestCombo)this._bestCombo=this.combo.count;
            this.fx.addShake(e.type==='boss'?12:4,.14);this.fx.addFreeze(e.type==='boss'?.09:.028);this.fx.addZoom(e.type==='boss'?.05:.014);this.shockwaves.push(new Shockwave(e.x,e.y,e.col,e.type==='boss'?120:46));
            fl.push(new FloatText(e.x,e.y-e.sz,`+${pts}`,e.type==='boss'?'#ffd700':e.type==='warden'?'#cc66ff':'#fff',e.type==='boss'?22:14));
            if(this.combo.count>=10)fl.push(new FloatText(e.x,e.y-e.sz-24,'BRUTAL!','#ff9000',17));
            for(let i=0;i<e.coins;i++)ps.push(new Particle(e.x+rand(-18,18),e.y+rand(-15,15),rand(-72,72),rand(-98,-22),'#ffd700',1.2,4,true,true));
    if(p.lifesteal&&!p.dead)p.hp=Math.min(p.maxHp,p.hp+p.lifesteal);
    const was=p.nova;p.nova=Math.min(100,p.nova+(e.type==='boss'?35:e.type==='warden'?6:3.2)*p.novaMult);
    const drop=t=>this.pickups.push(new Pickup(e.x,e.y,t));
    if(e.type==='boss'){drop('heal');drop('quad');drop('nova');}
    else if(Math.random()<(e.type==='warden'?.22:.085)){const r=Math.random();let t=r<.3?'heal':r<.55?'rapid':r<.78?'quad':'nova';if(t==='heal'&&p.hp>p.maxHp*.85)t='rapid';drop(t);}
  }
  _collect(u){
    const p=this.player,d=PUD[u.t];sfx.upg();
    if(u.t==='heal')p.hp=Math.min(p.maxHp,p.hp+30);else if(u.t==='rapid')p.buffRapid=8;else if(u.t==='quad')p.buffQuad=8;else p.nova=Math.min(100,p.nova+40);
    this.floats.push(new FloatText(u.x,u.y-18,d.lbl,d.col,14));
    for(let i=0;i<10;i++)this.parts.push(new Particle(u.x,u.y,rand(-130,130),rand(-130,130),d.col,.4,3,true));
  }
  _chain(from,dmg,n,ps){
    const hit=new Set([from]);let cur=from,d=dmg;
    for(let i=0;i<n;i++){let best=null,bd=190;this.enemies.forEach(e=>{if(e.dead||hit.has(e))return;const q=dist(cur,e);if(q<bd){bd=q;best=e;}});
      if(!best)break;hit.add(best);const pts=[{x:cur.x,y:cur.y}];for(let k=1;k<5;k++){const t=k/5;pts.push({x:cur.x+(best.x-cur.x)*t+rand(-9,9),y:cur.y+(best.y-cur.y)*t+rand(-9,9)});}
      pts.push({x:best.x,y:best.y});this.bolts.push({pts,life:.2,ml:.2});best.damage(d,ps);d*=.85;cur=best;}
  }
  _well(x,y){
    this.wells.push({x,y,t:3.2,age:0,tick:.1,r:190,dmg:11*this.player.dmgMult});
    this.shockwaves.push(new Shockwave(x,y,'#a060ff',150));this.fx.addShake(5,.2);sfx.combo();
    for(let i=0;i<GQP(18);i++){const a=rand(0,6.283),d=rand(60,170);this.parts.push(new Particle(x+Math.cos(a)*d,y+Math.sin(a)*d,-Math.cos(a)*150,-Math.sin(a)*150,'#b080ff',.5,3,true));}
  }
  _wl(){return this.endless?`${this.wave} ∞`:`${this.wave}/${this.TOTAL}`;}
  _winBtns(){const y=H/2+104,h=IS_TOUCH?46:38,w=150,x0=W/2-250;return[['home',x0],['again',x0+175],['endless',x0+350]].map(([id,x])=>({id,x,y,w,h}));}
  _goHome(){GAME_HOOKS.gameplayStop();GAME_HOOKS.clearContext();this.paused=false;this.state=ST.MENU;_desiredMusicMode='normal';if(AC&&audioOn)_startMusic('normal');sfx.resume();}
  _startEndless(){
    const p=this.player;this.endless=true;this.state=ST.PLAY;this.wave--;
    p.hp=Math.min(p.maxHp,p.hp+Math.ceil(p.maxHp*.35));p.inv=1.5;p.dead=false;this.parts=[];this.rewardVisible=false;
    sfx.epic();this.fx.addFlash('#ff9a2e',.4);this._nextWave();
  }
  // Revive rules: spend coins. The cost rises with every death in a run (50, 100, 150 …).
  _reviveCost(){return 50*Math.max(1,this.deathCount);}
  _reviveMode(){return this.coins>=this._reviveCost()?'coin':null;}
  _overBtns(){const y=H/2+142,h=IS_TOUCH?44:34,w=170;return[{id:'home',x:W/2-178,y,w,h},{id:'new',x:W/2+8,y,w,h}];}
  _resetRect(){return IS_TOUCH?{x:W-204,y:H-54,w:192,h:40}:{x:W-190,y:H-42,w:176,h:28};}
  _resetAll(){
    STORE.clear();
    Object.assign(SAVE,{kills:0,bosses:0,wins:0,deathless:0,bestWave:0,bank:0,owned:[],sel:'vanguard',forge:{},guns:['pistol'],gun:'pistol',endlessBest:0});
    HS=0;leaderboard=[];unlockedAch=new Set();Object.assign(OPT,{shake:true,nums:true,fps:false});
    acceptPrivacy();persist();STORE.setItem('vb_ver','10.7');GAME_HOOKS._pct=-1;
    sfx.epic();this.fx.addFlash('#ff2244',.4);
  }
  _fireNova(){
    const p=this.player;if(p.nova<100||p.novaCD>0||p.dead)return;p.nova=0;p.novaCD=20*p.novaCDm;p.inv=Math.max(p.inv,.8);const ps=this.parts;
    this.enemies.forEach(e=>{if(e.dead)return;if(dist(e,p)<360){e.damage(e.type==='boss'?160:200,ps);const a=Math.atan2(e.y-p.y,e.x-p.x);e.x=clamp(e.x+Math.cos(a)*60,AR.x+e.sz,AR.x+AR.w-e.sz);e.y=clamp(e.y+Math.sin(a)*60,AR.y+e.sz,AR.y+AR.h-e.sz);}});
    this.bullets.forEach(b=>{if(!b.fromPlayer&&dist(b,p)<380)b.dead=true;});
    this.shockwaves.push(new Shockwave(p.x,p.y,'#7ffcff',380),new Shockwave(p.x,p.y,'#ffffff',260),new Shockwave(p.x,p.y,'#9060ff',320));
    const n=GQP(70);for(let i=0;i<n;i++){const a=i/n*6.283;ps.push(new Particle(p.x,p.y,Math.cos(a)*rand(300,520),Math.sin(a)*rand(300,520),i%2?'#7ffcff':'#fff',rand(.5,.9),rand(3,7),true,i%3===0));}
    this.fx.addFlash('#7ffcff',.5);this.fx.addShake(16,.5);buzz([30,40,70]);this.fx.addZoom(.07);this.fx.addFreeze(.09);this.fx.addChroma(.8);sfx.explode();sfx.epic();
    this.floats.push(new FloatText(p.x,p.y-44,'VOID NOVA!','#7ffcff',24));
  }
  _drawNova(c){
    const p=this.player,cd=p.novaCD>0,ready=p.nova>=100&&!cd,cx=W/2;
    const r=cd?1-p.novaCD/(20*p.novaCDm):p.nova/100;
    c.save();c.textAlign='center';c.font='bold 10px "Courier New"';
    if(ready){c.shadowBlur=14;c.shadowColor='#7ffcff';c.fillStyle=`rgba(127,252,255,${.7+.3*Math.sin(this.fc*.2)})`;c.fillText(this.touch.isMobile?'◈ VOID NOVA READY — TAP ◈':'◈ VOID NOVA READY — PRESS Q ◈',cx,H-27);}
    else if(cd){c.fillStyle='rgba(255,170,90,.95)';c.fillText(`VOID NOVA RECHARGING  ${Math.ceil(p.novaCD)}s`+(p.nova>=100?'  ·  CHARGED':''),cx,H-27);}
    else{c.fillStyle='rgba(120,170,190,.9)';c.fillText('VOID NOVA  ·  KILL TO CHARGE',cx,H-27);}
    c.restore();fancyBar(c,cx-110,H-21,220,9,r,ready?'#7ffcff':cd?'#ff9a2e':'#2aa8c8');c.strokeStyle='rgba(127,252,255,.35)';c.lineWidth=1;c.strokeRect(cx-110.5,H-21.5,221,10);
  }
  _tgl(c,r,label,on){
    const h=this.mouse.x>=r.x&&this.mouse.x<=r.x+r.w&&this.mouse.y>=r.y&&this.mouse.y<=r.y+r.h;
    c.save();c.fillStyle=h?'rgba(8,22,40,.95)':'rgba(4,10,20,.85)';c.strokeStyle=on?'rgba(0,245,255,.7)':'rgba(120,130,150,.5)';if(h){c.shadowBlur=10;c.shadowColor='#00f5ff';}c.lineWidth=1.5;c.fillRect(r.x,r.y,r.w,r.h);c.strokeRect(r.x,r.y,r.w,r.h);c.restore();
    c.fillStyle=on?'#00f5ff':'rgba(150,160,175,.9)';c.font='bold 11px "Courier New"';c.textAlign='center';c.fillText(label+(on?': ON':': OFF'),r.x+r.w/2,r.y+r.h/2+4);
  }
  _endRun(){SAVE.bank+=Math.max(0,this.earned-this._bk);this._bk=this.earned;SAVE.bestWave=Math.max(SAVE.bestWave,Math.min(this.wave,this.TOTAL));if(this.endless)SAVE.endlessBest=Math.max(SAVE.endlessBest||0,this.wave);this._skinCheck();persist();}
  _skinCheck(){SKINS.forEach(k=>{if(k.prog&&!ownedSkin(k)){const[a,b]=k.prog();if(a>=b){SAVE.owned.push(k.id);this.newSkin=k.name;this.achPop.trigger({id:'skin_'+k.id,name:k.name,desc:'NEW SKIN UNLOCKED',icon:'🚀'});}}});}
  _skinRect(i){return{x:59+(i%4)*214,y:122+Math.floor(i/4)*200,w:200,h:190};}
  _skinBack(){return{x:W/2-90,y:566,w:180,h:38};}
  _clickSkins(e){
    const r=canvas.getBoundingClientRect(),mx=(e.clientX-r.left)*(W/r.width),my=(e.clientY-r.top)*(H/r.height);
    const hit=q=>mx>=q.x&&mx<=q.x+q.w&&my>=q.y&&my<=q.y+q.h;
    if(hit(this._skinBack())){this.state=ST.MENU;return;}
    SKINS.forEach((k,i)=>{if(!hit(this._skinRect(i)))return;
      if(ownedSkin(k)){SAVE.sel=k.id;persist();sfx.upg();}
      else if(k.cost&&SAVE.bank>=k.cost){SAVE.bank-=k.cost;SAVE.owned.push(k.id);SAVE.sel=k.id;persist();sfx.epic();this.fx.addFlash(SRC[k.rar],.3);}
      else sfx.hit();});
  }
  _drawSkins(c){
    this.sky.draw(c);c.fillStyle='rgba(0,0,0,.62)';c.fillRect(0,0,W,H);
    drawTitle(c,'HANGAR',W/2,64,44,this.fc);
    c.textAlign='center';c.font='bold 12px "Courier New"';c.fillStyle='#ffd700';c.fillText(`◆ BANK: ${SAVE.bank.toLocaleString()}   ·   COINS YOU COLLECT ARE BANKED WHEN A RUN ENDS`,W/2,92);
    SKINS.forEach((k,i)=>{
      const q=this._skinRect(i),own=ownedSkin(k),eq=SAVE.sel===k.id,col=SRC[k.rar],hov=this.mouse.x>=q.x&&this.mouse.x<=q.x+q.w&&this.mouse.y>=q.y&&this.mouse.y<=q.y+q.h;
      glass(c,q.x,q.y,q.w,q.h,col,eq?.7:hov?.5:(k.rar==='legendary'?.3+.2*Math.sin(this.fc*.07):0));
      const cx=q.x+q.w/2,cy=q.y+76;c.textAlign='center';c.fillStyle=col;c.font='bold 9px "Courier New"';c.fillText(k.rar==='legendary'?'★ LEGENDARY ★':k.rar.toUpperCase(),cx,q.y+18);
      c.save();
      if(k.id==='hrr'&&hrrLogo.complete&&hrrLogo.naturalWidth>0){c.globalCompositeOperation='lighter';c.globalAlpha=own?.55:.2;const lw=104,lh=lw*hrrLogo.naturalHeight/hrrLogo.naturalWidth;c.drawImage(hrrLogo,cx-lw/2,cy-lh/2,lw,lh);c.globalCompositeOperation='source-over';}
      c.globalAlpha=own?.5:.15;c.drawImage(glowSprite(k.glow),cx-48,cy-48,96,96);
      c.globalAlpha=own?1:.3;c.translate(cx,cy);c.rotate(-.5+Math.sin(this.fc*.03+i)*.25);drawShip(c,k,26,false,false,'#fff');c.restore();
      c.textAlign='center';c.fillStyle=own?'#fff':'#8896a8';c.font='bold 13px "Courier New"';c.fillText(k.name,cx,q.y+134);
      let st,sc;if(eq){st='✔ EQUIPPED';sc='#44ff88';}else if(own){st='CLICK TO EQUIP';sc='#6ab8c8';}else if(k.cost){st=`BUY  ${k.cost} ◆`;sc=SAVE.bank>=k.cost?'#ffd700':'#7a6a30';}else{st='🔒 LOCKED';sc='#c06060';}
      c.fillStyle=sc;c.font='bold 11px "Courier New"';c.fillText(st,cx,q.y+154);
      let how=k.how;if(!own&&k.prog){const[a,b]=k.prog();if(b>1)how+=` (${Math.min(a,b)}/${b})`;}
      c.fillStyle='rgba(150,175,195,.85)';c.font='9px "Courier New"';c.fillText(how,cx,q.y+173);
    });
    const bb=this._skinBack(),bh=this.mouse.x>=bb.x&&this.mouse.x<=bb.x+bb.w&&this.mouse.y>=bb.y&&this.mouse.y<=bb.y+bb.h;
    c.save();c.fillStyle=bh?'rgba(8,22,40,.95)':'rgba(4,10,20,.85)';c.strokeStyle=bh?'#00f5ff':'rgba(22,45,85,.7)';if(bh){c.shadowBlur=10;c.shadowColor='#00f5ff';}c.lineWidth=1.5;c.fillRect(bb.x,bb.y,bb.w,bb.h);c.strokeRect(bb.x,bb.y,bb.w,bb.h);c.restore();
    c.fillStyle=bh?'#00f5ff':'rgba(140,180,200,.9)';c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText('◀  BACK',bb.x+bb.w/2,bb.y+bb.h/2+4);
  }

  _applyForge(){
    const p=this.player;FORGE.forEach(f=>{const l=forgeLv(f.id);if(l&&f.apply)f.apply(p,l);});
    const g=SAVE.gun;if(g&&g!=='pistol'&&START_GUNS.some(x=>x.id===g)&&SAVE.guns.includes(g)&&WEAPONS[g])p.weapon=g;
    p._hpD=p.hp;p._shD=p.shield;
  }
  _fRow(i){return{x:40,y:128+i*52,w:500,h:46};}
  _fBuyBtn(i){const r=this._fRow(i);return IS_TOUCH?{x:r.x+r.w-122,y:r.y+3,w:112,h:40}:{x:r.x+r.w-118,y:r.y+8,w:108,h:30};}
  _gCard(i){return{x:570,y:128+i*78,w:350,h:70};}
  _clickForge(e){
    const r=canvas.getBoundingClientRect(),mx=(e.clientX-r.left)*(W/r.width),my=(e.clientY-r.top)*(H/r.height),hit=q=>mx>=q.x&&mx<=q.x+q.w&&my>=q.y&&my<=q.y+q.h;
    if(hit(this._skinBack())){this.state=ST.MENU;return;}
    FORGE.forEach((f,i)=>{if(!hit(this._fBuyBtn(i)))return;const l=forgeLv(f.id);if(l>=f.max){sfx.hit();return;}const c=f.cost[l];
      if(SAVE.bank>=c){SAVE.bank-=c;SAVE.forge[f.id]=l+1;persist();sfx.epic();this.fx.addFlash('#00f5ff',.2);}else sfx.hit();});
    START_GUNS.forEach((g,i)=>{if(!hit(this._gCard(i)))return;
      if(SAVE.guns.includes(g.id)){SAVE.gun=g.id;persist();sfx.upg();}
      else if(SAVE.bank>=g.cost){SAVE.bank-=g.cost;SAVE.guns.push(g.id);SAVE.gun=g.id;persist();sfx.epic();this.fx.addFlash('#ffd700',.25);}else sfx.hit();});
  }
  _drawForge(c){
    this.sky.draw(c);c.fillStyle='rgba(0,0,0,.64)';c.fillRect(0,0,W,H);
    drawTitle(c,'VOID FORGE',W/2,60,40,this.fc);
    c.textAlign='center';c.font='bold 12px "Courier New"';c.fillStyle='#ffd700';c.fillText(`◆ BANK: ${SAVE.bank.toLocaleString()}   ·   PERMANENT UPGRADES CARRY OVER TO EVERY RUN`,W/2,88);
    c.textAlign='left';c.font='bold 10px "Courier New"';c.fillStyle='rgba(120,200,225,.9)';c.fillText('PERMANENT UPGRADES',40,120);c.fillText('STARTING GUN',570,120);
    FORGE.forEach((f,i)=>{
      const q=this._fRow(i),bb=this._fBuyBtn(i),l=forgeLv(f.id),maxed=l>=f.max,cost=maxed?0:f.cost[l],can=!maxed&&SAVE.bank>=cost;
      const hov=this.mouse.x>=bb.x&&this.mouse.x<=bb.x+bb.w&&this.mouse.y>=bb.y&&this.mouse.y<=bb.y+bb.h;
      glass(c,q.x,q.y,q.w,q.h,maxed?'#44ff88':'#00f5ff',hov&&can?.5:0);
      c.textAlign='left';c.font='20px sans-serif';c.fillStyle='#fff';c.fillText(f.icon,q.x+12,q.y+30);
      c.font='bold 12px "Courier New"';c.fillStyle='#fff';c.fillText(f.name+(l?`  Lv ${l}`:''),q.x+46,q.y+19);
      c.font='10px "Courier New"';c.fillStyle='rgba(150,185,205,.95)';c.fillText(maxed?'MAX: '+f.desc(l):'Next: '+f.desc(l+1),q.x+46,q.y+35);
      for(let k=0;k<f.max;k++){c.fillStyle=k<l?(maxed?'#44ff88':'#00f5ff'):'rgba(60,90,110,.7)';c.fillRect(q.x+q.w-228+k*14,q.y+18,10,10);}
      c.save();c.fillStyle=maxed?'rgba(20,60,35,.9)':can?(hov?'rgba(70,55,10,.98)':'rgba(40,32,8,.95)'):'rgba(14,18,26,.9)';c.strokeStyle=maxed?'#44ff88':can?'#ffd700':'rgba(90,100,115,.6)';c.lineWidth=1.5;if(hov&&can){c.shadowBlur=10;c.shadowColor='#ffd700';}
      c.fillRect(bb.x,bb.y,bb.w,bb.h);c.strokeRect(bb.x,bb.y,bb.w,bb.h);c.restore();
      c.textAlign='center';c.font='bold 11px "Courier New"';c.fillStyle=maxed?'#44ff88':can?'#ffd700':'rgba(120,130,145,.9)';c.fillText(maxed?'MAXED':`BUY ${cost} ◆`,bb.x+bb.w/2,bb.y+19);
    });
    START_GUNS.forEach((g,i)=>{
      const q=this._gCard(i),w=WEAPONS[g.id],own=SAVE.guns.includes(g.id),eq=SAVE.gun===g.id,can=!own&&SAVE.bank>=g.cost;
      const hov=this.mouse.x>=q.x&&this.mouse.x<=q.x+q.w&&this.mouse.y>=q.y&&this.mouse.y<=q.y+q.h;
      glass(c,q.x,q.y,q.w,q.h,w.col,eq?.7:hov?.45:0);
      c.textAlign='left';c.font='24px sans-serif';c.fillStyle='#fff';c.fillText(w.icon,q.x+14,q.y+42);
      c.font='bold 13px "Courier New"';c.fillStyle=own?'#fff':'#9aa6b4';c.fillText(w.name,q.x+56,q.y+24);
      c.font='10px "Courier New"';c.fillStyle='rgba(150,185,205,.95)';c.fillText(`${w.pel>1?w.pel+'× ':''}${w.dmg} dmg · ${(1/w.rate).toFixed(1)} shots/s`,q.x+56,q.y+40);c.fillStyle='rgba(125,160,182,.95)';c.font='9px "Courier New"';c.fillText(g.desc,q.x+56,q.y+57);
      c.textAlign='right';c.font='bold 11px "Courier New"';
      if(eq){c.fillStyle='#44ff88';c.fillText('✔ EQUIPPED',q.x+q.w-14,q.y+24);}else if(own){c.fillStyle='#6ab8c8';c.fillText('CLICK TO EQUIP',q.x+q.w-14,q.y+24);}
      else{c.fillStyle=can?'#ffd700':'#7a6a30';c.fillText(`BUY  ${g.cost} ◆`,q.x+q.w-14,q.y+24);}
    });
    c.textAlign='center';c.font='9px "Courier New"';c.fillStyle='rgba(130,160,180,.85)';c.fillText('Rare, epic & legendary weapons can only be found during a run.',745,128+5*78+14);
    const bb=this._skinBack(),bh=this.mouse.x>=bb.x&&this.mouse.x<=bb.x+bb.w&&this.mouse.y>=bb.y&&this.mouse.y<=bb.y+bb.h;
    c.save();c.fillStyle=bh?'rgba(8,22,40,.95)':'rgba(4,10,20,.85)';c.strokeStyle=bh?'#00f5ff':'rgba(22,45,85,.7)';if(bh){c.shadowBlur=10;c.shadowColor='#00f5ff';}c.lineWidth=1.5;c.fillRect(bb.x,bb.y,bb.w,bb.h);c.strokeRect(bb.x,bb.y,bb.w,bb.h);c.restore();
    c.fillStyle=bh?'#00f5ff':'rgba(140,180,200,.9)';c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText('◀  BACK',bb.x+bb.w/2,bb.y+bb.h/2+4);
  }

  // Every click and every tap goes through here.
  _press(e){
    if(e.button!==0)return;
    if(!e._pos){const r=canvas.getBoundingClientRect();this.mouse.x=(e.clientX-r.left)*(W/r.width);this.mouse.y=(e.clientY-r.top)*(H/r.height);}
    if(this.touch.isMobile)this.touch.reset();
      initAudio();this.mouse.down=true;
      if(this.state===ST.SPLASH){this._skipSplash();return;}
      if(this.state===ST.LOADING)return;
      if(this.showPrivacy){const b=this._privBtn();if(this.mouse.x>=b.x&&this.mouse.x<=b.x+b.w&&this.mouse.y>=b.y&&this.mouse.y<=b.y+b.h){acceptPrivacy();this.showPrivacy=false;}return;}
      if(this.state===ST.MENU){
        const sb=this._settingsBtnRect;
        if(this.mouse.x>=sb.x&&this.mouse.x<=sb.x+sb.w&&this.mouse.y>=sb.y&&this.mouse.y<=sb.y+sb.h){this.state=ST.SETTINGS;return;}
        if(this._in(this._mb(1))){this._skinCheck();persist();this.state=ST.SKINS;return;}
        if(this._in(this._mb(2))){this.state=ST.FORGE;sfx.upg();return;}
        this.start();return;
      }
      if(this.state===ST.SETTINGS){this._clickSettings(e);return;}
      if(this.state===ST.SKINS){this._clickSkins(e);return;}
      if(this.state===ST.FORGE){this._clickForge(e);return;}
      if(this.state===ST.OVER||this.state===ST.WIN){
        if(this.state===ST.OVER&&this.rewardVisible){
          const m=this._reviveMode(),rb=this._revBtn();
          if(m&&this.mouse.x>=rb.x&&this.mouse.x<=rb.x+rb.w&&this.mouse.y>=rb.y&&this.mouse.y<=rb.y+rb.h){this._coinRevive();return;}
        }
        if(this.state===ST.WIN){const b=this._winBtns().find(q=>this.mouse.x>=q.x&&this.mouse.x<=q.x+q.w&&this.mouse.y>=q.y&&this.mouse.y<=q.y+q.h);
          if(b){if(b.id==='home')this._goHome();else if(b.id==='again')this.start();else this._startEndless();}return;}
        {const ob=this._overBtns().find(q=>this.mouse.x>=q.x&&this.mouse.x<=q.x+q.w&&this.mouse.y>=q.y&&this.mouse.y<=q.y+q.h);if(ob){if(ob.id==='home')this._goHome();else this.start();}return;}
      }
      // HUD buttons (pause/mute) — checked BEFORE state-click logic so they
      // can't be swallowed by the "click anywhere advances" STATS screen.
      const pb=this.PAUSE_BTN;
      if([ST.PLAY,ST.BOSS,ST.STATS,ST.UPGRADE].includes(this.state)&&this.mouse.x>=pb.x&&this.mouse.x<=pb.x+pb.w&&this.mouse.y>=pb.y&&this.mouse.y<=pb.y+pb.h){
        const live=[ST.PLAY,ST.BOSS].includes(this.state);
        this.paused=!this.paused;
        if(this.paused){sfx.pause();if(live)GAME_HOOKS.gameplayStop();}
        else{sfx.resume();if(live)GAME_HOOKS.gameplayStart();}
        return;
      }
      const mb=this.MUTE_BTN;
      if([ST.PLAY,ST.BOSS,ST.STATS,ST.UPGRADE].includes(this.state)&&this.mouse.x>=mb.x&&this.mouse.x<=mb.x+mb.w&&this.mouse.y>=mb.y&&this.mouse.y<=mb.y+mb.h){
        _userMuted=!_userMuted;audioOn=!_userMuted;_saveMute();if(!audioOn)_stopMusic();else if(AC)_startMusic(_desiredMusicMode);return;
      }
      if(this.paused){this._clickPause(e);return;}
      // Stats screen → advance to upgrades
      if(this.state===ST.PLAY&&this.showTutorial){if(this._tutStep===undefined)this._tutStep=0;this._tutStep++;if(this._tutStep>=5){this.showTutorial=false;this.tutorialT=0;}return;}
      if(this.state===ST.STATS){this._advanceToUpgrades();return;}
      // Upgrade selection
      if(this.state===ST.UPGRADE){this._clickUpgrade(e);return;}
  }
  _in(r){return this.mouse.x>=r.x&&this.mouse.x<=r.x+r.w&&this.mouse.y>=r.y&&this.mouse.y<=r.y+r.h;}
  // Touch: is this finger pressing a menu / button (true) or steering the ship (false)?
  touchUi(x,y){
    if(this.showPrivacy||this.paused)return true;
    if(this.state!==ST.PLAY&&this.state!==ST.BOSS)return true;
    const pad=10,hit=b=>x>=b.x-pad&&x<=b.x+b.w+pad&&y>=b.y-pad&&y<=b.y+b.h+pad;
    return hit(this.PAUSE_BTN)||hit(this.MUTE_BTN);
  }
  _tapAt(cx,cy){
    const r=canvas.getBoundingClientRect(),x=(cx-r.left)*(W/r.width),y=(cy-r.top)*(H/r.height);
    this.mouse.x=x;this.mouse.y=y;
    if([ST.PLAY,ST.BOSS,ST.STATS,ST.UPGRADE].includes(this.state)){for(const b of[this.PAUSE_BTN,this.MUTE_BTN]){if(x>=b.x-10&&x<=b.x+b.w+10&&y>=b.y-10&&y<=b.y+b.h+10){this.mouse.x=b.x+b.w/2;this.mouse.y=b.y+b.h/2;break;}}}
    this._press({clientX:cx,clientY:cy,button:0,_pos:true});
    this.mouse.down=false;
  }
  _mb(i){return IS_TOUCH?{x:12,y:8+i*54,w:116,h:46}:[{x:12,y:9,w:92,h:36},{x:12,y:50,w:92,h:36},{x:12,y:90,w:92,h:36}][i];}
  _arenaFX(c){
    const p=this.player,t=this.fc;c.save();c.beginPath();c.rect(AR.x,AR.y,AR.w,AR.h);c.clip();
    if(GQ>=1)c.drawImage(DC,AR.x,AR.y);
    c.globalCompositeOperation='lighter';    if(GQ>=1){c.globalAlpha=GQ>=3?.34:.24;c.drawImage(glowSprite('#00b8ff'),p.x-180,p.y-180,360,360);}
    if(GQ>=2){
      const sy=AR.y+((t*1.4)%(AR.h+120))-60,g=c.createLinearGradient(0,sy-40,0,sy+40);g.addColorStop(0,'rgba(0,200,255,0)');g.addColorStop(.5,'rgba(0,200,255,.07)');g.addColorStop(1,'rgba(0,200,255,0)');c.globalAlpha=1;c.fillStyle=g;c.fillRect(AR.x,sy-40,AR.w,80);
      const M=this._motes||(this._motes=Array.from({length:GQ>=3?70:36},()=>({x:rand(AR.x,AR.x+AR.w),y:rand(AR.y,AR.y+AR.h),z:rand(.3,1),p:rand(0,6)})));
      c.fillStyle='#8fe8ff';M.forEach(m=>{m.y-=m.z*.18;m.x+=Math.sin(t*.01+m.p)*.12;if(m.y<AR.y)m.y=AR.y+AR.h;c.globalAlpha=(.15+.35*Math.abs(Math.sin(t*.02+m.p)))*m.z;c.beginPath();c.arc(m.x,m.y,m.z*1.5,0,6.283);c.fill();});
    }
    c.restore();
  }

  _menuFX(c){
    const kb=this._mb(1),kh=this.mouse.x>=kb.x&&this.mouse.x<=kb.x+kb.w&&this.mouse.y>=kb.y&&this.mouse.y<=kb.y+kb.h;
    c.save();c.fillStyle=kh?'rgba(8,22,40,.95)':'rgba(4,10,20,.88)';c.strokeStyle=kh?'#00f5ff':'rgba(40,95,140,.85)';if(kh){c.shadowBlur=14;c.shadowColor='#00f5ff';}c.lineWidth=kh?2:1.5;c.fillRect(kb.x,kb.y,kb.w,kb.h);c.strokeRect(kb.x,kb.y,kb.w,kb.h);c.restore();
    c.fillStyle=kh?'#00f5ff':'rgba(120,180,205,.95)';c.font='bold 13px "Courier New"';c.textAlign='center';c.fillText('🚀 SKINS',kb.x+kb.w/2,kb.y+kb.h/2+5);
    {const fb=this._mb(2),fh=this.mouse.x>=fb.x&&this.mouse.x<=fb.x+fb.w&&this.mouse.y>=fb.y&&this.mouse.y<=fb.y+fb.h;
    c.save();c.fillStyle=fh?'rgba(8,22,40,.95)':'rgba(4,10,20,.88)';c.strokeStyle=fh?'#ffd700':'rgba(140,110,40,.85)';if(fh){c.shadowBlur=14;c.shadowColor='#ffd700';}c.lineWidth=fh?2:1.5;c.fillRect(fb.x,fb.y,fb.w,fb.h);c.strokeRect(fb.x,fb.y,fb.w,fb.h);c.restore();
    c.fillStyle=fh?'#ffd700':'rgba(210,180,100,.95)';c.font='bold 13px "Courier New"';c.textAlign='center';c.fillText('🔨 FORGE',fb.x+fb.w/2,fb.y+fb.h/2+5);}
    const hy=H*.58,t=this.fc;c.save();
    const sg=c.createLinearGradient(0,hy-120,0,hy+10);sg.addColorStop(0,'rgba(0,120,255,0)');sg.addColorStop(1,'rgba(0,200,255,.22)');c.fillStyle=sg;c.fillRect(0,hy-120,W,130);
    c.beginPath();c.rect(0,hy,W,H-hy);c.clip();c.strokeStyle='rgba(0,200,255,.3)';c.lineWidth=1;
    for(let i=-14;i<=14;i++){c.beginPath();c.moveTo(W/2+i*18,hy);c.lineTo(W/2+i*170,H);c.stroke();}
    const off=(t*.012)%1;for(let i=0;i<14;i++){const k=(i+off)/14,y=hy+(H-hy)*k*k;c.globalAlpha=.1+k*.35;c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
    c.restore();
    if(hrrLogo.complete&&hrrLogo.naturalWidth>0){c.save();c.globalCompositeOperation='lighter';c.globalAlpha=.6;const lw=64,lh=lw*hrrLogo.naturalHeight/hrrLogo.naturalWidth;c.drawImage(hrrLogo,12,H-lh-10,lw,lh);c.restore();}
    c.save();c.textAlign='center';c.font='bold 10px "Courier New"';
    if(GQ===3){c.fillStyle='#ff9a2e';c.shadowBlur=12;c.shadowColor='#ff7a00';c.fillText('◈ OVERCLOCK GRAPHICS ACTIVE ◈',W/2,H-14);}
    else if(Math.floor(t*.03)%2===0){c.fillStyle='rgba(255,154,46,.85)';c.fillText('NEW · TRY OVERCLOCK GRAPHICS IN SETTINGS',W/2,H-14);}
    c.restore();
  }

  _post(c){
    if(!this._bl){this._bl=[document.createElement('canvas'),document.createElement('canvas')];this._np=null;this._noise=makeNoise();this._scan=makeScan();}
    const cw=canvas.width,ch=canvas.height,[a,b]=this._bl,aw=Math.max(2,cw>>2),ah=Math.max(2,ch>>2);
    if(a.width!==aw){a.width=aw;a.height=ah;b.width=aw>>1;b.height=ah>>1;}
    const ax=a.getContext('2d'),bx=b.getContext('2d');ax.imageSmoothingQuality='high';bx.imageSmoothingQuality='high';
    ax.globalCompositeOperation='copy';ax.filter=FILT?'brightness(.75) contrast(1.9)':'none';ax.drawImage(canvas,0,0,aw,ah);ax.filter='none';
    bx.globalCompositeOperation='copy';bx.drawImage(a,0,0,b.width,b.height);
    c.save();c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='lighter';
    c.globalAlpha=FILT?.55:.2;c.drawImage(a,0,0,cw,ch);c.globalAlpha=FILT?.75:.26;c.drawImage(b,0,0,cw,ch);c.restore();
    c.save();c.setTransform(RSX,0,0,RSY,0,0);
    if(!this._np){this._np=c.createPattern(this._noise,'repeat');this._sp=c.createPattern(this._scan,'repeat');}
    c.globalAlpha=.07;c.save();c.translate(rInt(0,127),rInt(0,127));c.fillStyle=this._np;c.fillRect(-128,-128,W+128,H+128);c.restore();
    c.globalAlpha=.16;c.fillStyle=this._sp;c.fillRect(0,0,W,H);
    c.globalAlpha=1;const v=c.createRadialGradient(W/2,H/2,H*.45,W/2,H/2,W*.62);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.55)');c.fillStyle=v;c.fillRect(0,0,W,H);
    c.restore();
  }

  _drawMenu(c){
    this.sky.draw(c);
    c.save();c.globalAlpha=.04;c.fillStyle='#88ffff';for(let y=0;y<H;y+=3)c.fillRect(0,y,W,1);c.restore();
    this._menuFX(c);
    const p=1+Math.sin(this.fc*.038)*.018;
    c.save();c.translate(W/2,H/2-148);c.scale(p,p);drawTitle(c,'VOID BREACH',0,0,72,this.fc);c.restore();
    c.fillStyle='rgba(40,130,175,1)';c.font='bold 11px "Courier New"';c.textAlign='center';c.fillText('ROGUELIKE  ·  TOP-DOWN SHOOTER  ·  WAVE SURVIVAL',W/2,H/2-106);
    const ctrls=this.touch.isMobile?[['LEFT THUMB','MOVE'],['RIGHT THUMB','AIM + FIRE'],['⚡ BUTTON','DASH'],['◈ BUTTON','VOID NOVA'],['TOP-RIGHT','PAUSE']]:
      [['WASD / ARROWS','MOVE'],['MOUSE','AIM'],['LEFT CLICK','SHOOT'],['SHIFT','DASH'],['P','PAUSE'],['M','MUTE']];
    const cpx=W/2-170,cpy=H/2-85,cpw=340,cph=ctrls.length*22+18;
    c.fillStyle='rgba(4,9,20,.78)';c.strokeStyle='rgba(14,32,65,.9)';c.lineWidth=1;c.fillRect(cpx,cpy,cpw,cph);c.strokeRect(cpx,cpy,cpw,cph);
    ctrls.forEach(([k,v],i)=>{c.fillStyle='rgba(80,170,210,1)';c.font='10px "Courier New"';c.textAlign='right';c.fillText(k,W/2-8,cpy+20+i*22);c.fillStyle='rgba(50,120,150,1)';c.fillText('—',W/2,cpy+20+i*22);c.fillStyle='rgba(60,175,145,1)';c.textAlign='left';c.fillText(v,W/2+10,cpy+20+i*22);});
    c.fillStyle='rgba(35,90,125,1)';c.font='10px "Courier New"';c.textAlign='center';c.fillText(`12 WAVES + ENDLESS  ·  13 WEAPONS  ·  ${UPGRADES.length} UPGRADES`,W/2,H/2+68);
    if(leaderboard.length>0){
      // Top-3 local leaderboard, top-right corner
      const lbW=172,lbX=W-lbW-12,lbY=16,rows=Math.min(3,leaderboard.length),lbH=26+rows*15+6;
      c.save();c.fillStyle='rgba(4,9,20,.82)';c.strokeStyle='rgba(255,200,40,.45)';c.lineWidth=1;
      c.fillRect(lbX,lbY,lbW,lbH);c.strokeRect(lbX,lbY,lbW,lbH);
      c.fillStyle='rgba(255,215,0,1)';c.font='bold 10px "Courier New"';c.textAlign='center';
      c.fillText('🏆 TOP SCORES',lbX+lbW/2,lbY+16);
      leaderboard.slice(0,3).forEach((e,i)=>{
        const ry=lbY+32+i*15;
        c.fillStyle='rgba(190,205,220,.9)';c.font='9px "Courier New"';c.textAlign='left';
        c.fillText(`${i+1}.`,lbX+9,ry);
        c.fillStyle='rgba(255,225,110,1)';c.textAlign='right';
        c.fillText(`${e.score.toLocaleString()}  ·  W${e.wave}`,lbX+lbW-9,ry);
      });
      c.restore();
    } else if(HS>0){c.save();c.shadowBlur=10;c.shadowColor='#ffd700';c.fillStyle='rgba(255,215,0,1)';c.font='bold 12px "Courier New"';c.fillText(`🏆  BEST SCORE:  ${HS.toLocaleString()}`,W/2,H/2+88);c.restore();}
    if(Math.floor(this.fc*.028)%2===0){c.save();c.shadowBlur=20;c.shadowColor='#00f5ff';c.fillStyle='rgba(0,245,255,1)';c.font='bold 18px "Courier New"';c.textAlign='center';c.fillText('[ CLICK  or  ENTER  to  START ]',W/2,H/2+116);c.restore();}
    // Settings button — proper visible button, top-left corner (mirrors pause button style)
    const sb=this._settingsBtnRect;const sbh=this.mouse.x>=sb.x&&this.mouse.x<=sb.x+sb.w&&this.mouse.y>=sb.y&&this.mouse.y<=sb.y+sb.h;
    c.save();
    c.fillStyle=sbh?'rgba(8,22,40,.95)':'rgba(4,10,20,.88)';
    c.strokeStyle=sbh?'#00f5ff':'rgba(40,95,140,.85)';
    if(sbh){c.shadowBlur=14;c.shadowColor='#00f5ff';}
    c.lineWidth=sbh?2:1.5;
    c.fillRect(sb.x,sb.y,sb.w,sb.h);c.strokeRect(sb.x,sb.y,sb.w,sb.h);
    c.restore();
    c.fillStyle=sbh?'#00f5ff':'rgba(120,180,205,.95)';c.font='bold 13px "Courier New"';c.textAlign='center';
    c.fillText('⚙ SETTINGS',sb.x+sb.w/2,sb.y+sb.h/2+5);
    c.fillStyle='rgba(20,40,60,.7)';c.font='9px "Courier New"';c.textAlign='right';c.fillText('v11.1',W-8,H-20);
  }

  _drawSettings(c){
    this.sky.draw(c);
    c.save();c.fillStyle='rgba(0,0,0,.55)';c.fillRect(0,0,W,H);c.restore();
    c.save();c.shadowBlur=30;c.shadowColor='#00f5ff';c.fillStyle='rgba(0,245,255,1)';c.font='bold 30px "Courier New"';c.textAlign='center';c.fillText('SETTINGS',W/2,H/2-110);c.restore();

    // Graphics quality
    c.fillStyle='rgba(160,210,230,1)';c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText('GRAPHICS QUALITY',W/2,H/2-46);
    ['LOW','MED','HIGH','OVERCLOCK'].forEach((label,i)=>{
      const b=this._qualityBtnRect(i),active=GQ===i;
      const hov=this.mouse.x>=b.x&&this.mouse.x<=b.x+b.w&&this.mouse.y>=b.y&&this.mouse.y<=b.y+b.h;
      c.save();
      c.fillStyle=active?'rgba(0,60,90,.95)':hov?'rgba(8,22,40,.95)':'rgba(4,10,20,.85)';
      c.strokeStyle=active?(i===3?'#ff9a2e':'#00f5ff'):hov?(i===3?'rgba(255,154,46,.6)':'rgba(0,245,255,.5)'):(i===3?'rgba(160,90,30,.7)':'rgba(22,45,85,.7)');
      if(active||hov){c.shadowBlur=12;c.shadowColor=i===3?'#ff7a00':'#00f5ff';}
      c.lineWidth=active?2:1;c.fillRect(b.x,b.y,b.w,b.h);c.strokeRect(b.x,b.y,b.w,b.h);c.restore();
      c.fillStyle=active?(i===3?'#ff9a2e':'#00f5ff'):(i===3?'rgba(255,170,90,.8)':'rgba(150,190,205,.9)');c.font='bold 12px "Courier New"';c.textAlign='center';
      c.fillText(label,b.x+b.w/2,b.y+b.h/2+4);
    });
    c.fillStyle='rgba(90,130,150,.8)';c.font='9px "Courier New"';c.textAlign='center';
    if(GQ===3)c.fillStyle='rgba(255,170,90,.95)';c.fillText(['Minimum effects — best for slow devices','Balanced visuals','Dynamic lighting, glow & full particles','OVERCLOCK: bloom · HDR glow · film grain · additive FX · scanlines'][GQ],W/2,H/2+24);

    // Sound toggle
    const st=this._soundToggleRect();const sth=this.mouse.x>=st.x&&this.mouse.x<=st.x+st.w&&this.mouse.y>=st.y&&this.mouse.y<=st.y+st.h;
    c.save();c.fillStyle=sth?'rgba(8,22,40,.95)':'rgba(4,10,20,.85)';c.strokeStyle=audioOn?'rgba(0,255,150,.6)':'rgba(255,80,80,.6)';
    if(sth){c.shadowBlur=10;c.shadowColor=audioOn?'#00ffaa':'#ff4444';}
    c.lineWidth=1.5;c.fillRect(st.x,st.y,st.w,st.h);c.strokeRect(st.x,st.y,st.w,st.h);c.restore();
    c.fillStyle=audioOn?'rgba(100,255,180,1)':'rgba(255,110,110,1)';c.font='bold 13px "Courier New"';c.textAlign='center';
    c.fillText(audioOn?'🔊  SOUND: ON':'🔇  SOUND: OFF',st.x+st.w/2,st.y+st.h/2+5);

    const ar=this._autoRect(),arh=this.mouse.x>=ar.x&&this.mouse.x<=ar.x+ar.w&&this.mouse.y>=ar.y&&this.mouse.y<=ar.y+ar.h;
    c.save();c.fillStyle=arh?'rgba(8,22,40,.95)':'rgba(4,10,20,.85)';c.strokeStyle=AUTO?'rgba(0,245,255,.7)':'rgba(120,130,150,.5)';if(arh){c.shadowBlur=10;c.shadowColor='#00f5ff';}c.lineWidth=1.5;c.fillRect(ar.x,ar.y,ar.w,ar.h);c.strokeRect(ar.x,ar.y,ar.w,ar.h);c.restore();
    c.fillStyle=AUTO?'#00f5ff':'rgba(150,160,175,.9)';c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText(AUTO?'⚡ AUTO PERFORMANCE: ON':'⚡ AUTO PERFORMANCE: OFF',ar.x+ar.w/2,ar.y+19);c.fillStyle='rgba(130,170,195,.85)';c.font='9px "Courier New"';c.fillText(AUTO_DESC[0],ar.x+ar.w/2,ar.y+32);c.fillText(AUTO_DESC[1],ar.x+ar.w/2,ar.y+43);
    if(IS_TOUCH){
      c.fillStyle='rgba(160,210,230,1)';c.font='bold 11px "Courier New"';c.textAlign='center';c.fillText('TOUCH AIM RESPONSE',W/2,H/2+92);
      ['LOW','MED','HIGH'].forEach((label,i)=>{const b=this._aimSensRect(i),active=TOUCH_AIM_SENS===i,hov=this.mouse.x>=b.x&&this.mouse.x<=b.x+b.w&&this.mouse.y>=b.y&&this.mouse.y<=b.y+b.h;c.save();c.fillStyle=active?'rgba(0,60,90,.95)':hov?'rgba(8,22,40,.95)':'rgba(4,10,20,.85)';c.strokeStyle=active?'#00f5ff':'rgba(22,45,85,.7)';if(active||hov){c.shadowBlur=10;c.shadowColor='#00f5ff';}c.lineWidth=active?2:1;c.fillRect(b.x,b.y,b.w,b.h);c.strokeRect(b.x,b.y,b.w,b.h);c.restore();c.fillStyle=active?'#00f5ff':'rgba(150,190,205,.9)';c.font='bold 11px "Courier New"';c.textAlign='center';c.fillText(label,b.x+b.w/2,b.y+b.h/2+4);});
    }
    this._tgl(c,this._shakeRect(),'SCREEN SHAKE',OPT.shake);this._tgl(c,this._numsRect(),'DMG NUMBERS',OPT.nums);
    {const rr=this._resetRect(),rh=this.mouse.x>=rr.x&&this.mouse.x<=rr.x+rr.w&&this.mouse.y>=rr.y&&this.mouse.y<=rr.y+rr.h;if(this._rst>0)this._rst-=.016;const arm=this._rst>0;
     c.save();c.fillStyle=rh?'rgba(40,10,14,.95)':'rgba(14,6,8,.85)';c.strokeStyle=arm?'#ff2244':'rgba(150,50,60,.7)';if(rh||arm){c.shadowBlur=10;c.shadowColor='#ff2244';}c.lineWidth=1.5;c.fillRect(rr.x,rr.y,rr.w,rr.h);c.strokeRect(rr.x,rr.y,rr.w,rr.h);c.restore();
     c.fillStyle=arm?'#ff6677':'rgba(200,110,120,.9)';c.font='bold 9px "Courier New"';c.textAlign='center';c.fillText(arm?'CLICK AGAIN TO ERASE ALL':'RESET SAVE DATA',rr.x+rr.w/2,rr.y+rr.h/2+3);}
    // Back button
    const bb=this._settingsBackRect();const bbh=this.mouse.x>=bb.x&&this.mouse.x<=bb.x+bb.w&&this.mouse.y>=bb.y&&this.mouse.y<=bb.y+bb.h;
    c.save();c.fillStyle=bbh?'rgba(8,22,40,.95)':'rgba(4,10,20,.85)';c.strokeStyle=bbh?'#00f5ff':'rgba(22,45,85,.7)';
    if(bbh){c.shadowBlur=10;c.shadowColor='#00f5ff';}
    c.lineWidth=1;c.fillRect(bb.x,bb.y,bb.w,bb.h);c.strokeRect(bb.x,bb.y,bb.w,bb.h);c.restore();
    c.fillStyle=bbh?'#00f5ff':'rgba(140,180,200,.9)';c.font='bold 12px "Courier New"';c.textAlign='center';
    c.fillText('◀  BACK',bb.x+bb.w/2,bb.y+bb.h/2+5);
    c.fillStyle='rgba(70,100,120,.7)';c.font='9px "Courier New"';c.fillText('ESC to go back',W/2,H/2+216);
  }

  _drawOver(c){
    this.sky.draw(c);c.fillStyle='rgba(0,0,0,.86)';c.fillRect(0,0,W,H);
    c.save();c.shadowBlur=44;c.shadowColor='#ff2244';c.fillStyle='rgba(255,34,68,1)';c.font='bold 62px "Courier New"';c.textAlign='center';c.fillText('SIGNAL LOST',W/2,H/2-104);c.restore();
    c.fillStyle='rgba(200,80,100,1)';c.font='14px "Courier New"';c.textAlign='center';c.fillText('SYSTEM TERMINATED',W/2,H/2-62);
    [['FINAL SCORE',this.score.toLocaleString(),'rgba(255,215,0,1)'],['WAVE REACHED',`${this._wl()}`,'rgba(240,240,240,1)'],['TOTAL KILLS',this.totalKills.toString(),'rgba(255,180,140,1)']].forEach(([l,v,col],i)=>{c.fillStyle='rgba(14,22,40,.9)';c.fillRect(W/2-145,H/2-35+i*32,290,26);c.strokeStyle='rgba(24,44,80,.8)';c.lineWidth=1;c.strokeRect(W/2-145,H/2-35+i*32,290,26);c.fillStyle='rgba(120,195,220,1)';c.font='bold 11px "Courier New"';c.textAlign='left';c.fillText(l,W/2-135,H/2-35+i*32+18);c.save();c.shadowBlur=5;c.shadowColor=col;c.fillStyle=col;c.font='bold 13px "Courier New"';c.textAlign='right';c.fillText(v,W/2+135,H/2-35+i*32+18);c.restore();});
    if(this.score>0&&this.score>=HS){c.save();c.shadowBlur=16;c.shadowColor='#ffd700';c.fillStyle='rgba(255,215,0,1)';c.font='bold 14px "Courier New"';c.textAlign='center';c.fillText('★  NEW HIGH SCORE!  ★',W/2,H/2+70);c.restore();}
    else if(this._lbRank>=1&&this._lbRank<5){c.save();c.shadowBlur=14;c.shadowColor='#ffaa00';c.fillStyle='rgba(255,180,60,1)';c.font='bold 13px "Courier New"';c.textAlign='center';c.fillText(`🏆  NEW TOP 5!  RANK #${this._lbRank+1}  🏆`,W/2,H/2+70);c.restore();}
    c.fillStyle='rgba(255,215,0,.8)';c.font='bold 11px "Courier New"';c.textAlign='center';c.fillText(`◆ +${this.earned} COINS BANKED`+(this.endless?`   ·   ∞ ENDLESS BEST: WAVE ${Math.max(SAVE.endlessBest||0,this.wave)}`:''),W/2,H/2+212);
    const rm=this.rewardVisible?this._reviveMode():null,rb=this._revBtn();
    if(this.rewardVisible){
      c.textAlign='center';c.font='10px "Courier New"';c.fillStyle='rgba(150,165,185,.95)';
      c.fillText(rm==='coin'?'You have enough coins to revive.  The cost rises with every death.':`Need ${this._reviveCost()} coins to revive — you have ${this.coins}.`,W/2,H/2+84);
      if(rm){const rh=this.mouse.x>=rb.x&&this.mouse.x<=rb.x+rb.w&&this.mouse.y>=rb.y&&this.mouse.y<=rb.y+rb.h;
        c.save();c.fillStyle=rh?'rgba(30,25,5,.98)':'rgba(15,12,3,.96)';c.strokeStyle=rh?'rgba(255,215,0,1)':'rgba(120,100,10,.8)';if(rh){c.shadowBlur=20;c.shadowColor='rgba(255,215,0,1)';}c.lineWidth=2;c.fillRect(rb.x,rb.y,rb.w,rb.h);c.strokeRect(rb.x,rb.y,rb.w,rb.h);c.restore();
        c.fillStyle=rh?'rgba(255,225,80,1)':'rgba(200,170,30,.9)';c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText(`◆  SPEND ${this._reviveCost()} COINS — REVIVE  (you have ${this.coins})`,rb.x+rb.w/2,rb.y+rb.h/2+5);}
    }
    this._overBtns().forEach(b=>{const hov=this.mouse.x>=b.x&&this.mouse.x<=b.x+b.w&&this.mouse.y>=b.y&&this.mouse.y<=b.y+b.h,home=b.id==='home',col=home?'#9fb4c8':'#ff6a7a';
      c.save();c.fillStyle=hov?'rgba(24,16,20,.97)':'rgba(8,10,18,.92)';c.strokeStyle=col;c.lineWidth=hov?2.2:1.6;if(hov){c.shadowBlur=14;c.shadowColor=col;}c.fillRect(b.x,b.y,b.w,b.h);c.strokeRect(b.x,b.y,b.w,b.h);c.restore();
      c.fillStyle=col;c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText(home?'⌂ QUIT TO MENU':'↻ NEW RUN',b.x+b.w/2,b.y+b.h/2+4);});
    c.textAlign='center';c.font='9px "Courier New"';c.fillStyle='rgba(150,160,175,.8)';c.fillText('H = quit to menu   ·   ENTER = new run',W/2,H/2+194);
  }

  _drawWin(c){
    this.sky.draw(c);c.fillStyle='rgba(0,0,0,.85)';c.fillRect(0,0,W,H);
    if(this.fc%3===0)for(let i=0;i<3;i++)this.parts.push(new Particle(rand(AR.x,AR.x+AR.w),rand(AR.y,AR.y+AR.h*.6),rand(-65,65),rand(-85,-22),'#ffd700',rand(.7,1.5),rand(2,6),true,true));
    this.parts.forEach(p=>{p.update(.016);p.draw(c);});
    c.save();c.shadowBlur=55;c.shadowColor='#ffd700';c.fillStyle='rgba(255,215,0,1)';c.font='bold 60px "Courier New"';c.textAlign='center';c.fillText('VOID CLEARED',W/2,H/2-92);c.restore();
    c.fillStyle='rgba(190,180,50,1)';c.font='13px "Courier New"';c.textAlign='center';c.fillText('ALL ENTITIES PURGED  —  MISSION COMPLETE',W/2,H/2-48);
    [['FINAL SCORE',this.score.toLocaleString(),'rgba(255,215,0,1)'],['TOTAL KILLS',this.totalKills.toString(),'rgba(255,180,140,1)'],['COINS',this.coins.toString(),'rgba(255,215,0,1)']].forEach(([l,v,col],i)=>{c.fillStyle='rgba(12,18,32,.9)';c.fillRect(W/2-145,H/2-18+i*32,290,26);c.strokeStyle='rgba(22,44,80,.8)';c.lineWidth=1;c.strokeRect(W/2-145,H/2-18+i*32,290,26);c.fillStyle='rgba(120,195,220,1)';c.font='bold 11px "Courier New"';c.textAlign='left';c.fillText(l,W/2-135,H/2-18+i*32+18);c.save();c.shadowBlur=5;c.shadowColor=col;c.fillStyle=col;c.font='bold 13px "Courier New"';c.textAlign='right';c.fillText(v,W/2+135,H/2-18+i*32+18);c.restore();});
    if(this.score>=HS){c.save();c.shadowBlur=16;c.shadowColor='#ffd700';c.fillStyle='rgba(255,215,0,1)';c.font='bold 14px "Courier New"';c.textAlign='center';c.fillText('★  NEW HIGH SCORE!  ★',W/2,H/2+90);c.restore();}
    else if(this._lbRank>=1&&this._lbRank<5){c.save();c.shadowBlur=14;c.shadowColor='#ffaa00';c.fillStyle='rgba(255,180,60,1)';c.font='bold 13px "Courier New"';c.textAlign='center';c.fillText(`🏆  NEW TOP 5!  RANK #${this._lbRank+1}  🏆`,W/2,H/2+90);c.restore();}
    this._winBtns().forEach(b=>{
      const hov=this.mouse.x>=b.x&&this.mouse.x<=b.x+b.w&&this.mouse.y>=b.y&&this.mouse.y<=b.y+b.h,en=b.id==='endless',col=en?'#ff9a2e':b.id==='again'?'#ffd700':'#9fb4c8';
      c.save();c.fillStyle=hov?'rgba(30,24,10,.97)':'rgba(8,10,18,.92)';c.strokeStyle=col;c.lineWidth=hov?2.5:1.8;c.shadowBlur=en?(14+6*Math.sin(this.fc*.12)):hov?14:0;c.shadowColor=col;c.fillRect(b.x,b.y,b.w,b.h);c.strokeRect(b.x,b.y,b.w,b.h);c.restore();
      c.fillStyle=col;c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText(en?'∞ ENDLESS MODE':b.id==='again'?'↻ PLAY AGAIN':'⌂ HOME',b.x+b.w/2,b.y+b.h/2+4);});
    c.textAlign='center';c.font='9px "Courier New"';c.fillStyle='rgba(150,160,175,.85)';c.fillText('H = home   ·   ENTER = play again   ·   E = endless',W/2,H/2+160);
    c.fillStyle='rgba(255,170,90,.95)';c.font='bold 10px "Courier New"';c.fillText('∞ ENDLESS: waves keep getting harder until you fall — how far can you go?',W/2,H/2+176);
    if(this.newSkin){c.save();c.shadowBlur=14;c.shadowColor='#ff2a2a';c.fillStyle='#ff6a6a';c.font='bold 12px "Courier New"';c.textAlign='center';c.fillText('★ NEW SKIN UNLOCKED: '+this.newSkin+' ★',W/2,H/2+196);c.restore();}
    drawTitle(c,'VOID BREACH 2',W/2,H/2+240,34,this.fc);
    c.save();c.textAlign='center';c.font='bold 16px "Courier New"';c.shadowBlur=16;c.shadowColor='#ff9a2e';c.fillStyle=`rgba(255,170,70,${.7+.3*Math.sin(this.fc*.1)})`;c.fillText('◈  COMING SOON  ◈',W/2,H/2+264);c.shadowBlur=0;c.fillStyle='rgba(200,200,210,.7)';c.font='11px "Courier New"';c.fillText('— HRR STUDIOS —',W/2,H/2+282);c.restore();
  }

  _drawMsg(c){
    if(this.msgT<=0)return;const a=Math.min(1,this.msgT*.7);
    c.save();c.globalAlpha=a;c.translate(W/2,H/2-72);c.scale(this.msgScale,this.msgScale);c.shadowBlur=30;c.shadowColor=this.msgCol;c.fillStyle=this.msgCol;c.font='bold 28px "Courier New"';c.textAlign='center';c.fillText(this.msgTxt,0,0);c.restore();
  }

  // ── MAIN DRAW ──────────────────────────────────────────────────────────────
  draw(){
    ctx.setTransform(RSX,0,0,RSY,0,0);
    const now=performance.now(),fdt=Math.min(.05,(now-(this._fl||now))/1000);this._fl=now;
    if(this._pst!==this.state){if(this.touch&&this.touch.isMobile)this.touch.reset();if(this.state===ST.MENU)GAME_HOOKS.onMenu();if(this._pst!==undefined&&this._pst!==ST.LOADING&&this.state!==ST.LOADING)this.fadeA=.85;this._pst=this.state;}
    this._drawInner();
    if(GQ===3)this._post(ctx);
    if(OPT.fps){const f=1/Math.max(.001,this._rawdt||.016);this._fps=lerp(this._fps||60,Math.min(f,240),.08);ctx.save();ctx.font='bold 11px "Courier New"';ctx.textAlign='left';ctx.fillStyle=this._fps<30?'#ff5a5a':this._fps<50?'#ffcc44':'#44ff88';ctx.fillText(Math.round(this._fps)+' FPS · '+GQN[GQ],8,H-8);ctx.restore();}
    if(this.fadeA>0){this.fadeA=Math.max(0,this.fadeA-fdt*3.2);ctx.save();ctx.globalAlpha=this.fadeA;ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.restore();}
  }
  _drawInner(){
    ctx.clearRect(0,0,W,H);
    if(this.state===ST.SPLASH){this._drawSplash(ctx);return;}
    if(this.state===ST.LOADING){this._drawLoading(ctx);return;}
    if(this.state===ST.MENU){this._drawMenu(ctx);if(this.showPrivacy)this._drawPrivacy(ctx);this._drawPointer(ctx);return;}
    if(this.state===ST.SETTINGS){this._drawSettings(ctx);this._drawPointer(ctx);return;}
    if(this.state===ST.SKINS){this._drawSkins(ctx);this._drawPointer(ctx);return;}
    if(this.state===ST.FORGE){this._drawForge(ctx);this._drawPointer(ctx);return;}

    renderLights(this.enemies,this.player,this.fc);
    ctx.save();ctx.translate(this.fx.shake.x,this.fx.shake.y);if(this.fx.zoom){const z=1+this.fx.zoom;ctx.translate(W/2,H/2);ctx.scale(z,z);ctx.translate(-W/2,-H/2);}
    this.sky.draw(ctx);this._drawArena(ctx);
    this.obs.forEach(o=>o.draw(ctx));
    this.shockwaves.forEach(s=>s.draw(ctx));
    this.parts.forEach(p=>p.draw(ctx));
    this.enemies.forEach(e=>e.draw(ctx));
    this.pickups.forEach(u=>u.draw(ctx));
    this.player.draw(ctx);
    this.bullets.forEach(b=>b.draw(ctx));
    this.wells.forEach(w=>{const a=Math.min(1,w.t*1.3,w.age*5);ctx.save();ctx.translate(w.x,w.y);ctx.globalAlpha=a;
      if(GQ>=1){ctx.globalCompositeOperation='lighter';ctx.drawImage(glowSprite('#9040ff'),-w.r,-w.r,w.r*2,w.r*2);ctx.globalCompositeOperation='source-over';}
      for(let k=0;k<3;k++){const r=w.r*(.32+k*.27)*(1-.07*Math.sin(w.age*6+k)),o=w.age*(3-k)*1.3;ctx.strokeStyle=k%2?'rgba(190,130,255,.6)':'rgba(120,60,255,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r,o,o+4.2);ctx.stroke();}
      ctx.fillStyle='#000';ctx.beginPath();ctx.arc(0,0,14+Math.sin(w.age*9)*2,0,6.283);ctx.fill();ctx.strokeStyle='#c090ff';ctx.lineWidth=2;ctx.stroke();ctx.restore();});
    this.bolts.forEach(b=>{const a=b.life/b.ml;ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineJoin='round';ctx.shadowBlur=16;ctx.shadowColor='#58c8ff';ctx.strokeStyle=`rgba(88,200,255,${a})`;ctx.lineWidth=5;ctx.beginPath();b.pts.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.strokeStyle=`rgba(255,255,255,${a})`;ctx.lineWidth=1.8;ctx.stroke();ctx.restore();});
    this.floats.forEach(f=>f.draw(ctx));
    ctx.restore();

    this.fx.applyFlash(ctx);
    this.fx.applyVignette(ctx,this.player.hp,this.player.maxHp);
    this.combo.draw(ctx);

    if([ST.PLAY,ST.STATS,ST.UPGRADE,ST.BOSS].includes(this.state))this._drawHUD(ctx);
    if([ST.PLAY,ST.BOSS].includes(this.state))this._drawNova(ctx);
    if(this.state===ST.STATS)   this._drawStats(ctx);
    if(this.state===ST.UPGRADE) this._drawUpgrades(ctx);
    if(this.state===ST.BOSS)    this._drawBossIntro(ctx);
    if(this.state===ST.OVER)    this._drawOver(ctx);
    if(this.state===ST.WIN)     this._drawWin(ctx);
    if(this.paused)             this._drawPause(ctx);
    this._drawMsg(ctx);
    this._drawTutorial(ctx);
    this._drawCrosshair(ctx);
    this.touch.draw(ctx);
    this.achPop.draw(ctx);

    if(this.fx.chroma>.05&&GQ>0)this.fx.applyChromatic(ctx);
    if(this.showPrivacy&&this.state!==ST.LOADING)this._drawPrivacy(ctx);
  }

  run(){
    let last=0;
    const loop=ts=>{const raw=(ts-last)/1000,dt=Math.min(raw,.05);last=ts;this._rawdt=raw;
      if((this.state===ST.PLAY||this.state===ST.BOSS)&&!this.paused&&!document.hidden)this._runT=(this._runT||0)+raw;
      if(AUTO&&this.state===ST.PLAY&&!this.paused&&this.waveTrans<=0&&!document.hidden){
        if(raw>.1){this._as=0;this._an=0;}
        else{this._as=(this._as||0)+raw;this._an=(this._an||0)+1;
          if(this._as>=4){const avg=this._as/this._an;this._as=0;this._an=0;
            if(this._skipW>0)this._skipW--;
            else if(avg>.027){this._good=0;this._bad=(this._bad||0)+1;
              if(this._bad>=2){this._bad=0;const flr=avg>.05?0:1;if(GQ>flr){GQ--;this._lows=(this._lows||0)+1;this._skipW=1;this._msg('AUTO: GRAPHICS LOWERED TO '+GQN[GQ],2,'#ffaa00');}}}
            else{this._bad=0;if(avg<.0185&&GQ<GQmax&&(this._lows||0)<3){if(++this._good>=3){this._good=0;GQ++;this._skipW=1;this._msg('AUTO: GRAPHICS RAISED TO '+GQN[GQ],2,'#00ff88');}}else this._good=0;}}}
      }else{this._as=0;this._an=0;}
      this.update(dt);this.draw();requestAnimationFrame(loop);};
    requestAnimationFrame(loop);
  }
}

// ── Resize ────────────────────────────────────────────────────────────────────
let RS=1,RSX=1,RSY=1;
function resize(){
  const dpr=window.devicePixelRatio||1;
  if(IS_TOUCH){
    const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),k=clamp(dpr,1,1.5);
    canvas.style.width=w+'px';canvas.style.height=h+'px';
    canvas.width=Math.round(w*k);canvas.height=Math.round(h*k);
    RSX=canvas.width/W;RSY=canvas.height/H;RS=RSX;
  }else{
    const scale=Math.min(innerWidth/W,innerHeight/H),k=clamp(scale*dpr,1,2.5);
    canvas.style.width=(W*scale)+'px';canvas.style.height=(H*scale)+'px';
    canvas.width=Math.round(W*k);canvas.height=Math.round(H*k);RS=RSX=RSY=k;
  }
}
addEventListener('resize',resize);document.addEventListener('fullscreenchange',resize);document.addEventListener('webkitfullscreenchange',resize);if(window.visualViewport)window.visualViewport.addEventListener('resize',resize);resize();

// ── Boot ──────────────────────────────────────────────────────────────────────
function reloadFromStore(){
  try{HS=parseInt(STORE.getItem('vb_hs')||'0')||0;}catch(e){}
  try{if(STORE.getItem('vb_p')==='1')privOK=true;}catch(e){}
  try{const sv=parseInt(STORE.getItem('vb_gq'));if(sv>=0&&sv<=3){GQ=GQmax=sv;}}catch(e){}
  try{AUTO=STORE.getItem('vb_auto')!=='0';}catch(e){}
  try{Object.assign(OPT,{shake:true,nums:true,fps:false},JSON.parse(STORE.getItem('vb_opt')||'{}'));}catch(e){}
  try{Object.assign(SAVE,{kills:0,bosses:0,wins:0,deathless:0,bestWave:0,bank:0,owned:[],sel:'vanguard',forge:{},guns:['pistol'],gun:'pistol'},JSON.parse(STORE.getItem('vb_save')||'{}'));fixSave();}catch(e){}
  try{leaderboard=JSON.parse(STORE.getItem('vb_lb')||'[]');}catch(e){}
  try{unlockedAch=new Set(JSON.parse(STORE.getItem('vb_ach')||'[]'));}catch(e){}
  try{_userMuted=STORE.getItem('vb_mute')==='1';audioOn=!_userMuted;}catch(e){}
}
(async()=>{ reloadFromStore(); const G=new Game(); G.run();
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){ if([ST.PLAY,ST.BOSS].includes(G.state)&&!G.paused){G.paused=true;GAME_HOOKS.gameplayStop();} if(AC&&AC.state==='running')AC.suspend(); }
    else if(AC&&AC.state==='suspended')AC.resume();
  });
})();