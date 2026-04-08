#!/usr/bin/env python3
"""
server.py — Epistemic Graph HTTP server
Pure Python stdlib: http.server + urllib. Zero external dependencies.
REST API + static file serving on a single port.
"""

import http.server
import json
import os
import sqlite3
import urllib.parse
from pathlib import Path

import db

DB_PATH = os.path.join(os.path.dirname(__file__), "epistemic.db")
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
PORT = 8742

# ── Helpers ───────────────────────────────────────────────────────────────────

def json_response(handler, data, status=200):
    body = json.dumps(data, default=str).encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", len(body))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)

def error_response(handler, message, status=400):
    json_response(handler, {"error": message}, status)

def read_body(handler) -> dict:
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    return json.loads(handler.rfile.read(length))

def parse_path(path: str):
    """Return (path_parts_list, query_dict) from a raw request path."""
    parsed = urllib.parse.urlparse(path)
    parts = [p for p in parsed.path.strip("/").split("/") if p]
    query = dict(urllib.parse.parse_qsl(parsed.query))
    return parts, query


# ── Router ────────────────────────────────────────────────────────────────────

class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        print(f"  {self.command} {self.path} → {args[1] if len(args)>1 else ''}")

    def _get_db(self):
        return db.init_db(DB_PATH)

    # ── OPTIONS (CORS preflight) ──────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── GET ───────────────────────────────────────────────────────────────────
    def do_GET(self):
        parts, query = parse_path(self.path)

        # API routes
        if parts and parts[0] == "api":
            conn = self._get_db()
            try:
                self._route_api_get(parts[1:], query, conn)
            finally:
                conn.close()
            return

        # Static files
        self._serve_static()

    def _route_api_get(self, parts, query, conn):
        if not parts:
            return json_response(self, {"status": "ok", "service": "epistemic-graph"})

        resource = parts[0]

        # GET /api/objects
        if resource == "objects" and len(parts) == 1:
            return json_response(self, db.list_research_objects(conn))

        # GET /api/objects/:id
        if resource == "objects" and len(parts) == 2:
            obj = db.get_research_object(conn, int(parts[1]))
            if not obj:
                return error_response(self, "Not found", 404)
            return json_response(self, obj)

        # GET /api/objects/:id/nodes[?type=...]
        if resource == "objects" and len(parts) == 3 and parts[2] == "nodes":
            nodes = db.list_nodes(conn, int(parts[1]), type=query.get("type"))
            return json_response(self, nodes)

        # GET /api/objects/:id/edges  — all edges for a research object in one call
        if resource == "objects" and len(parts) == 3 and parts[2] == "edges":
            edges = db.list_all_edges(conn, int(parts[1]))
            return json_response(self, edges)

        # GET /api/objects/:id/documents
        if resource == "objects" and len(parts) == 3 and parts[2] == "documents":
            docs = db.list_documents(conn, int(parts[1]))
            return json_response(self, docs)

        # GET /api/nodes/:id
        if resource == "nodes" and len(parts) == 2:
            node = db.get_node(conn, int(parts[1]))
            if not node:
                return error_response(self, "Not found", 404)
            return json_response(self, node)

        # GET /api/nodes/:id/edges
        if resource == "nodes" and len(parts) == 3 and parts[2] == "edges":
            edges = db.get_edges(conn, int(parts[1]))
            return json_response(self, edges)

        # GET /api/nodes/:id/documents
        if resource == "nodes" and len(parts) == 3 and parts[2] == "documents":
            docs = db.get_node_documents(conn, int(parts[1]))
            return json_response(self, docs)

        # GET /api/documents/:id
        if resource == "documents" and len(parts) == 2:
            doc = db.get_document(conn, int(parts[1]))
            if not doc:
                return error_response(self, "Not found", 404)
            return json_response(self, doc)

        error_response(self, "Not found", 404)

    # ── POST ──────────────────────────────────────────────────────────────────
    def do_POST(self):
        parts, _ = parse_path(self.path)
        if not parts or parts[0] != "api":
            return error_response(self, "Not found", 404)

        conn = self._get_db()
        try:
            self._route_api_post(parts[1:], conn)
        finally:
            conn.close()

    def _route_api_post(self, parts, conn):
        body = read_body(self)

        # POST /api/objects
        if parts == ["objects"]:
            name = body.get("name", "").strip()
            if not name:
                return error_response(self, "name is required")
            rid = db.create_research_object(conn, name, body.get("description", ""))
            return json_response(self, db.get_research_object(conn, rid), 201)

        # POST /api/objects/:id/nodes
        if len(parts) == 3 and parts[0] == "objects" and parts[2] == "nodes":
            ro_id = int(parts[1])
            required = ("type", "title")
            if not all(body.get(f) for f in required):
                return error_response(self, f"Required fields: {required}")
            nid = db.create_node(
                conn, ro_id,
                body["type"], body["title"],
                body.get("body", ""),
                body.get("type_metadata", {})
            )
            return json_response(self, db.get_node(conn, nid), 201)

        # POST /api/edges
        if parts == ["edges"]:
            required = ("from_node_id", "to_node_id", "relationship")
            if not all(body.get(f) for f in required):
                return error_response(self, f"Required fields: {required}")
            eid = db.create_edge(
                conn,
                int(body["from_node_id"]),
                int(body["to_node_id"]),
                body["relationship"],
                body.get("label", "")
            )
            return json_response(self, {"id": eid}, 201)

        # POST /api/objects/:id/documents
        if len(parts) == 3 and parts[0] == "objects" and parts[2] == "documents":
            ro_id = int(parts[1])
            if not body.get("title"):
                return error_response(self, "title is required")
            did = db.add_document(
                conn, ro_id,
                body["title"],
                body.get("source_url", ""),
                body.get("filename", ""),
                body.get("extracted_text", "")
            )
            return json_response(self, db.get_document(conn, did), 201)

        # POST /api/nodes/:id/documents/:doc_id
        if len(parts) == 4 and parts[0] == "nodes" and parts[2] == "documents":
            ok = db.link_node_document(conn, int(parts[1]), int(parts[3]))
            return json_response(self, {"linked": ok})

        error_response(self, "Not found", 404)

    # ── PUT ───────────────────────────────────────────────────────────────────
    def do_PUT(self):
        parts, _ = parse_path(self.path)
        if not parts or parts[0] != "api":
            return error_response(self, "Not found", 404)

        conn = self._get_db()
        try:
            body = read_body(self)
            resource = parts[1] if len(parts) > 1 else ""

            # PUT /api/objects/:id
            if resource == "objects" and len(parts) == 3:
                ok = db.update_research_object(conn, int(parts[2]), **body)
                return json_response(self, {"updated": ok})

            # PUT /api/nodes/:id
            if resource == "nodes" and len(parts) == 3:
                ok = db.update_node(conn, int(parts[2]), **body)
                return json_response(self, {"updated": ok})

            error_response(self, "Not found", 404)
        finally:
            conn.close()

    # ── DELETE ────────────────────────────────────────────────────────────────
    def do_DELETE(self):
        parts, _ = parse_path(self.path)
        if not parts or parts[0] != "api":
            return error_response(self, "Not found", 404)

        conn = self._get_db()
        try:
            resource = parts[1] if len(parts) > 1 else ""

            # DELETE /api/edges/:id
            if resource == "edges" and len(parts) == 3:
                ok = db.delete_edge(conn, int(parts[2]))
                return json_response(self, {"deleted": ok})

            # DELETE /api/nodes/:id
            if resource == "nodes" and len(parts) == 3:
                ok = db.delete_node(conn, int(parts[2]))
                return json_response(self, {"deleted": ok})

            error_response(self, "Not found", 404)
        finally:
            conn.close()

    # ── Static files ──────────────────────────────────────────────────────────
    def _serve_static(self):
        parts, _ = parse_path(self.path)
        rel = "/".join(parts) if parts else "index.html"
        if not rel:
            rel = "index.html"

        filepath = Path(STATIC_DIR) / rel
        if filepath.is_dir():
            filepath = filepath / "index.html"

        if not filepath.exists() or not filepath.is_file():
            # SPA fallback
            filepath = Path(STATIC_DIR) / "index.html"

        content_types = {
            ".html": "text/html",
            ".js":   "application/javascript",
            ".css":  "text/css",
            ".json": "application/json",
            ".png":  "image/png",
            ".svg":  "image/svg+xml",
        }
        ct = content_types.get(filepath.suffix, "application/octet-stream")
        data = filepath.read_bytes()

        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import socketserver

    # Ensure DB is initialised on startup
    conn = db.init_db(DB_PATH)
    conn.close()
    print(f"Database: {DB_PATH}")

    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.allow_reuse_address = True
        print(f"Epistemic Graph server → http://localhost:{PORT}")
        print("Ctrl-C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
