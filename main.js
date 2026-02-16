// main.js
import * as THREE from "three";
import { scene, renderer, activeCamera, controls, setActiveCamera, orthoCamera, handleResize, loader, updateGrid } from "./world.js";
import { state, markDirty } from "./store.js";
import { setupEvents, transformControls, clearSelection, selectObject, deleteSelected } from "./interaction.js";
import { applyMaterial, undo, redo, saveState, checkTransparentWalls } from "./logic.js";

// === Helper: Load Furniture ===
function loadFurniture(name) {
  loader.load(`./public/models/${name}.glb`, (gltf) => {
    const model = gltf.scene; model.userData.model = name;
    model.traverse(c => { if(c.isMesh) c.castShadow=c.receiveShadow=true; });
    scene.add(model); state.furniture.push(model); 
    selectObject(model); 
    markDirty(); 
    saveState(); // Save after adding furniture
  });
}

// === Icons ===
const icons = {
  move: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>`,
  rotate: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  scale: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H5v2h3v5h2v-5h5v-2z"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  undo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`,
  redo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>`,
  save: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
  chevron: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`
};

// === CSS Injection ===
const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
  :root { --bg: #111; --panel: rgba(20,20,20,0.95); --border: rgba(0, 210, 255, 0.2); --accent: #00d2ff; }
  body { margin:0; font-family:'Inter',sans-serif; overflow:hidden; background:#111; color:#eee; }
  
  .toolbar { position:absolute; top:10px; right:10px; width:280px; display:flex; flex-direction:column; gap:8px; z-index:100; max-height:95vh; overflow-y:auto; }
  .toolbar::-webkit-scrollbar { width:4px; }
  
  .panel-box { background:var(--panel); backdrop-filter:blur(10px); border:1px solid var(--border); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:10px; box-shadow:0 4px 12px rgba(0,0,0,0.5); }
  .section-title { font-size:10px; text-transform:uppercase; letter-spacing:1px; opacity:0.8; font-weight:600; color:var(--accent); margin-bottom:2px; display:flex; justify-content:space-between; align-items:center; }
  
  button { background:transparent; border:1px solid rgba(255,255,255,0.15); color:#ccc; padding:6px; border-radius:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:0.2s; font-size:11px; }
  button:hover { background:rgba(0,210,255,0.1); border-color:var(--accent); color:white; }
  button.active { background:var(--accent); color:#000; font-weight:bold; border-color:var(--accent); }
  button.danger { border-color:#ff4444; color:#ff8888; }
  button.danger:hover { background:#ff4444; color:#000; }

  .row { display:flex; gap:6px; align-items:center; justify-content:space-between; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  
  input[type=number] { background:rgba(0,0,0,0.3); border:1px solid var(--border); color:#eee; padding:6px; border-radius:4px; width:50px; text-align:center; }
  input[type=color] { -webkit-appearance:none; border:none; width:100%; height:28px; padding:0; background:none; cursor:pointer; }
  
  /* Thumbnails */
  .thumb-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; }
  .thumb-btn { aspect-ratio:1; border:1px solid rgba(255,255,255,0.1); border-radius:4px; background-size:cover; background-position:center; cursor:pointer; position:relative; transition:0.2s; }
  .thumb-btn:hover { border-color:var(--accent); transform:scale(1.05); }
  .thumb-label { position:absolute; bottom:0; left:0; width:100%; background:rgba(0,0,0,0.7); font-size:8px; text-align:center; color:white; padding:2px 0; border-bottom-left-radius:3px; border-bottom-right-radius:3px; }

  /* Polished Dropdown Grid */
  .dropdown-container { position:relative; width:100%; } 
  .dropdown-btn { width:100%; justify-content:space-between; text-align:left; }
  .dropdown-content { display:none; margin-top:8px; grid-template-columns:repeat(3, 1fr); gap:8px; max-height:250px; overflow-y:auto; padding-right:4px; }
  .dropdown-content.open { display:grid; }
  .furn-item { aspect-ratio:1; background:rgba(255,255,255,0.05); border-radius:6px; border:1px solid transparent; cursor:pointer; background-size:80%; background-position:center; background-repeat:no-repeat; position:relative; transition:0.2s; }
  .furn-item:hover { border-color:var(--accent); background-color:rgba(0,210,255,0.1); }
  .furn-item span { position:absolute; bottom:0; width:100%; text-align:center; font-size:9px; background:rgba(0,0,0,0.8); padding:2px 0; border-bottom-left-radius:5px; border-bottom-right-radius:5px; }

  /* Toggles */
  .toggle-switch { display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer; }
  .toggle-checkbox { width:16px; height:16px; accent-color:var(--accent); }

  #tooltip { position:absolute; background:var(--accent); color:#000; padding:4px 8px; border-radius:4px; pointer-events:none; display:none; font-weight:bold; font-size:11px; transform:translate(15px,-15px); box-shadow:0 0 10px rgba(0,210,255,0.4); z-index:200; }
`;
document.head.appendChild(style);

// === UI Builder ===
const toolbar = document.createElement("div"); toolbar.className = "toolbar"; document.body.appendChild(toolbar);
const tip = document.createElement("div"); tip.id = "tooltip"; document.body.appendChild(tip);

// 1. Transform Tools
const p1 = document.createElement("div"); p1.className = "panel-box";
p1.innerHTML = `<div class="section-title">Tools</div>`;
const tRow = document.createElement("div"); tRow.className = "grid-3";
const moveBtn = document.createElement("button"); moveBtn.innerHTML = `${icons.move} Move`; moveBtn.onclick = () => setTool('translate', moveBtn);
const rotBtn = document.createElement("button"); rotBtn.innerHTML = `${icons.rotate} Rot`; rotBtn.onclick = () => setTool('rotate', rotBtn);
const sclBtn = document.createElement("button"); sclBtn.innerHTML = `${icons.scale} Scl`; sclBtn.onclick = () => setTool('scale', sclBtn);
tRow.append(moveBtn, rotBtn, sclBtn); p1.appendChild(tRow); toolbar.appendChild(p1);

function setTool(mode, btn) {
    transformControls.setMode(mode);
    [moveBtn, rotBtn, sclBtn].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
setTool('translate', moveBtn);

// 2. Wall Construction & Grid
const p2 = document.createElement("div"); p2.className = "panel-box";
p2.innerHTML = `<div class="section-title">Construction</div>`;

// Wall Draw
const wRow = document.createElement("div"); wRow.className = "row";
const drawBtn = document.createElement("button"); drawBtn.id = "drawBtn"; drawBtn.innerText = "Draw Wall"; drawBtn.style.flex="1";
const hInput = document.createElement("input"); hInput.type="number"; hInput.value=state.wallHeight; hInput.title="Wall Height";
hInput.onchange = e => state.wallHeight = parseFloat(e.target.value);
wRow.append(drawBtn, hInput); p2.appendChild(wRow);

// Grid Size
const gRow = document.createElement("div"); gRow.className = "row"; gRow.style.marginTop="8px";
gRow.innerHTML = `<span style="font-size:11px; opacity:0.8">Grid Size:</span>`;
const gInput = document.createElement("input"); gInput.type="number"; gInput.value=state.gridSize;
gInput.onchange = e => { updateGrid(parseFloat(e.target.value)); };
gRow.appendChild(gInput); p2.appendChild(gRow);

// Smart Walls Toggle
const sRow = document.createElement("div"); sRow.className = "row"; sRow.style.marginTop="8px";
const sLabel = document.createElement("label"); sLabel.className = "toggle-switch";
const sCheck = document.createElement("input"); sCheck.type = "checkbox"; sCheck.className = "toggle-checkbox";
sCheck.onchange = (e) => { state.transparentWalls = e.target.checked; };
sLabel.append(sCheck, "Smart Transparent Walls");
sRow.appendChild(sLabel); p2.appendChild(sRow);

drawBtn.onclick = () => {
    state.placingWall = !state.placingWall;
    drawBtn.innerText = state.placingWall ? "Stop Drawing" : "Draw Wall";
    drawBtn.classList.toggle("active", state.placingWall);
    state.walls.forEach(w => {
        w.children[0].visible = state.placingWall;
        w.material = state.placingWall ? new THREE.MeshBasicMaterial({color:0x999999}) : new THREE.MeshStandardMaterial({color:0xeeeeee});
        if(!state.placingWall) applyMaterial(w, w.userData.texture!=='Plain'?'texture':'color', w.userData.texture!=='Plain'?w.userData.texture:'#'+w.userData.color);
    });
    state.nodes.forEach(n => n.visible = state.placingWall);
    if(state.placingWall) { setActiveCamera(orthoCamera); controls.enableRotate = false; controls.reset(); clearSelection(); } 
    else { controls.enableRotate = true; state.lastPoint = null; tip.style.display="none"; }
};
p2.insertAdjacentHTML('beforeend', `<div class="row" style="font-size:11px; margin-top:8px; justify-content:space-between; opacity:0.7"><span>Length</span><span id="ui-len" style="color:#00d2ff;font-weight:bold">-</span></div>`);
toolbar.appendChild(p2);

// 3. Wall Appearance
const p3 = document.createElement("div"); p3.className = "panel-box";
p3.innerHTML = `<div class="section-title">Appearance</div>`;
const cRow = document.createElement("div"); cRow.className = "row"; cRow.style.marginBottom="8px";
const cInput = document.createElement("input"); cInput.type="color"; cInput.id="colInput"; cInput.value="#eeeeee";
cInput.oninput = e => { if(state.selection[0]) { applyMaterial(state.selection[0], 'color', e.target.value); markDirty(); }};
cInput.onchange = () => saveState(); // Save state on release
cRow.innerHTML = `<span style="font-size:11px">Paint Color:</span>`; cRow.appendChild(cInput); p3.appendChild(cRow);

const tGrid = document.createElement("div"); tGrid.className = "thumb-grid";
const textures = [
    { name: 'Plain', img: null, color: '#999' },
    { name: 'Brick', img: './public/textures/brick.jpg', color: '#833' },
    { name: 'Concrete', img: './public/textures/concrete.jpg', color: '#555' },
    { name: 'Wood', img: './public/textures/wood.jpg', color: '#d95' },
    { name: 'Paper', img: './public/textures/wallpaper.jpg', color: '#ffe' }
];
textures.forEach(tex => {
    const btn = document.createElement("div"); btn.className = "thumb-btn";
    if(tex.img) btn.style.backgroundImage = `url(${tex.img})`; else btn.style.backgroundColor = tex.color;
    btn.onclick = () => { if(state.selection[0]) { applyMaterial(state.selection[0], 'texture', tex.name); markDirty(); saveState(); }};
    btn.innerHTML = `<div class="thumb-label">${tex.name}</div>`; tGrid.appendChild(btn);
});
p3.appendChild(tGrid); toolbar.appendChild(p3);

// 4. Furniture Library (Polished Grid)
const p5 = document.createElement("div"); p5.className = "panel-box";
p5.innerHTML = `<div class="section-title">Furniture</div>`;
const furnContainer = document.createElement("div"); furnContainer.className = "dropdown-container"; 
const dropBtn = document.createElement("button"); dropBtn.className = "dropdown-btn"; 
dropBtn.innerHTML = `<span>Open Library</span> ${icons.chevron}`; 
furnContainer.appendChild(dropBtn);

const dropContent = document.createElement("div"); dropContent.className = "dropdown-content"; 
furnContainer.appendChild(dropContent);
dropBtn.onclick = () => { dropContent.classList.toggle("open"); };

// Hidden Renderer for Thumbnails
const thumbW = 128, thumbH = 128;
const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true }); tr.setSize(thumbW, thumbH);
const ts = new THREE.Scene(); const tc = new THREE.PerspectiveCamera(45, 1, 0.1, 10); tc.position.set(2, 2, 3); tc.lookAt(0, 0.5, 0);
ts.add(new THREE.DirectionalLight(0xffffff, 2)); ts.add(new THREE.AmbientLight(0xffffff, 1));

["sofa","chair","cupboard","bed","tv","lamp","toilet","basin","sidetable"].forEach(name => {
  const btn = document.createElement("div"); btn.className = "furn-item";
  btn.innerHTML = `<span>${name}</span>`;
  btn.onclick = () => { loadFurniture(name); }; dropContent.appendChild(btn);
  
  loader.load(`./public/models/${name}.glb`, gltf => {
    const model = gltf.scene.clone(); const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z);
    model.scale.setScalar(2/maxDim); model.position.set(0,-0.5,0);
    ts.children = ts.children.slice(0,2); ts.add(model); // Keep lights, swap model
    tr.render(ts, tc); btn.style.backgroundImage = `url(${tr.domElement.toDataURL()})`;
  });
});
p5.appendChild(furnContainer); toolbar.appendChild(p5);

// 5. Project Actions
const p4 = document.createElement("div"); p4.className = "panel-box";
p4.innerHTML = `<div class="section-title">Project</div>`;
const aRow = document.createElement("div"); aRow.className = "grid-3";
const uBtn = document.createElement("button"); uBtn.id="undoBtn"; uBtn.innerHTML = `${icons.undo} Undo`; uBtn.onclick = undo;
const rBtn = document.createElement("button"); rBtn.id="redoBtn"; rBtn.innerHTML = `${icons.redo} Redo`; rBtn.onclick = redo;
const dBtn = document.createElement("button"); dBtn.className = "danger"; dBtn.innerHTML = `${icons.trash} Del`; dBtn.onclick = deleteSelected;
const sBtn = document.createElement("button"); sBtn.innerHTML = `${icons.save} JSON`; sBtn.onclick = () => {
    const blob = new Blob([state.history[state.history.length-1]], {type:"application/json"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="project.json"; a.click();
};
aRow.append(uBtn, rBtn, dBtn, sBtn); p4.appendChild(aRow); toolbar.appendChild(p4);

// === Loop ===
// Save initial state to allow undoing back to start
saveState(); 

setupEvents();
window.addEventListener('resize', handleResize);
function animate() { 
    requestAnimationFrame(animate); 
    checkTransparentWalls(); // Run Smart Transparency Logic
    controls.update(); 
    renderer.render(scene, activeCamera); 
}
animate();