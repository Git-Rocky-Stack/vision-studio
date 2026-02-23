# Vision Studio - Python Backend Integration Plan

## Overview

This document outlines the plan for integrating the Python AI backend for image and video generation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON APP (Frontend)                  │
│  - React + TypeScript UI                                    │
│  - IPC communication with main process                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ IPC (invoke/handle)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              PYTHON BACKEND (FastAPI Server)                │
│  - REST API for generation endpoints                        │
│  - WebSocket for real-time progress updates                 │
│  - Queue management for jobs                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌───────────┐ ┌───────────┐ ┌───────────┐
│  ComfyUI  │ │  Diffusers│ │  Model    │
│  (SD/FLUX)│ │  (Direct) │ │  Manager  │
└───────────┘ └───────────┘ └───────────┘
```

## Implementation Steps

### Phase 1: Basic FastAPI Server

Create `backend/` directory with:

```python
# backend/main.py
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import asyncio

app = FastAPI()

# CORS for Electron communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/generate/image")
async def generate_image(request: ImageGenerationRequest):
    """Start image generation job"""
    pass

@app.post("/api/generate/video")
async def generate_video(request: VideoGenerationRequest):
    """Start video generation job"""
    pass

@app.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str):
    """Get generation job status"""
    pass

@app.websocket("/ws/progress")
async def progress_websocket(websocket: WebSocket):
    """Real-time progress updates"""
    pass
```

### Phase 2: ComfyUI Integration

```python
# backend/comfy_client.py
import websocket
import json
import uuid

class ComfyUIClient:
    def __init__(self, server_address="127.0.0.1:8188"):
        self.server_address = server_address
        self.client_id = str(uuid.uuid4())
    
    def queue_prompt(self, prompt):
        """Send prompt to ComfyUI"""
        pass
    
    def get_progress(self, prompt_id):
        """Get generation progress"""
        pass
```

### Phase 3: Model Management

```python
# backend/model_manager.py
class ModelManager:
    def __init__(self):
        self.models_dir = "./models"
        
    def list_models(self):
        """List available models"""
        pass
    
    def download_model(self, model_name, source):
        """Download model from HuggingFace"""
        pass
    
    def validate_model(self, model_path):
        """Validate model file integrity"""
        pass
```

### Phase 4: Electron-Python Bridge

Update Electron main process:

```typescript
// electron/main.ts
import { spawn } from 'child_process';

// Start Python backend
function startBackend() {
  const pythonProcess = spawn('python', ['backend/main.py'], {
    cwd: app.getAppPath(),
  });
  
  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python] ${data}`);
  });
  
  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python Error] ${data}`);
  });
}
```

## Supported Models

### Image Generation
1. **FLUX.1 [dev]** - 23.8 GB
   - Best quality
   - Apache 2.0 license
   - Requires significant VRAM

2. **FLUX.1 [schnell]** - 23.8 GB
   - 4 steps generation
   - Faster inference
   - Non-commercial license

3. **Stable Diffusion XL** - 6.9 GB
   - Good balance of quality/speed
   - Large community
   - Many fine-tuned variants

4. **Stable Diffusion 1.5** - 4.3 GB
   - Fast generation
   - Works on lower VRAM
   - Extensive ecosystem

### Video Generation
1. **LTX Video** - 9.4 GB
   - High-quality video
   - Direct text-to-video
   - 24fps output

2. **Stable Video Diffusion** - 9.6 GB
   - Image-to-video
   - 14/25 frame variants
   - Good motion quality

3. **AnimateDiff** - 1.6 GB
   - Motion module
   - Works with SD 1.5
   - Efficient

## Requirements

### Python Dependencies
```
torch>=2.0.0
torchvision>=0.15.0
diffusers>=0.25.0
transformers>=4.35.0
accelerate>=0.24.0
fastapi>=0.104.0
uvicorn>=0.24.0
websockets>=12.0
Pillow>=10.0.0
numpy>=1.24.0
```

### Hardware Requirements
- **Minimum**: NVIDIA GPU with 8GB VRAM
- **Recommended**: NVIDIA RTX 4090 with 24GB VRAM
- **CPU Mode**: Possible but very slow

## Next Steps

1. Create `backend/` directory structure
2. Implement FastAPI server with endpoints
3. Add ComfyUI integration
4. Create model download/management system
5. Implement WebSocket for real-time progress
6. Connect Electron IPC to Python backend
7. Add error handling and recovery
8. Test with various models
