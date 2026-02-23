"""
Vision Studio - Python Backend
FastAPI server for AI image and video generation
"""

import asyncio
import uuid
import json
import os
from datetime import datetime
from typing import Optional, Dict, List, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from utils.job_manager import JobManager, JobStatus, GenerationJob
from utils.comfy_client import ComfyUIClient
from utils.model_manager import ModelManager
from utils.direct_generator import DirectGenerator

# Configuration
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")

# Ensure directories exist
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# Global instances
job_manager = JobManager()
model_manager = ModelManager(MODELS_DIR)
comfy_client: Optional[ComfyUIClient] = None
direct_generator: Optional[DirectGenerator] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    global comfy_client, direct_generator
    
    # Startup
    print("🚀 Starting Vision Studio Backend...")
    
    # Initialize ComfyUI client
    try:
        comfy_client = ComfyUIClient(COMFYUI_URL)
        await comfy_client.connect()
        print(f"✅ Connected to ComfyUI at {COMFYUI_URL}")
    except Exception as e:
        print(f"⚠️ Could not connect to ComfyUI: {e}")
        print("   Will use direct generation as fallback")
    
    # Initialize direct generator
    try:
        direct_generator = DirectGenerator(MODELS_DIR)
        print("✅ Direct generator initialized")
    except Exception as e:
        print(f"⚠️ Could not initialize direct generator: {e}")
    
    # Load available models
    await model_manager.scan_models()
    print(f"✅ Found {len(model_manager.available_models)} models")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down...")
    if comfy_client:
        await comfy_client.disconnect()


# Create FastAPI app
app = FastAPI(
    title="Vision Studio API",
    description="AI Image and Video Generation Backend",
    version="0.1.0",
    lifespan=lifespan
)

# CORS middleware for Electron
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount outputs directory for serving generated files
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")


# ============= Pydantic Models =============

class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., description="Positive prompt for generation")
    negative_prompt: str = Field(default="", description="Negative prompt")
    width: int = Field(default=1024, ge=256, le=2048, description="Image width")
    height: int = Field(default=1024, ge=256, le=2048, description="Image height")
    steps: int = Field(default=25, ge=1, le=100, description="Sampling steps")
    cfg_scale: float = Field(default=7.5, ge=1, le=30, description="CFG Scale")
    seed: int = Field(default=-1, description="Random seed (-1 for random)")
    model: str = Field(default="flux-dev", description="Model to use")
    scheduler: str = Field(default="euler", description="Scheduler/sampler")


class VideoGenerationRequest(BaseModel):
    prompt: str = Field(..., description="Prompt for video generation")
    image_path: Optional[str] = Field(default=None, description="Optional input image")
    width: int = Field(default=1024, ge=256, le=1920)
    height: int = Field(default=576, ge=256, le=1080)
    fps: int = Field(default=24, ge=12, le=60)
    duration: int = Field(default=5, ge=1, le=10, description="Duration in seconds")
    steps: int = Field(default=25, ge=1, le=100)
    model: str = Field(default="ltx-video", description="Model to use")
    seed: int = Field(default=-1)


class JobResponse(BaseModel):
    job_id: str
    status: str
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    type: str
    created_at: datetime
    completed_at: Optional[datetime]
    result: Optional[Dict[str, Any]]
    error: Optional[str]


class ModelInfo(BaseModel):
    id: str
    name: str
    type: str
    size: str
    status: str
    description: str


class SystemInfo(BaseModel):
    gpu_available: bool
    gpu_name: Optional[str]
    gpu_vram: Optional[str]
    cuda_version: Optional[str]
    comfyui_connected: bool
    models_count: int


# ============= API Endpoints =============

@app.get("/")
async def root():
    return {"message": "Vision Studio API", "version": "0.1.0"}


@app.get("/api/system/info", response_model=SystemInfo)
async def get_system_info():
    """Get system information including GPU status"""
    import torch
    
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
    gpu_vram = f"{torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB" if gpu_available else None
    cuda_version = torch.version.cuda
    
    return SystemInfo(
        gpu_available=gpu_available,
        gpu_name=gpu_name,
        gpu_vram=gpu_vram,
        cuda_version=cuda_version,
        comfyui_connected=comfy_client is not None and comfy_client.connected,
        models_count=len(model_manager.available_models)
    )


# ============= Image Generation =============

@app.post("/api/generate/image", response_model=JobResponse)
async def generate_image(
    request: ImageGenerationRequest,
    background_tasks: BackgroundTasks
):
    """Start an image generation job"""
    job_id = str(uuid.uuid4())
    
    # Create job
    job = GenerationJob(
        id=job_id,
        type="image",
        status=JobStatus.PENDING,
        params=request.dict(),
        output_dir=os.path.join(OUTPUT_DIR, job_id)
    )
    
    os.makedirs(job.output_dir, exist_ok=True)
    job_manager.add_job(job)
    
    # Start generation in background
    background_tasks.add_task(
        process_image_generation,
        job_id,
        request
    )
    
    return JobResponse(
        job_id=job_id,
        status="pending",
        message="Image generation job started"
    )


async def process_image_generation(job_id: str, request: ImageGenerationRequest):
    """Process image generation job"""
    try:
        job_manager.update_job(job_id, status=JobStatus.PROCESSING, progress=0.0)
        
        # Try ComfyUI first, fallback to direct generation
        if comfy_client and comfy_client.connected:
            result = await generate_with_comfyui(job_id, request)
        else:
            result = await generate_direct(job_id, request)
        
        job_manager.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            result=result,
            completed_at=datetime.now()
        )
        
    except Exception as e:
        print(f"❌ Image generation failed: {e}")
        job_manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=datetime.now()
        )


