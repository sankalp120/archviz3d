// editor.js (Refactored: Undo/Redo, Auto-Thumbnails, Grid Layout, Light Rotation)
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

// === Camera ===============================================================
const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
camera.position.set(0, 35, 20);
camera.lookAt(0, 0, 0);

// === Controls =============================================================
const controls = new OrbitControls(camera, renderer.domElement);
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
  dirLight.shadow.bias = -0.0001;
  const d = 30;
  dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);
}
setupLighting();

// === Grid & Floor ========================================================
const gridSize = 30;
const gridHelper = new THREE.GridHelper(gridSize, gridSize, 0x555555, 0x333333);
scene.add(gridHelper);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(gridSize, gridSize),
  new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.position.y = -0.02;
scene.add(floor);

// === State & History ======================================================
let walls = [], furniture = [], selectable = [];
let lastPoint = null, placingWall = false;
let selectedWall = null, selectedFurniture = null;
let outlineGroup = null;
let wallHeight = 3, gridSnap = 0.5;
let isDarkMode = true;
let dirty = false;

// History Stack
const history = [];
let historyStep = -1;
const MAX_HISTORY = 50; // Limit stack size

function markDirty(flag = true) {
  dirty = !!flag;
  document.title = dirty ? `* archviz.3d` : `archviz.3d`;
}

// === Undo/Redo Logic ======================================================
function saveState() {
  // Remove future history if we diverge
  if (historyStep < history.length - 1) {
    history.splice(historyStep + 1);
  }

  // Create Snapshot
  const snapshot = {
    walls: walls.map(w => ({
      pos: [w.position.x, w.position.y, w.position.z],
      rot: w.rotation.y,
      len: w.userData.length,
      texture: w.userData.texture || 'Plain'
    })),
    furniture: furniture.map(f => ({
      model: f.userData.model,
      pos: [f.position.x, f.position.y, f.position.z],
      rot: [f.rotation.x, f.rotation.y, f.rotation.z],
      scale: [f.scale.x, f.scale.y, f.scale.z]
    }))
  };

  history.push(JSON.stringify(snapshot));
  if (history.length > MAX_HISTORY) history.shift();
  else historyStep++;
}

function restoreState(jsonString) {
  if (!jsonString) return;
  const state = JSON.parse(jsonString);

  // 1. Clear Current Scene
  clearSelection();
  walls.forEach(w => scene.remove(w));
  furniture.forEach(f => scene.remove(f));
  walls = []; furniture = []; selectable = [];

  // 2. Rebuild Walls
  state.walls.forEach(data => {
    const geo = new THREE.BoxGeometry(data.len, wallHeight, 0.2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    const w = new THREE.Mesh(geo, mat);
    w.position.set(...data.pos);
    w.rotation.y = data.rot;
    w.castShadow = true; w.receiveShadow = true;
    w.userData.length = data.len;
    if (data.texture) applyTexture(w, data.texture);
    scene.add(w); walls.push(w); selectable.push(w);
  });

  // 3. Rebuild Furniture
  state.furniture.forEach(data => {
    loader.load(`./public/models/${data.model}.glb`, (gltf) => {
      const m = gltf.scene;
      m.userData.model = data.model;
      m.position.set(...data.pos);
      m.rotation.set(...data.rot);
      m.scale.set(...data.scale);
      m.traverse(c => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });
      scene.add(m); furniture.push(m); selectable.push(m);
    });
  });
}

function undo() {
  if (historyStep > 0) {
    historyStep--;
    restoreState(history[historyStep]);
  }
}

function redo() {
  if (historyStep < history.length - 1) {
    historyStep++;
    restoreState(history[historyStep]);
  }
}

