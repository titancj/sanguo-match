#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const levels = JSON.parse(fs.readFileSync(path.join(root, "levels.json"), "utf8"));
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function noop(){}
function makeCtx(){
  const gradient = { addColorStop: noop };
  return {
    beginPath:noop, moveTo:noop, arcTo:noop, closePath:noop, fill:noop, stroke:noop,
    createLinearGradient(){ return gradient; }, createRadialGradient(){ return gradient; },
    fillRect:noop, ellipse:noop, arc:noop, save:noop, restore:noop, translate:noop,
    rotate:noop, scale:noop, clearRect:noop, drawImage:noop, setTransform:noop,
    fillText:noop, quadraticCurveTo:noop, bezierCurveTo:noop, lineTo:noop,
    measureText(){ return {width:0}; }
  };
}
function makeClassList(){
  const set = new Set();
  return { add:c=>set.add(c), remove:c=>set.delete(c), contains:c=>set.has(c), toString:()=>[...set].join(" ") };
}
function makeEl(id=""){
  return {
    id, style:{}, children:[], disabled:false, textContent:"", title:"", className:"",
    classList:makeClassList(), offsetWidth:0,
    appendChild(child){ this.children.push(child); return child; },
    getContext(){ return makeCtx(); },
    toDataURL(){ return "data:image/png;base64,"; },
    getBoundingClientRect(){ return {left:0, top:0, width:400, height:400}; },
    set innerHTML(v){ this._innerHTML=String(v); this.children=[]; },
    get innerHTML(){ return this._innerHTML || ""; },
    addEventListener:noop
  };
}
const ids = ["board","startOverlay","introOverlay","winOverlay","loseOverlay","mapOverlay","startBtn","continueBtn","introBtn","winBtn","loseBtn","mapBtn","muteBtn","movesNum","levelTag","goals","introSeal","introTitle","introStory","introGoals","winStars","winText","mapGrid","boardWrap","praise"];
const elements = Object.fromEntries(ids.map(id=>[id, makeEl(id)]));
elements.startOverlay.classList.add("show");
elements.boardWrap.clientWidth = 420;
elements.boardWrap.clientHeight = 620;
const storage = new Map();

const context = {
  console,
  setTimeout: (fn)=>{ fn(); return 0; },
  clearTimeout: noop,
  Math,
  JSON,
  Promise,
  window: { SIM:true, devicePixelRatio:1, addEventListener:noop },
  navigator: {},
  localStorage: { getItem:k=>storage.get(k)||null, setItem:(k,v)=>storage.set(k,String(v)) },
  requestAnimationFrame: noop,
  fetch: async()=>({ ok:true, json:async()=>levels }),
  document: {
    getElementById(id){ return elements[id] || (elements[id]=makeEl(id)); },
    createElement(tag){ const el=makeEl(tag); el.tagName=tag.toUpperCase(); return el; },
    querySelector(){ return makeEl("query"); }
  }
};
context.window.localStorage = context.localStorage;
context.window.document = context.document;
context.window.navigator = context.navigator;

(async()=>{
  vm.createContext(context);
  vm.runInContext(script, context, {filename:"index.html"});
  for(let i=0;i<8;i++) await Promise.resolve();
  if(elements.startBtn.disabled) throw new Error("start button stayed disabled");
  elements.startBtn.onclick();
  if(!elements.mapOverlay.classList.contains("show")) throw new Error("map did not open");
  if(elements.mapGrid.children.length !== 40) throw new Error(`expected 40 map nodes, got ${elements.mapGrid.children.length}`);
  elements.mapGrid.children[0].onclick();
  if(!elements.introOverlay.classList.contains("show")) throw new Error("intro did not open from map");
  await elements.introBtn.onclick();
  if(String(elements.levelTag.textContent).indexOf("桃园结义") === -1) throw new Error("level 1 HUD did not render");
  context.showWin();
  const saved = JSON.parse(storage.get("sanguo-match-progress-v1") || "{}");
  if((saved.unlocked||0) < 2) throw new Error("win did not unlock next level in storage");
  console.log("smoke ok: levels loaded, map rendered, first level starts, progress saves");
})().catch(err=>{ console.error(err); process.exit(1); });
