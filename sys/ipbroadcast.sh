#!/bin/bash

# Get the primary IP address (first non-loopback)
IP=$(hostname -I | awk '{print $1}')

# Create a temporary Python script to serve the IP address
PYFILE="/tmp/ipbroadcast_server.py"
cat > "$PYFILE" <<EOF
import http.server
import socketserver

PORT = 246
IP = "$IP"

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(f"<h1>Device IP: {IP}</h1>".encode())

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.serve_forever()
EOF

# Run the Python server in the background
python3 "$PYFILE" &