/**
 * graph3d.js — Epistemic Graph 3D renderer
 * Three.js from CDN. Bespoke — no wrapper libraries.
 * Orbit controls, typed node colours, animated edges.
 */

import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// ── Type config ───────────────────────────────────────────────────────────────
export const TYPE_CFG = {
  open_question:       { color: 0xff9e64, label: 'Open Question',        r: 6 },
  provisional_stance:  { color: 0xa0c4ff, label: 'Provisional Stance',   r: 5 },
  derived_conclusion:  { color: 0xb9f2a1, label: 'Derived Conclusion',   r: 5 },
  imported_tool:       { color: 0xc9b1ff, label: 'Imported Tool',        r: 4 },
  concrete_implication:{ color: 0xffd6a5, label: 'Concrete Implication', r: 5 },
  glossary_term:       { color: 0x89d4cf, label: 'Glossary Term',        r: 4 },
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
let nodeMeshes = {};   // node_id -> THREE.Mesh
let edgeLines  = [];   // THREE.Line[]
let positions  = {};   // node_id -> THREE.Vector3
let velocities = {};   // node_id -> THREE.Vector3
let nodes = [], edges = [];
let animId = null;
let physicsIter = 0;

// Interaction
let raycaster, mouse;
let hovered = null, selected = null;
let onSelectCallback = null;

// ── Init ──────────────────────────────────────────────────────────────────────
export function init(container, onSelect) {
  onSelectCallback = onSelect;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);
  scene.fog = new THREE.FogExp2(0x0a0a0a, 0.008);

  // Camera
  camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
  camera.position.set(0, 0, 280);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 30;
  controls.maxDistance = 800;

  // Ambient + point light
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const pt = new THREE.PointLight(0xffffff, 1.2, 600);
  pt.position.set(100, 100, 100);
  scene.add(pt);

  // Raycaster
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Events
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('click', onClick);
  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  startLoop();
}

// ── Load graph data ───────────────────────────────────────────────────────────
export function loadGraph(nodeData, edgeData) {
  // Clear existing
  for (const id in nodeMeshes) scene.remove(nodeMeshes[id]);
  edgeLines.forEach(l => scene.remove(l));
  nodeMeshes = {}; edgeLines = []; positions = {}; velocities = {};
  physicsIter = 0;

  nodes = nodeData;
  edges = edgeData;

  // Spawn nodes on a sphere
  nodes.forEach((n, i) => {
    const cfg = TYPE_CFG[n.type] || { color: 0x888888, r: 5 };

    const geo  = new THREE.SphereGeometry(cfg.r, 20, 16);
    const mat  = new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.15,
      roughness: 0.4,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { nodeId: n.id, type: n.type };

    // Fibonacci sphere distribution
    const phi   = Math.acos(1 - 2 * (i + 0.5) / nodes.length);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r     = 120 + Math.random() * 40;
    const pos   = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    mesh.position.copy(pos);
    positions[n.id]  = pos.clone();
    velocities[n.id] = new THREE.Vector3();

    scene.add(mesh);
    nodeMeshes[n.id] = mesh;
  });

  buildEdgeLines();
}

function buildEdgeLines() {
  edgeLines.forEach(l => scene.remove(l));
  edgeLines = [];
  edges.forEach(e => {
    const a = positions[e.from_node_id], b = positions[e.to_node_id];
    if (!a || !b) return;
    const color = REL_CFG[e.relationship] || 0x444444;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, mat);
    line.userData = { edgeId: e.id, fromId: e.from_node_id, toId: e.to_node_id };
    scene.add(line);
    edgeLines.push(line);
  });
}

// ── Physics ───────────────────────────────────────────────────────────────────
const K_REPEL  = 18000;
const K_SPRING = 90;
const DAMPING  = 0.75;

function physicsStep() {
  physicsIter++;
  const cooling = Math.max(0.02, 1 - physicsIter / 600);
  const ids = Object.keys(positions);

  // Repulsion
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = positions[ids[i]], b = positions[ids[j]];
      const diff = new THREE.Vector3().subVectors(b, a);
      const d2 = Math.max(1, diff.lengthSq());
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
    const f    = (d - K_SPRING) / K_SPRING * 0.25;
    diff.normalize().multiplyScalar(f);
    velocities[e.from_node_id].add(diff);
    velocities[e.to_node_id].sub(diff);
  });

  // Centre gravity
  ids.forEach(id => {
    const p = positions[id];
    velocities[id].addScaledVector(p, -0.002);
  });

  // Integrate
  ids.forEach(id => {
    velocities[id].multiplyScalar(DAMPING);
    positions[id].addScaledVector(velocities[id], cooling);
    nodeMeshes[id]?.position.copy(positions[id]);
  });

  // Update edge geometry
  edgeLines.forEach(line => {
    const a = positions[line.userData.fromId];
    const b = positions[line.userData.toId];
    if (!a || !b) return;
    line.geometry.setFromPoints([a, b]);
    line.geometry.attributes.position.needsUpdate = true;
  });
}

