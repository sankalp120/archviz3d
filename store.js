// store.js
export const state = {
  walls: [],
  furniture: [],
  nodes: [],
  floors: [],
  selection: [],
  history: [],
  historyStep: -1,
  placingWall: false,
  transparentWalls: false,
  lastPoint: null,
  isDarkMode: true,
  dirty: false,
  wallHeight: 3,
  gridSnap: 0.25,
  gridSize: 20,
  sunIntensity: 1.2,
  sunRotation: 0.5,
  floorConfig: { 
      texture: 'Wood', 
      color: 'ffffff',
      scale: .2
  },
  MAX_HISTORY: 50
};

export function markDirty(flag = true) {
  state.dirty = !!flag;
  document.title = state.dirty ? `* archviz.3d` : `archviz.3d`;
}