async def generate_with_comfyui(job_id: str, request: ImageGenerationRequest) -> Dict:
    """Generate image using ComfyUI"""
    # This would send a workflow to ComfyUI
    # For now, placeholder
    await asyncio.sleep(2)  # Simulate processing
    
    return {
        "images": [f"/outputs/{job_id}/image_001.png"],
        "seed": request.seed if request.seed != -1 else 12345,
        "width": request.width,
        "height": request.height
    }


async def generate_direct(job_id: str, request: ImageGenerationRequest) -> Dict:
    """Generate image using direct diffusers pipeline"""
    if not direct_generator:
        raise RuntimeError("Direct generator not available")
    
    result = await direct_generator.generate_image(
        job_id=job_id,
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        width=request.width,
        height=request.height,
        steps=request.steps,
        cfg_scale=request.cfg_scale,
        seed=request.seed if request.seed != -1 else None,
        model_name=request.model,
        progress_callback=lambda p: job_manager.update_job(job_id, progress=p)
    )
    
    return result


# ============= Video Generation =============

@app.post("/api/generate/video", response_model=JobResponse)
async def generate_video(
    request: VideoGenerationRequest,
    background_tasks: BackgroundTasks
):
    """Start a video generation job"""
    job_id = str(uuid.uuid4())
    
    job = GenerationJob(
        id=job_id,
        type="video",
        status=JobStatus.PENDING,
        params=request.dict(),
        output_dir=os.path.join(OUTPUT_DIR, job_id)
    )
    
    os.makedirs(job.output_dir, exist_ok=True)
    job_manager.add_job(job)
    
    background_tasks.add_task(
        process_video_generation,
        job_id,
        request
    )
    
    return JobResponse(
        job_id=job_id,
        status="pending",
        message="Video generation job started"
    )


async def process_video_generation(job_id: str, request: VideoGenerationRequest):
    """Process video generation job"""
    try:
        job_manager.update_job(job_id, status=JobStatus.PROCESSING, progress=0.0)
        
        # Video generation logic here
        # This would use video models like LTX Video, SVD, etc.
        
        # Simulate for now
        for i in range(10):
            await asyncio.sleep(1)
            job_manager.update_job(job_id, progress=(i + 1) * 10)
        
        result = {
            "video": f"/outputs/{job_id}/video.mp4",
            "frames": 24 * request.duration,
            "fps": request.fps,
            "duration": request.duration
        }
        
        job_manager.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            result=result,
            completed_at=datetime.now()
        )
        
    except Exception as e:
        print(f"❌ Video generation failed: {e}")
        job_manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=datetime.now()
        )


# ============= Job Management =============

@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get job status and progress"""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobStatusResponse(
        job_id=job.id,
        status=job.status.value,
        progress=job.progress,
        type=job.type,
        created_at=job.created_at,
        completed_at=job.completed_at,
        result=job.result,
        error=job.error
    )


@app.post("/api/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    """Cancel a running job"""
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if job.status == JobStatus.PROCESSING:
        job_manager.update_job(
            job_id,
            status=JobStatus.CANCELLED,
            completed_at=datetime.now()
        )
        return {"message": "Job cancelled"}
    
    return {"message": f"Job is already {job.status.value}"}


@app.get("/api/jobs")
async def list_jobs(status: Optional[str] = None, limit: int = 50):
    """List recent jobs"""
    jobs = job_manager.list_jobs(status=status, limit=limit)
    return {
        "jobs": [
            {
                "job_id": j.id,
                "status": j.status.value,
                "type": j.type,
                "progress": j.progress,
                "created_at": j.created_at
            }
            for j in jobs
        ]
    }


# ============= Model Management =============

@app.get("/api/models", response_model=List[ModelInfo])
async def list_models():
    """List available models"""
    return model_manager.get_model_list()


@app.post("/api/models/{model_id}/download")
async def download_model(model_id: str, background_tasks: BackgroundTasks):
    """Download a model"""
    background_tasks.add_task(model_manager.download_model, model_id)
    return {"message": f"Started downloading {model_id}"}


@app.get("/api/models/{model_id}/status")
async def get_model_status(model_id: str):
    """Get model download status"""
    status = model_manager.get_model_status(model_id)
    return status


# ============= WebSocket for Real-time Updates =============

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time job updates"""
    await manager.connect(websocket)
    
    # Start background task to send updates
    update_task = asyncio.create_task(send_job_updates(websocket))
    
    try:
        while True:
            # Receive commands from client
            data = await websocket.receive_json()
            
            if data.get("action") == "subscribe":
                job_id = data.get("job_id")
                # Subscribe to specific job updates
                pass
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        update_task.cancel()


async def send_job_updates(websocket: WebSocket):
    """Send periodic job updates"""
    try:
        while True:
            # Send all active jobs status
            active_jobs = job_manager.list_jobs(status="processing")
            
            for job in active_jobs:
                await websocket.send_json({
                    "type": "job_update",
                    "job_id": job.id,
                    "status": job.status.value,
                    "progress": job.progress
                })
            
            await asyncio.sleep(0.5)  # Update every 500ms
            
    except asyncio.CancelledError:
        pass


# ============= Run Server =============

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
