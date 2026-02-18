// logic.js
import * as THREE from "three";
import { scene, loadTex, loader, activeCamera } from "./world.js";
import { state } from "./store.js";
import { clearSelection } from "./interaction.js";

// === Local Texture Registry ===
export const textureURLs = {
  'Brick': './public/textures/brick.jpg',
  'Concrete': './public/textures/concrete.jpg',
  'Beige': './public/textures/beige_wall.jpg',
  'Wood': './public/textures/wood.jpg',
  'Wood_2': './public/textures/wood_2.jpg',
  'Worn_Wood': './public/textures/worn_wood.jpg',
  'Marble': './public/textures/marble.jpg',
  'Marble_2': './public/textures/marble_2.jpg'
};

const textures = { 'Plain': null };
Object.keys(textureURLs).forEach(key => {
    textures[key] = loadTex(textureURLs[key]);
});

// === Nodes & Walls ===
export function createNode(pos) {
  const existing = state.nodes.find(n => n.position.distanceTo(pos) < 0.2);
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
  wall.userData = { length: len, color: 'eeeeee', texture: 'Plain', textureScale: 0.2, start: nStart, end: nEnd };
  wall.position.y = (state.wallHeight/2) - 0.01;

  nStart.userData.walls.push(wall); nEnd.userData.walls.push(wall);
  scene.add(wall); state.walls.push(wall);
  
  if(!silent) generateFloor();
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
  generateFloor();
}

export function updateConnectedNodes(wall) {
  const len = wall.userData.length, ang = -wall.rotation.y;
  const dx = (len/2)*Math.cos(ang), dz = (len/2)*Math.sin(ang);
  wall.userData.start.position.set(wall.position.x - dx, 0, wall.position.z - dz);
  wall.userData.end.position.set(wall.position.x + dx, 0, wall.position.z + dz);
  updateConnectedWalls(wall.userData.start); updateConnectedWalls(wall.userData.end);
}

