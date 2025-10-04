import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { TransformControls } from "jsm/controls/TransformControls.js";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";

// === Setup ===
const w = window.innerWidth;
const h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(20, w / h, 0.01, 1000);
camera.position.set(5, 10, 10);
camera.lookAt(0, 0, 0);

// === Controls ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.09;

// === Lighting (Improved for ArchViz) ===
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

// === Grid & Floor ===
const gridSize = 20;
scene.add(new THREE.GridHelper(gridSize, gridSize));
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(gridSize, gridSize),
  new THREE.MeshStandardMaterial({ color: 0x808080 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.position.y = -0.05;
scene.add(floor);

// === State ===
let walls = [], wallLabels = [];
let furniture = [];
let lastPoint = null, placingWall = false;
let selectedWall = null, selectedFurniture = null;
let outlineGroup = null;
let wallHeight = 3, gridSnap = 1;

// === Raycaster ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// === Preview Line ===
const previewLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xffff00 })
);
scene.add(previewLine);
previewLine.visible = false;

// === Transform Controls ===
const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setSize(0.8);
transformControls.addEventListener("dragging-changed", e => controls.enabled = !e.value);
transformControls.addEventListener("objectChange", () => snapWallTransform());
scene.add(transformControls);

// === Toolbar UI ===
const toolbar = document.createElement("div");
Object.assign(toolbar.style, {
  position: "absolute",
  top: "10px",
  right: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  background: "rgba(0,0,0,0.5)",
  padding: "10px",
  borderRadius: "8px"
});
document.body.appendChild(toolbar);

function makeToolButton(label, mode) {
  const btn = document.createElement("button");
  btn.innerText = label;
  Object.assign(btn.style, {
    padding: "8px",
    fontFamily: "Arial",
    border: "none",
    cursor: "pointer",
    background: "#333",
    color: "white"
  });
  btn.onclick = () => {
    if (mode) transformControls.setMode(mode);
    highlightActive(mode);
  };
  toolbar.appendChild(btn);
  return btn;
}

const moveBtn = makeToolButton("Move", "translate");
const rotateBtn = makeToolButton("Rotate", "rotate");
const scaleBtn = makeToolButton("Scale", "scale");
highlightActive("translate");

function highlightActive(mode) {
  [moveBtn, rotateBtn, scaleBtn].forEach(b => b.style.background = "#333");
  if (mode === "translate") moveBtn.style.background = "orange";
  if (mode === "rotate") rotateBtn.style.background = "orange";
  if (mode === "scale") scaleBtn.style.background = "orange";
}

// === Wall Tools ===
const wallButton = makeToolButton("Place Wall", null);
wallButton.onclick = () => toggleWallPlacement();

const heightInput = document.createElement("input");
Object.assign(heightInput, { type: "number", min: "0.1", step: "0.1", value: wallHeight });
Object.assign(heightInput.style, { marginTop: "10px", padding: "5px", fontFamily: "Arial" });
heightInput.addEventListener("change", () => wallHeight = parseFloat(heightInput.value));
toolbar.appendChild(heightInput);

const deleteBtn = makeToolButton("Delete", null);
deleteBtn.onclick = () => deleteSelected();

// === Furniture ===
const loader = new GLTFLoader();
const modelSelector = document.createElement("select");
["sofa","sofa_2","chair","cupboard","bed","tv","lamp","toilet","basin","sidetable","toilet_2"]
  .forEach(name => modelSelector.appendChild(new Option(name, name)));
toolbar.appendChild(modelSelector);

makeToolButton("Add Furniture", null).onclick = () => addFurniture(modelSelector.value);

// === Functions ===
function snapWallTransform() {
  if (!selectedWall) return;
  selectedWall.position.x = Math.round(selectedWall.position.x / gridSnap) * gridSnap;
  selectedWall.position.z = Math.round(selectedWall.position.z / gridSnap) * gridSnap;
  selectedWall.rotation.y = Math.round(selectedWall.rotation.y / (Math.PI / 12)) * (Math.PI / 12);
}

function toggleWallPlacement() {
  placingWall = !placingWall;
  wallButton.innerText = placingWall ? "Stop Wall" : "Place Wall";
  if (!placingWall) {
    lastPoint = null;
    previewLine.visible = false;
  }
}

function deleteSelected() {
  if (selectedWall) {
    const i = walls.indexOf(selectedWall);
    if (i > -1) {
      scene.remove(selectedWall, wallLabels[i].label);
      walls.splice(i, 1);
      wallLabels.splice(i, 1);
    }
  } else if (selectedFurniture) {
    const i = furniture.indexOf(selectedFurniture);
    if (i > -1) {
      scene.remove(selectedFurniture);
      furniture.splice(i, 1);
    }
  }
  clearSelection();
}

function clearSelection() {
  transformControls.detach();
  selectedWall = selectedFurniture = null;
  if (outlineGroup) { scene.remove(outlineGroup); outlineGroup = null; }
}

