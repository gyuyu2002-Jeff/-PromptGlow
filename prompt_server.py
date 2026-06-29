import http.server
import os
import urllib.request
import urllib.parse
import json
import sys

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PORT = 8080

# Load style data to build ID-to-Prompt mapping
try:
    with open("data/evaluation_lite.json", "r", encoding="utf-8") as f:
        lite_data = json.load(f)
    style_map = {item["id"]: item.get("name_original", item.get("name", "")) for item in lite_data}
except Exception as e:
    print(f"Error loading database: {e}")
    style_map = {}

class AutoGeneratingHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        url_path = urllib.parse.unquote(self.path)
        # Parse queries (like cache busting)
        clean_path = url_path.split('?')[0]
        
        # Check if the requested file is a style image under assets/images/
        if clean_path.startswith("/assets/images/") and clean_path.endswith(".png"):
            filename = os.path.basename(clean_path)
            item_id = filename.split('.')[0] # e.g. "nano_15"
            
            # Check if this item is a general style and doesn't exist locally on disk
            local_file_path = os.path.join(".", "assets", "images", filename)
            
            # If the style image is missing locally, return 404 so the frontend can render a beautiful CSS Traditional Chinese card
            if item_id in style_map and not os.path.exists(local_file_path):
                self.send_response(404)
                self.send_header('Content-type', 'text/plain')
                self.end_headers()
                self.wfile.write(b"Image not generated yet")
                return
            
        super().do_GET()

# Force UTF-8 encoding headers for served files to prevent browser decoding bugs on localized systems
AutoGeneratingHandler.extensions_map.update({
    '.json': 'application/json; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
})

if __name__ == '__main__':
    server = http.server.HTTPServer(("", PORT), AutoGeneratingHandler)
    print(f"✨ Custom PromptGlow Server started on port {PORT} with Direct CDN Fallback.")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
