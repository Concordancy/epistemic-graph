/**
 * app3d.js — application logic wiring the 3D graph renderer to the API
 */

import * as Graph3D from './graph3d.js';

// ── Type config (mirrors graph3d.js) ─────────────────────────────────────────
const TYPE_META = {
  open_question:       { color: '#ff9e64', label: 'Open Question',        metaKey: 'why_held_open',        metaLabel: 'Why held open' },
  provisional_stance:  { color: '#a0c4ff', label: 'Provisional Stance',   metaKey: 'revision_conditions',  metaLabel: 'Revision conditions' },
  derived_conclusion:  { color: '#b9f2a1', label: 'Derived Conclusion',   metaKey: 'derivation_trace',     metaLabel: 'Derivation trace' },
  imported_tool:       { color: '#c9b1ff', label: 'Imported Tool',        metaKey: 'scope_limits',         metaLabel: 'Scope / limits' },
  concrete_implication:{ color: '#ffd6a5', label: 'Concrete Implication', metaKey: 'what_changes_if_true', metaLabel: 'What changes if true' },
  glossary_term:       { color: '#89d4cf', label: 'Glossary Term',        metaKey: 'definition',           metaLabel: 'Definition' },
};

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  currentObject: null,
  nodes: [],
  edges: [],
  selectedNode: null,
  edgePendingFrom: null,
  edgePendingTo: null,
};

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  return r.json();
}
const GET    = p    => api('GET',    p);
const POST   = (p,b)=> api('POST',   p, b);
const PUT    = (p,b)=> api('PUT',    p, b);
const DELETE = p    => api('DELETE', p);

// ── Landing ───────────────────────────────────────────────────────────────────
async function loadLanding() {
  const objects = await GET('/objects');
  const list = document.getElementById('objects-list');
  list.innerHTML = '';
  if (!objects.length) {
    list.innerHTML = '<p style="color:#555;font-size:0.8rem;text-align:center">No research objects yet.</p>';
  }
  objects.forEach(obj => {
    const card = document.createElement('div');
    card.className = 'object-card';
    card.innerHTML = `<h2>${obj.name}</h2><p>${obj.description || ''}</p>`;
    card.onclick = () => openObject(obj);
    list.appendChild(card);
  });
}

window.showLanding = function() {
  state.currentObject = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('landing').style.display = 'flex';
  loadLanding();
};

// ── Open research object ──────────────────────────────────────────────────────
async function openObject(obj) {
  state.currentObject = obj;
  document.getElementById('obj-name').textContent = obj.name;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Init 3D scene
  const container = document.getElementById('graph-container');
  Graph3D.init(container, onNodeSelected);

  await refreshGraph();
}

async function refreshGraph() {
  const id = state.currentObject.id;
  state.nodes = await GET(`/objects/${id}/nodes`);

  // Collect all edges
  const seen = new Set();
  const allEdges = [];
  for (const n of state.nodes) {
    const e = await GET(`/nodes/${n.id}/edges`);
    for (const edge of e.outgoing) {
      if (!seen.has(edge.id)) { seen.add(edge.id); allEdges.push(edge); }
    }
  }
  state.edges = allEdges;

  Graph3D.loadGraph(state.nodes, state.edges);
  document.getElementById('node-count').textContent = `${state.nodes.length} nodes · ${state.edges.length} edges`;
}

// ── Node selection → detail panel ─────────────────────────────────────────────
function onNodeSelected(node) {
  if (!node) { closeDetail(); return; }
  state.selectedNode = node;

  if (state.edgePendingFrom !== null) {
    // Second click in edge-creation mode
    state.edgePendingTo = node.id;
    document.getElementById('edge-status').style.display = 'none';
    document.getElementById('edge-modal').classList.add('visible');
    return;
  }

  openDetail(node);
}

async function openDetail(node) {
  const meta = TYPE_META[node.type] || { color: '#888', label: node.type };

  const badge = document.getElementById('detail-badge');
  badge.textContent = meta.label;
  badge.style.color = meta.color;
  badge.style.borderColor = meta.color;

  document.getElementById('detail-title').value = node.title || '';
  document.getElementById('detail-body-text').value = node.body || '';

  // Type-specific meta
  const mf = document.getElementById('detail-meta');
  mf.innerHTML = '';
  if (meta.metaKey) {
    const val = node.type_metadata?.[meta.metaKey] || '';
    mf.innerHTML = `<div class="field-label">${meta.metaLabel}</div>
      <textarea class="field-val" id="meta-val" onblur="saveMetaField('${meta.metaKey}',this.value)">${val}</textarea>`;
  }

  // Edges
  const edgesData = await GET(`/nodes/${node.id}/edges`);
  const edgesDiv = document.getElementById('detail-edges');
  edgesDiv.innerHTML = '';
  [...edgesData.outgoing.map(e=>({...e,dir:'out'})),
   ...edgesData.incoming.map(e=>({...e,dir:'in'}))]
    .forEach(e => {
      const otherId = e.dir === 'out' ? e.to_node_id : e.from_node_id;
      const other = state.nodes.find(n => n.id === otherId);
      if (!other) return;
      const el = document.createElement('div');
      el.className = 'edge-item';
      el.innerHTML = `<span class="edge-rel">${e.dir==='out'?'→':'←'} ${e.relationship}</span>${other.title}`;
      el.onclick = () => {
        Graph3D.selectNode(otherId);
        Graph3D.flyTo(otherId);
        const n = state.nodes.find(x => x.id === otherId);
        if (n) openDetail(n);
      };
      edgesDiv.appendChild(el);
    });

  document.getElementById('detail').classList.remove('hidden');
}

