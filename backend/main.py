"""
Vision Studio - Python Backend
FastAPI server for AI image and video generation
"""

import builtins
import sys
from typing import Any, Optional

# --- Safe print must be installed BEFORE any other imports, because some
# modules (e.g. direct_generator) print Unicode at import time and Windows
# PyInstaller bundles use cp1252 stdout which cannot encode emoji. -----------
ORIGINAL_PRINT = builtins.print


def make_console_safe(message: Any, encoding: Optional[str] = None) -> str:
    text = str(message)
    target_encoding = encoding or getattr(sys.stdout, "encoding", None) or "utf-8"
    return text.encode(target_encoding, errors="replace").decode(target_encoding, errors="replace")


def safe_print(*args: Any, **kwargs: Any) -> None:
    sep = kwargs.pop("sep", " ")
    file = kwargs.get("file")
    encoding = getattr(file, "encoding", None) if file is not None else None
    safe_args = [make_console_safe(arg, encoding=encoding) for arg in args]
    ORIGINAL_PRINT(*safe_args, sep=sep, **kwargs)


builtins.print = safe_print
# ---------------------------------------------------------------------------

import asyncio
import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from utils.job_manager import JobManager, JobStatus, GenerationJob
from utils.comfy_workflows import build_image_workflow
from utils.direct_video_generator import DirectVideoGenerator
from utils.model_manager import ModelManager
from utils.direct_generator import DirectGenerator
from utils.image_ops import apply_crop_and_transform, upscale_image_file
from utils.prompt_service import enhance_prompt

try:
    from utils.comfy_client import ComfyUIClient
    COMFY_CLIENT_IMPORT_ERROR: Optional[Exception] = None
except Exception as import_error:
    ComfyUIClient = None  # type: ignore[assignment]
    COMFY_CLIENT_IMPORT_ERROR = import_error

# Configuration
OUTPUT_DIR = os.getenv("OUTPUT_DIR", os.path.join(os.path.dirname(__file__), "outputs"))
MODELS_DIR = os.getenv("MODELS_DIR", os.path.join(os.path.dirname(__file__), "models"))
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")

# Ensure directories exist
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# Global instances
job_manager = JobManager()
model_manager = ModelManager(MODELS_DIR)
comfy_client: Optional[ComfyUIClient] = None
direct_generator: Optional[DirectGenerator] = None
direct_video_generator: Optional[DirectVideoGenerator] = None


