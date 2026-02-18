// main.js
import * as THREE from "three";
import { scene, renderer, activeCamera, controls, setActiveCamera, orthoCamera, perspCamera, handleResize, loader, updateGrid, updateSun, toggleDarkMode, loadFloorPlan, toggleFloorPlan } from "./world.js";
import { state, markDirty } from "./store.js";
import { setupEvents, transformControls, clearSelection, selectObject, deleteSelected, selectAll, hidePreview, setGizmoMode } from "./interaction.js";
import { applyMaterial, undo, redo, saveState, checkTransparentWalls, wallTextures, textureURLs, getProjectData, loadProjectData } from "./logic.js";

function loadFurniture(name) {
  loader.load(`./public/models/${name}.glb`, (gltf) => {
    const model = gltf.scene; model.userData.model = name;
    model.traverse(c => { if(c.isMesh) c.castShadow=c.receiveShadow=true; });
    scene.add(model); state.furniture.push(model); 
    selectObject(model); markDirty(); saveState();
  });
}

const icons = {
  move: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>`,
  rotate: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  scale: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H5v2h3v5h2v-5h5v-2z"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  undo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`,
  redo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>`,
  save: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
  load: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`,
  chevron: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`,
  sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z"/></svg>`
};

const style = document.createElement('style');
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
  :root { --bg: #111; --panel: rgba(20,20,20,0.95); --border: rgba(0, 210, 255, 0.2); --accent: #00d2ff; --text: #eee; }
  body.light-mode { --bg: #e0e0e0; --panel: rgba(240,240,240,0.95); --border: rgba(0, 150, 200, 0.3); --accent: #0088cc; --text: #222; }
  body { margin:0; font-family:'Inter',sans-serif; overflow:hidden; background:var(--bg); color:var(--text); transition: background 0.3s; }
  .toolbar { position:absolute; top:10px; right:10px; width:280px; display:flex; flex-direction:column; gap:8px; z-index:100; max-height:95vh; overflow-y:auto; }
  .toolbar::-webkit-scrollbar { width:4px; }
  .panel-box { background:var(--panel); backdrop-filter:blur(10px); border:1px solid var(--border); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:10px; box-shadow:0 4px 12px rgba(0,0,0,0.2); transition: background 0.3s; }
  .section-title { font-size:10px; text-transform:uppercase; letter-spacing:1px; opacity:0.8; font-weight:600; color:var(--accent); margin-bottom:2px; display:flex; justify-content:space-between; align-items:center; }
  button { background:transparent; border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; transition:0.2s; font-size:11px; opacity:0.8; }
  button:hover { background:rgba(0,210,255,0.1); border-color:var(--accent); opacity:1; }
  button.active { background:var(--accent); color:var(--bg); font-weight:bold; border-color:var(--accent); opacity:1; }
  button.danger { border-color:#ff4444; color:#ff8888; }
  button.danger:hover { background:#ff4444; color:#fff; }
  .row { display:flex; gap:6px; align-items:center; justify-content:space-between; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  input[type=number], input[type=range] { background:rgba(128,128,128,0.2); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; width:50px; text-align:center; }
  input[type=range] { width:100%; padding:0; height:4px; accent-color:var(--accent); cursor:pointer; }
  input[type=color] { -webkit-appearance:none; border:none; width:100%; height:28px; padding:0; background:none; cursor:pointer; }
  
  .dropdown-container { position:relative; width:100%; } 
  .dropdown-btn { width:100%; justify-content:space-between; text-align:left; }
  .dropdown-content { display:none; width:100%; background:rgba(0,0,0,0.1); border-radius:4px; padding:4px; grid-template-columns:repeat(3, 1fr); gap:6px; max-height:200px; overflow-y:auto; margin-top:4px; border:1px solid var(--border); }
  .dropdown-content.open { display:grid; }
  .furn-item { aspect-ratio:1; background:rgba(128,128,128,0.1); border-radius:6px; border:1px solid transparent; cursor:pointer; background-size:80%; background-position:center; background-repeat:no-repeat; position:relative; transition:0.2s; }
  .furn-item:hover { border-color:var(--accent); background-color:rgba(0,210,255,0.1); }
  .furn-item span { position:absolute; bottom:0; width:100%; text-align:center; font-size:9px; background:rgba(0,0,0,0.8); color:white; padding:2px 0; border-bottom-left-radius:5px; border-bottom-right-radius:5px; }
  .toggle-switch { display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer; opacity:0.8; transition:0.2s; }
  .toggle-switch:hover { opacity:1; color:var(--accent); }
  .toggle-checkbox { width:14px; height:14px; accent-color:var(--accent); cursor:pointer; }
  #tooltip { position:absolute; background:var(--accent); color:#000; padding:4px 8px; border-radius:4px; pointer-events:none; display:none; font-weight:bold; font-size:11px; transform:translate(15px,-15px); box-shadow:0 0 10px rgba(0,210,255,0.4); z-index:200; }
  
  #scaleVal { width:32px; text-align:right; color:var(--accent); font-weight:bold; font-size:11px; }
`;
document.head.appendChild(style);

const toolbar = document.createElement("div"); toolbar.className = "toolbar"; document.body.appendChild(toolbar);
const tip = document.createElement("div"); tip.id = "tooltip"; document.body.appendChild(tip);

// 1. View & Transform
const p1 = document.createElement("div"); p1.className = "panel-box";
p1.innerHTML = `<div class="section-title">View & Tools</div>`;
const vRow = document.createElement("div"); vRow.className = "row"; vRow.style.marginBottom="8px";
const camBtn = document.createElement("button"); camBtn.innerHTML = `2D / 3D`; camBtn.style.flex="1";
camBtn.onclick = () => {
    const isOrtho = activeCamera === orthoCamera;
    setActiveCamera(isOrtho ? perspCamera : orthoCamera);
    camBtn.classList.toggle('active', !isOrtho);
};
vRow.appendChild(camBtn); 

const darkBtn = document.createElement("button"); darkBtn.innerHTML = icons.sun; darkBtn.title = "Toggle Dark/Light Mode";
darkBtn.onclick = () => {
    toggleDarkMode();
    document.body.classList.toggle('light-mode');
}; 
vRow.appendChild(darkBtn);
p1.appendChild(vRow);

const tRow = document.createElement("div"); tRow.className = "grid-3";
const moveBtn = document.createElement("button"); moveBtn.innerHTML = `${icons.move} Move`; moveBtn.onclick = () => setTool('translate', moveBtn);
const rotBtn = document.createElement("button"); rotBtn.innerHTML = `${icons.rotate} Rot`; rotBtn.onclick = () => setTool('rotate', rotBtn);
const sclBtn = document.createElement("button"); sclBtn.innerHTML = `${icons.scale} Scl`; sclBtn.onclick = () => setTool('scale', sclBtn);
tRow.append(moveBtn, rotBtn, sclBtn); p1.appendChild(tRow); toolbar.appendChild(p1);

function setTool(mode, btn) {
    setGizmoMode(mode);
    [moveBtn, rotBtn, sclBtn].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
setTool('translate', moveBtn);

// 2. Construction
const p2 = document.createElement("div"); p2.className = "panel-box";
p2.innerHTML = `<div class="section-title">Construction</div>`;
const wRow = document.createElement("div"); wRow.className = "row";
const drawBtn = document.createElement("button"); drawBtn.id = "drawBtn"; drawBtn.innerText = "Draw Wall"; drawBtn.style.flex="1";
const hInput = document.createElement("input"); hInput.type="number"; hInput.value=state.wallHeight; hInput.title="Wall Height";
hInput.onchange = e => state.wallHeight = parseFloat(e.target.value);
wRow.append(drawBtn, hInput); p2.appendChild(wRow);

const gRow = document.createElement("div"); gRow.className = "row"; gRow.style.marginTop="8px";
gRow.innerHTML = `<span style="font-size:11px; opacity:0.8">Grid Size:</span>`;
const gInput = document.createElement("input"); gInput.type="number"; gInput.value=state.gridSize;
gInput.onchange = e => { updateGrid(parseFloat(e.target.value)); };
gRow.appendChild(gInput); p2.appendChild(gRow);

const sRow = document.createElement("div"); sRow.className = "row"; sRow.style.marginTop="8px";
const sLabel = document.createElement("label"); sLabel.className = "toggle-switch";
const sCheck = document.createElement("input"); sCheck.type = "checkbox"; sCheck.className = "toggle-checkbox";
sCheck.onchange = (e) => { state.transparentWalls = e.target.checked; };
sLabel.append(sCheck, "Smart Transparency");
sRow.appendChild(sLabel); p2.appendChild(sRow);

// Floor Plan Import UI
const planRow = document.createElement("div"); planRow.className = "row"; planRow.style.marginTop="8px";
const planBtn = document.createElement("button"); planBtn.innerText = "Import Floor Plan"; planBtn.style.flex="1";
const planInput = document.createElement("input"); planInput.type="file"; planInput.accept="image/*"; planInput.style.display="none";
planRow.appendChild(planBtn); p2.appendChild(planRow);

planBtn.onclick = () => planInput.click();
planInput.onchange = (e) => {
    if(e.target.files && e.target.files[0]) {
        loadFloorPlan(e.target.files[0]);
    }
};

drawBtn.onclick = () => {
    state.placingWall = !state.placingWall;
    drawBtn.innerText = state.placingWall ? "Stop Drawing" : "Draw Wall";
    drawBtn.classList.toggle("active", state.placingWall);
    
    document.body.style.cursor = state.placingWall ? "crosshair" : "default";
    toggleFloorPlan(state.placingWall);

    state.walls.forEach(w => {
        w.children[0].visible = state.placingWall;
        w.material = state.placingWall ? new THREE.MeshBasicMaterial({color:0x999999}) : new THREE.MeshStandardMaterial({color:0xeeeeee});
        if(!state.placingWall) applyMaterial(w, w.userData.texture!=='Plain'?'texture':'color', w.userData.texture!=='Plain'?w.userData.texture:'#'+w.userData.color);
    });
    if(state.placingWall) { 
        setActiveCamera(orthoCamera); controls.enableRotate = false; controls.reset(); clearSelection(); 
    } else { 
        controls.enableRotate = true; state.lastPoint = null; tip.style.display="none"; hidePreview(); 
    }
};
p2.insertAdjacentHTML('beforeend', `<div class="row" style="font-size:11px; margin-top:8px; justify-content:space-between; opacity:0.7"><span>Length</span><span id="ui-len" style="color:var(--accent);font-weight:bold">-</span></div>`);
toolbar.appendChild(p2);

// 3. Environment
const pEnv = document.createElement("div"); pEnv.className = "panel-box";
pEnv.innerHTML = `<div class="section-title">Environment</div>`;
const intRow = document.createElement("div"); intRow.className = "row";
intRow.innerHTML = `<span style="font-size:11px">Intensity</span>`;
const intSlide = document.createElement("input"); intSlide.type = "range"; intSlide.min="0"; intSlide.max="2"; intSlide.step="0.1"; intSlide.value=state.sunIntensity;
intSlide.oninput = e => { state.sunIntensity = parseFloat(e.target.value); updateSun(); };
intRow.appendChild(intSlide); pEnv.appendChild(intRow);
const rotRow = document.createElement("div"); rotRow.className = "row";
rotRow.innerHTML = `<span style="font-size:11px">Rotation</span>`;
const rotSlide = document.createElement("input"); rotSlide.type = "range"; rotSlide.min="0"; rotSlide.max="6.28"; rotSlide.step="0.1"; rotSlide.value=state.sunRotation;
rotSlide.oninput = e => { state.sunRotation = parseFloat(e.target.value); updateSun(); };
rotRow.appendChild(rotSlide); pEnv.appendChild(rotRow);
toolbar.appendChild(pEnv);

// 4. Appearance
const p3 = document.createElement("div"); p3.className = "panel-box";
p3.innerHTML = `<div class="section-title">Appearance</div>`;
const cRow = document.createElement("div"); cRow.className = "row"; cRow.style.marginBottom="8px";
const cInput = document.createElement("input"); cInput.type="color"; cInput.id="colInput"; cInput.value="#eeeeee";

cInput.oninput = e => { 
    if(state.selection.length > 0) {
        state.selection.forEach(obj => {
            if (state.walls.includes(obj) || state.floors.includes(obj)) {
                applyMaterial(obj, 'color', e.target.value); 
            }
        });
        markDirty(); 
    }
};
cInput.onchange = () => saveState();
cRow.innerHTML = `<span style="font-size:11px">Paint/Tint:</span>`; cRow.appendChild(cInput); p3.appendChild(cRow);

// Expanding Texture Dropdown
const txContainer = document.createElement("div"); txContainer.className = "dropdown-container";
const txBtn = document.createElement("button"); txBtn.className = "dropdown-btn"; txBtn.innerHTML = `<span>Select Texture</span> ${icons.chevron}`; txBtn.style.marginBottom="8px";
const txContent = document.createElement("div"); txContent.className = "dropdown-content";
txBtn.onclick = () => { txContent.classList.toggle("open"); };

Object.keys(wallTextures).forEach(key => {
    const item = document.createElement("div"); item.className = "furn-item"; 
    item.innerHTML = `<span>${key}</span>`;
    
    if (key !== 'Plain') {
        const url = textureURLs[key];
        if (url) {
            item.style.backgroundImage = `url(${url})`;
            item.style.backgroundColor = '#555';
        }
    } else {
        item.style.backgroundColor = '#888';
    }

    item.onclick = () => { 
        if(state.selection.length > 0) { 
            state.selection.forEach(obj => {
                if (state.walls.includes(obj) || state.floors.includes(obj)) {
                    applyMaterial(obj, 'texture', key); 
                }
            });
            markDirty(); 
            saveState(); 
        }
        txContent.classList.remove('open');
    };
    txContent.appendChild(item);
});
txContainer.append(txBtn, txContent);
p3.appendChild(txContainer);

// Mapping Slider
const scRow = document.createElement("div"); scRow.className = "row";
const scSlide = document.createElement("input"); scSlide.type = "range"; scSlide.id = "scaleSlide";
scSlide.min = "0.1"; scSlide.max = "3.0"; scSlide.step = "0.1"; scSlide.value = "0.2";
const scVal = document.createElement("span"); scVal.id = "scaleVal"; scVal.innerText = "0.2x";

scSlide.oninput = (e) => { 
    scVal.innerText = e.target.value + 'x';
    if(state.selection.length > 0) { 
        state.selection.forEach(obj => {
            if (state.walls.includes(obj) || state.floors.includes(obj)) {
                applyMaterial(obj, 'scale', e.target.value); 
            }
        });
        markDirty(); 
    }
};
scSlide.onchange = () => saveState();

scRow.innerHTML = `<span style="font-size:11px">Mapping:</span>`; 
scRow.append(scSlide, scVal); 
p3.appendChild(scRow);
toolbar.appendChild(p3);

// 5. Furniture
const p5 = document.createElement("div"); p5.className = "panel-box";
p5.innerHTML = `<div class="section-title">Furniture</div>`;
const furnContainer = document.createElement("div"); furnContainer.className = "dropdown-container"; 
const dropBtn = document.createElement("button"); dropBtn.className = "dropdown-btn"; 
dropBtn.innerHTML = `<span>Open Library</span> ${icons.chevron}`; 
furnContainer.appendChild(dropBtn);
const dropContent = document.createElement("div"); dropContent.className = "dropdown-content"; 
furnContainer.appendChild(dropContent);
dropBtn.onclick = () => { dropContent.classList.toggle("open"); };

// Hidden Renderer for Furniture Thumbnails
const thumbW = 128, thumbH = 128;
const tr = new THREE.WebGLRenderer({ antialias: true, alpha: true }); tr.setSize(thumbW, thumbH);
const ts = new THREE.Scene(); const tc = new THREE.PerspectiveCamera(45, 1, 0.1, 10); tc.position.set(2, 2, 3); tc.lookAt(0, 0.5, 0);
ts.add(new THREE.DirectionalLight(0xffffff, 2)); ts.add(new THREE.AmbientLight(0xffffff, 1));

["sofa","chair","cupboard","bed","tv","lamp","toilet","basin","sidetable","sofa_2", "window","kitchen_1","kitchen_2","kitchen_3","kitchen_4"].forEach(name => {
  const btn = document.createElement("div"); btn.className = "furn-item";
  btn.innerHTML = `<span>${name}</span>`;
  btn.onclick = () => { loadFurniture(name); dropContent.classList.remove('open'); }; 
  dropContent.appendChild(btn);
  
  loader.load(`./public/models/${name}.glb`, gltf => {
    const model = gltf.scene.clone(); const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z);
    model.scale.setScalar(2/maxDim); model.position.set(0,-0.5,0);
    ts.children = ts.children.slice(0,2); ts.add(model); 
    tr.render(ts, tc); btn.style.backgroundImage = `url(${tr.domElement.toDataURL()})`;
  });
});
p5.appendChild(furnContainer); toolbar.appendChild(p5);

// 6. Project
const p4 = document.createElement("div"); p4.className = "panel-box";
const titleDiv = document.createElement("div"); titleDiv.className = "section-title"; titleDiv.innerText = "Project";
const selBtn = document.createElement("button"); selBtn.innerText = "Select All"; selBtn.style.fontSize="10px"; selBtn.style.padding="2px 6px"; selBtn.onclick = selectAll;
titleDiv.appendChild(selBtn); p4.appendChild(titleDiv);

const acRow = document.createElement("div"); acRow.className = "grid-3";
const uBtn = document.createElement("button"); uBtn.id="undoBtn"; uBtn.innerHTML = `${icons.undo} Undo`; uBtn.onclick = undo;
const rBtn = document.createElement("button"); rBtn.id="redoBtn"; rBtn.innerHTML = `${icons.redo} Redo`; rBtn.onclick = redo;
const dBtn = document.createElement("button"); dBtn.className = "danger"; dBtn.innerHTML = `${icons.trash} Del`; dBtn.onclick = deleteSelected;
const sBtn = document.createElement("button"); sBtn.innerHTML = `${icons.save} JSON`; sBtn.onclick = () => {
    const json = getProjectData(); // Use new function for reliable snapshot
    const blob = new Blob([json], {type:"application/json"});
    const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`project-${Date.now()}.json`; a.click();
};

const lBtn = document.createElement("button"); lBtn.innerHTML = `${icons.load} Load`;
const lInp = document.createElement("input"); lInp.type="file"; lInp.accept=".json"; lInp.style.display="none";
lBtn.onclick = () => {
    lInp.value = ""; // FIX: Reset input so the same file can be reloaded
    lInp.click();
};
lInp.onchange = (e) => { 
    if(e.target.files[0]) {
        const r = new FileReader();
        r.onload = (ev) => loadProjectData(ev.target.result);
        r.readAsText(e.target.files[0]);
    }
};

acRow.append(uBtn, rBtn, dBtn, sBtn, lBtn);
p4.appendChild(acRow); toolbar.appendChild(p4);

// Initial State Save
saveState(); 

setupEvents();
window.addEventListener('resize', handleResize);
function animate() { 
    requestAnimationFrame(animate); 
    checkTransparentWalls(); 
    controls.update(); 
    renderer.render(scene, activeCamera); 
}
animate();