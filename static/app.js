/**
 * app.js — Epistemic Graph frontend
 * Vanilla JS, no framework, no build step.
 * Graph rendered on HTML5 Canvas with a simple force-directed layout.
 */

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  currentObject: null,
  nodes: [],
  edges: [],
  selectedNode: null,
  edgePendingFrom: null,   // node id awaiting second click to form edge
  positions: {},           // node_id -> {x, y, vx, vy}
  dragging: null,          // {nodeId, offsetX, offsetY}
  animFrame: null,
};

// ── Type colours & labels ─────────────────────────────────────────────────────
const TYPE_META = {
  open_question:      { color: '#ff9e64', label: 'Open Question',       metaKey: 'why_held_open',       metaLabel: 'Why held open' },
  provisional_stance: { color: '#a0c4ff', label: 'Provisional Stance',  metaKey: 'revision_conditions', metaLabel: 'Revision conditions' },
  derived_conclusion: { color: '#b9f2a1', label: 'Derived Conclusion',  metaKey: 'derivation_trace',    metaLabel: 'Derivation trace' },
  imported_tool:      { color: '#c9b1ff', label: 'Imported Tool',       metaKey: 'scope_limits',        metaLabel: 'Scope / limits' },
  concrete_implication:{ color: '#ffd6a5',label: 'Concrete Implication',metaKey: 'what_changes_if_true',metaLabel: 'What changes if true' },
  glossary_term:      { color: '#89d4cf', label: 'Glossary Term',       metaKey: 'definition',          metaLabel: 'Definition' },
};

const REL_META = {
  supports:    { color: '#b9f2a1', label: 'supports' },
  refutes:     { color: '#f87171', label: 'refutes' },
  depends_on:  { color: '#a0c4ff', label: 'depends on' },
  instantiates:{ color: '#c9b1ff', label: 'instantiates' },
  opens:       { color: '#ffd6a5', label: 'opens' },
  implies:     { color: '#ff9e64', label: 'implies' },
  defines:     { color: '#89d4cf', label: 'defines' },
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  return r.json();
}

const GET    = (p)    => api('GET',    p);
const POST   = (p, b) => api('POST',   p, b);
const PUT    = (p, b) => api('PUT',    p, b);
const DELETE = (p)    => api('DELETE', p);

// ── Landing ───────────────────────────────────────────────────────────────────
async function loadLanding() {
  const objects = await GET('/objects');
  const list = document.getElementById('objects-list');
  list.innerHTML = '';
  if (objects.length === 0) {
    list.innerHTML = '<p style="color:#555;font-size:0.85rem;text-align:center">No research objects yet. Create one below.</p>';
  }
  objects.forEach(obj => {
    const card = document.createElement('div');
    card.className = 'object-card';
    card.innerHTML = `<h2>${obj.name}</h2><p>${obj.description || ''}</p>`;
    card.onclick = () => openObject(obj);
    list.appendChild(card);
  });
}

function showLanding() {
  cancelAnimationFrame(state.animFrame);
  document.getElementById('app').style.display = 'none';
  document.getElementById('landing').style.display = 'flex';
  state.currentObject = null;
  loadLanding();
}

// ── Research Object ───────────────────────────────────────────────────────────
async function openObject(obj) {
  state.currentObject = obj;
  document.getElementById('obj-name').textContent = obj.name;
  document.getElementById('obj-desc').textContent = obj.description;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  await refreshGraph();
}

async function refreshGraph() {
  const id = state.currentObject.id;
  const [nodes, edgesRaw] = await Promise.all([
    GET(`/objects/${id}/nodes`),
    // fetch edges for all nodes
    (async () => {
      const all = [];
      const ns = await GET(`/objects/${id}/nodes`);
      const seen = new Set();
      for (const n of ns) {
        const e = await GET(`/nodes/${n.id}/edges`);
        for (const edge of e.outgoing) {
          if (!seen.has(edge.id)) { seen.add(edge.id); all.push(edge); }
        }
      }
      return all;
    })()
  ]);
  state.nodes = nodes;
  state.edges = edgesRaw;

  // Initialise positions for new nodes
  nodes.forEach(n => {
    if (!state.positions[n.id]) {
      const angle = Math.random() * 2 * Math.PI;
      const r = 150 + Math.random() * 100;
      state.positions[n.id] = {
        x: 0 + r * Math.cos(angle),
        y: 0 + r * Math.sin(angle),
        vx: 0, vy: 0
      };
    }
  });

  startPhysics();
}

