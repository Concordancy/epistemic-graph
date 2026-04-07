# Epistemic Graph

A typed knowledge graph platform for collaborative foundational AI research.

Philosophy and formalism in dialogue — not sequence.

## Node Types

| Type | Purpose |
|------|---------|
| **Open Question** | Deliberately unresolved — with a note on *why* it's being held open |
| **Provisional Stance** | Working position, with explicit revision conditions |
| **Derived Conclusion** | Established result with traceable derivation |
| **Imported Tool** | Math/formalism we're using, with explicit scope limits |
| **Concrete Implication** | Bridge node: "if X, then we build/measure Y differently" |

## Stack

- Backend: Python 3 stdlib only (no frameworks)
- Database: SQLite (built-in)
- Frontend: Vanilla HTML + JS (no build pipeline)
- Tunnel: cloudflared (for public access during dev)

## Run

```bash
python3 server.py
```

## Philosophy

Every philosophical claim contains at least one concrete implication —
something that would be done differently if true versus false.
The platform makes finding that implication a required step.
