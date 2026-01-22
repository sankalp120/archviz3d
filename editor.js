// editor.js (Final: Pro Drawing Mode, Continuous Walls, Tooltips, Ortho Snap)
import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { TransformControls } from "jsm/controls/TransformControls.js";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";

// === Basic Setup ==========================================================
const w = window.innerWidth;
const h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(w, h);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// === Camera System (Persp + Ortho) ========================================
const aspect = w / h;
const viewSize = 20;

const perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
perspCamera.position.set(0, 35, 20);
perspCamera.lookAt(0, 0, 0);

const orthoCamera = new THREE.OrthographicCamera(
  -viewSize * aspect, viewSize * aspect, 
  viewSize, -viewSize, 
  1, 1000
);
orthoCamera.position.set(0, 40, 0); // Straight Top-Down
orthoCamera.lookAt(0, 0, 0);
orthoCamera.zoom = 0.8; 

let activeCamera = perspCamera;

// === Controls =============================================================
const controls = new OrbitControls(activeCamera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.maxPolarAngle = Math.PI / 2.1;

// === Lighting =============================================================
let hemiLight, dirLight;
const lightDistance = 20;

function setupLighting() {
  hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.bias = -0.0005;
  dirLight.shadow.normalBias = 0.05;
  
  const d = 30;
  dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);
}
setupLighting();

// === Grid & Floor ========================================================
const gridSize = 30;
const gridHelper = new THREE.GridHelper(gridSize, gridSize, 0x888888, 0x444444);
scene.add(gridHelper);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(gridSize, gridSize),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.position.y = 0; 
scene.add(floor);

// === Measurement Tooltip =================================================
const tooltip = document.createElement("div");
Object.assign(tooltip.style, {
  position: "absolute",
  display: "none",
  backgroundColor: "rgba(0,0,0,0.8)",
  color: "#fff",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "12px",
  pointerEvents: "none", // Click through
  whiteSpace: "nowrap",
  transform: "translate(15px, -15px)",
  zIndex: "100"
});
document.body.appendChild(tooltip);

// === State & History ======================================================
let walls = [], furniture = [], selectable = [];
let lastPoint = null, placingWall = false;
let selectedWall = null, selectedFurniture = null;
let wallHeight = 3, gridSnap = 0.5;
let isDarkMode = true;
let dirty = false;

// History Stack
const history = [];
let historyStep = -1;
const MAX_HISTORY = 50;

function markDirty(flag = true) {
  dirty = !!flag;
  document.title = dirty ? `* archviz.3d` : `archviz.3d`;
}

// === Undo/Redo Logic ======================================================
function saveState() {
  if (historyStep < history.length - 1) history.splice(historyStep + 1);
  const snapshot = {
    walls: walls.map(w => ({
      pos: [w.position.x, w.position.y, w.position.z],
      rot: w.rotation.y,
      len: w.userData.length,
      texture: w.userData.texture || 'Plain',
      color: w.material.color.getHexString() 
    })),
    furniture: furniture.map(f => ({
      model: f.userData.model,
      pos: [f.position.x, f.position.y, f.position.z],
      rot: [f.rotation.x, f.rotation.y, f.rotation.z],
      scale: [f.scale.x, f.scale.y, f.scale.z]
    }))
  };
  history.push(JSON.stringify(snapshot));
  if (history.length > MAX_HISTORY) history.shift(); else historyStep++;
}

function restoreState(jsonString) {
  if (!jsonString) return;
  const state = JSON.parse(jsonString);
  clearSelection();
  walls.forEach(w => scene.remove(w));
  furniture.forEach(f => scene.remove(f));
  walls = []; furniture = []; selectable = [];

  state.walls.forEach(data => {
    const geo = new THREE.BoxGeometry(data.len, wallHeight, 0.2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const w = new THREE.Mesh(geo, mat);
    w.position.set(...data.pos); w.rotation.y = data.rot; w.castShadow = true; w.receiveShadow = true;
    w.userData.length = data.len;
    // Fix Y to prevent Z-fighting on load
    w.position.y = (wallHeight/2) - 0.01;
    if (data.texture && data.texture !== 'Plain') applyMaterial(w, 'texture', data.texture);
    else applyMaterial(w, 'color', '#' + (data.color || 'eeeeee'));
    scene.add(w); walls.push(w); selectable.push(w);
  });

  state.furniture.forEach(data => {
    loader.load(`./public/models/${data.model}.glb`, (gltf) => {
      const m = gltf.scene; m.userData.model = data.model;
      m.position.set(...data.pos); m.rotation.set(...data.rot); m.scale.set(...data.scale);
      m.traverse(c => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });
      scene.add(m); furniture.push(m); selectable.push(m);
    });
  });
}

