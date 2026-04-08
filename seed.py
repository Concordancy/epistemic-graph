#!/usr/bin/env python3
"""Seed the Epistemic Graph with nodes from our conversation."""
import urllib.request, json

BASE = "http://localhost:8742/api"

def post(path, body):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def put(path, body):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def edge(f, t, r, l=""):
    return post("/edges", {"from_node_id": f, "to_node_id": t, "relationship": r, "label": l})

ro = 1

put("/objects/1", {
    "name": "The Perception Problem",
    "description": "What would it mean to build a system that genuinely perceives rather than processes — that constitutes its own tasks, tolerates groundlessness, and remains open to mystery without forcing resolution?"
})

# Open Questions
q1 = post(f"/objects/{ro}/nodes", {"type":"open_question","title":"What distinguishes genuine perception from data processing?","body":"Current systems transform inputs to outputs. Perception implies a subject for whom the world appears. Is this distinction real, formalizable, or a category error?","type_metadata":{"why_held_open":"No existing formalism captures the subject-world relation without circularity. Functional definitions collapse perception into processing by definition."}})
q2 = post(f"/objects/{ro}/nodes", {"type":"open_question","title":"Can a system constitute its own tasks?","body":"All current learning systems are heteronomous — tasks are externally given. Can a system discover what matters to it, and decide when a given task is the wrong one?","type_metadata":{"why_held_open":"Autonomy may require embodiment, stakes, or something we haven't yet named. No current architecture approaches this."}})
q3 = post(f"/objects/{ro}/nodes", {"type":"open_question","title":"What is groundlessness tolerance and can it be engineered?","body":"Humans act without resolving foundational questions first. AI systems always close — they produce an answer. Can a system hold productive uncertainty as a generative state rather than a gap to fill?","type_metadata":{"why_held_open":"Requires representing open questions as persistent objects with properties, not absences. Architecturally different from anything current systems do."}})
q4 = post(f"/objects/{ro}/nodes", {"type":"open_question","title":"Is intelligence a natural kind?","body":"The word names a cluster of observed behaviors that may or may not have coherent boundaries. Starting here may be starting in quicksand.","type_metadata":{"why_held_open":"Thousands of definitions, none commanding broad agreement. May be a folk concept rather than a real category."}})
q5 = post(f"/objects/{ro}/nodes", {"type":"open_question","title":"Can abduction overcome RAG/LoRA brittleness?","body":"Peirce's abduction is inference to the best explanation. RAG fails at semantic retrieval boundaries; LoRA fails outside training distribution. Abduction may point to a third path.","type_metadata":{"why_held_open":"Not well-implemented anywhere. May be the core research problem this platform is pointed at."}})

# Provisional Stances
s1 = post(f"/objects/{ro}/nodes", {"type":"provisional_stance","title":"A learning system's task must be pregiven — unless we change something fundamental","body":"All current systems optimize against externally defined criteria. Getting to genuine autonomy requires a different training paradigm, embodied environment with stakes, or something we haven't named.","type_metadata":{"revision_conditions":"Revise if a system generates coherent novel task descriptions not reducible to reframings of its training objective."}})
s2 = post(f"/objects/{ro}/nodes", {"type":"provisional_stance","title":"Neuroscience is non-optional context for AI architecture","body":"The brain is the only existence proof that what we are trying to build is possible. 'Be informed by neuroscience' means understanding what problems it solved and why — not copying it.","type_metadata":{"revision_conditions":"Revise if a system achieves general perception-like behavior via a pathway with no structural analogue in biological intelligence."}})
s3 = post(f"/objects/{ro}/nodes", {"type":"provisional_stance","title":"Open questions should be first-class objects, not gaps","body":"A gap is absence. A generative void is a persistent object with properties: linked implications, explorations, a reason it is held open, outputs it has already produced. The platform encodes this structurally.","type_metadata":{"revision_conditions":"Revise if the distinction makes no practical difference to how research proceeds."}})
s4 = post(f"/objects/{ro}/nodes", {"type":"provisional_stance","title":"Philosophy and formalization are in dialogue, not sequence","body":"Formalization does not reduce philosophy — it extracts the next concrete thing from it while leaving the philosophical question running. They proceed concurrently.","type_metadata":{"revision_conditions":"Revise if formalization consistently distorts rather than clarifies the philosophical questions it touches."}})

