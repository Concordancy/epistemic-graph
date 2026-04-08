/**
 * graph3d.js — Epistemic Graph 3D renderer
 * Three.js bundled locally. Bespoke — no wrapper libraries.
 * Orbit controls, typed node colours, physics layout, semantic selection.
 */

import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// ── Type config ───────────────────────────────────────────────────────────────
export const TYPE_CFG = {
  open_question:       { color: 0xff9e64, label: 'Open Question',        r: 7  },
  provisional_stance:  { color: 0xa0c4ff, label: 'Provisional Stance',   r: 6  },
  derived_conclusion:  { color: 0xb9f2a1, label: 'Derived Conclusion',   r: 6  },
  imported_tool:       { color: 0xc9b1ff, label: 'Imported Tool',        r: 5  },
  concrete_implication:{ color: 0xffd6a5, label: 'Concrete Implication', r: 6  },
  glossary_term:       { color: 0x89d4cf, label: 'Glossary Term',        r: 5  },
};

export const REL_CFG = {
  supports:    0xb9f2a1,
  refutes:     0xf87171,
  depends_on:  0xa0c4ff,
  instantiates:0xc9b1ff,
  opens:       0xffd6a5,
  implies:     0xff9e64,
  defines:     0x89d4cf,
};

// ── Scene state ───────────────────────────────────────────────────────────────
let scene, camera, renderer, controls;
let nodeMeshes = {};
let nodeLabels = {};   // node_id -> CSS2D label (future)
let edgeLines  = [];
let positions  = {};
let velocities = {};
let nodes = [], edges = [];
let animId = null;
let physicsIter = 0;

let raycaster, mouse;
let hovered = null, selected = null;
let onSelectCallback = null;

// Track mousedown position to distinguish click from drag
let _mdX = 0, _mdY = 0;

// ── Init ──────────────────────────────────────────────────────────────────────
export function init(container, onSelect) {
  onSelectCallback = onSelect;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  // Much lighter fog — nodes stay visible much further out
  scene.fog = new THREE.FogExp2(0x0a0a0a, 0.0015);

  camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.5, 3000);
  camera.position.set(0, 0, 450);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 15;
  controls.maxDistance = 1500;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.9;

  // Lighting — ambient + three directionals for visible depth shading
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));

  const lights = [
    [300, 300, 300, 0.9],
    [-200, 150, -200, 0.5],
    [0, -250, 150, 0.3],
  ];
  lights.forEach(([x, y, z, intensity]) => {
    const dl = new THREE.DirectionalLight(0xffffff, intensity);
    dl.position.set(x, y, z);
    scene.add(dl);
  });

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Mouse events
  renderer.domElement.addEventListener('mousedown', e => { _mdX = e.clientX; _mdY = e.clientY; });
  renderer.domElement.addEventListener('click', onClick);
  renderer.domElement.addEventListener('mousemove', onMouseMove);

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  startLoop();
}

// ── Load graph data ───────────────────────────────────────────────────────────
export function loadGraph(nodeData, edgeData) {
  for (const id in nodeMeshes) scene.remove(nodeMeshes[id]);
  edgeLines.forEach(l => scene.remove(l));
  nodeMeshes = {}; edgeLines = []; positions = {}; velocities = {};
  physicsIter = 0;
  hovered = null; selected = null;

  nodes = nodeData;
  edges = edgeData;

  const n = nodes.length;

  nodes.forEach((node, i) => {
    const cfg = TYPE_CFG[node.type] || { color: 0x888888, r: 5 };

    const geo = new THREE.SphereGeometry(cfg.r, 24, 18);
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.18,
      roughness: 0.5,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { nodeId: node.id, type: node.type, label: node.title };

    // Fibonacci sphere for even initial distribution
    const phi   = Math.acos(1 - 2 * (i + 0.5) / n);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r     = 160 + Math.random() * 60;
    const pos = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );

    mesh.position.copy(pos);
    positions[node.id]  = pos.clone();
    velocities[node.id] = new THREE.Vector3();

    scene.add(mesh);
    nodeMeshes[node.id] = mesh;
  });

  buildEdgeLines();
}

function buildEdgeLines() {
  edgeLines.forEach(l => scene.remove(l));
  edgeLines = [];

  edges.forEach(e => {
    const a = positions[e.from_node_id], b = positions[e.to_node_id];
    if (!a || !b) return;

    const color = REL_CFG[e.relationship] || 0x555555;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 });
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const line = new THREE.Line(geo, mat);
    line.userData = { edgeId: e.id, fromId: e.from_node_id, toId: e.to_node_id };
    scene.add(line);
    edgeLines.push(line);
  });
}

// ── Force-directed physics ────────────────────────────────────────────────────
const K_REPEL  = 25000;
const K_SPRING = 100;
const DAMPING  = 0.72;

function physicsStep() {
  physicsIter++;
  const cooling = Math.max(0.015, 1 - physicsIter / 700);
  const ids = Object.keys(positions);

  // Repulsion between all pairs
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = positions[ids[i]], b = positions[ids[j]];
      const diff = new THREE.Vector3().subVectors(b, a);
      const d2 = Math.max(4, diff.lengthSq());
      const f  = K_REPEL / d2;
      diff.normalize().multiplyScalar(f);
      velocities[ids[i]].sub(diff);
      velocities[ids[j]].add(diff);
    }
  }

  // Spring attraction along edges
  edges.forEach(e => {
    const a = positions[e.from_node_id], b = positions[e.to_node_id];
    if (!a || !b) return;
    const diff = new THREE.Vector3().subVectors(b, a);
    const d    = Math.max(0.1, diff.length());
    const f    = (d - K_SPRING) / K_SPRING * 0.22;
    diff.normalize().multiplyScalar(f);
    velocities[e.from_node_id].add(diff);
    velocities[e.to_node_id].sub(diff);
  });

  // Gentle centre gravity
  ids.forEach(id => velocities[id].addScaledVector(positions[id], -0.0018));

  // Integrate
  ids.forEach(id => {
    velocities[id].multiplyScalar(DAMPING);
    positions[id].addScaledVector(velocities[id], cooling);
    if (nodeMeshes[id]) nodeMeshes[id].position.copy(positions[id]);
  });

  // Sync edge geometry
  edgeLines.forEach(line => {
    const a = positions[line.userData.fromId];
    const b = positions[line.userData.toId];
    if (!a || !b) return;
    const pts = line.geometry.attributes.position;
    pts.setXYZ(0, a.x, a.y, a.z);
    pts.setXYZ(1, b.x, b.y, b.z);
    pts.needsUpdate = true;
  });
}