// ── Force-directed layout ─────────────────────────────────────────────────────
function startPhysics() {
  cancelAnimationFrame(state.animFrame);
  let iter = 0;

  function tick() {
    iter++;
    const cooling = Math.max(0.02, 1 - iter / 800);
    physicsStep(cooling);
    drawGraph();
    if (iter < 800 || state.dragging) {
      state.animFrame = requestAnimationFrame(tick);
    } else {
      drawGraph(); // final frame
    }
  }
  state.animFrame = requestAnimationFrame(tick);
}

function physicsStep(cooling) {
  const nodes = state.nodes;
  const pos = state.positions;
  const k = 120; // ideal spring length

  // Repulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = pos[nodes[i].id], b = pos[nodes[j].id];
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.sqrt(dx*dx + dy*dy));
      const f = (k * k) / (d * d) * 2;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx -= fx; a.vy -= fy;
      b.vx += fx; b.vy += fy;
    }
  }

  // Attraction along edges
  state.edges.forEach(e => {
    const a = pos[e.from_node_id], b = pos[e.to_node_id];
    if (!a || !b) return;
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.max(1, Math.sqrt(dx*dx + dy*dy));
    const f = (d - k) / k * 0.3;
    a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
  });

  // Centre gravity
  nodes.forEach(n => {
    const p = pos[n.id];
    p.vx -= p.x * 0.003;
    p.vy -= p.y * 0.003;
  });

  // Apply velocities
  nodes.forEach(n => {
    if (state.dragging && state.dragging.nodeId === n.id) return;
    const p = pos[n.id];
    p.vx *= 0.7;
    p.vy *= 0.7;
    p.x += p.vx * cooling;
    p.y += p.vy * cooling;
  });
}

// ── Canvas drawing ────────────────────────────────────────────────────────────
function drawGraph() {
  const canvas = document.getElementById('graph-canvas');
  const panel = document.getElementById('graph-panel');
  canvas.width  = panel.clientWidth;
  canvas.height = panel.clientHeight;
  const ctx = canvas.getContext('2d');
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const pos = state.positions;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw edges
  state.edges.forEach(e => {
    const a = pos[e.from_node_id], b = pos[e.to_node_id];
    if (!a || !b) return;
    const ax = cx + a.x, ay = cy + a.y;
    const bx = cx + b.x, by = cy + b.y;
    const rel = REL_META[e.relationship] || { color: '#444', label: e.relationship };

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = rel.color + '66';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(by - ay, bx - ax);
    const nr = 22; // node radius
    const ex = bx - Math.cos(angle) * nr;
    const ey = by - Math.sin(angle) * nr;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 8 * Math.cos(angle - 0.4), ey - 8 * Math.sin(angle - 0.4));
    ctx.lineTo(ex - 8 * Math.cos(angle + 0.4), ey - 8 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = rel.color + '99';
    ctx.fill();

    // Edge label (midpoint)
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    ctx.font = '10px Courier New';
    ctx.fillStyle = rel.color + 'aa';
    ctx.textAlign = 'center';
    ctx.fillText(rel.label, mx, my - 5);
  });

  // Draw nodes
  const R = 22;
  state.nodes.forEach(n => {
    const p = pos[n.id];
    if (!p) return;
    const x = cx + p.x, y = cy + p.y;
    const meta = TYPE_META[n.type] || { color: '#888', label: n.type };
    const isSelected = state.selectedNode && state.selectedNode.id === n.id;
    const isPending  = state.edgePendingFrom === n.id;

    // Circle
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 2 * Math.PI);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.strokeStyle = isPending ? '#fff' : (isSelected ? meta.color : meta.color + '88');
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = meta.color;
    ctx.fill();

    // Label below
    ctx.font = '11px Courier New';
    ctx.fillStyle = isSelected ? meta.color : '#aaa';
    ctx.textAlign = 'center';
    const words = n.title.split(' ');
    let line = '', lines = [];
    words.forEach(w => {
      if ((line + w).length > 18) { lines.push(line.trim()); line = ''; }
      line += w + ' ';
    });
    lines.push(line.trim());
    lines.forEach((l, i) => ctx.fillText(l, x, y + R + 14 + i * 13));
  });
}

