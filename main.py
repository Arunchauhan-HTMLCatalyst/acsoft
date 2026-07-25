from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
import re
import urllib.parse

app = FastAPI(
    title="acSoft YouTube Downloader API",
    description="CORS-proxied backend routing requests through unblocked Cobalt nodes.",
    version="1.1"
)

# Enable CORS for all origins (allowing frontend calls from any domain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def parse_id(url):
    reg = r'(?:youtu\.be/|youtube\.com/(?:embed/|v/|watch\?v=|watch\?.+&v=|shorts/|live/))([^?&]+)'
    match = re.search(reg, url)
    return match.group(1) if match else None

@app.get("/api/info")
def get_info(url: str = Query(..., description="YouTube video URL")):
    video_id = parse_id(url)
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")
        
    return {
        'title': 'YouTube Video',
        'thumbnail': f'https://img.youtube.com/vi/{video_id}/maxresdefault.jpg',
        'duration': 0,
        'formats': [
            {'format_id': '1080', 'resolution': '1080p (Full HD)', 'ext': 'mp4'},
            {'format_id': '720', 'resolution': '720p (HD)', 'ext': 'mp4'},
            {'format_id': '480', 'resolution': '480p (SD)', 'ext': 'mp4'},
            {'format_id': '360', 'resolution': '360p', 'ext': 'mp4'}
        ]
    }

@app.get("/api/download")
async def download(url: str = Query(..., description="YouTube video URL"), format: str = Query("1080", description="Target format or resolution")):
    is_audio = (format == 'bestaudio')
    
    # Configure the payload for Cobalt
    payload = {
        "url": url,
        "videoQuality": format if not is_audio else "1080",
        "vQuality": format if not is_audio else "1080",
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

    async with httpx.AsyncClient(verify=False) as client:
        for instance in instances:
            for path in [instance, f"{instance}/api/json"]:
                try:
                    response = await client.post(
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
                            # Redirect client browser directly to the resolved stream link
                            return RedirectResponse(url=res_data["url"])
                except Exception as e:
                    print(f"Node query failed for {path}: {e}")
                    
    # Fallback to SaveFrom if all fails
    fallback_url = f"https://savefrom.net/?url={urllib.parse.quote(url)}"
    return RedirectResponse(url=fallback_url)

if __name__ == '__main__':
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