// === Loaders ==============================================================
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// === Texture System =======================================================
function createPattern(color, name) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color; ctx.fillRect(0,0,64,64);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(0,0,32,32); ctx.fillRect(32,32,32,32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.name = name; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const wallTextures = {
  'Plain': null,
  'Brick': createPattern('#8d4038', 'Brick'), 
  'Concrete': createPattern('#888888', 'Concrete'),
  'Wood': createPattern('#8b5a2b', 'Wood'),
  'Paper': createPattern('#e0d6b6', 'Paper')
};

function applyTexture(wall, texName) {
  const tex = wallTextures[texName];
  if (!tex) {
    wall.material = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  } else {
    const cloned = tex.clone();
    cloned.repeat.set(wall.userData.length || 1, wallHeight); 
    cloned.needsUpdate = true;
    wall.material = new THREE.MeshStandardMaterial({ map: cloned });
  }
  wall.userData.texture = texName;
}

// === Transform Controls ==================================================
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setSize(0.8);
transformControls.addEventListener("dragging-changed", e => {
  controls.enabled = !e.value;
  // Save state when drag ends
  if (!e.value) {
    markDirty(true);
    saveState();
  }
});
transformControls.addEventListener("objectChange", () => {
  if (selectedWall) snapWall();
  if (selectedFurniture) snapFurn();
});
scene.add(transformControls);

// === UI & CSS ============================================================
(function injectStyles() {
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
    :root { --bg: #1e1e1e; --panel: rgba(30,30,30,0.85); --border: rgba(255,255,255,0.1); --text: #e0e0e0; --accent: #3b82f6; --hover: rgba(255,255,255,0.1); }
    body.light-mode { --bg: #f0f0f0; --panel: rgba(255,255,255,0.9); --border: rgba(0,0,0,0.1); --text: #333; --accent: #2563eb; --hover: rgba(0,0,0,0.05); }
    body { margin:0; font-family:'Inter',sans-serif; overflow:hidden; color:var(--text); }
    .toolbar { position:absolute; top:10px; right:10px; width:280px; max-height:95vh; overflow-y:auto; background:var(--panel); backdrop-filter:blur(10px); border:1px solid var(--border); border-radius:8px; padding:16px; display:flex; flex-direction:column; gap:16px; box-shadow:0 4px 12px rgba(0,0,0,0.2); }
    .section-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; opacity:0.6; font-weight:600; margin-bottom:4px; }
    .row { display:flex; gap:8px; align-items:center; justify-content:space-between; }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    button { background:transparent; border:1px solid var(--border); color:var(--text); padding:8px 12px; border-radius:6px; cursor:pointer; font-size:13px; transition:all 0.2s; display:flex; align-items:center; justify-content:center; gap:6px; }
    button:hover { background:var(--hover); }
    button.active { background:var(--accent); color:white; border-color:var(--accent); }
    input[type=number], select { background:rgba(0,0,0,0.2); border:1px solid var(--border); color:var(--text); padding:6px; border-radius:4px; width:60px; }
    body.light-mode input[type=number] { background:rgba(0,0,0,0.05); }
    input[type=range] { width:100%; accent-color:var(--accent); }
    .thumb-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
    .thumb-btn { aspect-ratio:1; border:1px solid var(--border); border-radius:6px; background-color:rgba(128,128,128,0.1); background-size:80%; background-position:center; background-repeat:no-repeat; cursor:pointer; position:relative; }
    .thumb-btn:hover { border-color:var(--accent); background-color:var(--hover); }
    .thumb-label { position:absolute; bottom:2px; left:0; width:100%; font-size:9px; text-align:center; background:rgba(0,0,0,0.5); color:white; padding:2px 0; }
    .icon { width:16px; height:16px; fill:currentColor; }
  `;
  const s = document.createElement("style");
  s.innerHTML = css; document.head.appendChild(s);
})();

const icons = {
  move: `<svg class="icon" viewBox="0 0 24 24"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2l-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>`,
  rotate: `<svg class="icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
  trash: `<svg class="icon" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  save: `<svg class="icon" viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>`,
  sun: `<svg class="icon" viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z"/></svg>`,
  undo: `<svg class="icon" viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`,
  redo: `<svg class="icon" viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>`
};

// === Thumbnail Generator =================================================
const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
thumbRenderer.setSize(128, 128);
const thumbScene = new THREE.Scene();
const thumbCam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
thumbCam.position.set(2, 2, 3); thumbCam.lookAt(0, 0.5, 0);
const tLight = new THREE.DirectionalLight(0xffffff, 2);
tLight.position.set(2, 5, 2); thumbScene.add(tLight); thumbScene.add(new THREE.AmbientLight(0xffffff, 1));

async function generateThumbnail(modelUrl) {
  return new Promise((resolve) => {
    loader.load(modelUrl, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2 / maxDim;
      model.scale.set(scale, scale, scale); model.position.y = -0.5;
      thumbScene.clear(); thumbScene.add(tLight); thumbScene.add(new THREE.AmbientLight(0xffffff, 1)); thumbScene.add(model);
      thumbRenderer.render(thumbScene, thumbCam);
      resolve(thumbRenderer.domElement.toDataURL());
    }, undefined, () => resolve(null));
  });
}

// === UI Construction =====================================================
const toolbar = document.createElement("div"); toolbar.className = "toolbar"; document.body.appendChild(toolbar);
function addControl(label, element, parent = toolbar) {
  const div = document.createElement("div"); div.style.marginBottom = "8px";
  const lbl = document.createElement("div"); lbl.className = "section-title"; lbl.innerText = label;
  div.appendChild(lbl); div.appendChild(element); parent.appendChild(div);
}

// 1. Transform Tools
const toolRow = document.createElement("div"); toolRow.className = "grid-2";
const moveBtn = document.createElement("button"); moveBtn.innerHTML = `${icons.move} Move`;
moveBtn.onclick = () => { transformControls.setMode("translate"); setActive(moveBtn); };
const rotBtn = document.createElement("button"); rotBtn.innerHTML = `${icons.rotate} Rotate`;
rotBtn.onclick = () => { transformControls.setMode("rotate"); setActive(rotBtn); };
toolRow.appendChild(moveBtn); toolRow.appendChild(rotBtn); addControl("Tools", toolRow);

let activeBtn = null;
function setActive(btn) { [moveBtn, rotBtn].forEach(b => b.classList.remove("active")); if(btn) { btn.classList.add("active"); activeBtn = btn; } }
setActive(moveBtn);

// 2. Wall Tools
const wallRow = document.createElement("div"); wallRow.className = "row";
const drawBtn = document.createElement("button"); drawBtn.innerText = "Draw Wall"; drawBtn.style.flex = "1";
drawBtn.onclick = () => toggleWallMode();
const hInput = document.createElement("input"); hInput.type = "number"; hInput.value = wallHeight;
hInput.onchange = e => wallHeight = parseFloat(e.target.value);
wallRow.appendChild(drawBtn); wallRow.appendChild(hInput); addControl("Wall Construction", wallRow);

// 3. Textures
const texRow = document.createElement("div"); texRow.className = "row";
const texSelect = document.createElement("select"); texSelect.style.width = "100%";
Object.keys(wallTextures).forEach(k => { const opt = document.createElement("option"); opt.value = k; opt.innerText = k; texSelect.appendChild(opt); });
texSelect.onchange = () => { if (selectedWall) { applyTexture(selectedWall, texSelect.value); markDirty(); saveState(); } };
texRow.appendChild(texSelect); addControl("Wall Texture", texRow);

// 4. Furniture
const thumbContainer = document.createElement("div"); thumbContainer.className = "thumb-grid"; addControl("Furniture", thumbContainer);
const furnitureList = ["sofa","chair","cupboard","bed","tv","lamp","toilet","basin","sidetable"];
furnitureList.forEach(async (name) => {
  const btn = document.createElement("div"); btn.className = "thumb-btn";
  const lbl = document.createElement("div"); lbl.className = "thumb-label"; lbl.innerText = name; btn.appendChild(lbl);
  btn.onclick = () => loadFurniture(name); thumbContainer.appendChild(btn);
  const imgData = await generateThumbnail(`./public/models/${name}.glb`);
  if(imgData) btn.style.backgroundImage = `url(${imgData})`;
});

// 5. Environment
const envDiv = document.createElement("div");
const rotDiv = document.createElement("div"); rotDiv.className = "row";
rotDiv.innerHTML = `<span style="font-size:11px">Sun Dir</span>`;
const rotSlide = document.createElement("input"); rotSlide.type = "range"; rotSlide.min = 0; rotSlide.max = 6.28; rotSlide.step = 0.1;
rotSlide.oninput = (e) => { const a = parseFloat(e.target.value); dirLight.position.x = Math.sin(a)*lightDistance; dirLight.position.z = Math.cos(a)*lightDistance; dirLight.lookAt(0,0,0); };
rotDiv.appendChild(rotSlide); envDiv.appendChild(rotDiv);
const intDiv = document.createElement("div"); intDiv.className = "row";
intDiv.innerHTML = `<span style="font-size:11px">Intensity</span>`;
const intSlide = document.createElement("input"); intSlide.type = "range"; intSlide.min = 0; intSlide.max = 2; intSlide.step = 0.1; intSlide.value = 1.2;
intSlide.oninput = (e) => dirLight.intensity = parseFloat(e.target.value);
intDiv.appendChild(intSlide); envDiv.appendChild(intDiv);
const toggleRow = document.createElement("div"); toggleRow.className = "row"; toggleRow.style.marginTop = "8px";
const gridBtn = document.createElement("button"); gridBtn.innerText = "Grid"; gridBtn.style.flex = "1";
gridBtn.onclick = () => { gridHelper.visible = !gridHelper.visible; };
const modeBtn = document.createElement("button"); modeBtn.innerHTML = icons.sun; modeBtn.style.flex = "1";
modeBtn.onclick = () => { isDarkMode = !isDarkMode; document.body.classList.toggle("light-mode"); scene.background.set(isDarkMode?0x1a1a1a:0xf0f0f0); floor.material.color.set(isDarkMode?0x222222:0xdddddd); gridHelper.material.color.set(isDarkMode?0x555555:0xaaaaaa); };
toggleRow.appendChild(gridBtn); toggleRow.appendChild(modeBtn); envDiv.appendChild(toggleRow); addControl("Environment", envDiv);

// 6. Project & History
const actionRow = document.createElement("div"); actionRow.className = "row";
const undoBtn = document.createElement("button"); undoBtn.innerHTML = icons.undo; undoBtn.title = "Undo (Ctrl+Z)"; undoBtn.onclick = undo;
const redoBtn = document.createElement("button"); redoBtn.innerHTML = icons.redo; redoBtn.title = "Redo (Ctrl+Y)"; redoBtn.onclick = redo;
const delBtn = document.createElement("button"); delBtn.innerHTML = icons.trash; delBtn.style.color = "#ff6b6b"; delBtn.onclick = deleteSelection;
const saveBtn = document.createElement("button"); saveBtn.innerHTML = icons.save; saveBtn.onclick = exportToJSON;
actionRow.appendChild(undoBtn); actionRow.appendChild(redoBtn); actionRow.appendChild(delBtn); actionRow.appendChild(saveBtn);
addControl("Project", actionRow);

// === Logic: Wall Building =================================================
const previewLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]), new THREE.LineBasicMaterial({color:0x3b82f6}));
scene.add(previewLine); previewLine.visible = false;
function toggleWallMode() { placingWall = !placingWall; drawBtn.innerText = placingWall ? "Stop" : "Draw Wall"; drawBtn.classList.toggle("active", placingWall); if (!placingWall) { lastPoint = null; previewLine.visible = false; } }