window.closeDetail = function() {
  state.selectedNode = null;
  document.getElementById('detail').classList.add('hidden');
  Graph3D.deselectAll();
};

window.saveField = async function(field, value) {
  if (!state.selectedNode) return;
  await PUT(`/nodes/${state.selectedNode.id}`, { [field]: value });
  state.selectedNode[field] = value;
  state.nodes = state.nodes.map(n => n.id === state.selectedNode.id ? {...n, [field]: value} : n);
};

window.saveMetaField = async function(key, value) {
  if (!state.selectedNode) return;
  const meta = { ...state.selectedNode.type_metadata, [key]: value };
  await PUT(`/nodes/${state.selectedNode.id}`, { type_metadata: meta });
  state.selectedNode.type_metadata = meta;
};

window.deleteSelected = async function() {
  if (!state.selectedNode) return;
  if (!confirm(`Delete "${state.selectedNode.title}"?`)) return;
  await DELETE(`/nodes/${state.selectedNode.id}`);
  closeDetail();
  await refreshGraph();
};

window.flyToSelected = function() {
  if (state.selectedNode) Graph3D.flyTo(state.selectedNode.id);
};

// ── Edge creation ─────────────────────────────────────────────────────────────
window.startEdge = function() {
  if (!state.selectedNode) return;
  state.edgePendingFrom = state.selectedNode.id;
  state.edgePendingTo = null;
  closeDetail();
  document.getElementById('edge-status').style.display = 'block';
};

window.cancelEdge = function() {
  state.edgePendingFrom = null;
  state.edgePendingTo = null;
  document.getElementById('edge-status').style.display = 'none';
  document.getElementById('edge-modal').classList.remove('visible');
};

window.submitEdge = async function() {
  const rel   = document.getElementById('edge-rel-select').value;
  const label = document.getElementById('edge-label-input').value;
  await POST('/edges', {
    from_node_id: state.edgePendingFrom,
    to_node_id:   state.edgePendingTo,
    relationship: rel, label
  });
  document.getElementById('edge-modal').classList.remove('visible');
  state.edgePendingFrom = null;
  state.edgePendingTo = null;
  await refreshGraph();
};

// ── Node creation ─────────────────────────────────────────────────────────────
window.showCreateOverlay = function() {
  document.getElementById('node-title-input').value = '';
  document.getElementById('node-body-input').value = '';
  updateMetaInput();
  document.getElementById('create-overlay').classList.add('visible');
  document.getElementById('node-title-input').focus();
};

window.hideCreateOverlay = function() {
  document.getElementById('create-overlay').classList.remove('visible');
};

window.updateMetaInput = function() {
  const type = document.getElementById('node-type').value;
  const meta = TYPE_META[type];
  const wrap = document.getElementById('meta-input-wrap');
  wrap.innerHTML = meta?.metaLabel
    ? `<textarea id="meta-input" placeholder="${meta.metaLabel}" style="background:#0a0a0a;border:1px solid #222;color:#d4d4d4;padding:0.5rem;font-family:inherit;font-size:0.8rem;width:100%;min-height:60px;outline:none;resize:vertical;"></textarea>`
    : '';
};

window.submitCreateNode = async function() {
  const type  = document.getElementById('node-type').value;
  const title = document.getElementById('node-title-input').value.trim();
  const body  = document.getElementById('node-body-input').value.trim();
  const mi    = document.getElementById('meta-input');
  const metaVal = mi ? mi.value.trim() : '';
  if (!title) { document.getElementById('node-title-input').focus(); return; }

  const meta = TYPE_META[type];
  const type_metadata = meta?.metaKey && metaVal ? { [meta.metaKey]: metaVal } : {};

  const node = await POST(`/objects/${state.currentObject.id}/nodes`, {
    type, title, body, type_metadata
  });

  hideCreateOverlay();
  await refreshGraph();
  Graph3D.selectNode(node.id);
  Graph3D.flyTo(node.id);
  openDetail(node);
};

// ── Research object modal ─────────────────────────────────────────────────────
window.showObjectModal = function() {
  document.getElementById('obj-modal').classList.add('visible');
  document.getElementById('new-obj-name').focus();
};
window.hideObjectModal = function() {
  document.getElementById('obj-modal').classList.remove('visible');
};
window.submitNewObject = async function(e) {
  e.preventDefault();
  const name = document.getElementById('new-obj-name').value.trim();
  const desc = document.getElementById('new-obj-desc').value.trim();
  const obj = await POST('/objects', { name, description: desc });
  hideObjectModal();
  openObject(obj);
};

// ── Tab switching ─────────────────────────────────────────────────────────────
window.switchTab = function(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'docs') alert('Documents panel — coming in next sprint!');
};

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  if (e.key === 'Escape') {
    hideCreateOverlay();
    hideObjectModal();
    cancelEdge();
    closeDetail();
  }
  if (e.key === 'n' && state.currentObject) showCreateOverlay();
  if (e.key === 'f' && state.selectedNode) flyToSelected();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('load', loadLanding);
