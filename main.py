from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp
import urllib.request
import urllib.parse
import uvicorn

app = FastAPI(
    title="acSoft YouTube Downloader API",
    description="Production-ready API for streaming and downloading YouTube media utilizing yt-dlp.",
    version="1.0"
)

# Enable CORS for all origins (allowing frontend calls from any domain)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/info")
def get_info(url: str = Query(..., description="YouTube video URL")):
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Filter clean pre-muxed mp4 formats (contains both video and audio)
            formats = []
            for f in info.get('formats', []):
                if f.get('vcodec') != 'none' and f.get('acodec') != 'none' and f.get('ext') == 'mp4':
                    formats.append({
                        'format_id': f.get('format_id'),
                        'resolution': f.get('resolution') or f.get('format_note'),
                        'ext': f.get('ext'),
                        'filesize': f.get('filesize') or f.get('filesize_approx')
                    })
            
            return {
                'title': info.get('title'),
                'thumbnail': info.get('thumbnail') or info.get('thumbnails', [{}])[-1].get('url'),
                'duration': info.get('duration'),
                'formats': formats
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/download")
def download(url: str = Query(..., description="YouTube video URL"), format: str = Query("best", description="yt-dlp format selection id")):
    try:
        ydl_opts = {
            'format': format,
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            stream_url = info.get('url')
            title = info.get('title', 'download')
            ext = info.get('ext', 'mp4')
            
            if not stream_url:
                raise HTTPException(status_code=500, detail="Could not resolve stream URL")
            
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
            
            return StreamingResponse(
                generate(),
                media_type="application/octet-stream",
                headers={
                    "Content-Disposition": f"attachment; filename*=UTF-8''{safe_title}.{ext}"
                }
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == '__main__':
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