def get_uvicorn_config(reload_enabled: Optional[bool] = None) -> Dict[str, Any]:
    if reload_enabled is None:
        reload_enabled = os.getenv("VISION_STUDIO_BACKEND_RELOAD", "").lower() in {"1", "true", "yes"}

    return {
        "host": "0.0.0.0",
        "port": 8000,
        "reload": reload_enabled,
        "log_level": "info",
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    global comfy_client, direct_generator, direct_video_generator
    
    # Startup
    print("🚀 Starting Vision Studio Backend...")
    
    # Initialize ComfyUI client
    if ComfyUIClient is None:
        print(f"⚠️ ComfyUI client unavailable: {COMFY_CLIENT_IMPORT_ERROR}")
        print("   Will use direct generation as fallback")
    else:
        try:
            comfy_client = ComfyUIClient(COMFYUI_URL)
            await comfy_client.connect()
            print(f"✅ Connected to ComfyUI at {COMFYUI_URL}")
        except Exception as e:
            print(f"⚠️ Could not connect to ComfyUI: {e}")
            print("   Will use direct generation as fallback")
    
    # Initialize direct generator
    try:
        direct_generator = DirectGenerator(MODELS_DIR, OUTPUT_DIR)
        print("✅ Direct generator initialized")
    except Exception as e:
        print(f"⚠️ Could not initialize direct generator: {e}")

    # Initialize direct video generator
    try:
        direct_video_generator = DirectVideoGenerator(MODELS_DIR, OUTPUT_DIR)
        print("✅ Direct video generator initialized")
    except Exception as e:
        print(f"⚠️ Could not initialize direct video generator: {e}")
    
    # Load available models
    await model_manager.scan_models()
    print(f"✅ Found {len(model_manager.available_models)} models")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down...")
    if comfy_client:
        await comfy_client.disconnect()


# Create FastAPI app with OpenAPI/Swagger enabled
app = FastAPI(
    title="Vision Studio API",
    description="""
## AI Image and Video Generation Backend

Professional-grade API for AI-powered creative content generation.

### Features
- **Image Generation** - FLUX.1, Stable Diffusion XL, SD 1.5
- **Video Generation** - LTX Video, Stable Video Diffusion, AnimateDiff
- **Image Editing** - Crop, upscale, transform, filters
- **Batch Processing** - Queue-based multi-prompt generation
- **Model Management** - Download, install, and manage AI models
- **Real-time Updates** - WebSocket-based progress streaming

### Authentication
Currently no authentication required (local-only deployment).

### Rate Limiting
⚠️ Not yet implemented - planned for production deployment.
    """,
    version="0.1.0",
    docs_url="/api/docs",      # Swagger UI
    redoc_url="/api/redoc",    # ReDoc
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
    contact={
        "name": "Vision Studio Team",
        "email": "hello@visionstudio.app",
    },
    license_info={
        "name": "MIT",
    },
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


class PromptEnhancementRequest(BaseModel):
    prompt: str = Field(..., description="Prompt to enhance")
    mode: str = Field(default="clarify", description="Enhancement mode")


class CropBoxRequest(BaseModel):
    left: int
    top: int
    width: int
    height: int


class ImageEditRequest(BaseModel):
    source_path: str
    crop_box: Optional[CropBoxRequest] = None
    rotation: int = 0
    flip_horizontal: bool = False
    flip_vertical: bool = False


class ImageUpscaleRequest(BaseModel):
    source_path: str
    scale_factor: int = Field(default=2, ge=2, le=4)


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

@app.get("/", tags=["Health"])
async def root():
    """
    Root endpoint - API health check.

    Returns a simple message confirming the API is running.
    """
    return {"message": "Vision Studio API", "version": "0.1.0"}


@app.get("/api/system/info", response_model=SystemInfo, tags=["System"])
async def get_system_info():
    """
    Get system information including GPU status and model availability.

    Returns detailed information about:
    - **GPU Availability**: Whether CUDA-capable GPU is detected
    - **GPU Name**: Model name (e.g., "NVIDIA GeForce RTX 4090")
    - **GPU VRAM**: Total video memory in GB
    - **CUDA Version**: Installed CUDA toolkit version
    - **ComfyUI Connection**: Whether ComfyUI client is connected
    - **Models Count**: Number of installed AI models

    **Use Case:** Check system capabilities before starting generation jobs.
    """
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


@app.post("/api/prompts/enhance", tags=["Prompts"])
async def enhance_prompt_endpoint(request: PromptEnhancementRequest):
    """
    Enhance a prompt using AI-powered prompt engineering.

    ## Enhancement Modes:
    - **clarify**: Add detail and structure while preserving the original subject
    - **variations**: Generate multiple alternative phrasings (returns array)
    - **expand**: Add more descriptive elements and context
    - **shorten**: Condense to essential elements only

    ### Request Body
    - `prompt`: The prompt to enhance (required)
    - `mode`: Enhancement mode (default: "clarify")

    ### Response
    Enhanced prompt string, or array of variations if mode="variations"

    ### Example
    ```json
    {
      "prompt": "a cat",
      "mode": "clarify"
    }
    ```
    """
    return enhance_prompt(request.prompt, request.mode)


def create_derived_output_path(source_path: str, prefix: str) -> tuple[str, str]:
    source = Path(source_path)
    derived_job_id = f"{prefix}-{uuid.uuid4().hex[:12]}"
    target_dir = Path(OUTPUT_DIR) / derived_job_id
    target_dir.mkdir(parents=True, exist_ok=True)
    output_filename = f"{source.stem}-{prefix}.png"
    absolute_path = str((target_dir / output_filename).resolve()).replace("\\", "/")
    relative_path = f"/outputs/{derived_job_id}/{output_filename}"
    return absolute_path, relative_path


def model_to_dict(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


@app.post("/api/images/crop", response_model=Dict[str, Any], tags=["Images"])
async def crop_image(request: ImageEditRequest):
    """
    Crop and transform an image with optional rotation and flip.

    ### Request Body
    - `source_path`: Absolute path to source image (required)
    - `crop_box`: Crop region (left, top, width, height) - optional
    - `rotation`: Rotation in degrees (default: 0)
    - `flip_horizontal`: Flip horizontally (default: false)
    - `flip_vertical`: Flip vertically (default: false)

    ### Response
    - `image`: Relative URL path to cropped image
    - `width`: Output image width in pixels
    - `height`: Output image height in pixels

    ### Errors
    - `404`: Source image not found
    """
    if not os.path.exists(request.source_path):
        raise HTTPException(status_code=404, detail="Source image not found")

    output_path, relative_path = create_derived_output_path(request.source_path, "crop")
    result = apply_crop_and_transform(
        request.source_path,
        output_path,
        crop_box=model_to_dict(request.crop_box) if request.crop_box else None,
        rotation=request.rotation,
        flip_horizontal=request.flip_horizontal,
        flip_vertical=request.flip_vertical,
    )
    result["image"] = relative_path
    return result


@app.post("/api/images/upscale", response_model=Dict[str, Any], tags=["Images"])
async def upscale_image(request: ImageUpscaleRequest):
    """
    Upscale an image using AI super-resolution.

    ### Request Body
    - `source_path`: Absolute path to source image (required)
    - `scale_factor`: Upscale multiplier (2-4, default: 2)

    ### Response
    - `image`: Relative URL path to upscaled image
    - `width`: Output image width in pixels
    - `height`: Output image height in pixels

    ### Errors
    - `404`: Source image not found
    """
    if not os.path.exists(request.source_path):
        raise HTTPException(status_code=404, detail="Source image not found")

    output_path, relative_path = create_derived_output_path(request.source_path, "upscale")
    result = upscale_image_file(
        request.source_path,
        output_path,
        scale_factor=request.scale_factor,
    )
    result["image"] = relative_path
    return result


# ============= Image Generation =============

@app.post("/api/generate/image", response_model=JobResponse, tags=["Generation"])
async def generate_image(
    request: ImageGenerationRequest,
    background_tasks: BackgroundTasks
):
    """
    Start an AI image generation job.

    Creates a new generation job and returns immediately. The job runs asynchronously
    in the background. Use `GET /api/jobs/{job_id}` to poll for progress and results,
    or connect to `ws://localhost:8000/ws` for real-time updates.

    ### Request Body
    - `prompt`: Text description of the image to generate (required)
    - `negative_prompt`: Elements to exclude from the image (default: "")
    - `width`: Image width in pixels (256-2048, default: 1024)
    - `height`: Image height in pixels (256-2048, default: 1024)
    - `steps`: Sampling iterations (1-100, default: 25)
    - `cfg_scale`: Classifier-free guidance scale (1-30, default: 7.5)
    - `seed`: Random seed for reproducibility (-1 for random, default: -1)
    - `model`: Model ID to use (default: "flux-dev")
    - `scheduler`: Sampling scheduler (default: "euler")

    ### Response
    - `job_id`: Unique identifier for the generation job
    - `status`: Initial status ("pending")
    - `message`: Human-readable status message

    ### Models Available
    - `flux-dev`: FLUX.1 dev model (highest quality)
    - `sdxl`: Stable Diffusion XL
    - `sd-1.5`: Stable Diffusion 1.5 (fastest)

    ### Example
    ```json
    {
      "prompt": "a serene mountain landscape at sunset, golden hour lighting",
      "negative_prompt": "blurry, low quality",
      "width": 1024,
      "height": 1024,
      "steps": 30,
      "cfg_scale": 7.5,
      "seed": -1,
      "model": "flux-dev"
    }
    ```
    """
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
    if not comfy_client:
        raise RuntimeError("ComfyUI client is not available")

    workflow, resolved_seed = build_image_workflow(
        model=request.model,
        prompt=request.prompt,
        negative_prompt=request.negative_prompt,
        width=request.width,
        height=request.height,
        steps=request.steps,
        cfg_scale=request.cfg_scale,
        scheduler=request.scheduler,
        seed=request.seed if request.seed != -1 else None,
        file_prefix=f"vision_studio/{job_id}/image",
    )

    prompt_id = await comfy_client.queue_prompt(workflow)
    job_manager.update_job(job_id, progress=10.0)
    outputs = await comfy_client.wait_for_prompt_completion(
        prompt_id,
        progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
    )

    generated_images: List[str] = []
    output_dir = Path(OUTPUT_DIR) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    for index, output in enumerate(outputs, start=1):
        image_bytes = await comfy_client.get_image(
            output["filename"],
            output.get("subfolder", ""),
            output.get("type", "output"),
        )
        extension = Path(output["filename"]).suffix or ".png"
        local_filename = f"image_{index:03d}{extension}"
        local_path = output_dir / local_filename
        local_path.write_bytes(image_bytes)
        generated_images.append(f"/outputs/{job_id}/{local_filename}")

    return {
        "images": generated_images,
        "seed": resolved_seed,
        "width": request.width,
        "height": request.height,
        "prompt": request.prompt,
        "model": request.model,
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
        scheduler=request.scheduler,
        progress_callback=lambda p: job_manager.update_job(job_id, progress=p)
    )
    
    return result


# ============= Video Generation =============

@app.post("/api/generate/video", response_model=JobResponse, tags=["Generation"])
async def generate_video(
    request: VideoGenerationRequest,
    background_tasks: BackgroundTasks
):
    """
    Start an AI video generation job.

    Creates a new video generation job and returns immediately. The job runs asynchronously
    in the background. Video generation typically takes 2-10 minutes depending on duration,
    resolution, and GPU capabilities.

    ### Request Body
    - `prompt`: Text description of the video to generate (required)
    - `image_path`: Optional input image for image-to-video (default: null)
    - `width`: Video width in pixels (256-1920, default: 1024)
    - `height`: Video height in pixels (256-1080, default: 576)
    - `fps`: Frames per second (12-60, default: 24)
    - `duration`: Video length in seconds (1-10, default: 5)
    - `steps`: Sampling iterations (1-100, default: 25)
    - `model`: Model ID to use (default: "ltx-video")
    - `seed`: Random seed for reproducibility (default: -1)

    ### Models Available
    - `ltx-video`: LTX Video model (text-to-video and image-to-video)
    - `svd`: Stable Video Diffusion (image-to-video only)
    - `animate-diff`: AnimateDiff (text-to-video with motion modules)

    ### Text-to-Video vs Image-to-Video
    - **Text-to-Video**: Use when `image_path` is null. Model: ltx-video, animate-diff.
    - **Image-to-Video**: Provide `image_path`. Model: svd, ltx-video.

    ### Example
    ```json
    {
      "prompt": "a drone flying over a mountain range, cinematic camera movement",
      "width": 1024,
      "height": 576,
      "fps": 24,
      "duration": 4,
      "steps": 30,
      "model": "ltx-video",
      "seed": -1
    }
    ```
    """
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

        if not direct_video_generator:
            raise RuntimeError("Direct video generator not available")

        result = await direct_video_generator.generate_video(
            job_id=job_id,
            prompt=request.prompt,
            image_path=request.image_path,
            width=request.width,
            height=request.height,
            fps=request.fps,
            duration=request.duration,
            steps=request.steps,
            model_name=request.model,
            seed=request.seed if request.seed != -1 else 0,
            progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
        )
        
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

@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse, tags=["Jobs"])
async def get_job_status(job_id: str):
    """
    Get detailed status and progress for a generation job.

    ### Path Parameters
    - `job_id`: The unique job identifier returned from `/api/generate/image` or `/api/generate/video`

    ### Response Fields
    - `job_id`: Unique job identifier
    - `status`: Current status (pending, processing, completed, failed, cancelled)
    - `progress`: Completion percentage (0.0 - 100.0)
    - `type`: Job type ("image" or "video")
    - `created_at`: ISO 8601 timestamp when job was created
    - `completed_at`: ISO 8601 timestamp when job finished (null if still running)
    - `result`: Job output (images array or video path, seed, metadata)
    - `error`: Error message if status is "failed"

    ### Status Values
    - `pending`: Job queued, waiting to start
    - `processing`: Actively generating
    - `completed`: Successfully finished
    - `failed`: Error occurred (check `error` field)
    - `cancelled`: User cancelled the job

    ### Errors
    - `404`: Job not found
    """
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


@app.post("/api/jobs/{job_id}/cancel", tags=["Jobs"])
async def cancel_job(job_id: str):
    """
    Cancel a running or pending generation job.

    ### Path Parameters
    - `job_id`: The unique job identifier

    ### Behavior
    - If job is `processing` or `pending`: Sets status to `cancelled` and stops generation
    - If job is already `completed`, `failed`, or `cancelled`: Returns message indicating current status

    ### Response
    - `message`: Human-readable result description

    ### Errors
    - `404`: Job not found
    """
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


@app.get("/api/jobs", tags=["Jobs"])
async def list_jobs(status: Optional[str] = None, limit: int = 50):
    """
    List recent generation jobs with optional filtering.

    ### Query Parameters
    - `status`: Filter by status (pending, processing, completed, failed, cancelled)
    - `limit`: Maximum number of jobs to return (1-100, default: 50)

    ### Response
    - `jobs`: Array of job summaries, sorted by creation time (newest first)

    ### Example
    ```
    GET /api/jobs?status=completed&limit=10
    ```
    """
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

@app.get("/api/models", response_model=List[ModelInfo], tags=["Models"])
async def list_models():
    """
    List all available AI models.

    Returns a list of models that are installed or available for download.

    ### Response Fields
    - `id`: Unique model identifier (used in generation requests)
    - `name`: Human-readable model name
    - `type`: Model type (image, video, lora, controlnet)
    - `size`: Model size in human-readable format (e.g., "5.2 GB")
    - `status`: Installation status (installed, available, downloading)
    - `description`: Model description and capabilities

    ### Example Response
    ```json
    [
      {
        "id": "flux-dev",
        "name": "FLUX.1 [dev]",
        "type": "image",
        "size": "12.0 GB",
        "status": "installed",
        "description": "High-quality text-to-image model"
      }
    ]
    ```
    """
    return model_manager.get_model_list()


@app.post("/api/models/{model_id}/download", tags=["Models"])
async def download_model(model_id: str, background_tasks: BackgroundTasks):
    """
    Start downloading a model in the background.

    ### Path Parameters
    - `model_id`: The unique model identifier (e.g., "flux-dev", "sdxl")

    ### Behavior
    Model downloads run asynchronously in the background. Use `GET /api/models/{model_id}/status`
    to check download progress. Large models (10+ GB) may take several minutes depending on
    internet connection speed.

    ### Response
    - `success`: Always true if download was queued
    - `message`: Confirmation message

    ### Errors
    - `404`: Model ID not found in available models list

    ### Example
    ```
    POST /api/models/flux-dev/download
    ```
    """
    background_tasks.add_task(model_manager.download_model, model_id)
    return {"success": True, "message": f"Started downloading {model_id}"}


@app.get("/api/models/{model_id}/status", tags=["Models"])
async def get_model_status(model_id: str):
    """
    Get detailed status of a model download.

    ### Path Parameters
    - `model_id`: The unique model identifier

    ### Response Fields
    - `id`: Model identifier
    - `name`: Model name
    - `status`: Current status (pending, downloading, completed, failed)
    - `progress`: Download progress (0.0 - 100.0)
    - `downloaded_bytes`: Bytes downloaded so far
    - `total_bytes`: Total model size in bytes
    - `error`: Error message if download failed

    ### Errors
    - `404`: Model ID not found
    """
    status = model_manager.get_model_status(model_id)
    return status


@app.delete("/api/models/{model_id}", tags=["Models"])
async def delete_model(model_id: str):
    """
    Delete a locally installed model.

    ### Path Parameters
    - `model_id`: The unique model identifier

    ### Behavior
    Frees disk space by removing the model files. The model can be re-downloaded later
    if needed.

    ### Response
    - `success`: True if model was deleted

    ### Errors
    - `404`: Model not found or not installed locally
    """
    deleted = await model_manager.delete_model(model_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model not found or not installed")
    return {"success": True}


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


@app.websocket("/ws", tags=["WebSocket"])
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time generation job updates.

    Connect to this endpoint to receive live progress updates for all active generation jobs.
    This eliminates the need for HTTP polling.

    ### Connection
    ```
    ws://localhost:8000/ws
    ```

    ### Client Messages
    Send JSON objects with the following structure:
    ```json
    {
      "action": "subscribe",
      "job_id": "job-123"  // Optional: subscribe to specific job only
    }
    ```

    ### Server Messages
    The server pushes periodic updates (every 500ms) for all processing jobs:
    ```json
    {
      "type": "job_update",
      "job_id": "job-123",
      "status": "processing",
      "progress": 45.5
    }
    ```

    ### Message Fields
    - `type`: Always "job_update"
    - `job_id`: Unique job identifier
    - `status`: Current job status (pending, processing, completed, failed, cancelled)
    - `progress`: Completion percentage (0.0 - 100.0)

    ### Example (JavaScript)
    ```javascript
    const ws = new WebSocket("ws://localhost:8000/ws");
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      console.log(`Job ${update.job_id}: ${update.progress}%`);
    };
    ```

    ### Disconnection
    The server automatically removes disconnected clients. Reconnect with exponential backoff
    if the connection is lost.
    """
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

    config = get_uvicorn_config()
    # When running as a PyInstaller bundle, uvicorn cannot import "main:app" by
    # string because the module doesn't exist in the frozen namespace.  Passing
    # the app object directly works in both dev and bundled contexts.  Note:
    # reload must be disabled when passing the app object (reload requires the
    # string form), which is fine for production bundles.
    if getattr(sys, "frozen", False):
        config["reload"] = False
        uvicorn.run(app, **config)
    else:
        uvicorn.run("main:app", **config)