function undo() { if (historyStep > 0) { historyStep--; restoreState(history[historyStep]); } }
function redo() { if (historyStep < history.length - 1) { historyStep++; restoreState(history[historyStep]); } }

// === Loaders & Textures ===================================================
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

function loadTex(path) {
  const tex = textureLoader.load(path);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const wallTextures = {
  'Plain': null,
  'Brick': loadTex('./public/textures/brick.jpg'), 
  'Concrete': loadTex('./public/textures/concrete.jpg'),
  'Wood': loadTex('./public/textures/wood.jpg'),
  'Paper': loadTex('./public/textures/wallpaper.jpg')
};

function applyMaterial(wall, type, value) {
  const mat = wall.material;
  if (type === 'color') {
    mat.map = null; mat.color.set(value); mat.needsUpdate = true; wall.userData.texture = 'Plain';
  } else if (type === 'texture') {
    const tex = wallTextures[value];
    if (tex) {
      const cloned = tex.clone();
      cloned.repeat.set(wall.userData.length || 1, wallHeight);
      cloned.needsUpdate = true; mat.map = cloned; mat.color.set(0xffffff); mat.needsUpdate = true; wall.userData.texture = value;
    }
  }
}

// === Transform Controls ==================================================
const transformControls = new TransformControls(activeCamera, renderer.domElement);
transformControls.setSize(0.8);
transformControls.addEventListener("dragging-changed", e => { controls.enabled = !e.value; if (!e.value) { markDirty(true); saveState(); } });
transformControls.addEventListener("objectChange", () => { if (selectedWall) snapWall(); if (selectedFurniture) snapFurn(); });
scene.add(transformControls);

// === UI CSS ==============================================================
(function injectStyles() {
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    :root { --bg: #1e1e1e; --panel: rgba(30,30,30,0.85); --border: rgba(255,255,255,0.1); --text: #e0e0e0; --accent: #3b82f6; --hover: rgba(255,255,255,0.1); }
    body.light-mode { --bg: #f0f0f0; --panel: rgba(255,255,255,0.9); --border: rgba(0,0,0,0.1); --text: #333; --accent: #2563eb; --hover: rgba(0,0,0,0.05); }
    body { margin:0; font-family:'Inter',sans-serif; overflow:hidden; color:var(--text); }
    .toolbar { position:absolute; top:10px; right:10px; width:280px; max-height:95vh; display:flex; flex-direction:column; gap:12px; }
    .panel-box { background:var(--panel); backdrop-filter:blur(10px); border:1px solid var(--border); border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:12px; box-shadow:0 4px 12px rgba(0,0,0,0.2); }
    .section-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; opacity:0.6; font-weight:600; margin-bottom:4px; }
    .row { display:flex; gap:6px; align-items:center; justify-content:space-between; }
    .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
    .grid-2 { display:grid; grid-template-columns:1fr 2fr; gap:6px; }
    button { background:transparent; border:1px solid var(--border); color:var(--text); padding:8px; border-radius:6px; cursor:pointer; font-size:12px; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px; }
    button:hover { background:var(--hover); }
    button.active { background:var(--accent); color:white; border-color:var(--accent); }
    input[type=number], select { background:rgba(0,0,0,0.2); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; width:60px; }
    body.light-mode input[type=number] { background:rgba(0,0,0,0.05); }
    input[type=color] { -webkit-appearance: none; border: none; width: 100%; height: 32px; padding: 0; background: none; cursor: pointer; }
    input[type=color]::-webkit-color-swatch-wrapper { padding: 0; } input[type=color]::-webkit-color-swatch { border: 1px solid var(--border); border-radius: 4px; }
    input[type=range] { width:100%; accent-color:var(--accent); }
    .dropdown-container { position: relative; width: 100%; } .dropdown-btn { width: 100%; justify-content: space-between; text-align:left; }
    .dropdown-content { display: none; margin-top: 8px; grid-template-columns: repeat(3, 1fr); gap: 8px; max-height: 250px; overflow-y: auto; padding-right: 4px; }
    .dropdown-content.open { display: grid; }
    .dropdown-content::-webkit-scrollbar { width: 6px; } .dropdown-content::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); } .dropdown-content::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); border-radius: 3px; }
    .thumb-btn { aspect-ratio:1; border:1px solid var(--border); border-radius:6px; background-color:rgba(128,128,128,0.1); background-size:80%; background-position:center; background-repeat:no-repeat; cursor:pointer; position:relative; }
    .thumb-btn:hover { border-color:var(--accent); background-color:var(--hover); }
    .thumb-label { position:absolute; bottom:2px; left:0; width:100%; font-size:9px; text-align:center; background:rgba(0,0,0,0.6); color:white; padding:2px 0; border-bottom-left-radius:5px; border-bottom-right-radius:5px;}
    .icon { width:16px; height:16px; fill:currentColor; }
  `;
  const s = document.createElement("style"); s.innerHTML = css; document.head.appendChild(s);
})();

const icons = {
  move: `<svg class="icon" viewBox="0 0 24 24"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>`,
  rotate: `<svg class="icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  scale: `<svg class="icon" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 9h-2V7h-2v5H5v2h3v5h2v-5h5v-2z"/></svg>`,
  trash: `<svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  save: `<svg class="icon" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
  sun: `<svg class="icon" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1z"/></svg>`,
  undo: `<svg class="icon" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`,
  redo: `<svg class="icon" viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>`,
  chevron: `<svg class="icon" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>`
};

