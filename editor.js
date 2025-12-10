// editor.js (refactored + UI upgrade + optimizations + requested changes)
// Based on your original editor.js + UI template. :contentReference[oaicite:3]{index=3}
import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { TransformControls } from "jsm/controls/TransformControls.js";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";

// === Basic Setup ==========================================================
const w = window.innerWidth;
const h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// === Camera: top-down-ish view ============================================
const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
camera.position.set(0, 30, 0);
camera.lookAt(0, 0, 0);
camera.rotation.x = -Math.PI / 2;
camera.zoom = 1.5;
camera.updateProjectionMatrix();

// === Controls =============================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.09;

// === Lighting =============================================================
function setupLighting() {
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(10, 20, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.near = 1;
  dirLight.shadow.camera.far = 100;
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  scene.add(dirLight);
}
setupLighting();

// === Grid & Floor ========================================================
const gridSize = 30;
scene.add(new THREE.GridHelper(gridSize, gridSize));
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(gridSize, gridSize),
  new THREE.MeshStandardMaterial({ color: 0x808080 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.position.y = -0.05;
scene.add(floor);

// === State ================================================================
let walls = [], wallLabels = []; // walls[] stores wall meshes
let furniture = [];
let selectable = []; // optimized list for raycasting (walls + furniture)
let lastPoint = null, placingWall = false;
let selectedWall = null, selectedFurniture = null;
let outlineGroup = null;
let wallHeight = 3, gridSnap = 0.5;

// Dirty tracking for unsaved changes
let dirty = false;
const origTitle = document.title || "archviz.3d";

function markDirty(flag = true) {
  dirty = !!flag;
  document.title = dirty ? `* ${origTitle}` : origTitle;
}
function clearDirty() { markDirty(false); }

// === Reusable utilities ==================================================
const snap = {
  pos: v => Math.round(v / gridSnap) * gridSnap,
  rot: r => Math.round(r / (Math.PI / 12)) * (Math.PI / 12),
  deg15: r => {
    const snapStep = THREE.MathUtils.degToRad(15);
    return Math.round(r / snapStep) * snapStep;
  }
};

// === Raycaster & Mouse ===================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// === Preview Line ========================================================
const previewLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xffff00 })
);
scene.add(previewLine);
previewLine.visible = false;

// === Transform Controls ==================================================
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setSize(0.8);
transformControls.addEventListener("dragging-changed", e => controls.enabled = !e.value);
transformControls.addEventListener("objectChange", () => {
  if (selectedWall) snapWallTransform();
  if (selectedFurniture) snapFurnitureRotation();
  markDirty(true);
});
scene.add(transformControls);

// === Outline material (reused) ===========================================
const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffa500 });

// === Inject Cute Button CSS (drop-in) ===================================
(function injectButtonCSS() {
  const css = `
    .arch-toolbar {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border-radius: 12px;
      background: rgba(10,10,10,0.45);
      backdrop-filter: blur(6px);
      border: 1px solid rgba(255,255,255,0.04);
      z-index: 10;
    }
    .arch-btn {
      padding: 10px 14px;
      border-radius: 12px;
      background: rgba(255,255,255,0.06);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.14);
      font-family: Inter, Arial, sans-serif;
      font-size: 0.92rem;
      cursor: pointer;
      transition: transform .16s ease, box-shadow .16s ease, background .12s ease;
      outline: none;
    }
    .arch-btn:hover { transform: translateY(-3px); background: rgba(255,255,255,0.16); box-shadow: 0 8px 18px rgba(0,0,0,0.45); }
    .arch-btn.active { background: #ffb13d; color: #000; border-color: #ffd89a; box-shadow: 0 6px 18px #ffa50055; }
    .arch-select, .arch-input { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); color: #fff; }
    /* requested: solid black background for dropdown so item text is readable */
    .arch-select { background: #000 !important; color: #fff !important; }
    .arch-input { background: rgba(255,255,255,0.03); }
    .arch-row { display:flex; gap:8px; align-items:center; }
  `;
  const s = document.createElement("style");
  s.innerText = css;
  document.head.appendChild(s);
})();

// === Toolbar UI ==========================================================
const toolbar = document.createElement("div");
toolbar.className = "arch-toolbar";
document.body.appendChild(toolbar);