function createTextSprite(message) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = '24px Arial';
  ctx.fillStyle = 'white';
  ctx.fillText(message, 0, 24);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.scale.set(2, 1, 1);
  return sprite;
}

function showOutline(obj) {
  if (outlineGroup) scene.remove(outlineGroup);
  outlineGroup = new THREE.Group();
  obj.traverse(child => {
    if (child.isMesh) {
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(child.geometry),
        new THREE.LineBasicMaterial({ color: 0xffa500 })
      );
      wire.applyMatrix4(child.matrixWorld);
      outlineGroup.add(wire);
    }
  });
  scene.add(outlineGroup);
}

function addFurniture(name) {
  loader.load(`./public/models/${name}.glb`, gltf => {
    const model = gltf.scene;
    model.traverse(c => { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } });
    scene.add(model);
    furniture.push(model);
    selectedFurniture = model;
    transformControls.attach(model);
    highlightActive(transformControls.getMode());
    showOutline(model);
  });
}

// === Event Listeners ===
window.addEventListener("click", e => handleClick(e));
window.addEventListener("mousemove", e => handleMouseMove(e));
window.addEventListener("keydown", e => {
  if (e.key === "Escape") { placingWall = false; wallButton.innerText = "Place Wall"; clearSelection(); }
});

function handleClick(e) {
  mouse.x = (e.clientX / w) * 2 - 1;
  mouse.y = -(e.clientY / h) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const floorHits = raycaster.intersectObject(floor);
  const hits = raycaster.intersectObjects([...walls, ...furniture], true);

  if (!placingWall) {
    if (hits.length) {
      const obj = hits[0].object;
      selectedWall = walls.includes(obj) ? obj : null;
      selectedFurniture = !selectedWall ? obj.parent : null;
      transformControls.attach(selectedWall || selectedFurniture);
      highlightActive(transformControls.getMode());
      showOutline(selectedWall || selectedFurniture);
    } else clearSelection();
    return;
  }

  if (floorHits.length) {
    const point = floorHits[0].point;
    point.set(
      Math.round(point.x / gridSnap) * gridSnap,
      0,
      Math.round(point.z / gridSnap) * gridSnap
    );

    if (lastPoint) {
      const dx = point.x - lastPoint.x;
      const dz = point.z - lastPoint.z;
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(length, wallHeight, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      wall.position.set((lastPoint.x + point.x) / 2, wallHeight / 2, (lastPoint.z + point.z) / 2);
      wall.rotation.y = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
      wall.castShadow = wall.receiveShadow = true;
      scene.add(wall);
      walls.push(wall);

      const label = createTextSprite(`${length.toFixed(2)}m`);
      label.position.set(wall.position.x, wall.position.y + wallHeight / 2 + 0.2, wall.position.z);
      scene.add(label);
      wallLabels.push({ wall, label });

      lastPoint = null;
      previewLine.visible = false;
    } else lastPoint = point;
  }
}

function handleMouseMove(e) {
  if (!placingWall || !lastPoint) return;
  mouse.x = (e.clientX / w) * 2 - 1;
  mouse.y = -(e.clientY / h) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(floor);
  if (hits.length) {
    const p = hits[0].point.clone();
    p.set(
      Math.round(p.x / gridSnap) * gridSnap,
      0,
      Math.round(p.z / gridSnap) * gridSnap
    );
    previewLine.geometry.setFromPoints([lastPoint, p]);
    previewLine.visible = true;
  } else previewLine.visible = false;
}

// === Animate ===
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  wallLabels.forEach(({ wall, label }) => {
    label.position.set(wall.position.x, wall.position.y + wallHeight / 2 + 0.2, wall.position.z);
  });
}

// === Load template from external JSON ===
async function loadTemplates() {
  try {
    const response = await fetch("./public/templates.json");
    const templates = await response.json();

    const selectedTemplate = localStorage.getItem("selectedTemplate");
    if (selectedTemplate && templates[selectedTemplate]) {
      loadTemplateData(templates[selectedTemplate]);
    }
  } catch (err) {
    console.error("Failed to load templates.json", err);
  }
}

// Template loader function
function loadTemplateData(data) {
  data.forEach(item => {
    if (item.type === "wall") {
      const dx = item.end[0] - item.start[0];
      const dz = item.end[1] - item.start[1];
      const length = Math.sqrt(dx * dx + dz * dz);
      const angle = Math.atan2(dz, dx);

      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(length, wallHeight, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      wall.position.set((item.start[0] + item.end[0]) / 2, wallHeight / 2, (item.start[1] + item.end[1]) / 2);
      wall.rotation.y = angle;
      wall.castShadow = wall.receiveShadow = true;

      scene.add(wall);
      walls.push(wall);
    }

    if (item.type === "furniture") {
      loader.load(`./public/models/${item.model}.glb`, gltf => {
        const model = gltf.scene;
        model.position.set(...item.pos);
        scene.add(model);
        furniture.push(model);
      });
    }
  });
}

// Start loading
loadTemplates();



animate();
