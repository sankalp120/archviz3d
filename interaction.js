// interaction.js
import * as THREE from "three";
import { TransformControls } from "jsm/controls/TransformControls.js";
import { scene, renderer, activeCamera, controls, floor } from "./world.js";
import { state, markDirty } from "./store.js";
import { buildWall, updateConnectedWalls, updateConnectedNodes, saveState, generateFloor } from "./logic.js";

export const transformControls = new TransformControls(activeCamera, renderer.domElement);
transformControls.setSize(0.8); scene.add(transformControls);

transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
    if (!event.value) { saveState(); markDirty(); }
});

const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();
const snap = v => Math.round(v/state.gridSnap)*state.gridSnap;
const preview = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]), new THREE.LineBasicMaterial({color:0x00d2ff}));
scene.add(preview); preview.visible = false;

export function updateTransformGizmo() {
    const mode = transformControls.getMode();
    const obj = state.selection[state.selection.length-1];
    
    transformControls.showX = true; transformControls.showY = true; transformControls.showZ = true;

    if (obj) {
        if (state.walls.includes(obj)) {
            if (mode === 'rotate') { transformControls.showX = false; transformControls.showZ = false; }
            else if (mode === 'scale') { transformControls.showX = false; transformControls.showY = false; }
        }
        if (state.floors.includes(obj)) {
            transformControls.detach();
        }
    }
}

export function setGizmoMode(mode) {
    transformControls.setMode(mode);
    updateTransformGizmo();
}

export function selectObject(obj, multi = false) {
  if (!multi) { clearSelection(); state.selection = [obj]; } 
  else {
      const idx = state.selection.indexOf(obj);
      if (idx > -1) state.selection.splice(idx, 1);
      else state.selection.push(obj);
  }

  updateHighlights();

  if (state.selection.length > 0) {
      const active = state.selection[state.selection.length - 1];
      if (!state.floors.includes(active)) {
          transformControls.attach(active);
      } else {
          transformControls.detach();
      }
      updateUI(active);
      updateTransformGizmo();
  } else {
      transformControls.detach();
      updateUI(null);
  }
}

export function selectAll() {
    state.selection = [...state.walls, ...state.furniture];
    updateHighlights();
    if(state.selection.length > 0) {
        transformControls.attach(state.selection[state.selection.length-1]);
        updateTransformGizmo();
    }
}

export function clearSelection() {
  state.selection = [];
  updateHighlights();
  transformControls.detach();
  updateUI(null);
}

function updateHighlights() {
    const oldGroup = scene.getObjectByName("highlightGroup");
    if(oldGroup) scene.remove(oldGroup);
    if(state.selection.length === 0) return;

    const group = new THREE.Group(); group.name = "highlightGroup";
    state.selection.forEach(obj => {
        if(state.floors.includes(obj)) return;
        let geo;
        if (obj.geometry) geo = new THREE.EdgesGeometry(obj.geometry);
        else { const box = new THREE.Box3().setFromObject(obj); const helper = new THREE.BoxHelper(obj, 0x00d2ff); group.add(helper); return; }
        
        const mat = new THREE.LineBasicMaterial({ color: 0x00d2ff, depthTest: false });
        const wire = new THREE.LineSegments(geo, mat);
        wire.position.copy(obj.position); wire.rotation.copy(obj.rotation); wire.scale.copy(obj.scale);
        group.add(wire);
    });
    scene.add(group);
}

function updateUI(obj) {
    const el = document.getElementById("ui-len");
    const col = document.getElementById("colInput");
    const tex = document.getElementById("texDropdown"); // Updated ID
    const slide = document.getElementById("scaleSlide");
    const valSpan = document.getElementById("scaleVal");
    
    if(el) el.innerText = "-";

    if (obj) {
        if (state.walls.includes(obj)) {
            if(el) el.innerText = `${obj.userData.length.toFixed(2)}m`;
            if(col && obj.userData.color) col.value = '#' + obj.userData.color;
            if(tex && obj.userData.texture) tex.value = obj.userData.texture;
            if(slide) {
                const val = obj.userData.textureScale || 0.2;
                slide.value = val;
                valSpan.innerText = val + 'x';
            }
        }
        else if (state.floors.includes(obj)) {
            if(col) col.value = '#' + state.floorConfig.color;
            if(tex) tex.value = state.floorConfig.texture;
            if(slide) {
                const val = state.floorConfig.scale || 0.2;
                slide.value = val;
                valSpan.innerText = val + 'x';
            }
        }
    }
}

