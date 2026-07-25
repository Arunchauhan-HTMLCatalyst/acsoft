import os
import sys
import subprocess
import urllib.parse

# Auto-install dependencies
def install_dependencies():
    required_packages = ['flask', 'flask-cors', 'httpx']
    for pkg in required_packages:
        try:
            __import__(pkg.replace('-', '_'))
        except ImportError:
            print(f"Installing missing dependency: {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

install_dependencies()

from flask import Flask, request, redirect, jsonify
from flask_cors import CORS
import httpx
import re

app = Flask(__name__)
# Allow CORS requests from all domains
CORS(app, resources={r"/api/*": {"origins": "*"}})

def parse_id(url):
    reg = r'(?:youtu\.be/|youtube\.com/(?:embed/|v/|watch\?v=|watch\?.+&v=|shorts/|live/))([^?&]+)'
    match = re.search(reg, url)
    return match.group(1) if match else None

@app.route('/api/info', methods=['GET'])
def get_info():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'URL parameter is required'}), 400
    
    video_id = parse_id(url)
    if not video_id:
        return jsonify({'error': 'Invalid YouTube URL'}), 400
        
    return jsonify({
        'title': 'YouTube Video',
        'thumbnail': f'https://img.youtube.com/vi/{video_id}/maxresdefault.jpg',
        'duration': 0,
        'formats': [
            {'format_id': '1080', 'resolution': '1080p (Full HD)', 'ext': 'mp4'},
            {'format_id': '720', 'resolution': '720p (HD)', 'ext': 'mp4'},
            {'format_id': '480', 'resolution': '480p (SD)', 'ext': 'mp4'},
            {'format_id': '360', 'resolution': '360p', 'ext': 'mp4'}
        ]
    })

@app.route('/api/download', methods=['GET'])
def download():
    url = request.args.get('url')
    format_id = request.args.get('format', '1080')
    
    if not url:
        return "URL parameter is required", 400
        
    is_audio = (format_id == 'bestaudio')
    
    # Configure the payload for Cobalt
    payload = {
        "url": url,
        "videoQuality": format_id if not is_audio else "1080",
        "vQuality": format_id if not is_audio else "1080",
        "downloadMode": "audio" if is_audio else "auto",
        "isAudioOnly": is_audio,
        "isAudio": is_audio,
        "aFormat": "mp3",
        "audioFormat": "mp3",
        "filenamePattern": "basic"
    }

    instances = [
        'https://api.cobalt.tools',
        'https://co.wuk.sh',
        'https://cobalt.k6.cz',
        'https://api.cobalt.best',
        'https://cobalt.perennialte.ch'
    ]

    with httpx.Client(verify=False) as client:
        for instance in instances:
            for path in [instance, f"{instance}/api/json"]:
                try:
                    response = client.post(
                        path,
                        json=payload,
                        headers={
                            "Accept": "application/json",
                            "Content-Type": "application/json"
                        },
                        timeout=8.0
                    )
                    if response.status_code == 200:
                        res_data = response.json()
                        if res_data and "url" in res_data:
                            return redirect(res_data["url"])
                except Exception as e:
                    print(f"Node query failed for {path}: {e}")
                    
    # Fallback to SaveFrom if all fails
    fallback_url = f"https://savefrom.net/?url={urllib.parse.quote(url)}"
    return redirect(fallback_url)

if __name__ == '__main__':
    print("=" * 60)
    print(" acSoft Backend — YouTube Downloader Server running on port 5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=True)