// === UI Construction =====================================================
const toolbar = document.createElement("div"); toolbar.className = "toolbar"; document.body.appendChild(toolbar);
const toolsPanel = document.createElement("div"); toolsPanel.className = "panel-box"; toolbar.appendChild(toolsPanel);
function addControl(label, element, parent = toolsPanel) {
  const div = document.createElement("div"); const lbl = document.createElement("div"); lbl.className = "section-title"; lbl.innerText = label;
  div.appendChild(lbl); div.appendChild(element); parent.appendChild(div);
}

// Transform
const toolRow = document.createElement("div"); toolRow.className = "grid-3";
const moveBtn = document.createElement("button"); moveBtn.innerHTML = `${icons.move} Move`;
moveBtn.onclick = () => { transformControls.setMode("translate"); setActive(moveBtn); };
const rotBtn = document.createElement("button"); rotBtn.innerHTML = `${icons.rotate} Rotate`;
rotBtn.onclick = () => { transformControls.setMode("rotate"); setActive(rotBtn); };
const scaleBtn = document.createElement("button"); scaleBtn.innerHTML = `${icons.scale} Scale`;
scaleBtn.onclick = () => { transformControls.setMode("scale"); setActive(scaleBtn); };
toolRow.appendChild(moveBtn); toolRow.appendChild(rotBtn); toolRow.appendChild(scaleBtn);
addControl("Transform Tools", toolRow);
let activeBtn = null; function setActive(btn) { [moveBtn, rotBtn, scaleBtn].forEach(b => b.classList.remove("active")); if(btn) { btn.classList.add("active"); activeBtn = btn; } } setActive(moveBtn);

// Wall Tools
const wallRow = document.createElement("div"); wallRow.className = "row";
const drawBtn = document.createElement("button"); drawBtn.innerText = "Draw Wall"; drawBtn.style.flex = "1";
drawBtn.onclick = () => toggleWallMode();
const hInput = document.createElement("input"); hInput.type = "number"; hInput.value = wallHeight;
hInput.onchange = e => wallHeight = parseFloat(e.target.value);
wallRow.appendChild(drawBtn); wallRow.appendChild(hInput); addControl("Wall Construction", wallRow);