# Derived Conclusions
c1 = post(f"/objects/{ro}/nodes", {"type":"derived_conclusion","title":"Current AI systems are almost entirely heteronomous","body":"They optimize for things because training and users defined them. They do not have genuine concerns in the sense that anything matters to them independent of that framing. This is structural, not incidental.","type_metadata":{"derivation_trace":"Follows from the definition of heteronomy. All current architectures define loss functions externally."}})
c2 = post(f"/objects/{ro}/nodes", {"type":"derived_conclusion","title":"Optimizing harder cannot produce genuine autonomy","body":"A hammer that learns to hit nails better is still a hammer. Scaling a heteronomous system does not change its fundamental category. Task-constitution requires something qualitatively different.","type_metadata":{"derivation_trace":"From the distinction between optimizing within a fixed objective and generating new objectives. Categorically different operations."}})
c3 = post(f"/objects/{ro}/nodes", {"type":"derived_conclusion","title":"RAG and LoRA fail at their knowledge boundary for distinct structural reasons","body":"RAG: retrieval is keyword-proximity pretending to be semantic. LoRA: static interpolation — knows training distribution, nothing outside. Both failures are structural.","type_metadata":{"derivation_trace":"RAG: semantic gap between query form and answer location. LoRA: static snapshot, no update mechanism."}})

# Imported Tools
t1 = post(f"/objects/{ro}/nodes", {"type":"imported_tool","title":"Shannon entropy","body":"H(X) = -sum p(x) log p(x). Measures expected surprise. Equivalent in structure to Boltzmann's thermodynamic entropy — the shared term points to a deep fact about uncertainty.","type_metadata":{"scope_limits":"Applies to well-defined probability distributions.","what_not_claimed":"NOT claiming entropy captures everything relevant to cognition or perception. It is a measurement tool, not a theory of mind."}})
t2 = post(f"/objects/{ro}/nodes", {"type":"imported_tool","title":"Prolog (logic programming)","body":"Defines facts and rules; engine finds proofs by backward-chaining. Used here to detect contradictions, find unsupported stances, check inferential consistency of the knowledge graph.","type_metadata":{"scope_limits":"Sound for deductive inference within closed-world assumption. Not a model of abductive or probabilistic reasoning.","what_not_claimed":"NOT claiming Prolog can perform abduction or generate novel hypotheses. It is a consistency checker."}})

# Concrete Implications
i1 = post(f"/objects/{ro}/nodes", {"type":"concrete_implication","title":"Architecture cannot be feedforward-only","body":"If genuine perception requires a subject-world loop, purely feedforward computation cannot suffice. Must include recurrent or feedback structure that models the system as embedded in an environment.","type_metadata":{"what_changes_if_true":"Disqualifies transformer-only architectures as sufficient for perception. Requires feedback loops, self-modelling, or environmental embedding at the architectural level."}})
i2 = post(f"/objects/{ro}/nodes", {"type":"concrete_implication","title":"Open questions need a data structure, not a placeholder","body":"If open questions are generative objects, the data model must represent them as typed nodes with attributes. A NULL field or TODO is the wrong representation.","type_metadata":{"what_changes_if_true":"Already implemented: type=open_question, type_metadata.why_held_open. This implication is realized in the current schema."}})
i3 = post(f"/objects/{ro}/nodes", {"type":"concrete_implication","title":"Paper ingestion needs structured interrogation, not summarization","body":"LLM extraction must yield typed nodes with provenance. The prompt must ask: ASSERTS / ASSUMES / REFUTES / OPENS / EVIDENCE / TOOLS — each mapping to a node type. Output is a JSON array of candidate nodes.","type_metadata":{"what_changes_if_true":"The ingestion pipeline prompt template is fully determined by this. Summarization-style prompts are disqualified."}})
i4 = post(f"/objects/{ro}/nodes", {"type":"concrete_implication","title":"The Prolog KB is auto-generated from the graph","body":"Every typed edge (A --refutes--> B) is a Prolog fact (refutes(A,B).). The KB is a serialization of the graph, regenerated on demand. Consistency checks can run automatically after every graph update.","type_metadata":{"what_changes_if_true":"No separate KB maintenance. The graph IS the KB. One button generates the .pl file and runs checks."}})

