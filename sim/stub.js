"use strict";

global.window = global.window || { SIM: true, devicePixelRatio: 1, addEventListener(){} };
global.document = global.document || {
  getElementById(){ return { textContent:"", innerHTML:"", classList:{add(){},remove(){}}, appendChild(){}, getContext(){ return {}; }, style:{} }; },
  createElement(){ return { width:0, height:0, getContext(){ return {}; }, toDataURL(){ return ""; } }; },
  querySelector(){ return { innerHTML:"" }; }
};
global.navigator = global.navigator || {};
global.requestAnimationFrame = global.requestAnimationFrame || function(){};
