#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROWS = 8, COLS = 8;
const ALL_TYPES = ["coin","peach","jade","scroll","wine"];
const ROOT = path.resolve(__dirname, "..");
const LEVEL_FILE = path.join(ROOT, "levels.json");

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function key(r,c){ return r + "," + c; }
function inGrid(r,c){ return r>=0 && r<ROWS && c>=0 && c<COLS; }
function cloneCell(p){ return p ? {...p} : null; }
function targetForIndex(i){ return i<3 ? .9 : ((i+1)%10===0 ? .33 : i<9 ? .8 : Math.max(.52,.66-(i-10)*.004)); }
function band(target){ return [Math.max(0,target-.10), Math.min(1,target+.10)]; }

class Game{
  constructor(level, seed){
    this.level = level;
    this.rng = mulberry32(seed);
    this.types = level.types || ALL_TYPES;
    this.goals = Object.fromEntries((level.goals||[]).map(([t,n])=>[t,n]));
    this.moves = level.moves;
    this.sealStock = this.goals.seal || 0;
    this.grid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
    this.setup();
  }
  rnd(a){ return a[Math.floor(this.rng()*a.length)]; }
  isPiece(p){ return p && !p.box && !p.seal && p.t; }
  countGoal(t,n=1){ if(this.goals[t] > 0) this.goals[t] = Math.max(0, this.goals[t]-n); }
  won(){ return Object.values(this.goals).every(v=>v<=0); }
  newPiece(t,o={}){ return {t, s:o.s||null, lock:o.lock||0, seal:!!o.seal, box:false, hp:0}; }
  newSeal(){ return this.newPiece(null,{seal:true}); }
  pickType(r,c){
    let t, guard=0;
    do{
      t = this.rnd(this.types);
      guard++;
    }while(guard<30 && (
      (c>=2 && this.isPiece(this.grid[r][c-1]) && this.grid[r][c-1].t===t && this.isPiece(this.grid[r][c-2]) && this.grid[r][c-2].t===t) ||
      (r>=2 && this.isPiece(this.grid[r-1][c]) && this.grid[r-1][c].t===t && this.isPiece(this.grid[r-2][c]) && this.grid[r-2][c].t===t)
    ));
    return t;
  }
  makeLayout(ch,r,c){
    if(ch==="B" || ch==="b") return {box:true,hp:ch==="B"?2:1};
    if(ch==="S") return this.newSeal();
    if(ch==="L") return this.newPiece(this.pickType(r,c),{lock:1});
    if(ch==="R") return this.newPiece(this.pickType(r,c),{s:"rocketH"});
    if(ch==="r") return this.newPiece(this.pickType(r,c),{s:"rocketV"});
    return this.newPiece(this.pickType(r,c));
  }
  setup(){
    const layout = this.level.layout || Array.from({length:ROWS},()=>".".repeat(COLS));
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const p = this.makeLayout(layout[r][c],r,c);
      if(p.seal) this.sealStock = Math.max(0,this.sealStock-1);
      this.grid[r][c] = p;
    }
    this.seedSeal();
  }
  seedSeal(){
    if(this.sealStock<=0) return;
    for(const c of [2,5,1,6,3,4,0,7]){
      const p=this.grid[0][c];
      if(p && !p.box && !p.lock){ this.grid[0][c]=this.newSeal(); this.sealStock--; return; }
    }
  }
  findMatches(){
    const runs=[];
    for(let r=0;r<ROWS;r++){
      let c=0;
      while(c<COLS){
        if(!this.isPiece(this.grid[r][c])){ c++; continue; }
        const t=this.grid[r][c].t; let len=1;
        while(c+len<COLS && this.isPiece(this.grid[r][c+len]) && this.grid[r][c+len].t===t) len++;
        if(len>=3) runs.push({cells:Array.from({length:len},(_,i)=>[r,c+i]),h:true,t,len});
        c+=len;
      }
    }
    for(let c=0;c<COLS;c++){
      let r=0;
      while(r<ROWS){
        if(!this.isPiece(this.grid[r][c])){ r++; continue; }
        const t=this.grid[r][c].t; let len=1;
        while(r+len<ROWS && this.isPiece(this.grid[r+len][c]) && this.grid[r+len][c].t===t) len++;
        if(len>=3) runs.push({cells:Array.from({length:len},(_,i)=>[r+i,c]),h:false,t,len});
        r+=len;
      }
    }
    return runs;
  }
  blastCells(r,c,s,extra){
    const cells=[];
    if(s==="rocketH") for(let i=0;i<COLS;i++) cells.push([r,i]);
    else if(s==="rocketV") for(let i=0;i<ROWS;i++) cells.push([i,c]);
    else if(s==="bomb"){
      const R=extra&&extra.big?2:1;
      for(let dr=-R;dr<=R;dr++) for(let dc=-R;dc<=R;dc++) if(inGrid(r+dr,c+dc)) cells.push([r+dr,c+dc]);
    }else if(s==="orb"){
      let t=extra&&extra.color;
      if(!t){
        const cnt={};
        for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++){ const p=this.grid[rr][cc]; if(this.isPiece(p)&&!p.s) cnt[p.t]=(cnt[p.t]||0)+1; }
        t=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0] || this.rnd(this.types);
      }
      for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++){ const p=this.grid[rr][cc]; if(this.isPiece(p)&&p.t===t) cells.push([rr,cc]); }
      cells.push([r,c]);
    }else if(s==="cross"){
      for(let i=0;i<COLS;i++) cells.push([r,i]);
      for(let i=0;i<ROWS;i++) cells.push([i,c]);
    }else if(s==="mega"){
      for(let d=-1;d<=1;d++){
        if(inGrid(r+d,c)) for(let i=0;i<COLS;i++) cells.push([r+d,i]);
        if(inGrid(r,c+d)) for(let i=0;i<ROWS;i++) cells.push([i,c+d]);
      }
    }else if(s==="all") for(let rr=0;rr<ROWS;rr++) for(let cc=0;cc<COLS;cc++) cells.push([rr,cc]);
    return cells;
  }
  expandClears(initial, specials=[]){
    const clearSet=new Set(), boxHits=new Set(), fxQueue=[...specials], seen=new Set(specials.map(f=>key(f.r,f.c)));
    const push=(r,c)=>{
      if(!inGrid(r,c)) return;
      const p=this.grid[r][c]; if(!p) return;
      if(p.box){ boxHits.add(key(r,c)); return; }
      if(p.seal) return;
      const k=key(r,c); if(clearSet.has(k)) return;
      clearSet.add(k);
      if(p.s && !seen.has(k)){ seen.add(k); fxQueue.push({r,c,s:p.s}); }
    };
    for(const [r,c] of initial) push(r,c);
    while(fxQueue.length){
      const fx=fxQueue.shift();
      for(const [r,c] of this.blastCells(fx.r,fx.c,fx.s,fx.extra)) push(r,c);
      clearSet.add(key(fx.r,fx.c));
    }
    return {clearSet, boxHits};
  }
  spawnSpecials(runs, swapPos){
    const spawn={};
    for(const run of runs||[]){
      let s=null;
      if(run.len>=5) s="orb"; else if(run.len===4) s=run.h?"rocketH":"rocketV";
      if(s){
        let pos=run.cells[Math.floor(run.cells.length/2)];
        if(swapPos) for(const cl of run.cells) if(cl[0]===swapPos[0] && cl[1]===swapPos[1]) pos=cl;
        spawn[key(pos[0],pos[1])]=s;
      }
    }
    const cellRuns={};
    for(const run of runs||[]) for(const cl of run.cells){ const k=key(cl[0],cl[1]); (cellRuns[k]=cellRuns[k]||[]).push(run.h); }
    for(const k in cellRuns) if(cellRuns[k].includes(true)&&cellRuns[k].includes(false)) spawn[k]="bomb";
    return spawn;
  }
  applyClears(clearSet, boxHits, runs, swapPos){
    const spawn=this.spawnSpecials(runs,swapPos);
    if(runs){
      for(const run of runs) for(const [r,c] of run.cells){
        for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const rr=r+dr, cc=c+dc;
          if(inGrid(rr,cc) && this.grid[rr][cc] && this.grid[rr][cc].box) boxHits.add(key(rr,cc));
        }
      }
    }
    for(const k of clearSet){
      const [r,c]=k.split(",").map(Number); const p=this.grid[r][c];
      if(!p || p.box) continue;
      if(p.lock){ p.lock=0; this.countGoal("lock"); continue; }
      if(spawn[k]){ this.countGoal(p.t); p.t=null; p.s=spawn[k]; continue; }
      this.countGoal(p.t||"none"); this.grid[r][c]=null;
    }
    for(const k of boxHits){
      const [r,c]=k.split(",").map(Number); const p=this.grid[r][c];
      if(!p || !p.box) continue;
      p.hp--;
      if(p.hp<=0){ this.countGoal("box"); this.grid[r][c]=null; }
    }
  }
  countSeals(){ let n=0; for(const row of this.grid) for(const p of row) if(p&&p.seal) n++; return n; }
  makeFiller(segStart){
    if(segStart===0 && this.sealStock>0 && (this.countSeals()===0 || this.rng()<.16 || this.sealStock>Math.max(1,Math.floor(this.moves/5)))){
      this.sealStock--; return this.newSeal();
    }
    return this.newPiece(this.rnd(this.types));
  }
  collectSeals(){
    let n=0;
    for(let c=0;c<COLS;c++) if(this.grid[ROWS-1][c] && this.grid[ROWS-1][c].seal){ this.grid[ROWS-1][c]=null; this.countGoal("seal"); n++; }
    return n;
  }
  gravity(){
    for(let pass=0;pass<4;pass++){
      for(let c=0;c<COLS;c++){
        let segStart=0;
        for(let r=0;r<=ROWS;r++){
          const blocker = r===ROWS || (this.grid[r][c] && this.grid[r][c].box);
          if(blocker){
            const pieces=[];
            for(let i=r-1;i>=segStart;i--) if(this.grid[i][c] && !this.grid[i][c].box) pieces.push(this.grid[i][c]);
            let write=r-1;
            for(const p of pieces) this.grid[write--][c]=p;
            for(let i=write;i>=segStart;i--) this.grid[i][c]=this.makeFiller(segStart);
            segStart=r+1;
          }
        }
      }
      if(!this.collectSeals()) break;
    }
  }
  resolve(swapPos=null){
    let chain=0;
    while(true){
      const runs=this.findMatches();
      if(!runs.length) break;
      chain++;
      const initial=[]; for(const run of runs) for(const cl of run.cells) initial.push(cl);
      const {clearSet, boxHits}=this.expandClears(initial,[]);
      this.applyClears(clearSet,boxHits,runs,chain===1?swapPos:null);
      this.gravity();
    }
    return chain;
  }
  comboOf(a,b){
    if(a==="orb"&&b==="orb") return {s:"all"};
    if(a&&b&&a.startsWith("rocket")&&b.startsWith("rocket")) return {s:"cross"};
    if((a==="bomb"&&b&&b.startsWith("rocket"))||(b==="bomb"&&a&&a.startsWith("rocket"))) return {s:"mega"};
    if(a==="bomb"&&b==="bomb") return {s:"bomb",extra:{big:true}};
    return null;
  }
  activate(list){
    const {clearSet, boxHits}=this.expandClears([],list);
    this.applyClears(clearSet,boxHits,null,null);
    this.gravity();
    this.resolve(null);
  }
  swapRaw(r1,c1,r2,c2){ const a=this.grid[r1][c1]; this.grid[r1][c1]=this.grid[r2][c2]; this.grid[r2][c2]=a; }
  scoreMove(r1,c1,r2,c2){
    const A=this.grid[r1][c1], B=this.grid[r2][c2];
    if(!A||!B||A.box||B.box||A.lock||B.lock) return null;
    let score=0, special=null;
    const combo=A.s&&B.s ? this.comboOf(A.s,B.s) : null;
    if(combo) return {r1,c1,r2,c2,score:40};
    if(A.s||B.s){
      score += (A.s==="orb"||B.s==="orb") ? 28 : 18;
      if((A.s&&this.goals[A.t]>0)||(B.s&&this.goals[B.t]>0)) score+=5;
      return {r1,c1,r2,c2,score};
    }
    this.swapRaw(r1,c1,r2,c2);
    const runs=this.findMatches();
    this.swapRaw(r1,c1,r2,c2);
    if(!runs.length) return null;
    const seen=new Set();
    for(const run of runs){
      score += run.len;
      if(run.len===4) score += 4;
      if(run.len>=5) score += 8;
      if(this.goals[run.t]>0) score += run.len*1.5;
      for(const [r,c] of run.cells){
        seen.add(key(r,c));
        const p=this.grid[r][c]; if(p&&p.lock) score += 4;
        for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const q=this.grid[r+dr]?.[c+dc];
          if(q&&q.box&&this.goals.box>0) score += 2.2;
        }
      }
    }
    if((A.seal && r2>r1) || (B.seal && r1>r2)) score += 6;
    score += seen.size * .4 + this.rng()*.01;
    return {r1,c1,r2,c2,score};
  }
  movesList(){
    const out=[];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) for(const [dr,dc] of [[0,1],[1,0]]){
      const rr=r+dr, cc=c+dc;
      if(inGrid(rr,cc)){ const m=this.scoreMove(r,c,rr,cc); if(m) out.push(m); }
    }
    return out.sort((a,b)=>b.score-a.score);
  }
  shuffle(){
    const cells=[];
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ const p=this.grid[r][c]; if(this.isPiece(p)&&!p.s&&!p.lock) cells.push([r,c,p.t]); }
    for(let i=cells.length-1;i>0;i--){ const j=Math.floor(this.rng()*(i+1)); const t=cells[i][2]; cells[i][2]=cells[j][2]; cells[j][2]=t; }
    for(const [r,c,t] of cells) this.grid[r][c].t=t;
  }
  step(){
    const moves=this.movesList();
    if(!moves.length){ this.shuffle(); return false; }
    const pick=moves[Math.floor(this.rng()*Math.min(3,moves.length))];
    this.applyMove(pick);
    return true;
  }
  applyMove(m){
    const A=this.grid[m.r1][m.c1], B=this.grid[m.r2][m.c2];
    this.swapRaw(m.r1,m.c1,m.r2,m.c2);
    this.moves--;
    const combo=A.s&&B.s ? this.comboOf(A.s,B.s) : null;
    if(combo){ A.s=null; B.s=null; this.grid[m.r1][m.c1]=null; this.grid[m.r2][m.c2]=null; this.activate([{r:m.r2,c:m.c2,s:combo.s,extra:combo.extra}]); return; }
    if(A.s==="orb"||B.s==="orb"){
      const orb=A.s==="orb"?A:B, other=A.s==="orb"?B:A, pos=A.s==="orb"?[m.r2,m.c2]:[m.r1,m.c1];
      orb.s=null; this.grid[pos[0]][pos[1]]=null; this.activate([{r:pos[0],c:pos[1],s:"orb",extra:{color:other.t}}]); return;
    }
    if(A.s||B.s){
      const fx=[];
      if(A.s){ fx.push({r:m.r2,c:m.c2,s:A.s}); A.s=null; this.grid[m.r2][m.c2]=null; }
      if(B.s){ fx.push({r:m.r1,c:m.c1,s:B.s}); B.s=null; this.grid[m.r1][m.c1]=null; }
      this.activate(fx); return;
    }
    this.resolve([m.r2,m.c2]);
  }
  play(){
    this.resolve(null);
    let stalls=0;
    while(this.moves>0 && !this.won()){
      if(!this.step()) stalls++;
      if(stalls>8) break;
    }
    return {win:this.won(), movesLeft:this.moves};
  }
}

