import os
import sys
import subprocess

def install_and_import(package):
    try:
        __import__(package)
    except ImportError:
        print(f"Installing required library: {package}...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        except Exception as e:
            print(f"Failed to install {package} via pip: {e}")
            print("Please run: pip install yt-dlp")
            sys.exit(1)

# Ensure yt-dlp is installed and updated
install_and_import("yt_dlp")
import yt_dlp

def main():
    print("=" * 60)
    print(" acSoft Labs — Premium YouTube Video & Audio Downloader ")
    print("=" * 60)
    
    # Get URL
    url = input("Paste YouTube URL: ").strip()
    if not url:
        print("Error: URL cannot be empty.")
        return
        
    print("\nSelect Download Format:")
    print("1. Video — Best Quality (1080p / 4K / Auto)")
    print("2. Video — Medium Quality (720p)")
    print("3. Audio Only (MP3 / M4A)")
    
    choice = input("Enter choice (1-3): ").strip()
    
    # Configure yt-dlp options
    ydl_opts = {
        'outtmpl': '%(title)s.%(ext)s',
    }
    
    if choice == '1':
        print("\nDownloading Best Quality Video...")
        ydl_opts['format'] = 'bestvideo+bestaudio/best'
        ydl_opts['merge_output_format'] = 'mp4'
    elif choice == '2':
        print("\nDownloading 720p Video...")
        ydl_opts['format'] = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best[height<=720]'
        ydl_opts['merge_output_format'] = 'mp4'
    elif choice == '3':
        print("\nDownloading Audio Only...")
        ydl_opts['format'] = 'bestaudio/best'
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }]
    else:
        print("Invalid choice. Exiting.")
        return

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            
        print("\n" + "=" * 60)
        print(" SUCCESS: Download completed successfully!")
        print("=" * 60)
        
    except Exception as e:
        # Check if error is due to missing FFmpeg
        err_msg = str(e).lower()
        if "ffmpeg" in err_msg:
            print("\nFFmpeg was not detected on your system.")
            print("To merge high-quality video/audio or extract MP3s, FFmpeg is required.")
            print("Retrying with single-file fallback format (no FFmpeg needed)...")
            
            try:
                fallback_opts = {
                    'outtmpl': '%(title)s.%(ext)s',
                    'format': 'best' if choice in ['1', '2'] else 'bestaudio',
                }
                with yt_dlp.YoutubeDL(fallback_opts) as ydl:
                    ydl.download([url])
                print("\n" + "=" * 60)
                print(" SUCCESS: Download completed using fallback format!")
                print("=" * 60)
            except Exception as fe:
                print(f"Fallback failed: {fe}")
        else:
            print(f"\nDownload failed: {e}")

if __name__ == '__main__':
    main()