// ── Canvas interactions ───────────────────────────────────────────────────────
function initCanvasEvents() {
  const canvas = document.getElementById('graph-canvas');

  function nodeAt(ex, ey) {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    for (const n of state.nodes) {
      const p = state.positions[n.id];
      if (!p) continue;
      const dx = (cx + p.x) - ex, dy = (cy + p.y) - ey;
      if (Math.sqrt(dx*dx + dy*dy) < 26) return n;
    }
    return null;
  }

  canvas.addEventListener('mousedown', e => {
    const n = nodeAt(e.offsetX, e.offsetY);
    if (!n) return;
    const p = state.positions[n.id];
    state.dragging = { nodeId: n.id, offsetX: e.offsetX - (canvas.width/2 + p.x), offsetY: e.offsetY - (canvas.height/2 + p.y) };
    startPhysics();
  });

  canvas.addEventListener('mousemove', e => {
    if (!state.dragging) return;
    const p = state.positions[state.dragging.nodeId];
    p.x = e.offsetX - canvas.width/2  - state.dragging.offsetX;
    p.y = e.offsetY - canvas.height/2 - state.dragging.offsetY;
    p.vx = 0; p.vy = 0;
  });

  canvas.addEventListener('mouseup', e => {
    const wasDragging = state.dragging;
    state.dragging = null;

    const n = nodeAt(e.offsetX, e.offsetY);
    if (!n) return;

    // Was it a drag or a click?
    if (wasDragging) {
      const p = state.positions[wasDragging.nodeId];
      const dx = e.offsetX - canvas.width/2 - p.x - (wasDragging.offsetX || 0);
      const dy = e.offsetY - canvas.height/2 - p.y - (wasDragging.offsetY || 0);
      if (Math.sqrt(dx*dx + dy*dy) > 4) return; // was a real drag
    }

    // Edge creation mode
    if (state.edgePendingFrom !== null) {
      if (n.id !== state.edgePendingFrom) {
        promptEdge(state.edgePendingFrom, n.id);
      }
      state.edgePendingFrom = null;
      drawGraph();
      return;
    }

    selectNode(n);
  });
}

// ── Node selection & detail panel ─────────────────────────────────────────────
async function selectNode(node) {
  state.selectedNode = node;
  drawGraph();

  const meta = TYPE_META[node.type] || { color: '#888', label: node.type };
  const badge = document.getElementById('detail-type-badge');
  badge.textContent = meta.label;
  badge.style.color = meta.color;
  badge.style.borderColor = meta.color;

  document.getElementById('detail-title').value = node.title;
  document.getElementById('detail-body-text').value = node.body || '';

  // Type-specific meta field
  const mf = document.getElementById('detail-meta-fields');
  mf.innerHTML = '';
  if (meta.metaKey) {
    const val = node.type_metadata?.[meta.metaKey] || '';
    mf.innerHTML = `
      <div class="field-label">${meta.metaLabel}</div>
      <textarea class="field-value" id="meta-field-value"
        onblur="saveMetaField('${meta.metaKey}', this.value)">${val}</textarea>`;
  }

  // Edges
  const edgesData = await GET(`/nodes/${node.id}/edges`);
  const edgesDiv = document.getElementById('detail-edges');
  edgesDiv.innerHTML = '';

  [...edgesData.outgoing.map(e => ({ ...e, dir: 'out' })),
   ...edgesData.incoming.map(e => ({ ...e, dir: 'in' }))]
    .forEach(e => {
      const other = state.nodes.find(n => n.id === (e.dir === 'out' ? e.to_node_id : e.from_node_id));
      if (!other) return;
      const rel = REL_META[e.relationship] || { label: e.relationship };
      const item = document.createElement('div');
      item.className = 'edge-item';
      item.innerHTML = `<span class="edge-rel">${e.dir === 'out' ? '→' : '←'} ${rel.label}</span>${other.title}`;
      item.onclick = () => selectNode(other);
      edgesDiv.appendChild(item);
    });

  document.getElementById('detail-panel').classList.remove('hidden');
}

function closeDetail() {
  state.selectedNode = null;
  document.getElementById('detail-panel').classList.add('hidden');
  drawGraph();
}