// ── Render loop ───────────────────────────────────────────────────────────────
function startLoop() {
  if (animId) cancelAnimationFrame(animId);
  function tick() {
    animId = requestAnimationFrame(tick);
    if (physicsIter < 600) physicsStep();
    controls.update();
    updateHoverGlow();
    renderer.render(scene, camera);
  }
  tick();
}

// ── Hover glow ────────────────────────────────────────────────────────────────
function updateHoverGlow() {
  raycaster.setFromCamera(mouse, camera);
  const meshList = Object.values(nodeMeshes);
  const hits = raycaster.intersectObjects(meshList);
  const newHover = hits.length ? hits[0].object.userData.nodeId : null;

  if (newHover !== hovered) {
    if (hovered && nodeMeshes[hovered]) setGlow(hovered, false);
    hovered = newHover;
    if (hovered && nodeMeshes[hovered]) setGlow(hovered, true);
    renderer.domElement.style.cursor = hovered ? 'pointer' : 'default';
  }
}

function setGlow(nodeId, on) {
  const mesh = nodeMeshes[nodeId];
  if (!mesh) return;
  mesh.material.emissiveIntensity = on ? 0.7 : (selected === nodeId ? 0.5 : 0.15);
  mesh.scale.setScalar(on ? 1.25 : (selected === nodeId ? 1.15 : 1.0));
}

// ── Selection ─────────────────────────────────────────────────────────────────
function onClick(e) {
  // Don't fire if orbit control dragged
  if (controls.isRotating) return;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Object.values(nodeMeshes));
  if (!hits.length) {
    deselectAll();
    return;
  }
  const nodeId = hits[0].object.userData.nodeId;
  selectNode(nodeId);
}

export function selectNode(nodeId) {
  deselectAll();
  selected = nodeId;
  setGlow(nodeId, true);

  // Highlight connected edges + neighbour nodes
  edgeLines.forEach(line => {
    const { fromId, toId } = line.userData;
    const connected = fromId === nodeId || toId === nodeId;
    line.material.opacity = connected ? 0.9 : 0.1;
    line.material.linewidth = connected ? 2 : 1;
  });

  const neighbourIds = new Set();
  edges.forEach(e => {
    if (e.from_node_id === nodeId) neighbourIds.add(e.to_node_id);
    if (e.to_node_id   === nodeId) neighbourIds.add(e.from_node_id);
  });
  Object.entries(nodeMeshes).forEach(([id, mesh]) => {
    const nid = parseInt(id);
    if (nid !== nodeId && !neighbourIds.has(nid)) {
      mesh.material.opacity = 0.25;
      mesh.material.transparent = true;
    }
  });

  const node = nodes.find(n => n.id === nodeId);
  if (node && onSelectCallback) onSelectCallback(node);
}

export function deselectAll() {
  selected = null;
  edgeLines.forEach(l => { l.material.opacity = 0.5; });
  Object.values(nodeMeshes).forEach(m => {
    m.material.opacity = 1;
    m.material.transparent = false;
    m.scale.setScalar(1);
    m.material.emissiveIntensity = 0.15;
  });
  if (onSelectCallback) onSelectCallback(null);
}

// ── Fly-to ────────────────────────────────────────────────────────────────────
export function flyTo(nodeId, duration = 800) {
  const target = positions[nodeId];
  if (!target) return;
  const start = camera.position.clone();
  const dest  = target.clone().addScaledVector(target.clone().normalize(), 60);
  const t0 = performance.now();
  function step() {
    const t = Math.min(1, (performance.now() - t0) / duration);
    const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    camera.position.lerpVectors(start, dest, ease);
    controls.target.lerp(target, ease);
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

// ── Public: highlight subset ──────────────────────────────────────────────────
export function highlightSubset(nodeIds) {
  const set = new Set(nodeIds);
  Object.entries(nodeMeshes).forEach(([id, mesh]) => {
    const inSet = set.has(parseInt(id));
    mesh.material.opacity = inSet ? 1 : 0.08;
    mesh.material.transparent = true;
    mesh.material.emissiveIntensity = inSet ? 0.4 : 0.05;
  });
  edgeLines.forEach(l => {
    const connected = set.has(l.userData.fromId) && set.has(l.userData.toId);
    l.material.opacity = connected ? 0.8 : 0.03;
  });
}

export function resetHighlight() {
  deselectAll();
}