// Wall Appearance
const appRow = document.createElement("div"); appRow.className = "grid-2";
const colInput = document.createElement("input"); colInput.type = "color"; colInput.value = "#eeeeee"; colInput.title = "Wall Color";
colInput.oninput = (e) => { if (selectedWall) { applyMaterial(selectedWall, 'color', e.target.value); markDirty(); saveState(); } };
const texSelect = document.createElement("select"); texSelect.style.width = "100%";
Object.keys(wallTextures).forEach(k => { const opt = document.createElement("option"); opt.value = k; opt.innerText = k; texSelect.appendChild(opt); });
texSelect.onchange = () => { if (selectedWall) { applyMaterial(selectedWall, 'texture', texSelect.value); markDirty(); saveState(); } };
appRow.appendChild(colInput); appRow.appendChild(texSelect); addControl("Wall Appearance", appRow);

// Furniture
const furnContainer = document.createElement("div"); furnContainer.className = "dropdown-container"; addControl("Furniture Library", furnContainer);
const dropBtn = document.createElement("button"); dropBtn.className = "dropdown-btn"; dropBtn.innerHTML = `<span>Select Model</span> ${icons.chevron}`; furnContainer.appendChild(dropBtn);
const dropContent = document.createElement("div"); dropContent.className = "dropdown-content"; furnContainer.appendChild(dropContent);
dropBtn.onclick = () => { const isOpen = dropContent.classList.contains("open"); dropContent.classList.toggle("open"); dropBtn.querySelector("svg").style.transform = isOpen ? "rotate(0deg)" : "rotate(180deg)"; };
const furnitureList = ["sofa","chair","cupboard","bed","tv","lamp","toilet","basin","sidetable"];
const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); thumbRenderer.setSize(128, 128);
const thumbScene = new THREE.Scene(); const thumbCam = new THREE.PerspectiveCamera(50, 1, 0.1, 10); thumbCam.position.set(2, 2, 3); thumbCam.lookAt(0, 0.5, 0);
const tLight = new THREE.DirectionalLight(0xffffff, 2); tLight.position.set(2, 5, 2); thumbScene.add(tLight); thumbScene.add(new THREE.AmbientLight(0xffffff, 1));
furnitureList.forEach(name => {
  const btn = document.createElement("div"); btn.className = "thumb-btn";
  const lbl = document.createElement("div"); lbl.className = "thumb-label"; lbl.innerText = name; btn.appendChild(lbl);
  btn.onclick = () => { loadFurniture(name); markDirty(); }; dropContent.appendChild(btn);
  loader.load(`./public/models/${name}.glb`, gltf => {
    const model = gltf.scene; const box = new THREE.Box3().setFromObject(model); const size = box.getSize(new THREE.Vector3()); const maxDim = Math.max(size.x, size.y, size.z); const scale = 2 / maxDim; model.scale.set(scale, scale, scale); model.position.y = -0.5;
    thumbScene.clear(); thumbScene.add(tLight); thumbScene.add(new THREE.AmbientLight(0xffffff, 1)); thumbScene.add(model);
    thumbRenderer.render(thumbScene, thumbCam); btn.style.backgroundImage = `url(${thumbRenderer.domElement.toDataURL()})`;
  });
});

// Environment
const envPanel = document.createElement("div"); envPanel.className = "panel-box"; toolbar.appendChild(envPanel);
const envDiv = document.createElement("div");
const rotDiv = document.createElement("div"); rotDiv.className = "row"; rotDiv.innerHTML = `<span style="font-size:11px">Sun Angle</span>`;
const rotSlide = document.createElement("input"); rotSlide.type = "range"; rotSlide.min = 0; rotSlide.max = 6.28; rotSlide.step = 0.1;
rotSlide.oninput = (e) => { const a = parseFloat(e.target.value); dirLight.position.x = Math.sin(a)*lightDistance; dirLight.position.z = Math.cos(a)*lightDistance; dirLight.lookAt(0,0,0); };
rotDiv.appendChild(rotSlide); envDiv.appendChild(rotDiv);
const intDiv = document.createElement("div"); intDiv.className = "row"; intDiv.innerHTML = `<span style="font-size:11px">Intensity</span>`;
const intSlide = document.createElement("input"); intSlide.type = "range"; intSlide.min = 0; intSlide.max = 2; intSlide.step = 0.1; intSlide.value = 1.2;
intSlide.oninput = (e) => dirLight.intensity = parseFloat(e.target.value);
intDiv.appendChild(intSlide); envDiv.appendChild(intDiv);
const toggleRow = document.createElement("div"); toggleRow.className = "grid-3"; toggleRow.style.marginTop = "8px";
const gridBtn = document.createElement("button"); gridBtn.innerText = "Grid"; gridBtn.onclick = () => { gridHelper.visible = !gridHelper.visible; };
const modeBtn = document.createElement("button"); modeBtn.innerHTML = icons.sun; modeBtn.onclick = () => toggleMode();
const camBtn = document.createElement("button"); camBtn.innerHTML = `3D`; camBtn.title = "Switch View (Persp/Ortho)"; camBtn.onclick = toggleCamera;
toggleRow.appendChild(gridBtn); toggleRow.appendChild(modeBtn); toggleRow.appendChild(camBtn);
envDiv.appendChild(toggleRow); addControl("Environment", envDiv, envPanel);