// === Logic: Interactions ==================================================
const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();
function snap(val) { return Math.round(val/gridSnap)*gridSnap; }

window.addEventListener("click", onClick);
window.addEventListener("mousemove", onMove);
window.addEventListener("keydown", e => {
  if (e.key === "Escape") { placingWall = false; drawBtn.innerText = "Draw Wall"; clearSelection(); }
  if (e.key === "Delete") deleteSelection();
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
});

function onClick(e) {
  if (e.target.closest('.toolbar')) return;
  mouse.x = (e.clientX/w)*2-1; mouse.y = -(e.clientY/h)*2+1; raycaster.setFromCamera(mouse, camera);

  if (!placingWall) {
    const hits = raycaster.intersectObjects([...walls, ...furniture], true);
    if (hits.length > 0) {
      let obj = hits[0].object; while (obj.parent && obj.parent !== scene) obj = obj.parent;
      if (walls.includes(obj)) { selectedWall = obj; selectedFurniture = null; }
      else if (furniture.includes(obj)) { selectedFurniture = obj; selectedWall = null; }
      transformControls.attach(obj); showOutline(obj);
    } else clearSelection();
  } else {
    const hits = raycaster.intersectObject(floor);
    if (hits.length > 0) {
      const pt = hits[0].point; pt.x = snap(pt.x); pt.z = snap(pt.z); pt.y = 0;
      if (lastPoint) { buildWall(lastPoint, pt); lastPoint = null; previewLine.visible = false; markDirty(); saveState(); }
      else lastPoint = pt;
    }
  }
}

