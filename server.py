import os
import sys
import urllib.request
import urllib.parse
import subprocess

# Auto-install dependencies
def install_dependencies():
    required_packages = ['flask', 'flask-cors', 'yt-dlp']
    for pkg in required_packages:
        try:
            __import__(pkg.replace('-', '_'))
        except ImportError:
            print(f"Installing missing dependency: {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

install_dependencies()

from flask import Flask, request, Response, jsonify
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
# Allow CORS requests from local development and acsoft.online production domains
CORS(app, resources={r"/api/*": {"origins": "*"}})

@app.route('/api/info', methods=['GET'])
def get_info():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter is required'}), 400
    
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Extract only formats that contain both video and audio (pre-muxed) for simplicity,
            # or best audio format.
            formats = []
            
            # Add pre-muxed video formats
            for f in info.get('formats', []):
                if f.get('vcodec') != 'none' and f.get('acodec') != 'none' and f.get('ext') == 'mp4':
                    formats.append({
                        'format_id': f.get('format_id'),
                        'resolution': f.get('resolution') or f.get('format_note'),
                        'ext': f.get('ext'),
                        'filesize': f.get('filesize') or f.get('filesize_approx')
                    })
            
            return jsonify({
                'title': info.get('title'),
                'thumbnail': info.get('thumbnail') or info.get('thumbnails', [{}])[-1].get('url'),
                'duration': info.get('duration'),
                'formats': formats
            })
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['GET'])
def download():
    url = request.args.get('url')
    format_id = request.args.get('format', 'best')
    
    if not url:
        return "URL parameter is required", 400
        
    try:
        ydl_opts = {
            'format': format_id,
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            stream_url = info.get('url')
            title = info.get('title', 'download')
            ext = info.get('ext', 'mp4')
            
            if not stream_url:
                return "Could not resolve stream URL", 500
            
            # Parse the filename safely for Content-Disposition header
            safe_title = urllib.parse.quote(title)
            
            # Forward the stream request directly from YouTube to the client
            req = urllib.request.Request(
                stream_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            )
            
            def generate():
                try:
                    with urllib.request.urlopen(req) as response:
                        while True:
                            chunk = response.read(1024 * 64)  # Read 64KB chunks
                            if not chunk:
                                break
                            yield chunk
                except Exception as stream_err:
                    print(f"Error during stream generation: {stream_err}")
            
            # Return streamed response with attachment headers to force direct browser download
            return Response(
                generate(),
                headers={
                    'Content-Disposition': f"attachment; filename*=UTF-8''{safe_title}.{ext}",
                    'Content-Type': 'application/octet-stream'
                }
            )
            
    except Exception as e:
        return str(e), 500

if __name__ == '__main__':
    print("=" * 60)
    print(" acSoft Backend — YouTube Downloader Server running on port 5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