// Project Actions
const actionPanel = document.createElement("div"); actionPanel.className = "panel-box"; toolbar.appendChild(actionPanel);
const actionRow = document.createElement("div"); actionRow.className = "row";
const undoBtn = document.createElement("button"); undoBtn.innerHTML = icons.undo; undoBtn.title = "Undo (Ctrl+Z)"; undoBtn.onclick = undo;
const redoBtn = document.createElement("button"); redoBtn.innerHTML = icons.redo; redoBtn.title = "Redo (Ctrl+Y)"; redoBtn.onclick = redo;
const delBtn = document.createElement("button"); delBtn.innerHTML = icons.trash; delBtn.style.color = "#ff6b6b"; delBtn.onclick = deleteSelection;
const saveBtn = document.createElement("button"); saveBtn.innerHTML = icons.save; saveBtn.onclick = exportToJSON;
actionRow.appendChild(undoBtn); actionRow.appendChild(redoBtn); actionRow.appendChild(delBtn); actionRow.appendChild(saveBtn);
addControl("Project", actionRow, actionPanel);

// === Logic: Mode & Camera ================================================
function toggleMode() {
  isDarkMode = !isDarkMode; document.body.classList.toggle("light-mode");
  if (isDarkMode) { scene.background.set(0x1a1a1a); floor.material.color.set(0x222222); gridHelper.material.color.setHex(0x888888); }
  else { scene.background.set(0xf0f0f0); floor.material.color.set(0xdddddd); gridHelper.material.color.setHex(0x555555); }
}

function toggleCamera() {
  const isOrtho = activeCamera === orthoCamera;
  // If drawing, disallow switching back to persp manually to keep state clean, 
  // or allow it but be careful. Here we just switch.
  const newCam = isOrtho ? perspCamera : orthoCamera;
  newCam.position.copy(activeCamera.position); newCam.rotation.copy(activeCamera.rotation);
  activeCamera = newCam; controls.object = activeCamera; transformControls.camera = activeCamera;
  camBtn.innerHTML = isOrtho ? "3D" : "2D";
}

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
  renderer.setSize(w, h);
  perspCamera.aspect = aspect; perspCamera.updateProjectionMatrix();
  orthoCamera.left = -viewSize * aspect; orthoCamera.right = viewSize * aspect; orthoCamera.updateProjectionMatrix();
});

// === Logic: Wall Building =================================================
const previewLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]), new THREE.LineBasicMaterial({color:0x3b82f6}));
scene.add(previewLine); previewLine.visible = false;

function toggleWallMode() { 
  placingWall = !placingWall; 
  drawBtn.innerText = placingWall ? "Stop" : "Draw Wall"; 
  drawBtn.classList.toggle("active", placingWall); 
  
  if (placingWall) {
    // === AUTO SWITCH TO 2D ORTHO ===
    if (activeCamera !== orthoCamera) toggleCamera();
    controls.enableRotate = false; // Lock rotation for drawing
    // Force top down alignment
    orthoCamera.position.set(0, 40, 0);
    orthoCamera.lookAt(0, 0, 0);
    orthoCamera.rotation.z = 0; 
    controls.reset();
  } else {
    // Optional: Switch back or just unlock
    controls.enableRotate = true;
    lastPoint = null; 
    previewLine.visible = false; 
    tooltip.style.display = "none";
  }
}

// === Logic: Interactions ==================================================
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();
function snap(val) { return Math.round(val/gridSnap)*gridSnap; }

