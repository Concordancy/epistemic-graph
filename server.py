#!/usr/bin/env python3
"""
Epistemic Graph - minimal HTTP server
Pure Python stdlib, zero dependencies.
"""

import http.server
import socketserver
import os

PORT = 8742
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Epistemic Graph server running on port {PORT}")
        print(f"Serving from: {STATIC_DIR}")
        httpd.serve_forever()
