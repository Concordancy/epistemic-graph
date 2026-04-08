/**
 * graph3d.js — Epistemic Graph 3D renderer v3
 * Three.js bundled locally. Bespoke.
 * Features: orbit, typed nodes, label sprites, physics layout, semantic selection.
 */

import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// ── Type config ───────────────────────────────────────────────────────────────
export const TYPE_CFG = {
  open_question:       { color: 0xff9e64, hex: '#ff9e64', label: 'Open Question',        r: 8  },
  provisional_stance:  { color: 0xa0c4ff, hex: '#a0c4ff', label: 'Provisional Stance',   r: 7  },
  derived_conclusion:  { color: 0xb9f2a1, hex: '#b9f2a1', label: 'Derived Conclusion',   r: 7  },
  imported_tool:       { color: 0xc9b1ff, hex: '#c9b1ff', label: 'Imported Tool',        r: 6  },
  concrete_implication:{ color: 0xffd6a5, hex: '#ffd6a5', label: 'Concrete Implication', r: 7  },
  glossary_term:       { color: 0x89d4cf, hex: '#89d4cf', label: 'Glossary Term',        r: 6  },
};

export const REL_CFG = {
  supports:    { color: 0x6fcf97, hex: '#6fcf97' },
  refutes:     { color: 0xf87171, hex: '#f87171' },
  depends_on:  { color: 0x7eb8f7, hex: '#7eb8f7' },
  instantiates:{ color: 0xc9b1ff, hex: '#c9b1ff' },
  opens:       { color: 0xffd6a5, hex: '#ffd6a5' },
  implies:     { color: 0xff9e64, hex: '#ff9e64' },
  defines:     { color: 0x89d4cf, hex: '#89d4cf' },
};

// ── Module state ──────────────────────────────────────────────────────────────
let scene, camera, renderer, controls;
let nodeMeshes  = {};   // id -> Mesh
let nodeSprites = {};   // id -> Sprite (label)
let edgeLines   = [];
let positions   = {};   // id -> Vector3
let velocities  = {};   // id -> Vector3
let nodes = [], edges = [];
let animId = null, physicsIter = 0;
let raycaster, mouse;
let hovered = null, selected = null;
let onSelectCB = null;
let _mdX = 0, _mdY = 0;

// ── Label sprite factory ──────────────────────────────────────────────────────
function makeLabel(text, hexColor) {
  const canvas = document.createElement('canvas');
  const ctx    = canvas.getContext('2d');
  const fontSize = 22;
  const font     = `${fontSize}px Courier New`;
  const maxW     = 320;  // max canvas width in px
  const lineH    = fontSize + 6;

  // Word-wrap
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    if (ctx.measureText(test).width > maxW - 16 && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const canvasW = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)) + 20);
  const canvasH = lines.length * lineH + 12;
  canvas.width  = canvasW;
  canvas.height = canvasH;

  ctx.font = font;
  ctx.fillStyle = hexColor + 'dd';
  lines.forEach((line, i) => ctx.fillText(line, 10, fontSize + i * lineH));

  const tex    = new THREE.CanvasTexture(canvas);
  const mat    = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  // Scale canvas px -> world units (0.07 is approx world scale)
  sprite.scale.set(canvasW * 0.07, canvasH * 0.07, 1);
  return sprite;
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function init(container, onSelect) {
  onSelectCB = onSelect;

  // Explicit dimensions — essential for raycasting to work
  const W = container.clientWidth  || window.innerWidth;
  const H = container.clientHeight || window.innerHeight - 44; // minus topbar

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080808);
  // No fog — let everything be visible

  camera = new THREE.PerspectiveCamera(55, W / H, 0.5, 4000);
  camera.position.set(0, 0, 500);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  container.appendChild(renderer.domElement);

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.07;
  controls.minDistance    = 10;
  controls.maxDistance    = 2000;
  controls.rotateSpeed    = 0.55;
  controls.zoomSpeed      = 0.85;

  // Lighting — hemisphere + two directionals for solid depth shading
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222244, 0.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(300, 400, 300);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
  fill.position.set(-200, -100, -200);
  scene.add(fill);

  // Stars background
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(3000);
  for (let i = 0; i < 3000; i++) starPos[i] = (Math.random() - 0.5) * 3000;
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x445566, size: 0.7 })));

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  renderer.domElement.addEventListener('mousedown',  e => { _mdX = e.clientX; _mdY = e.clientY; });
  renderer.domElement.addEventListener('click',      onClick);
  renderer.domElement.addEventListener('mousemove',  onMouseMove);

  window.addEventListener('resize', () => {
    const W2 = container.clientWidth, H2 = container.clientHeight;
    camera.aspect = W2 / H2;
    camera.updateProjectionMatrix();
    renderer.setSize(W2, H2);
  });

  startLoop();
}

