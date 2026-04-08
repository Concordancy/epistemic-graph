# Deferred: Adaptive Explainer Pipeline

**Status:** Deferred — design captured, not yet built  
**Priority:** Medium (after chat interface + Prolog layer)  
**Origin:** Conversation with Barzin, 2026-04-08

---

## The Idea

An on-the-fly educational explainer system that:

1. **Detects gaps in the user's knowledge** by tracking interaction history with the graph (which nodes visited, time spent, connections followed vs. ignored, questions asked in chat)
2. **Proactively generates explainers** for concepts the user is likely to need next, before they ask
3. **Stitches pre-rendered components** together smoothly rather than rendering everything from scratch on demand
4. **Narrates using AI voice** synced to visual animation

---

## Two Rendering Targets (distinct tradeoffs)

### Option A: Python/Manim → MP4 (request-and-wait, simpler)

```
Node content + graph context
  → LLM generates Manim Python script + narration text
  → manim-voiceover renders MP4 with synced audio (30–120s render time)
  → cached and served to browser
  → plays inline in detail panel
```

**Pros:** Manim produces 3B1B-quality visuals, math rendering is excellent, Cairo/OpenGL output is polished  
**Cons:** Render time is a UX bottleneck; MP4 is not interactive

**Mitigation:** Cache aggressively. First render is slow; all subsequent requests are instant. Pre-generate explainers as a background job when graph is updated.

### Option B: Three.js in-scene animation (real-time, more complex)

Instead of video, the 3D graph itself becomes the explainer:
- Selected node expands; its connected subgraph animates into a structured layout
- Formula/concept text fades in step by step
- Edges animate to show direction of reasoning
- AI voice narrates in sync via Web Speech API or ElevenLabs streaming

**Pros:** Fully interactive, no render wait, seamlessly integrated with graph exploration  
**Cons:** Requires building a scripting/sequencing layer in Three.js; math typesetting in WebGL is non-trivial (MathJax → texture baking workaround exists)

**Best long-term approach:** Option B. The animation *is* the graph — same visual language throughout.

---

## Adaptive Pre-generation Algorithm (sketch)

```python
# Pseudocode — not yet implemented

def get_pregeneration_candidates(user_session):
    visited = user_session.visited_node_ids          # set of node IDs
    not_visited = all_nodes - visited
    
    # Priority 1: direct neighbours of visited nodes not yet seen
    frontier = graph.neighbours(visited) - visited
    
    # Priority 2: nodes on shortest path between recently visited pairs
    # (user is implicitly traversing a reasoning chain)
    recent = user_session.recent_nodes(n=5)
    path_nodes = graph.shortest_paths_between(recent) - visited
    
    # Priority 3: nodes frequently co-visited by other users
    # (future: collaborative filtering when multi-user)
    popular = analytics.frequently_visited_after(visited)
    
    candidates = ranked(frontier + path_nodes + popular)
    
    # Don't over-generate — budget N renders at a time
    return candidates[:N]
```

**Efficiency constraint:** Only pre-generate if the user has been active in the last T minutes and has not yet requested the explainer manually. Discard pre-generated content if the user never reaches the node within a session.

---

## Knowledge Gap Detection

Track per session:
- `visited_nodes`: set of node IDs clicked
- `time_on_node`: seconds spent with detail panel open
- `connections_followed`: edges traversed by clicking neighbour links
- `chat_questions`: topics raised in the LLM chat interface

Signals of a knowledge gap:
- User repeatedly returns to the same node (confusion)
- User clicks imported_tool nodes without following their `defines` edges (not understanding the tool)
- Chat question references a concept name that matches a glossary_term node not yet visited
- Low `time_on_node` relative to node complexity (body length, number of connections)

---

## WebXR Note

Three.js has native WebXR support. The same scene renders in VR/AR with ~50 additional lines. The explainer animations would work identically in a headset — potentially more powerful, as the user is physically surrounded by the graph. Defer until headset hardware is available, but design nothing that would prevent it.

---

## Dependencies Not Yet Installed

- `manim` + `manim-voiceover` (Python, pip)
- SWI-Prolog (for consistency layer, separate)
- ElevenLabs API key or local TTS (Coqui) for narration
- `pymupdf` for PDF ingestion pipeline

---

## Related Deferred Items

- PDF ingestion pipeline + arXiv API integration
- Prolog consistency checker + visual feedback in 3D graph
- Multi-user sessions with collaborative graph building
- WebXR / VR mode