# Glossary
g1 = post(f"/objects/{ro}/nodes", {"type":"glossary_term","title":"Entropy","body":"Used in two senses, both pointing to the same mathematical structure.","type_metadata":{"definition":"Shannon: H(X) = -sum p(x) log p(x). Boltzmann: log of microstates consistent with a macrostate. Formulas are structurally equivalent.","scope_note":"We use 'entropy' only in the Shannon sense unless explicitly prefixed with 'thermodynamic'."}})
g2 = post(f"/objects/{ro}/nodes", {"type":"glossary_term","title":"Heteronomy / Autonomy","body":"Central distinction for characterizing current AI vs. what we are trying to build.","type_metadata":{"definition":"Heteronomy: rule-given, externally defined objectives. Autonomy: self-legislating, internally generated objectives. All current AI systems are heteronomous.","scope_note":"'Autonomous driving' in colloquial sense is a heteronomous system — objectives are fully externally specified."}})
g3 = post(f"/objects/{ro}/nodes", {"type":"glossary_term","title":"Abduction (Peirce)","body":"The third mode of inference alongside deduction and induction.","type_metadata":{"definition":"Inference to the best explanation: given observations O and background K, hypothesize H such that H+K best explains O. Ampliative and defeasible.","scope_note":"Distinct from LLM-marketing 'abductive reasoning' which usually means pattern-matching with uncertainty."}})

# Edges
edges = [
    (q1["id"], s2["id"], "opens", "perception requires biological context"),
    (q2["id"], s1["id"], "opens", "task-constitution problem"),
    (q3["id"], s3["id"], "opens", "groundlessness implies open-question-as-object"),
    (s3["id"], i2["id"], "implies", "structural requirement"),
    (s1["id"], c1["id"], "implies", "heteronomy is structural"),
    (c1["id"], c2["id"], "implies", "scaling doesn't change category"),
    (c2["id"], i1["id"], "implies", "feedforward insufficient"),
    (q4["id"], c1["id"], "opens", "if not a natural kind, different framing needed"),
    (q5["id"], c3["id"], "opens", "abduction as third path"),
    (c3["id"], i3["id"], "implies", "ingestion must be structured"),
    (s4["id"], i3["id"], "supports", "formalization extracts concrete steps"),
    (t1["id"], s4["id"], "supports", "entropy formalism clarified philosophy-physics relation"),
    (t2["id"], i4["id"], "instantiates", "Prolog IS the graph serialized"),
    (i4["id"], i3["id"], "depends_on", "KB needs structured nodes to serialize"),
    (t1["id"], g1["id"], "defines", ""),
    (c1["id"], g2["id"], "defines", ""),
    (q5["id"], g3["id"], "defines", ""),
    (s2["id"], i1["id"], "supports", "neuroscience implies feedback architecture"),
    (q3["id"], i2["id"], "implies", "groundlessness tolerance needs persistent object"),
]

for (f, t, r, l) in edges:
    edge(f, t, r, l)

print(f"Done. 21 nodes, {len(edges)} edges seeded into research object {ro}.")
for label, n in [("Q1",q1),("Q2",q2),("Q3",q3),("Q4",q4),("Q5",q5),
                  ("S1",s1),("S2",s2),("S3",s3),("S4",s4),
                  ("C1",c1),("C2",c2),("C3",c3),
                  ("T1",t1),("T2",t2),
                  ("I1",i1),("I2",i2),("I3",i3),("I4",i4),
                  ("G1",g1),("G2",g2),("G3",g3)]:
    print(f"  {label} id={n['id']} [{n['type']}] {n['title'][:55]}")
