# M3U8 Video Downloader

A powerful M3U8 video downloading tool with **AES-128 encryption support** and a clean Web UI interface.

[中文文档](./README_CN.md)

## Features

### Core Features
- **Web UI** - Clean and intuitive browser interface
- **Encryption Support** - Automatic key download and AES-128 video decryption
- **Master Playlist** - Auto-detect and select the best quality sub-playlist
- **Non-encrypted Support** - Works with both encrypted and plain videos
- **Concurrent Downloads** - Multi-threaded downloading for faster speeds
- **Progress Display** - Real-time download progress and status
- **Duration Limit** - Download only the first N minutes of a video

### Anti-crawling Handling
- Automatic browser request headers simulation
- Custom Referer support
- Smart retry for failed segments

## Quick Start

### 1. Install Dependencies

```bash
# Node.js version (recommended)
cd packages/m3u8-dl
npm install

# Or Python version
pip3 install m3u8 pycryptodome flask flask-cors requests
# macOS: brew install ffmpeg
# Ubuntu: sudo apt install ffmpeg
```

### 2. Start Server

```bash
# Node.js version
npm run server

# Or Python version
python3 app.py
```

### 3. Access Interface

Open your browser and visit: http://localhost:5001

---

## Usage

### Web UI

1. **Enter M3U8 URL** - Paste the .m3u8 video link
2. **Set Referer** (optional) - Fill in the source URL if the site has hotlink protection
3. **Set Duration Limit** (optional) - Download only the first N minutes
4. **Click Start Download** - Wait for completion

### Download Status

| Status | Description |
|--------|-------------|
| pending | Parsing M3U8 playlist |
| downloading_key | Downloading encryption key |
| downloading | Downloading video segments |
| merging | Merging video files |
| completed | Download complete |
| error | Download error |
| cancelled | Cancelled |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/download/start` | POST | Start download task |
| `/api/download/<id>/status` | GET | Get download status |
| `/api/download/<id>/cancel` | POST | Cancel download |
| `/api/downloads` | GET | List all download tasks |

**Start Download Example:**

```bash
curl -X POST http://localhost:5001/api/download/start \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/video.m3u8",
    "outputPath": "./video.mp4",
    "referer": "https://example.com",
    "maxWorkers": 16,
    "durationLimit": 10
  }'
```

## Project Structure

```
video-downloader/
├── packages/
│   └── m3u8-dl/        # Core downloader package (Node.js)
│       ├── src/
│       │   ├── cli.ts      # CLI entry
│       │   ├── server.ts   # Web server
│       │   └── downloader.ts
│       └── package.json
├── frontend/           # React frontend
│   ├── src/App.tsx
│   └── package.json
├── app.py              # Python backend server
└── README.md
```

## Troubleshooting

### 1. FFmpeg Error

**Error**: `ffmpeg: command not found`

**Solution**:
- macOS: `brew install ffmpeg`
- Ubuntu: `sudo apt install ffmpeg`

### 2. Port Already in Use

```bash
# Find and kill process using port 5001
lsof -ti:5001 | xargs kill -9
```

### 3. Slow Download Speed

- Increase `maxWorkers` parameter (default: 16)
- Check network connection
- Try using a proxy

## Tech Stack

### Backend
- **Express** - Web framework (Node.js version)
- **Flask** - Web framework (Python version)
- **m3u8-parser** - M3U8 parsing
- **crypto** - AES decryption

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool

## Notes

1. Please comply with the target website's terms of service
2. For personal learning and research only
3. Do not use downloaded content for commercial purposes
4. Some sites may require valid cookies or authentication

## License

MIT License