function makeToolButton(label, mode) {
  const btn = document.createElement("button");
  btn.innerText = label;
  btn.className = "arch-btn";
  btn.onclick = () => {
    if (mode) transformControls.setMode(mode);
    highlightActive(btn);
  };
  toolbar.appendChild(btn);
  return btn;
}

let activeToolBtn = null;
function highlightActive(btn) {
  const all = toolbar.querySelectorAll(".arch-btn");
  all.forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  activeToolBtn = btn;
}

// --- Primary tool buttons
const moveBtn = makeToolButton("Move", "translate");
const rotateBtn = makeToolButton("Rotate", "rotate");
const scaleBtn = makeToolButton("Scale", "scale");
highlightActive(moveBtn);

// --- Wall tools row
const row1 = document.createElement("div"); row1.className = "arch-row";
const wallButton = document.createElement("button");
wallButton.className = "arch-btn";
wallButton.innerText = "Place Wall";
wallButton.onclick = () => toggleWallPlacement();
row1.appendChild(wallButton);
toolbar.appendChild(row1);

// height input
const heightInput = document.createElement("input");
heightInput.type = "number";
heightInput.min = "0.1";
heightInput.step = "0.1";
heightInput.value = wallHeight;
heightInput.className = "arch-input";
heightInput.style.width = "84px";
heightInput.addEventListener("change", () => wallHeight = parseFloat(heightInput.value) || wallHeight);
row1.appendChild(heightInput);

// --- Delete & Export
const deleteBtn = makeToolButton("Delete", null);
deleteBtn.onclick = () => { deleteSelected(); markDirty(true); };

const exportBtn = makeToolButton("Export JSON", null);
exportBtn.onclick = () => { exportToJSON(); clearDirty(); };

// --- Furniture selector & add
const modelSelector = document.createElement("select");
modelSelector.className = "arch-select";
modelSelector.style.width = "140px";
["sofa","sofa_2","chair","cupboard","bed","tv","lamp","toilet","basin","sidetable","toilet_2"]
  .forEach(name => modelSelector.appendChild(new Option(name, name)));
toolbar.appendChild(modelSelector);

const addFurnitureBtn = makeToolButton("Add Furniture", null);
addFurnitureBtn.onclick = () => { addFurniture(modelSelector.value); markDirty(true); };

// === Export function =====================================================
function exportToJSON() {
  const data = [];

  walls.forEach(w => {
    const length = w.userData.length || (w.geometry && w.geometry.parameters && w.geometry.parameters.width) || 1;
    const half = length / 2;
    const angle = w.rotation.y;
    const start = [
      w.position.x - Math.cos(angle) * half,
      w.position.z - Math.sin(angle) * half
    ];
    const end = [
      w.position.x + Math.cos(angle) * half,
      w.position.z + Math.sin(angle) * half
    ];

    data.push({
      type: "wall",
      start,
      end,
      height: w.scale.y || 1
    });
  });

  furniture.forEach(f => {
    const modelName = f.userData.model || f.name || "custom";
    data.push({
      type: "furniture",
      model: modelName,
      pos: [f.position.x, f.position.y, f.position.z],
      rot: [f.rotation.x, f.rotation.y, f.rotation.z],
      scale: [f.scale.x, f.scale.y, f.scale.z]
    });
  });

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my_design.json";
  a.click();
}

// === GLTF Loader ========================================================
const loader = new GLTFLoader();

// helper: create text sprite (for labels) ---------------------------------
function createTextSprite(message) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '28px Arial';
  ctx.fillStyle = 'white';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, 8, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(2.2, 0.6, 1);
  return sprite;
}

// helper: show outline ---------------------------------------------------
function showOutline(obj) {
  if (outlineGroup) { scene.remove(outlineGroup); outlineGroup = null; }
  outlineGroup = new THREE.Group();
  obj.traverse(child => {
    if (child.isMesh) {
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(child.geometry),
        outlineMaterial
      );
      wire.applyMatrix4(child.matrixWorld);
      outlineGroup.add(wire);
    }
  });
  scene.add(outlineGroup);
}

