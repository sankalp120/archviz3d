// interaction.js
import * as THREE from "three";
import { TransformControls } from "jsm/controls/TransformControls.js";
import { scene, renderer, activeCamera, controls, floor } from "./world.js";
import { state, markDirty } from "./store.js";
import { buildWall, updateConnectedWalls, updateConnectedNodes, saveState } from "./logic.js";

// === Controls & Raycaster ===
export const transformControls = new TransformControls(activeCamera, renderer.domElement);
transformControls.setSize(0.8); scene.add(transformControls);

// **Fix: Capture Transform Actions**
transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value; // Disable orbit while dragging
    if (!event.value) {
        // Drag just finished -> Save State
        saveState();
        markDirty();
    }
});

const raycaster = new THREE.Raycaster(); const mouse = new THREE.Vector2();
const snap = v => Math.round(v/state.gridSnap)*state.gridSnap;

// === Selection ===
export function selectObject(obj) {
  state.selection = [obj]; transformControls.attach(obj);
  const old = scene.getObjectByName("hl"); if(old) scene.remove(old);
  const box = new THREE.BoxHelper(obj, 0x00d2ff); box.name = "hl"; scene.add(box);
  
  if(state.walls.includes(obj)) {
    const el = document.getElementById("ui-len"); if(el) el.innerText = `${obj.userData.length.toFixed(2)}m`;
    const col = document.getElementById("colInput"); if(col && obj.userData.color) col.value = '#' + obj.userData.color;
    // const tex = document.getElementById("texSelect"); if(tex && obj.userData.texture) tex.value = obj.userData.texture;
  }
}

export function clearSelection() {
  state.selection = []; transformControls.detach();
  const old = scene.getObjectByName("hl"); if(old) scene.remove(old);
  const el = document.getElementById("ui-len"); if(el) el.innerText = "-";
}

export function deleteSelected() {
    if (state.selection.length === 0) return;
    const obj = state.selection[0];
    
    // Remove from Scene
    scene.remove(obj);
    
    // Remove from Arrays
    if (state.walls.includes(obj)) {
        state.walls = state.walls.filter(w => w !== obj);
        // Clean up nodes logic if needed (simple removal for now)
    }
    if (state.furniture.includes(obj)) {
        state.furniture = state.furniture.filter(f => f !== obj);
    }
    
    clearSelection();
    markDirty();
    saveState(); // Save after deletion
}

// === Event Handlers ===
export function setupEvents() {
  const preview = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]), new THREE.LineBasicMaterial({color:0x00d2ff}));
  preview.visible=false; scene.add(preview);

  window.addEventListener("click", e => {
    if(e.target.closest('.toolbar') || e.target.closest('.dropdown-content')) return;
    mouse.x = (e.clientX/window.innerWidth)*2-1; mouse.y = -(e.clientY/window.innerHeight)*2+1; 
    raycaster.setFromCamera(mouse, activeCamera);

    if(state.placingWall) {
        const hits = raycaster.intersectObject(floor);
        if(hits.length) {
            let pt = hits[0].point; pt.x=snap(pt.x); pt.z=snap(pt.z); pt.y=0;
            if(state.lastPoint) { 
                buildWall(state.lastPoint, pt); 
                saveState(); // Save after creation
                state.lastPoint = pt; 
            } else state.lastPoint = pt;
        }
    } else {
        const hits = raycaster.intersectObjects([...state.walls, ...state.furniture, ...state.nodes], true);
        if(hits.length) { 
           let obj = hits[0].object; 
           if(obj.userData.isNode) { selectObject(obj); return; }
           while(obj.parent && obj.parent!==scene) obj=obj.parent;
           selectObject(obj); 
        } else clearSelection();
    }
  });

  window.addEventListener("mousemove", e => {
      if(!state.placingWall || !state.lastPoint) return;
      mouse.x = (e.clientX/window.innerWidth)*2-1; mouse.y = -(e.clientY/window.innerHeight)*2+1; 
      raycaster.setFromCamera(mouse, activeCamera);
      const hits = raycaster.intersectObject(floor);
      if(hits.length) {
          let pt = hits[0].point; pt.x=snap(pt.x); pt.z=snap(pt.z); pt.y=0;
          preview.visible = true; preview.geometry.setFromPoints([state.lastPoint, pt]);
          const tip = document.getElementById("tooltip");
          if(tip) { 
              tip.style.display="block"; tip.style.left=e.clientX+"px"; tip.style.top=e.clientY+"px"; 
              tip.innerText = Math.sqrt(Math.pow(pt.x-state.lastPoint.x,2)+Math.pow(pt.z-state.lastPoint.z,2)).toFixed(2)+"m";
          }
      }
  });

  // Live updates during drag (visual only, save happens on drag end)
  transformControls.addEventListener("change", () => {
    if(!state.selection.length) return;
    const obj = state.selection[0];
    if(obj.userData.isNode) updateConnectedWalls(obj);
    else if(state.walls.includes(obj)) { 
        obj.position.x = snap(obj.position.x); obj.position.z = snap(obj.position.z);
        updateConnectedNodes(obj); 
    }
    const old = scene.getObjectByName("hl"); if(old) old.update();
  });

  window.addEventListener("keydown", e => {
     if(e.target.tagName === 'INPUT') return;
     if(e.key === "Escape") state.placingWall ? document.getElementById("drawBtn").click() : clearSelection();
     if(e.key === "Delete") deleteSelected();
     if((e.ctrlKey||e.metaKey) && e.key === 'z') document.getElementById("undoBtn").click();
     if((e.ctrlKey||e.metaKey) && e.key === 'y') document.getElementById("redoBtn").click();
  });
}