function onMove(e) {
  if (!placingWall || !lastPoint) return;
  mouse.x = (e.clientX/w)*2-1; mouse.y = -(e.clientY/h)*2+1; raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(floor);
  if (hits.length > 0) {
    const pt = hits[0].point; pt.x = snap(pt.x); pt.z = snap(pt.z); pt.y = 0;
    previewLine.geometry.setFromPoints([lastPoint, pt]); previewLine.visible = true;
  }
}

function buildWall(p1, p2) {
  const dx = p2.x-p1.x, dz = p2.z-p1.z; const len = Math.sqrt(dx*dx+dz*dz); if(len<0.1) return;
  const angle = Math.atan2(dz, dx);
  const geo = new THREE.BoxGeometry(len, wallHeight, 0.2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
  const wall = new THREE.Mesh(geo, mat);
  wall.position.set((p1.x+p2.x)/2, wallHeight/2, (p1.z+p2.z)/2);
  wall.rotation.y = -angle; wall.castShadow = wall.receiveShadow = true; wall.userData.length = len;
  scene.add(wall); walls.push(wall); selectable.push(wall);
}

function loadFurniture(name) {
  loader.load(`./public/models/${name}.glb`, (gltf) => {
    const model = gltf.scene;
    model.userData.model = name;
    model.traverse(c => { if(c.isMesh) c.castShadow=c.receiveShadow=true; });
    scene.add(model); furniture.push(model); selectable.push(model);
    selectedFurniture = model; selectedWall = null;
    transformControls.attach(model); showOutline(model);
    markDirty(); saveState();
  });
}

function deleteSelection() {
  if (selectedWall) { scene.remove(selectedWall); walls = walls.filter(w => w !== selectedWall); }
  else if (selectedFurniture) { scene.remove(selectedFurniture); furniture = furniture.filter(f => f !== selectedFurniture); }
  clearSelection(); markDirty(); saveState();
}

function clearSelection() { transformControls.detach(); selectedWall = null; selectedFurniture = null; if(outlineGroup) { scene.remove(outlineGroup); outlineGroup = null; } }
function snapWall() { if(!selectedWall) return; selectedWall.position.x = snap(selectedWall.position.x); selectedWall.position.z = snap(selectedWall.position.z); }
function snapFurn() { if(!selectedFurniture) return; selectedFurniture.rotation.y = Math.round(selectedFurniture.rotation.y/(Math.PI/12))*(Math.PI/12); }
function showOutline(obj) { if(outlineGroup) scene.remove(outlineGroup); outlineGroup = new THREE.Group(); const box = new THREE.BoxHelper(obj, 0x3b82f6); outlineGroup.add(box); scene.add(outlineGroup); }

// === Loop & Export ========================================================
function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }
animate();