// snap transforms ---------------------------------------------------------
function snapWallTransform() {
  if (!selectedWall) return;
  selectedWall.position.x = snap.pos(selectedWall.position.x);
  selectedWall.position.z = snap.pos(selectedWall.position.z);
  selectedWall.rotation.y = snap.rot(selectedWall.rotation.y);
}
function snapFurnitureRotation() {
  if (!selectedFurniture) return;
  selectedFurniture.rotation.y = snap.deg15(selectedFurniture.rotation.y);
}

// add furniture -----------------------------------------------------------
function addFurniture(name) {
  loader.load(`./public/models/${name}.glb`, gltf => {
    const model = gltf.scene;
    model.userData.model = name;
    model.name = name;
    model.traverse(c => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });
    model.position.set(0, 0, 0);
    scene.add(model);
    furniture.push(model);
    selectable.push(model);
    selectedFurniture = model;
    transformControls.attach(model);
    highlightActive(activeToolBtn);
    showOutline(model);
  }, undefined, err => console.error("Model load err:", err));
}

// === Selection helpers ===================================================
function findWallFromHit(object) {
  while (object && !walls.includes(object)) object = object.parent;
  return object && walls.includes(object) ? object : null;
}

function clearSelection() {
  transformControls.detach();
  selectedWall = selectedFurniture = null;
  if (outlineGroup) { scene.remove(outlineGroup); outlineGroup = null; }
}

// delete selected object --------------------------------------------------
function deleteSelected() {
  if (selectedWall) {
    const i = walls.indexOf(selectedWall);
    if (i > -1) {
      if (selectedWall.userData._label) selectedWall.remove(selectedWall.userData._label);
      scene.remove(selectedWall);
      walls.splice(i, 1);
      const idx = selectable.indexOf(selectedWall);
      if (idx > -1) selectable.splice(idx, 1);
      markDirty(true);
    }
  } else if (selectedFurniture) {
    const i = furniture.indexOf(selectedFurniture);
    if (i > -1) {
      scene.remove(selectedFurniture);
      furniture.splice(i, 1);
      const idx = selectable.indexOf(selectedFurniture);
      if (idx > -1) selectable.splice(idx, 1);
      markDirty(true);
    }
  }
  clearSelection();
}

// === Wall placement ======================================================
// toggle only flips mode; DO NOT set any start point on button click.
// start point is created when user clicks the GRID (floor).
function toggleWallPlacement() {
  placingWall = !placingWall;
  wallButton.innerText = placingWall ? "Stop Wall" : "Place Wall";
  if (!placingWall) {
    lastPoint = null;
    previewLine.visible = false;
  }
}

// Helper: check that click target is NOT part of the UI toolbar
function clickOnUI(e) {
  return e.target && (e.target.closest && e.target.closest('.arch-toolbar'));
}

// Handle clicks ===========================================================
window.addEventListener("click", e => handleClick(e));
window.addEventListener("mousemove", e => handleMouseMove(e));
window.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    placingWall = false;
    wallButton.innerText = "Place Wall";
    clearSelection();
  }
});

function handleClick(e) {
  // ignore clicks that originate from the toolbar/UI (prevents the toolbar click from starting a wall)
  if (clickOnUI(e)) {
    // still allow toggling the button (button's onclick will handle it)
    return;
  }

  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const floorHits = raycaster.intersectObject(floor);
  const hits = raycaster.intersectObjects(selectable, true);

  // selection mode
  if (!placingWall) {
    if (hits.length) {
      const obj = hits[0].object;
      const wallHit = findWallFromHit(obj);
      selectedWall = wallHit;
      selectedFurniture = selectedWall ? null : (function findRoot(o) { while (o && !furniture.includes(o)) o = o.parent; return o && furniture.includes(o) ? o : null; })(obj);
      const target = selectedWall || selectedFurniture;
      if (target) {
        transformControls.attach(target);
        highlightActive(activeToolBtn);
        showOutline(target);
      } else clearSelection();
    } else clearSelection();
    return;
  }

  // placing a wall - only set start point when clicking the grid
  if (floorHits.length) {
    const point = floorHits[0].point.clone();
    point.set(snap.pos(point.x), 0, snap.pos(point.z));

    if (lastPoint) {
      // compute wall geometry
      const dx = point.x - lastPoint.x;
      const dz = point.z - lastPoint.z;
      const length = Math.sqrt(dx*dx + dz*dz) || 0.01;
      const angle = Math.atan2(dz, dx);

      const wallGeo = new THREE.BoxGeometry(length, wallHeight, 0.1);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set((lastPoint.x + point.x)/2, wallHeight/2, (lastPoint.z + point.z)/2);
      wall.rotation.y = snap.rot(angle);
      wall.castShadow = wall.receiveShadow = true;
      wall.userData.length = length;

      // label as child (so it doesn't need per-frame updates)
      const label = createTextSprite(`${length.toFixed(2)}m`);
      label.position.set(0, wallHeight / 2 + 0.2, 0);
      label.renderOrder = 999;
      wall.add(label);
      wall.userData._label = label;

      scene.add(wall);
      walls.push(wall);
      selectable.push(wall);

      lastPoint = null;
      previewLine.visible = false;
      markDirty(true);
    } else {
      // set the first point only when user clicks the grid
      lastPoint = point;
    }
  }
}

