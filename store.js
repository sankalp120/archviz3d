// store.js
export const state = {
  walls: [],
  furniture: [],
  nodes: [],
  selection: [],
  history: [],
  historyStep: -1,
  placingWall: false,
  transparentWalls: false, // Feature Toggle
  lastPoint: null,
  isDarkMode: true,
  dirty: false,
  wallHeight: 3,
  gridSnap: 0.5,
  gridSize: 20, // Mutable Grid Size
  MAX_HISTORY: 50
};

export function markDirty(flag = true) {
  state.dirty = !!flag;
  document.title = state.dirty ? `* archviz.3d` : `archviz.3d`;
}