function exportToJSON() {
  const data = {
    walls: walls.map(w => ({ pos: [w.position.x,w.position.y,w.position.z], rot: w.rotation.y, len: w.userData.length, texture: w.userData.texture||'Plain' })),
    furniture: furniture.map(f => ({ model: f.userData.model, pos: [f.position.x,f.position.y,f.position.z], rot: [f.rotation.x,f.rotation.y,f.rotation.z], scale: [f.scale.x,f.scale.y,f.scale.z] }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `project-${Date.now()}.json`; a.click(); clearDirty();
}

// === Init ================================================================
async function loadTemplate() {
  saveState(); // Initial state
  const tName = localStorage.getItem("selectedTemplate"); if(!tName) return;
  let data = [];
  if(tName === "custom") { const raw = localStorage.getItem("customTemplate"); if(raw) data = JSON.parse(raw); }
  else { try { const res = await fetch("./public/templates.json"); const json = await res.json(); data = json[tName] || []; } catch(e) {} }
  const items = Array.isArray(data) ? data : [...(data.walls||[]), ...(data.furniture||[])];
  
  // Quick convert template format to simple add calls (avoid full restoreState logic for startup to prevent history bloat)
  items.forEach(item => {
    if(item.type === "wall" || item.len) {
      if(item.start && item.end) buildWall({x:item.start[0],z:item.start[1]}, {x:item.end[0],z:item.end[1]});
      else {
         const geo = new THREE.BoxGeometry(item.len, wallHeight, 0.2); const mat = new THREE.MeshStandardMaterial({color:0xeeeeee});
         const w = new THREE.Mesh(geo, mat); w.position.set(...item.pos); w.rotation.y = item.rot; w.castShadow=true; w.receiveShadow=true; w.userData.length = item.len;
         if(item.texture) applyTexture(w, item.texture); scene.add(w); walls.push(w); selectable.push(w);
      }
    } else if (item.type === "furniture" || item.model) {
      loader.load(`./public/models/${item.model}.glb`, (gltf) => {
        const m = gltf.scene; m.userData.model = item.model; m.position.set(...item.pos);
        if(item.rot) m.rotation.set(...item.rot); if(item.scale) m.scale.set(...item.scale);
        m.traverse(c=>{if(c.isMesh) c.castShadow=c.receiveShadow=true;}); scene.add(m); furniture.push(m); selectable.push(m);
      });
    }
  });
  // Update history with the loaded template
  setTimeout(() => saveState(), 500); // Small delay to let models load
}

loadTemplate();
window.addEventListener("beforeunload", (e) => { if(dirty) e.returnValue = "Unsaved changes"; });