function handleMouseMove(e) {
  if (!placingWall || !lastPoint) return;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(floor);
  if (hits.length) {
    const p = hits[0].point.clone();
    p.set(snap.pos(p.x), 0, snap.pos(p.z));
    previewLine.geometry.setFromPoints([lastPoint, p]);
    previewLine.visible = true;
  } else {
    previewLine.visible = false;
  }
}

// === Animation Loop ======================================================
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// === Templates loader ====================================================
async function loadTemplates() {
  try {
    const selectedTemplate = localStorage.getItem("selectedTemplate");

    if (selectedTemplate === "custom") {
      const data = JSON.parse(localStorage.getItem("customTemplate") || "[]");
      loadTemplateData(data);
      clearDirty();
      return;
    }

    const response = await fetch("./public/templates.json");
    const templates = await response.json();

    if (selectedTemplate && templates[selectedTemplate]) {
      loadTemplateData(templates[selectedTemplate]);
      clearDirty();
    }
  } catch (err) {
    console.error("Failed to load template", err);
  }
}

// parse & load template data
function loadTemplateData(data) {
  data.forEach(item => {
    if (item.type === "wall") {
      const dx = item.end[0] - item.start[0];
      const dz = item.end[1] - item.start[1];
      const length = Math.sqrt(dx*dx + dz*dz);
      const angle = Math.atan2(dz, dx);

      const wallGeo = new THREE.BoxGeometry(length, wallHeight, 0.1);
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.position.set((item.start[0] + item.end[0]) / 2, wallHeight / 2, (item.start[1] + item.end[1]) / 2);
      wall.rotation.y = angle;
      wall.castShadow = wall.receiveShadow = true;
      wall.userData.length = length;

      // label
      const label = createTextSprite(`${length.toFixed(2)}m`);
      label.position.set(0, wallHeight / 2 + 0.2, 0);
      wall.add(label);
      wall.userData._label = label;

      scene.add(wall);
      walls.push(wall);
      selectable.push(wall);
    }

    if (item.type === "furniture") {
      const modelName = item.model.toLowerCase();
      loader.load(`./public/models/${modelName}.glb`, gltf => {
        const model = gltf.scene;
        model.userData.model = modelName;
        model.name = modelName;
        model.traverse(c => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });

        model.position.set(...(item.pos || [0,0,0]));
        if (item.rot) model.rotation.set(...item.rot);
        if (item.scale) model.scale.set(...item.scale);

        scene.add(model);
        furniture.push(model);
        selectable.push(model);
      }, undefined, err => console.error("Template model load err:", err));
    }
  });
}

// start
loadTemplates();

// === Warn on unload if unsaved changes ===================================
// modern browsers only allow a generic dialog; returning a non-undefined value triggers it
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    // Chrome requires setting returnValue to a non-empty string
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});

// Optional: intercept SPA-style back navigation where available (history API)
// If you want to add a custom confirm (not recommended since browsers handle beforeunload), you could:
// window.addEventListener('popstate', () => { if (dirty && !confirm("You have unsaved changes. Leave?")) history.pushState(null, null, location.href); });

