// logic.js
import * as THREE from "three";
import { scene, loadTex, loader, activeCamera } from "./world.js";
import { state } from "./store.js";
import { clearSelection } from "./interaction.js";

const wallTextures = {
  'Plain': null, 'Brick': loadTex('./public/textures/brick.jpg'),
  'Concrete': loadTex('./public/textures/concrete.jpg'), 'Wood': loadTex('./public/textures/wood.jpg'),
  'Paper': loadTex('./public/textures/wallpaper.jpg')
};

// === Nodes & Walls ===
export function createNode(pos) {
  const existing = state.nodes.find(n => n.position.distanceTo(pos) < 0.1);
  if (existing) return existing;
  const node = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.5 }));
  node.position.copy(pos); node.userData = { isNode: true, walls: [] }; node.visible = false;
  scene.add(node); state.nodes.push(node);
  return node;
}

export function buildWall(p1, p2, silent = false) {
  const dx = p2.x - p1.x, dz = p2.z - p1.z; const len = Math.sqrt(dx*dx+dz*dz); if(len < 0.1) return;
  const angle = Math.atan2(dz, dx);
  const nStart = createNode(p1), nEnd = createNode(p2);
  
  const wall = new THREE.Mesh(new THREE.BoxGeometry(len, state.wallHeight, 0.2), new THREE.MeshBasicMaterial({ color: 0x999999 }));
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }));
  wall.add(outline);
  
  wall.position.set((p1.x+p2.x)/2, state.wallHeight/2, (p1.z+p2.z)/2);
  wall.rotation.y = -angle; wall.castShadow = wall.receiveShadow = true;
  wall.userData = { length: len, color: 'eeeeee', texture: 'Plain', start: nStart, end: nEnd };
  wall.position.y = (state.wallHeight/2) - 0.01;

  nStart.userData.walls.push(wall); nEnd.userData.walls.push(wall);
  scene.add(wall); state.walls.push(wall);
  return wall;
}

export function updateConnectedWalls(node) {
  node.userData.walls.forEach(w => {
    const n1 = w.userData.start, n2 = w.userData.end;
    const dx = n2.position.x - n1.position.x, dz = n2.position.z - n1.position.z;
    const len = Math.sqrt(dx*dx+dz*dz), angle = Math.atan2(dz, dx);
    w.position.set((n1.position.x+n2.position.x)/2, state.wallHeight/2, (n1.position.z+n2.position.z)/2);
    w.rotation.y = -angle; w.userData.length = len;
    w.geometry.dispose(); w.geometry = new THREE.BoxGeometry(len, state.wallHeight, 0.2);
    w.children[0].geometry.dispose(); w.children[0].geometry = new THREE.EdgesGeometry(w.geometry);
    if (w.userData.texture && w.userData.texture !== 'Plain') applyMaterial(w, 'texture', w.userData.texture);
  });
}

export function updateConnectedNodes(wall) {
  const len = wall.userData.length, ang = -wall.rotation.y;
  const dx = (len/2)*Math.cos(ang), dz = (len/2)*Math.sin(ang);
  wall.userData.start.position.set(wall.position.x - dx, 0, wall.position.z - dz);
  wall.userData.end.position.set(wall.position.x + dx, 0, wall.position.z + dz);
}

// === Smart Transparency ===
export function checkTransparentWalls() {
    if (!state.transparentWalls || state.placingWall) {
        state.walls.forEach(w => {
             if(w.material.transparent) {
                 w.material.opacity = 1.0; w.material.transparent = false; w.material.needsUpdate = true;
             }
        });
        return;
    }

    const dists = state.walls.map(w => ({ wall: w, dist: w.position.distanceTo(activeCamera.position) }));
    dists.sort((a,b) => a.dist - b.dist);

    dists.forEach((item, index) => {
        const mat = item.wall.material;
        const shouldFade = index < 2;
        if (shouldFade && (!mat.transparent || mat.opacity > 0.3)) {
            mat.transparent = true; mat.opacity = 0.2; mat.needsUpdate = true;
        } else if (!shouldFade && mat.transparent) {
            mat.transparent = false; mat.opacity = 1.0; mat.needsUpdate = true;
        }
    });
}

// === Materials ===
export function applyMaterial(wall, type, value) {
  if (state.placingWall) { 
      if(type === 'color') wall.userData.color = value.replace('#','');
      if(type === 'texture') wall.userData.texture = value;
      return; 
  }
  const mat = wall.material;
  if (type === 'color') {
    mat.map = null; mat.color.set(value); mat.needsUpdate = true;
    wall.userData.texture = 'Plain'; wall.userData.color = value.replace('#','');
  } else if (type === 'texture') {
    const tex = wallTextures[value];
    if(tex) {
      const cloned = tex.clone(); cloned.source = tex.source; cloned.repeat.set(wall.userData.length || 1, state.wallHeight);
      mat.map = cloned; mat.color.set(0xffffff); mat.needsUpdate = true; wall.userData.texture = value;
    }
  }
}

// === History (Undo/Redo) ===
export function saveState() {
  // If we are in the middle of the stack, remove the future
  if (state.historyStep < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyStep + 1);
  }

  const snapshot = { 
      walls: state.walls.map(w => ({
          p:[w.position.x,w.position.y,w.position.z], 
          rot:w.rotation.y, 
          l:w.userData.length, 
          t:w.userData.texture, 
          c:w.userData.color
      })), 
      furniture: state.furniture.map(f => ({
          m:f.userData.model, 
          p:[f.position.x,f.position.y,f.position.z], 
          r:[f.rotation.x,f.rotation.y,f.rotation.z], 
          s:[f.scale.x,f.scale.y,f.scale.z]
      })) 
  };
  
  state.history.push(JSON.stringify(snapshot));
  if (state.history.length > state.MAX_HISTORY) state.history.shift();
  else state.historyStep++;
}

export function undo() {
  if (state.historyStep <= 0) return;
  state.historyStep--;
  restoreSnapshot(JSON.parse(state.history[state.historyStep]));
}

export function redo() {
    if (state.historyStep < state.history.length - 1) {
        state.historyStep++;
        restoreSnapshot(JSON.parse(state.history[state.historyStep]));
    }
}

function restoreSnapshot(d) {
  clearSelection(); // Detach controls to prevent ghost interactions
  
  // Clear Scene
  state.walls.forEach(w => scene.remove(w)); state.walls = [];
  state.furniture.forEach(f => scene.remove(f)); state.furniture = [];
  state.nodes.forEach(n => scene.remove(n)); state.nodes = [];
  
  // Rebuild Walls
  d.walls.forEach(w => {
     const hL = w.l/2, dx = hL*Math.cos(-w.r), dz = hL*Math.sin(-w.r);
     const wall = buildWall({x:w.p[0]-dx, z:w.p[2]-dz}, {x:w.p[0]+dx, z:w.p[2]+dz}, true);
     wall.userData.texture = w.t; wall.userData.color = w.c;
     if(!state.placingWall) {
         if (w.t && w.t !== 'Plain') applyMaterial(wall, 'texture', w.t);
         else applyMaterial(wall, 'color', '#' + w.c);
     }
  });

  // Rebuild Furniture
  d.furniture.forEach(f => {
    loader.load(`./public/models/${f.m}.glb`, (g) => {
        const m = g.scene; m.userData.model=f.m; 
        m.position.set(...f.p); m.rotation.set(...f.r); m.scale.set(...f.s);
        m.traverse(c => { if(c.isMesh) c.castShadow=c.receiveShadow=true; });
        scene.add(m); state.furniture.push(m);
    });
  });
}

export { wallTextures };