function updateLabel() {
    const active = state.selection[state.selection.length-1];
    const tip = document.getElementById("tooltip");
    if (active && state.walls.includes(active) && transformControls.dragging) {
        const v = active.position.clone(); v.project(activeCamera);
        tip.style.display = "block";
        tip.style.left = ((v.x * .5 + .5) * window.innerWidth) + "px";
        tip.style.top = ((-(v.y * .5) + .5) * window.innerHeight - 40) + "px";
        tip.innerText = `${active.userData.length.toFixed(2)}m`;
    } else if(!state.placingWall) tip.style.display = "none";
}

export function deleteSelected() {
    if (state.selection.length === 0) return;
    const toDelete = [...state.selection];
    toDelete.forEach(obj => {
        if(state.floors.includes(obj)) return;
        scene.remove(obj);
        if (state.walls.includes(obj)) {
            state.walls = state.walls.filter(w => w !== obj);
            const nodes = [obj.userData.start, obj.userData.end];
            nodes.forEach(n => {
                if (n) {
                    n.userData.walls = n.userData.walls.filter(w => w !== obj);
                    if (n.userData.walls.length === 0) {
                        scene.remove(n); state.nodes = state.nodes.filter(node => node !== n);
                    }
                }
            });
        }
        if (state.furniture.includes(obj)) state.furniture = state.furniture.filter(f => f !== obj);
    });
    generateFloor();
    clearSelection(); markDirty(); saveState();
}

export function setupEvents() {
  window.addEventListener("click", e => {
    if(e.target.closest('.toolbar') || e.target.closest('.dropdown-content')) return;
    mouse.x = (e.clientX/window.innerWidth)*2-1; mouse.y = -(e.clientY/window.innerHeight)*2+1; 
    raycaster.setFromCamera(mouse, activeCamera);

    if(state.placingWall) {
        const hits = raycaster.intersectObject(floor);
        if(hits.length) {
            let pt = hits[0].point; pt.x=snap(pt.x); pt.z=snap(pt.z); pt.y=0;
            if(state.lastPoint) { buildWall(state.lastPoint, pt); saveState(); state.lastPoint = pt; } 
            else state.lastPoint = pt;
        }
    } else {
        const hits = raycaster.intersectObjects([...state.walls, ...state.furniture, ...state.nodes, ...state.floors], true);
        if(hits.length) { 
           let obj = hits[0].object; 
           if(obj.userData.isNode) { selectObject(obj); return; }
           while(obj.parent && obj.parent!==scene) obj=obj.parent;
           selectObject(obj, e.shiftKey); 
        } else if(!e.shiftKey) clearSelection();
    }
  });

  window.addEventListener("mousemove", e => {
      if(state.placingWall && state.lastPoint) {
          mouse.x = (e.clientX/window.innerWidth)*2-1; mouse.y = -(e.clientY/window.innerHeight)*2+1; 
          raycaster.setFromCamera(mouse, activeCamera);
          const hits = raycaster.intersectObject(floor);
          if(hits.length) {
              let pt = hits[0].point; pt.x=snap(pt.x); pt.z=snap(pt.z); pt.y=0;
              preview.visible = true; preview.geometry.setFromPoints([state.lastPoint, pt]);
              const tip = document.getElementById("tooltip");
              tip.style.display="block"; tip.style.left=e.clientX+"px"; tip.style.top=e.clientY+"px"; 
              tip.innerText = Math.sqrt(Math.pow(pt.x-state.lastPoint.x,2)+Math.pow(pt.z-state.lastPoint.z,2)).toFixed(2)+"m";
          }
      }
  });

  transformControls.addEventListener("change", () => {
    if(state.selection.length === 0) return;
    const obj = state.selection[state.selection.length-1];
    if(obj && obj.userData.isNode) updateConnectedWalls(obj);
    else if(obj && state.walls.includes(obj)) { 
        obj.position.x = snap(obj.position.x); obj.position.z = snap(obj.position.z);
        updateConnectedNodes(obj); 
    }
    updateHighlights(); updateUI(obj); updateLabel();
  });

  window.addEventListener("keydown", e => {
     if(e.target.tagName === 'INPUT') return;
     if(e.key === "Escape") {
         if(state.placingWall) document.getElementById("drawBtn").click();
         else clearSelection();
     }
     if(e.key === "Delete") deleteSelected();
     if((e.ctrlKey||e.metaKey) && e.key === 'z') document.getElementById("undoBtn").click();
     if((e.ctrlKey||e.metaKey) && e.key === 'y') document.getElementById("redoBtn").click();
  });
}

export function hidePreview() { 
    preview.visible = false; 
    const tip = document.getElementById("tooltip");
    if(tip) tip.style.display = "none";
}