function loadLevels(){
  const data=JSON.parse(fs.readFileSync(LEVEL_FILE,"utf8"));
  return (Array.isArray(data)?data:data.levels).map((l,i)=>({targetRate:targetForIndex(i), ...l}));
}
function runLevel(level, idx, runs, seedBase){
  let wins=0, movesLeft=0;
  for(let i=0;i<runs;i++){
    const g=new Game(level, seedBase + idx*100003 + i*9176);
    const res=g.play();
    if(res.win) wins++;
    movesLeft += Math.max(0,res.movesLeft);
  }
  return {wins, runs, rate:wins/runs, avgMoves:movesLeft/runs};
}
function fmtPct(x){ return (x*100).toFixed(0).padStart(3)+"%"; }
function printTable(levels, results){
  console.log("Lv  Title        Moves Target Band      Rate  AvgLeft Status");
  console.log("--  ----------- ----- ------ --------- ----- ------- ------");
  let ok=0;
  results.forEach((r,i)=>{
    const l=levels[i], [lo,hi]=band(l.targetRate);
    const pass=r.rate>=lo && r.rate<=hi;
    if(pass) ok++;
    const title=(l.title||"").slice(0,11).padEnd(11);
    console.log(`${String(i+1).padStart(2)}  ${title} ${String(l.moves).padStart(5)} ${fmtPct(l.targetRate)} ${fmtPct(lo)}-${fmtPct(hi)} ${fmtPct(r.rate)} ${r.avgMoves.toFixed(1).padStart(7)} ${pass?"OK":"TUNE"}`);
  });
  console.log(`\n${ok}/${levels.length} levels inside target band.`);
  return ok===levels.length;
}
function tune(levels, runs, seedBase){
  const tuned=levels.map(l=>({...l, goals:l.goals.map(g=>[...g]), layout:[...l.layout], types:[...l.types]}));
  for(let i=0;i<tuned.length;i++){
    for(let round=0;round<3;round++){
      const res=runLevel(tuned[i], i, runs, seedBase + round*999999);
      const target=tuned[i].targetRate, [lo,hi]=band(target);
      if(res.rate>=lo && res.rate<=hi) break;
      let delta=0;
      if(res.rate>hi) delta=-Math.max(1,Math.round((res.rate-target)*10));
      if(res.rate<lo) delta=Math.max(1,Math.round((target-res.rate)*10));
      tuned[i].moves=Math.max(14,Math.min(45,tuned[i].moves+delta));
    }
  }
  return tuned;
}
function parseArgs(argv){
  const args={runs:60, seed:20260611, tune:false, write:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==="--runs") args.runs=Number(argv[++i]);
    else if(a==="--seed") args.seed=Number(argv[++i]);
    else if(a==="--tune") args.tune=true;
    else if(a==="--write") args.write=true;
  }
  return args;
}
function main(){
  const args=parseArgs(process.argv.slice(2));
  let levels=loadLevels();
  if(args.tune){
    levels=tune(levels,args.runs,args.seed);
    if(args.write) fs.writeFileSync(LEVEL_FILE, JSON.stringify({levels}, null, 2));
  }
  const results=levels.map((l,i)=>runLevel(l,i,args.runs,args.seed));
  const ok=printTable(levels,results);
  process.exitCode = ok ? 0 : 1;
}
main();
