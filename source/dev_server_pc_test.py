import http.server
import socketserver

PORT = 8643

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
    print(f'Serving on http://localhost:{PORT} (no-cache — every refresh reloads fresh files)')
    httpd.serve_forever()
