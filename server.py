import http.server
import socketserver
import os
import json
import uuid
from urllib.parse import urlparse
import cgi
import subprocess
import tempfile

PORT = 8000
UPLOAD_DIR = 'uploads'

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
        
    def guess_type(self, path):
        if path.endswith('.wasm'):
            return 'application/wasm'
        return super().guess_type(path)

    def do_POST(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/upload':
            try:
                ctype, pdict = cgi.parse_header(self.headers['content-type'])
                if ctype == 'multipart/form-data':
                    # Parse multipart body
                    pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
                    pdict['CONTENT-LENGTH'] = int(self.headers['Content-Length'])
                    
                    form = cgi.FieldStorage(
                        fp=self.rfile,
                        headers=self.headers,
                        environ={'REQUEST_METHOD': 'POST',
                                 'CONTENT_TYPE': self.headers['Content-Type'],
                                 }
                    )

                    response_data = []

                    for field in form.keys():
                        fileitem = form[field]
                        if fileitem.filename:
                            ext = os.path.splitext(fileitem.filename)[1]
                            file_id = str(uuid.uuid4())
                            safe_filename = file_id + ext
                            filepath = os.path.join(UPLOAD_DIR, safe_filename)
                            
                            with open(filepath, 'wb') as fout:
                                fout.write(fileitem.file.read())
                                
                            response_data.append({
                                "originalName": fileitem.filename,
                                "storedName": safe_filename,
                                "url": f"/uploads/{safe_filename}",
                                "type": fileitem.type
                            })

                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"success": True, "files": response_data}).encode('utf-8'))
                else:
                    self.send_error(400, "Bad Request: must be multipart/form-data")
            except Exception as e:
                print("UPLOAD ERROR:", str(e))
                self.send_error(500, f"Internal Server Error: {e}")
        elif parsed_path.path == '/api/transcode':
            try:
                ctype, pdict = cgi.parse_header(self.headers['content-type'])
                if ctype == 'multipart/form-data':
                    pdict['boundary'] = bytes(pdict['boundary'], "utf-8")
                    pdict['CONTENT-LENGTH'] = int(self.headers['Content-Length'])
                    
                    form = cgi.FieldStorage(
                        fp=self.rfile,
                        headers=self.headers,
                        environ={'REQUEST_METHOD': 'POST',
                                 'CONTENT_TYPE': self.headers['Content-Type'],
                                 }
                    )
                    
                    fileitem = form.getvalue('video')
                    if not fileitem and 'video' in form:
                         fileitem = form['video'].file.read()

                    if fileitem:
                        webm_fd, webm_path = tempfile.mkstemp(suffix='.webm')
                        with os.fdopen(webm_fd, 'wb') as fout:
                            if isinstance(fileitem, bytes):
                                fout.write(fileitem)
                            else:
                                fout.write(form['video'].file.read())
                        
                        mp4_fd, mp4_path = tempfile.mkstemp(suffix='.mp4')
                        os.close(mp4_fd)

                        # Server-side ffmpeg transcoding via downloaded binary
                        cmd = [
                            './ffmpeg_bin', '-y', '-i', webm_path,
                            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                            '-movflags', '+faststart', '-preset', 'medium', '-crf', '20',
                            '-c:a', 'aac', '-b:a', '192k',
                            mp4_path
                        ]
                        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

                        with open(mp4_path, 'rb') as f:
                            mp4_data = f.read()

                        os.remove(webm_path)
                        os.remove(mp4_path)
                        
                        self.send_response(200)
                        self.send_header('Content-Type', 'video/mp4')
                        self.send_header('Content-Length', str(len(mp4_data)))
                        self.end_headers()
                        self.wfile.write(mp4_data)
                    else:
                        self.send_error(400, "Bad Request: No video uploaded")
                else:
                    self.send_error(400, "Must be multipart/form-data")
            except Exception as e:
                print("TRANSCODE ERROR:", str(e))
                self.send_error(500, f"Error: {e}")
        else:
            self.send_error(404, "Endpoint not found")

print(f"Starting Python Media Server on port {PORT}. Press Ctrl+C to stop.")
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Error starting server: {e}")