// ── Load graph data ───────────────────────────────────────────────────────────
export function loadGraph(nodeData, edgeData) {
  // Clear scene objects
  for (const id in nodeMeshes)  scene.remove(nodeMeshes[id]);
  for (const id in nodeSprites) scene.remove(nodeSprites[id]);
  edgeLines.forEach(l => scene.remove(l));
  nodeMeshes = {}; nodeSprites = {}; edgeLines = [];
  positions = {}; velocities = {};
  physicsIter = 0; hovered = null; selected = null;

  nodes = nodeData;
  edges = edgeData;

  const n = nodes.length;

  nodes.forEach((node, i) => {
    const cfg = TYPE_CFG[node.type] || { color: 0x888888, hex: '#888888', r: 6 };

    // Sphere
    const geo = new THREE.SphereGeometry(cfg.r, 28, 20);
    const mat = new THREE.MeshStandardMaterial({
      color:            cfg.color,
      emissive:         cfg.color,
      emissiveIntensity:0.2,
      roughness:        0.45,
      metalness:        0.08,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { nodeId: node.id };

    // Fibonacci sphere initial placement
    const phi   = Math.acos(1 - 2 * (i + 0.5) / n);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r     = 170 + Math.random() * 70;
    const pos   = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );

    mesh.position.copy(pos);
    positions[node.id]  = pos.clone();
    velocities[node.id] = new THREE.Vector3();

    scene.add(mesh);
    nodeMeshes[node.id] = mesh;

    // Label sprite — full title, word-wrapped
    const sprite = makeLabel(node.title, cfg.hex);
    sprite.position.set(pos.x, pos.y + cfg.r + 8, pos.z);
    scene.add(sprite);
    nodeSprites[node.id] = sprite;
  });

  buildEdges();
}

function buildEdges() {
  edgeLines.forEach(l => scene.remove(l));
  edgeLines = [];

  edges.forEach(e => {
    const a = positions[e.from_node_id], b = positions[e.to_node_id];
    if (!a || !b) return;
    const rel   = REL_CFG[e.relationship] || { color: 0x555555 };
    const mat   = new THREE.LineBasicMaterial({ color: rel.color, transparent: true, opacity: 0.5 });
    const geo   = new THREE.BufferGeometry();
    const pts   = new Float32Array(6);
    pts[0]=a.x; pts[1]=a.y; pts[2]=a.z;
    pts[3]=b.x; pts[4]=b.y; pts[5]=b.z;
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const line  = new THREE.Line(geo, mat);
    line.userData = { fromId: e.from_node_id, toId: e.to_node_id, rel: e.relationship };
    scene.add(line);
    edgeLines.push(line);
  });
}

// ── Physics ───────────────────────────────────────────────────────────────────
const K_REP = 28000, K_SPR = 105, DAMP = 0.72;

function physicsStep() {
  physicsIter++;
  const cool = Math.max(0.012, 1 - physicsIter / 700);
  const ids  = Object.keys(positions);
  const tmp  = new THREE.Vector3();

  // Repulsion
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = positions[ids[i]], b = positions[ids[j]];
      tmp.subVectors(b, a);
      const d2 = Math.max(9, tmp.lengthSq());
      const f  = K_REP / d2;
      tmp.normalize().multiplyScalar(f);
      velocities[ids[i]].sub(tmp);
      velocities[ids[j]].add(tmp);
    }
  }

  // Spring along edges
  edges.forEach(e => {
    const a = positions[e.from_node_id], b = positions[e.to_node_id];
    if (!a || !b) return;
    tmp.subVectors(b, a);
    const d = Math.max(0.1, tmp.length());
    const f = (d - K_SPR) / K_SPR * 0.22;
    tmp.normalize().multiplyScalar(f);
    velocities[e.from_node_id].add(tmp);
    velocities[e.to_node_id].sub(tmp);
  });

  // Centre pull
  ids.forEach(id => velocities[id].addScaledVector(positions[id], -0.0015));

  // Integrate + sync meshes
  ids.forEach(id => {
    velocities[id].multiplyScalar(DAMP);
    positions[id].addScaledVector(velocities[id], cool);

    const mesh   = nodeMeshes[id];
    const sprite = nodeSprites[id];
    const p      = positions[id];
    const cfg    = TYPE_CFG[nodes.find(n => n.id === parseInt(id))?.type] || { r: 6 };

    if (mesh)   mesh.position.copy(p);
    if (sprite) sprite.position.set(p.x, p.y + cfg.r + 8, p.z);
  });

  // Sync edge positions
  edgeLines.forEach(line => {
    const a = positions[line.userData.fromId];
    const b = positions[line.userData.toId];
    if (!a || !b) return;
    const attr = line.geometry.attributes.position;
    attr.setXYZ(0, a.x, a.y, a.z);
    attr.setXYZ(1, b.x, b.y, b.z);
    attr.needsUpdate = true;
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

// ── Hover ─────────────────────────────────────────────────────────────────────
function updateHover() {
  raycaster.setFromCamera(mouse, camera);
  const hits   = raycaster.intersectObjects(Object.values(nodeMeshes));
  const newHov = hits.length ? hits[0].object.userData.nodeId : null;

  if (newHov !== hovered) {
    if (hovered != null) applyGlow(hovered, false);
    hovered = newHov;
    if (hovered != null) applyGlow(hovered, true);
    renderer.domElement.style.cursor = hovered != null ? 'pointer' : 'default';
  }
}

function applyGlow(id, on) {
  const m = nodeMeshes[id];
  if (!m) return;
  const isSel = selected === id;
  m.material.emissiveIntensity = on ? 0.8 : (isSel ? 0.6 : 0.2);
  m.scale.setScalar(on ? 1.35 : (isSel ? 1.2 : 1.0));
}

// ── Click ─────────────────────────────────────────────────────────────────────
function onClick(e) {
  const dx = e.clientX - _mdX, dy = e.clientY - _mdY;
  if (Math.sqrt(dx*dx + dy*dy) > 6) return;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(Object.values(nodeMeshes));
  if (!hits.length) { deselectAll(); return; }
  selectNode(hits[0].object.userData.nodeId);
}

export function selectNode(nodeId) {
  deselectAll();
  selected = nodeId;

  const neighbourIds = new Set();
  edges.forEach(e => {
    if (e.from_node_id === nodeId) neighbourIds.add(e.to_node_id);
    if (e.to_node_id   === nodeId) neighbourIds.add(e.from_node_id);
  });

  edgeLines.forEach(l => {
    const conn = l.userData.fromId === nodeId || l.userData.toId === nodeId;
    l.material.opacity = conn ? 0.95 : 0.05;
  });

  Object.entries(nodeMeshes).forEach(([id, m]) => {
    const nid = parseInt(id);
    if (nid === nodeId) {
      m.material.emissiveIntensity = 0.6;
      m.scale.setScalar(1.2);
    } else if (neighbourIds.has(nid)) {
      m.material.opacity = 1; m.material.transparent = false;
      m.material.emissiveIntensity = 0.3;
    } else {
      m.material.opacity = 0.12; m.material.transparent = true;
      m.material.emissiveIntensity = 0.04;
    }
  });

  Object.entries(nodeSprites).forEach(([id, s]) => {
    const nid = parseInt(id);
    s.material.opacity = (nid === nodeId || neighbourIds.has(nid)) ? 1 : 0.15;
  });

  const node = nodes.find(n => n.id === nodeId);
  if (node && onSelectCB) onSelectCB(node);
}

export function deselectAll() {
  selected = null;
  edgeLines.forEach(l => { l.material.opacity = 0.5; });
  Object.values(nodeMeshes).forEach(m => {
    m.material.opacity = 1; m.material.transparent = false;
    m.scale.setScalar(1); m.material.emissiveIntensity = 0.2;
  });
  Object.values(nodeSprites).forEach(s => { s.material.opacity = 1; });
  if (onSelectCB) onSelectCB(null);
}

// ── Fly-to ────────────────────────────────────────────────────────────────────
export function flyTo(nodeId, duration = 900) {
  const target = positions[nodeId];
  if (!target) return;
  const startPos = camera.position.clone();
  const startTgt = controls.target.clone();
  const dir  = target.clone().normalize();
  const dest = target.clone().addScaledVector(dir, 80);
  const t0   = performance.now();
  function step() {
    const t    = Math.min(1, (performance.now() - t0) / duration);
    const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    camera.position.lerpVectors(startPos, dest, ease);
    controls.target.lerpVectors(startTgt, target, ease);
    if (t < 1) requestAnimationFrame(step);
  }
  step();
}

// ── Mouse ─────────────────────────────────────────────────────────────────────
function onMouseMove(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
}

// ── Subset highlight ──────────────────────────────────────────────────────────
export function highlightSubset(nodeIds) {
  const set = new Set(nodeIds);
  Object.entries(nodeMeshes).forEach(([id, m]) => {
    const in_ = set.has(parseInt(id));
    m.material.opacity = in_ ? 1 : 0.07; m.material.transparent = true;
    m.material.emissiveIntensity = in_ ? 0.4 : 0.04;
  });
  edgeLines.forEach(l => {
    l.material.opacity = set.has(l.userData.fromId) && set.has(l.userData.toId) ? 0.85 : 0.02;
  });
}

export function resetHighlight() { deselectAll(); }