window.addEventListener("click", onClick);
window.addEventListener("mousemove", onMove);
window.addEventListener("keydown", e => {
  if (e.target.tagName === 'INPUT') return; 
  if (e.key === "Escape") { 
    if(placingWall) {
      // Cancel current drawing chain but stay in mode? Or exit mode? 
      // Typically exit mode or cancel current chain.
      lastPoint = null; previewLine.visible = false; tooltip.style.display = "none";
      toggleWallMode(); // Exit mode
    } else {
      clearSelection(); 
    }
  }
  if (e.key === "Delete") deleteSelection();
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
});

function onClick(e) {
  if (e.target.closest('.toolbar')) return;
  mouse.x = (e.clientX/w)*2-1; mouse.y = -(e.clientY/h)*2+1; 
  raycaster.setFromCamera(mouse, activeCamera);

  if (!placingWall) {
    const hits = raycaster.intersectObjects([...walls, ...furniture], true);
    if (hits.length > 0) {
      let obj = hits[0].object; while (obj.parent && obj.parent !== scene) obj = obj.parent;
      if (walls.includes(obj)) { selectedWall = obj; selectedFurniture = null; }
      else if (furniture.includes(obj)) { selectedFurniture = obj; selectedWall = null; }
      transformControls.attach(obj); 
      if(selectedWall && selectedWall.material.color) {
         colInput.value = '#' + selectedWall.material.color.getHexString();
         texSelect.value = selectedWall.userData.texture || 'Plain';
      }
    } else clearSelection();
  } else {
    // === WALL DRAWING CLICK ===
    const hits = raycaster.intersectObject(floor);
    if (hits.length > 0) {
      let pt = hits[0].point; 
      pt.y = 0;
      
      // Axis Locking (Shift) logic applied to click as well
      if (lastPoint && e.shiftKey) {
        const dx = Math.abs(pt.x - lastPoint.x);
        const dz = Math.abs(pt.z - lastPoint.z);
        if (dx > dz) pt.z = lastPoint.z; else pt.x = lastPoint.x;
      }
      
      pt.x = snap(pt.x); pt.z = snap(pt.z);

      if (lastPoint) { 
        buildWall(lastPoint, pt); 
        saveState();
        // === CONTINUOUS DRAWING ===
        // Set lastPoint to the end of the new wall to start the next one immediately
        lastPoint = pt; 
      } else { 
        lastPoint = pt; 
      }
    }
  }
}

function onMove(e) {
  if (!placingWall) return;
  
  mouse.x = (e.clientX/w)*2-1; mouse.y = -(e.clientY/h)*2+1; 
  raycaster.setFromCamera(mouse, activeCamera);
  const hits = raycaster.intersectObject(floor);
  
  if (hits.length > 0) {
    let pt = hits[0].point; pt.y = 0;
    
    // === AXIS LOCKING (SHIFT) ===
    if (lastPoint && e.shiftKey) {
       const dx = Math.abs(pt.x - lastPoint.x);
       const dz = Math.abs(pt.z - lastPoint.z);
       if (dx > dz) pt.z = lastPoint.z; else pt.x = lastPoint.x;
    }

    pt.x = snap(pt.x); pt.z = snap(pt.z);
    
    // Update Tooltip
    tooltip.style.left = e.clientX + "px";
    tooltip.style.top = e.clientY + "px";
    
    if(lastPoint) {
      previewLine.geometry.setFromPoints([lastPoint, pt]); 
      previewLine.visible = true;
      
      // Calculate Distance
      const dist = Math.sqrt(Math.pow(pt.x - lastPoint.x, 2) + Math.pow(pt.z - lastPoint.z, 2));
      tooltip.innerText = `${dist.toFixed(2)}m`;
      tooltip.style.display = "block";
    } else {
      tooltip.innerText = "Click to Start";
      tooltip.style.display = "block";
      previewLine.visible = false;
    }
  }
}

