// world.js
import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import { GLTFLoader } from "jsm/loaders/GLTFLoader.js";
import { state } from "./store.js";

// === Setup Renderer & Scene ===
export const w = window.innerWidth;
export const h = window.innerHeight;
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(w, h);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

// === Cameras ===
const aspect = w / h;
export const perspCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
perspCamera.position.set(0, 35, 20); perspCamera.lookAt(0, 0, 0);

const viewSize = 11;
export const orthoCamera = new THREE.OrthographicCamera(
  -viewSize * aspect, viewSize * aspect, 
  viewSize, -viewSize, 
  1, 1000
);
orthoCamera.position.set(0, 50, 0); orthoCamera.lookAt(0, 0, 0); orthoCamera.zoom = 1.0; orthoCamera.updateProjectionMatrix();

export let activeCamera = orthoCamera;

// === Controls ===
export const controls = new OrbitControls(activeCamera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.09; controls.maxPolarAngle = Math.PI / 2.1;

// === Resources ===
export const loader = new GLTFLoader();
export const textureLoader = new THREE.TextureLoader();
export const loadTex = (path) => {
  const t = textureLoader.load(path); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};

// === Environment ===
export let dirLight;
(function setupLighting() {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6); hemi.position.set(0, 20, 0); scene.add(hemi);
  dirLight = new THREE.DirectionalLight(0xffffff, 1.2); 
  dirLight.castShadow = true; dirLight.shadow.mapSize.set(2048, 2048);
  const d = 30; dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d; dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);
})();

export function updateSun() {
    dirLight.intensity = state.sunIntensity;
    const r = 30;
    dirLight.position.x = r * Math.sin(state.sunRotation);
    dirLight.position.z = r * Math.cos(state.sunRotation);
    dirLight.position.y = 20;
    dirLight.lookAt(0,0,0);
}
updateSun(); // Init

// === Dynamic Grid ===
export let gridHelper, floor;
export function updateGrid(size) {
    if(gridHelper) scene.remove(gridHelper);
    if(floor) scene.remove(floor);
    state.gridSize = size;
    gridHelper = new THREE.GridHelper(size, size, 0x00d2ff, 0x333333); 
    scene.add(gridHelper);
    floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }));
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; floor.position.y = -0.01; 
    scene.add(floor);
}
updateGrid(state.gridSize);

export function setActiveCamera(cam) {
  activeCamera = cam; controls.object = activeCamera;
}

export function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / h;
  renderer.setSize(w, h);
  perspCamera.aspect = aspect; perspCamera.updateProjectionMatrix();
  orthoCamera.left = -viewSize * aspect; orthoCamera.right = viewSize * aspect;
  orthoCamera.top = viewSize; orthoCamera.bottom = -viewSize;
  orthoCamera.updateProjectionMatrix();
}