// ── Render loop ───────────────────────────────────────────────────────────────
function startLoop() {
  if (animId) cancelAnimationFrame(animId);
  function tick() {
    animId = requestAnimationFrame(tick);
    if (physicsIter < 700) physicsStep();
    controls.update();
    updateHover();
    renderer.render(scene, camera);
  }
  tick();
}

// ── Hover glow ────────────────────────────────────────────────────────────────
function updateHover() {
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Object.values(nodeMeshes));
  const newHov = hits.length ? hits[0].object.userData.nodeId : null;

  if (newHov !== hovered) {
    if (hovered != null) applyGlow(hovered, false);
    hovered = newHov;
    if (hovered != null) applyGlow(hovered, true);
    renderer.domElement.style.cursor = hovered != null ? 'pointer' : 'default';
  }
}

function applyGlow(nodeId, on) {
  const mesh = nodeMeshes[nodeId];
  if (!mesh) return;
  const isSelected = selected === nodeId;
  mesh.material.emissiveIntensity = on ? 0.75 : (isSelected ? 0.55 : 0.18);
  mesh.scale.setScalar(on ? 1.3 : (isSelected ? 1.18 : 1.0));
}

// ── Click / selection ─────────────────────────────────────────────────────────
function onClick(e) {
  // Ignore if mouse moved significantly (was a drag/rotate)
  const dx = e.clientX - _mdX, dy = e.clientY - _mdY;
  if (Math.sqrt(dx * dx + dy * dy) > 5) return;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Object.values(nodeMeshes));

  if (!hits.length) { deselectAll(); return; }
  selectNode(hits[0].object.userData.nodeId);
}

export function selectNode(nodeId) {
  deselectAll();
  selected = nodeId;
  applyGlow(nodeId, false); // reset hover, apply selected state

  // Dim unconnected, brighten connected edges
  const neighbourIds = new Set();
  edges.forEach(e => {
    if (e.from_node_id === nodeId) neighbourIds.add(e.to_node_id);
    if (e.to_node_id   === nodeId) neighbourIds.add(e.from_node_id);
  });

  edgeLines.forEach(line => {
    const conn = line.userData.fromId === nodeId || line.userData.toId === nodeId;
    line.material.opacity = conn ? 0.95 : 0.06;
  });

  Object.entries(nodeMeshes).forEach(([id, mesh]) => {
    const nid = parseInt(id);
    if (nid === nodeId) {
      mesh.material.emissiveIntensity = 0.55;
      mesh.scale.setScalar(1.18);
    } else if (neighbourIds.has(nid)) {
      mesh.material.opacity = 1;
      mesh.material.transparent = false;
      mesh.material.emissiveIntensity = 0.28;
    } else {
      mesh.material.opacity = 0.15;
      mesh.material.transparent = true;
      mesh.material.emissiveIntensity = 0.05;
    }
  });

  const node = nodes.find(n => n.id === nodeId);
  if (node && onSelectCallback) onSelectCallback(node);
}

export function deselectAll() {
  selected = null;
  edgeLines.forEach(l => { l.material.opacity = 0.45; });
  Object.values(nodeMeshes).forEach(m => {
    m.material.opacity = 1;
    m.material.transparent = false;
    m.scale.setScalar(1);
    m.material.emissiveIntensity = 0.18;
  });
  if (onSelectCallback) onSelectCallback(null);
}

// ── Fly-to ────────────────────────────────────────────────────────────────────
export function flyTo(nodeId, duration = 900) {
  const target = positions[nodeId];
  if (!target) return;
  const startPos = camera.position.clone();
  const startTgt = controls.target.clone();
  // Move camera to a position 70 units in front of the node
  const dir  = target.clone().normalize();
  const dest = target.clone().addScaledVector(dir, 70);
  const t0   = performance.now();

  function step() {
    const t    = Math.min(1, (performance.now() - t0) / duration);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    camera.position.lerpVectors(startPos, dest, ease);
    controls.target.lerpVectors(startTgt, target, ease);
    if (t < 1) requestAnimationFrame(step);
  }
  step();
}

// ── Mouse tracking ────────────────────────────────────────────────────────────
function onMouseMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
}

// ── Public utilities ──────────────────────────────────────────────────────────
export function highlightSubset(nodeIds) {
  const set = new Set(nodeIds);
  Object.entries(nodeMeshes).forEach(([id, mesh]) => {
    const inSet = set.has(parseInt(id));
    mesh.material.opacity = inSet ? 1 : 0.07;
    mesh.material.transparent = true;
    mesh.material.emissiveIntensity = inSet ? 0.4 : 0.04;
  });
  edgeLines.forEach(l => {
    const conn = set.has(l.userData.fromId) && set.has(l.userData.toId);
    l.material.opacity = conn ? 0.85 : 0.02;
  });
}

export function resetHighlight() { deselectAll(); }