function buildWall(p1, p2) {
  const dx = p2.x-p1.x, dz = p2.z-p1.z; const len = Math.sqrt(dx*dx+dz*dz); if(len<0.1) return;
  const angle = Math.atan2(dz, dx);
  const geo = new THREE.BoxGeometry(len, wallHeight, 0.2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  const wall = new THREE.Mesh(geo, mat);
  wall.position.set((p1.x+p2.x)/2, (wallHeight/2) - 0.01, (p1.z+p2.z)/2);
  wall.rotation.y = -angle; wall.castShadow = wall.receiveShadow = true; wall.userData.length = len;
  scene.add(wall); walls.push(wall); selectable.push(wall);
}

function loadFurniture(name) {
  loader.load(`./public/models/${name}.glb`, (gltf) => {
    const model = gltf.scene; model.userData.model = name;
    model.traverse(c => { if(c.isMesh) c.castShadow=c.receiveShadow=true; });
    scene.add(model); furniture.push(model); selectable.push(model);
    selectedFurniture = model; selectedWall = null; transformControls.attach(model);
    markDirty(); saveState();
  });
}

function deleteSelection() {
  if (selectedWall) { scene.remove(selectedWall); walls = walls.filter(w => w !== selectedWall); }
  else if (selectedFurniture) { scene.remove(selectedFurniture); furniture = furniture.filter(f => f !== selectedFurniture); }
  clearSelection(); markDirty(); saveState();
}

function clearSelection() { transformControls.detach(); selectedWall = null; selectedFurniture = null; }
function snapWall() { if(!selectedWall) return; selectedWall.position.x = snap(selectedWall.position.x); selectedWall.position.z = snap(selectedWall.position.z); }
function snapFurn() { if(!selectedFurniture) return; selectedFurniture.rotation.y = Math.round(selectedFurniture.rotation.y/(Math.PI/12))*(Math.PI/12); }

// === Loop & Export ========================================================
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, activeCamera); }
animate();
function exportToJSON() {
  const data = {
    walls: walls.map(w => ({ pos: [w.position.x,w.position.y,w.position.z], rot: w.rotation.y, len: w.userData.length, texture: w.userData.texture||'Plain', color: w.material.color.getHexString() })),
    furniture: furniture.map(f => ({ model: f.userData.model, pos: [f.position.x,f.position.y,f.position.z], rot: [f.rotation.x,f.rotation.y,f.rotation.z], scale: [f.scale.x,f.scale.y,f.scale.z] }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `project-${Date.now()}.json`; a.click(); clearDirty();
}

// === Init ================================================================
async function loadTemplate() {
  saveState();
  const tName = localStorage.getItem("selectedTemplate"); if(!tName) return;
  let data = [];
  if(tName === "custom") { const raw = localStorage.getItem("customTemplate"); if(raw) data = JSON.parse(raw); }
  else { try { const res = await fetch("./public/templates.json"); const json = await res.json(); data = json[tName] || []; } catch(e) {} }
  const items = Array.isArray(data) ? data : [...(data.walls||[]), ...(data.furniture||[])];
  items.forEach(item => {
    if(item.type === "wall" || item.len) {
      if(item.start && item.end) buildWall({x:item.start[0],z:item.start[1]}, {x:item.end[0],z:item.end[1]});
      else {
         const geo = new THREE.BoxGeometry(item.len, wallHeight, 0.2); const mat = new THREE.MeshStandardMaterial({color:0xeeeeee});
         const w = new THREE.Mesh(geo, mat); w.position.set(...item.pos); w.rotation.y = item.rot; w.castShadow=true; w.receiveShadow=true; w.userData.length = item.len; w.position.y = (wallHeight/2) - 0.01;
         if(item.texture && item.texture !== 'Plain') applyMaterial(w, 'texture', item.texture); else if(item.color) applyMaterial(w, 'color', '#' + item.color);
         scene.add(w); walls.push(w); selectable.push(w);
      }
    } else if (item.type === "furniture" || item.model) {
      loader.load(`./public/models/${item.model}.glb`, (gltf) => {
        const m = gltf.scene; m.userData.model = item.model; m.position.set(...item.pos);
        if(item.rot) m.rotation.set(...item.rot); if(item.scale) m.scale.set(...item.scale);
        m.traverse(c=>{if(c.isMesh) c.castShadow=c.receiveShadow=true;}); scene.add(m); furniture.push(m); selectable.push(m);
      });
    }
  });
  setTimeout(() => saveState(), 500);
}
loadTemplate();
window.addEventListener("beforeunload", (e) => { if(dirty) e.returnValue = "Unsaved changes"; });