function getConnectedGroups(allNodes) {
    const groups = [];
    const visited = new Set();
    allNodes.forEach(node => {
        if (visited.has(node)) return;
        const group = [];
        const queue = [node];
        visited.add(node);
        while (queue.length > 0) {
            const current = queue.pop();
            group.push(current);
            current.userData.walls.forEach(w => {
                const neighbor = (w.userData.start === current) ? w.userData.end : w.userData.start;
                if (neighbor && !visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            });
        }
        if (group.length >= 3) groups.push(group);
    });
    return groups;
}

export function generateFloor() {
    state.floors.forEach(f => scene.remove(f)); 
    state.floors = [];
    if (state.nodes.length < 3) return;
    const roomGroups = getConnectedGroups(state.nodes);
    roomGroups.forEach(groupNodes => {
        const points = groupNodes.map(n => new THREE.Vector2(n.position.x, n.position.z));
        const center = new THREE.Vector2();
        points.forEach(p => center.add(p)); 
        center.divideScalar(points.length);
        points.sort((a,b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
        const shape = new THREE.Shape(points);
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(Math.PI / 2);
        const tName = state.floorConfig.texture;
        const tex = textures[tName];
        const scale = state.floorConfig.scale || 0.2;
        const mat = new THREE.MeshStandardMaterial({ 
            color: '#' + state.floorConfig.color, 
            roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide
        });
        if (tex) {
            const cloned = tex.clone();
            cloned.source = tex.source; 
            cloned.wrapS = cloned.wrapT = THREE.RepeatWrapping;
            const box = new THREE.Box3().setFromPoints(points.map(p=>new THREE.Vector3(p.x,0,p.y)));
            const size = box.getSize(new THREE.Vector3());
            cloned.repeat.set((size.x / 4) * scale, (size.z / 4) * scale);
            mat.map = cloned;
        }
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = 0.02; 
        mesh.receiveShadow = true;
        scene.add(mesh); state.floors.push(mesh);
    });
}

export function applyMaterial(obj, type, value) {
  if (state.floors.includes(obj)) {
      if (type === 'color') state.floorConfig.color = value.replace('#','');
      if (type === 'texture') state.floorConfig.texture = value;
      if (type === 'scale') state.floorConfig.scale = parseFloat(value);
      generateFloor();
      return;
  }
  if (state.placingWall) { 
      if(type === 'color') obj.userData.color = value.replace('#','');
      if(type === 'texture') obj.userData.texture = value;
      return; 
  }
  if (type === 'scale') {
      obj.userData.textureScale = parseFloat(value);
      if (obj.userData.texture && obj.userData.texture !== 'Plain') applyMaterial(obj, 'texture', obj.userData.texture);
      return;
  }
  const mat = obj.material;
  if (type === 'color') {
    mat.map = null; mat.color.set(value); mat.needsUpdate = true;
    obj.userData.texture = 'Plain'; obj.userData.color = value.replace('#','');
  } else if (type === 'texture') {
    const tex = textures[value];
    if(tex) {
      const scale = obj.userData.textureScale || 0.2;
      const cloned = tex.clone(); cloned.source = tex.source; 
      cloned.wrapS = cloned.wrapT = THREE.RepeatWrapping;
      cloned.repeat.set((obj.userData.length || 1) * scale, state.wallHeight * scale);
      mat.map = cloned; mat.color.set(0xffffff); mat.needsUpdate = true; obj.userData.texture = value;
    }
  }
}

export function checkTransparentWalls() {
    if (!state.transparentWalls || state.placingWall) {
        state.walls.forEach(w => {
             if(w.material.transparent) { w.material.opacity = 1.0; w.material.transparent = false; w.material.needsUpdate = true; }
        });
        return;
    }
    const dists = state.walls.map(w => ({ wall: w, dist: w.position.distanceTo(activeCamera.position) }));
    dists.sort((a,b) => a.dist - b.dist);
    dists.forEach((item, index) => {
        const mat = item.wall.material;
        const shouldFade = index < 2;
        if (shouldFade && (!mat.transparent || mat.opacity > 0.3)) { mat.transparent = true; mat.opacity = 0.2; mat.needsUpdate = true; } 
        else if (!shouldFade && mat.transparent) { mat.transparent = false; mat.opacity = 1.0; mat.needsUpdate = true; }
    });
}

export function saveState() {
  if (state.historyStep < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyStep + 1);
  }
  const s = { 
      walls: state.walls.map(w => ({
          p:[w.position.x,w.position.y,w.position.z], rot:w.rotation.y, l:w.userData.length, 
          t:w.userData.texture, c:w.userData.color, ts: w.userData.textureScale 
      })), 
      furniture: state.furniture.map(f => ({m:f.userData.model, p:[f.position.x,f.position.y,f.position.z], r:[f.rotation.x,f.rotation.y,f.rotation.z], s:[f.scale.x,f.scale.y,f.scale.z]})),
      floor: { ...state.floorConfig }
  };
  state.history.push(JSON.stringify(s)); 
  state.historyStep++;
  if (state.history.length > state.MAX_HISTORY) {
      state.history.shift(); state.historyStep--;
  }
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

// FIXED: Exporting this function and adding safety checks
export function restoreSnapshot(d) {
  if (!d) return;
  clearSelection();
  
  // Clear Current Scene
  state.walls.forEach(w => scene.remove(w)); state.walls = [];
  state.furniture.forEach(f => scene.remove(f)); state.furniture = [];
  state.nodes.forEach(n => scene.remove(n)); state.nodes = [];
  
  if (d.floor) state.floorConfig = d.floor;

  // Restore Walls
  if (d.walls) {
    d.walls.forEach(w => {
       const hL = w.l/2, dx = hL*Math.cos(-w.r), dz = hL*Math.sin(-w.r);
       const wall = buildWall({x:w.p[0]-dx, z:w.p[2]-dz}, {x:w.p[0]+dx, z:w.p[2]+dz}, true);
       wall.userData.texture = w.t; wall.userData.color = w.c; wall.userData.textureScale = w.ts || 0.2;
       if(!state.placingWall) {
           if (w.t && w.t !== 'Plain') applyMaterial(wall, 'texture', w.t);
           else applyMaterial(wall, 'color', '#' + w.c);
       }
    });
  }

  // Restore Furniture
  if (d.furniture) {
    d.furniture.forEach(f => {
      loader.load(`./public/models/${f.m}.glb`, (g) => {
          const m = g.scene; m.userData.model=f.m; m.position.set(...f.p); m.rotation.set(...f.r); m.scale.set(...f.s);
          m.traverse(c => { if(c.isMesh) c.castShadow=c.receiveShadow=true; });
          scene.add(m); state.furniture.push(m);
      });
    });
  }
  
  generateFloor();
}
export { textures as wallTextures };