async function saveNodeField(field, value) {
  if (!state.selectedNode) return;
  await PUT(`/nodes/${state.selectedNode.id}`, { [field]: value });
  state.selectedNode[field] = value;
  state.nodes = state.nodes.map(n => n.id === state.selectedNode.id ? { ...n, [field]: value } : n);
  drawGraph();
}

async function saveMetaField(key, value) {
  if (!state.selectedNode) return;
  const meta = { ...state.selectedNode.type_metadata, [key]: value };
  await PUT(`/nodes/${state.selectedNode.id}`, { type_metadata: meta });
  state.selectedNode.type_metadata = meta;
}

async function deleteCurrentNode() {
  if (!state.selectedNode) return;
  if (!confirm(`Delete "${state.selectedNode.title}"?`)) return;
  await DELETE(`/nodes/${state.selectedNode.id}`);
  closeDetail();
  await refreshGraph();
}

// ── Edge creation ─────────────────────────────────────────────────────────────
function startEdgeFrom() {
  if (!state.selectedNode) return;
  state.edgePendingFrom = state.selectedNode.id;
  closeDetail();
  drawGraph();
}

async function promptEdge(fromId, toId) {
  const rels = Object.keys(REL_META);
  const rel = prompt(`Relationship type:\n${rels.map((r,i) => `${i+1}. ${r}`).join('\n')}\n\nEnter number or name:`);
  if (!rel) return;
  const chosen = rels[parseInt(rel) - 1] || rel.trim();
  if (!REL_META[chosen]) { alert('Unknown relationship type'); return; }
  const label = prompt(`Edge label (optional):`) || '';
  await POST('/edges', { from_node_id: fromId, to_node_id: toId, relationship: chosen, label });
  await refreshGraph();
}

// ── Node creation ─────────────────────────────────────────────────────────────
function showCreateOverlay() {
  document.getElementById('node-title').value = '';
  document.getElementById('node-body').value = '';
  updateMetaFields();
  document.getElementById('create-overlay').classList.add('visible');
  document.getElementById('node-title').focus();
}

function hideCreateOverlay() {
  document.getElementById('create-overlay').classList.remove('visible');
}

function updateMetaFields() {
  const type = document.getElementById('node-type-select').value;
  const meta = TYPE_META[type];
  const mf = document.getElementById('meta-fields');
  if (meta && meta.metaLabel) {
    mf.innerHTML = `<textarea id="meta-input" placeholder="${meta.metaLabel}" style="background:#0a0a0a;border:1px solid #222;color:#d4d4d4;padding:0.5rem;font-family:inherit;font-size:0.82rem;width:100%;min-height:60px;outline:none;"></textarea>`;
  } else {
    mf.innerHTML = '';
  }
}

async function submitCreateNode() {
  const type = document.getElementById('node-type-select').value;
  const title = document.getElementById('node-title').value.trim();
  const body = document.getElementById('node-body').value.trim();
  const metaInput = document.getElementById('meta-input');
  const metaVal = metaInput ? metaInput.value.trim() : '';

  if (!title) { document.getElementById('node-title').focus(); return; }

  const meta = TYPE_META[type];
  const type_metadata = meta && meta.metaKey && metaVal ? { [meta.metaKey]: metaVal } : {};

  const node = await POST(`/objects/${state.currentObject.id}/nodes`, {
    type, title, body, type_metadata
  });

  hideCreateOverlay();
  await refreshGraph();
  selectNode(node);
}

// ── Research object modal ─────────────────────────────────────────────────────
function showObjectModal() {
  document.getElementById('object-modal').classList.add('visible');
  document.getElementById('new-obj-name').focus();
}
function hideObjectModal() {
  document.getElementById('object-modal').classList.remove('visible');
}
async function submitNewObject(e) {
  e.preventDefault();
  const name = document.getElementById('new-obj-name').value.trim();
  const desc = document.getElementById('new-obj-desc').value.trim();
  const obj = await POST('/objects', { name, description: desc });
  hideObjectModal();
  openObject(obj);
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  // Documents tab = placeholder for now
  if (tab === 'documents') {
    alert('Documents panel coming in next sprint!');
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    hideCreateOverlay();
    hideObjectModal();
    if (state.edgePendingFrom !== null) {
      state.edgePendingFrom = null;
      drawGraph();
    }
  }
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    if (state.currentObject) showCreateOverlay();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  initCanvasEvents();
  loadLanding();
});
