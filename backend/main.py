"""
Vision Studio - Python Backend
FastAPI server for AI image and video generation
"""

import builtins
import sys
from typing import Any, Callable, Optional

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
import logging
import os
import shutil
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List
from contextlib import asynccontextmanager

import imageio.v2 as imageio
import imageio_ffmpeg
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from utils.job_manager import JobManager, JobStatus, GenerationJob
from utils.logging_config import setup_logging, get_logger
from utils.comfy_workflows import build_image_workflow
from utils.direct_video_generator import DirectVideoGenerator
from utils.model_manager import ModelManager
from utils.direct_generator import DirectGenerator
from utils.image_ops import apply_crop_and_transform, upscale_image_file
from utils.prompt_service import enhance_prompt
from api.controlnet import router as controlnet_router
from db.migrate import run_migrations
from middleware.rate_limit import limiter, rate_limit_exceeded_handler
from foundry.registry import ModelRegistry
from foundry.schemas import ModelRecordSchema

# Initialize logging at module load time
setup_logging(log_file=os.getenv("LOG_FILE"))
logger = get_logger(__name__)
from api.lora import router as lora_router
from api.edit import router as edit_router
from api.batch import router as batch_router

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
DATABASE_PATH = os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "data", "vision_studio.db"))
BACKEND_AUTH_HEADER = "x-vision-studio-token"
BACKEND_AUTH_TOKEN = os.getenv("VISION_STUDIO_BACKEND_AUTH_TOKEN")
AUTH_EXEMPT_PATHS = {"/", "/api/health", "/api/docs", "/api/redoc", "/api/openapi.json"}

# Ensure directories exist
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)

# Run database migrations at startup
run_migrations(DATABASE_PATH)

# Global instances
job_manager = JobManager()
model_manager = ModelManager(MODELS_DIR)
_CATALOG_PATH = os.path.join(os.path.dirname(__file__), "foundry", "verified-catalog.json")
model_registry = ModelRegistry(models_dir=MODELS_DIR, catalog_path=_CATALOG_PATH)
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
    logger.info("Starting Vision Studio Backend...")

    # Initialize ComfyUI client
    if ComfyUIClient is None:
        logger.warning(f"ComfyUI client unavailable: {COMFY_CLIENT_IMPORT_ERROR}. Will use direct generation as fallback")
    else:
        try:
            comfy_client = ComfyUIClient(COMFYUI_URL)
            await comfy_client.connect()
            logger.info(f"Connected to ComfyUI at {COMFYUI_URL}")
        except Exception as e:
            logger.warning(f"Could not connect to ComfyUI: {e}. Will use direct generation as fallback")

    # Initialize direct generator
    try:
        direct_generator = DirectGenerator(MODELS_DIR, OUTPUT_DIR)
        logger.info("Direct generator initialized")
    except Exception as e:
        logger.warning(f"Could not initialize direct generator: {e}")

    # Initialize direct video generator
    try:
        direct_video_generator = DirectVideoGenerator(MODELS_DIR, OUTPUT_DIR)
        logger.info("Direct video generator initialized")
    except Exception as e:
        logger.warning(f"Could not initialize direct video generator: {e}")

    # Load available models
    await model_manager.scan_models()
    logger.info(f"Found {len(model_manager.available_models)} models")

    yield

    # Shutdown
    logger.info("Shutting down...")
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
Rate limiting is enabled to prevent abuse:
- Generation endpoints: 10 requests/minute
- Edit endpoints: 30 requests/minute
- Batch endpoints: 5 requests/minute
- Default: 60 requests/minute
    """,
    version="3.0.0",
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

# Add rate limiter to app state
app.state.limiter = limiter

# Register rate limit exceeded exception handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


@app.middleware("http")
async def require_local_auth_token(request: Request, call_next):
    path = request.url.path
    is_exempt = path in AUTH_EXEMPT_PATHS or path.startswith("/outputs/")
    if BACKEND_AUTH_TOKEN and not is_exempt:
        if request.headers.get(BACKEND_AUTH_HEADER) != BACKEND_AUTH_TOKEN:
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})

    return await call_next(request)


# Request/Response logging middleware with timing
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all HTTP requests with timing and response status."""
    start_time = time.time()
    request_id = str(uuid.uuid4())

    # Log request start
    logger.info(
        "HTTP request started",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
        },
    )

    try:
        response = await call_next(request)

        # Calculate duration
        duration_ms = (time.time() - start_time) * 1000

        # Log response
        logger.info(
            "HTTP request completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
            },
        )

        return response

    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        logger.error(
            f"{request.method} {request.url.path} failed: {e}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "duration_ms": round(duration_ms, 2),
            },
            exc_info=True,
        )
        raise


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

# Register API routers
app.include_router(controlnet_router)
app.include_router(lora_router)
app.include_router(edit_router)
app.include_router(batch_router)


@app.get("/api/health", tags=["System"])
async def health_check():
    """Return backend health including generator availability."""
    return {
        "status": "ok",
        "comfyui_connected": comfy_client is not None and getattr(comfy_client, "connected", False),
        "direct_generator_available": direct_generator is not None,
        "direct_video_generator_available": direct_video_generator is not None,
        "generation_available": (
            (comfy_client is not None and getattr(comfy_client, "connected", False))
            or direct_generator is not None
        ),
    }


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


class VideoFrameExtractRequest(BaseModel):
    source_path: str
    time_ms: int = Field(default=0, ge=0)


class TimelineExportLayerRequest(BaseModel):
    source_path: str
    media_type: str = Field(pattern="^(image|video)$")
    source_time_ms: int = Field(default=0, ge=0)
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)


class TimelineExportFrameRequest(BaseModel):
    time_ms: int = Field(default=0, ge=0)
    layers: List[TimelineExportLayerRequest] = Field(default_factory=list)


class TimelineExportAudioLayerRequest(BaseModel):
    source_path: str
    source_time_ms: int = Field(default=0, ge=0)
    timeline_offset_ms: int = Field(default=0, ge=0)
    duration_ms: int = Field(default=1, ge=1)
    clip_offset_ms: int = Field(default=0, ge=0)
    clip_duration_ms: int = Field(default=1, ge=1)
    gain: float = Field(default=1.0, ge=0.0, le=2.0)
    fade_in_ms: int = Field(default=0, ge=0)
    fade_out_ms: int = Field(default=0, ge=0)


class TimelineExportRequest(BaseModel):
    sequence_name: str = Field(default="Timeline Export")
    width: int = Field(default=1920, ge=64, le=4096)
    height: int = Field(default=1080, ge=64, le=4096)
    fps: int = Field(default=24, ge=1, le=60)
    output_path: str
    frames: List[TimelineExportFrameRequest] = Field(min_length=1, max_length=24000)
    audio_layers: List[TimelineExportAudioLayerRequest] = Field(default_factory=list)


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
@limiter.limit("60/minute")
async def root(request: Request):
    """
    Root endpoint - API health check.

    Returns a simple message confirming the API is running.
    """
    return {"message": "Vision Studio API", "version": "3.0.0"}


@app.get("/api/system/info", response_model=SystemInfo, tags=["System"])
@limiter.limit("60/minute")
async def get_system_info(request: Request):
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
@limiter.limit("60/minute")
async def enhance_prompt_endpoint(request: Request, prompt_request: PromptEnhancementRequest):
    """
    Enhance a prompt using AI-powered prompt engineering.

    ## Enhancement Modes:
    - **clarify**: Add detail and structure while preserving the original subject
    - **cinematic**: Lean into film language, dramatic lighting, and atmosphere
    - **concise**: Condense to the most important visual elements
    - **variations**: Generate multiple alternative phrasings (returns array)
    - **expand**: Add more descriptive elements and context

    ### Request Body
    - `prompt`: The prompt to enhance (required)
    - `mode`: Enhancement mode (default: "clarify")

    ### Response
    Structured JSON with `mode`, `prompt`, and `variations`

    ### Example
    ```json
    {
      "prompt": "a cat",
      "mode": "clarify"
    }
    ```
    """
    return enhance_prompt(prompt_request.prompt, prompt_request.mode)


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


def extract_video_frame_file(source_path: str, output_path: str, time_ms: int = 0) -> Dict[str, Any]:
    reader = imageio.get_reader(source_path)

    try:
        metadata = reader.get_meta_data() or {}
        fps_value = metadata.get("fps")
        fps = float(fps_value) if isinstance(fps_value, (int, float)) and fps_value > 0 else None
        frame_index = max(0, round((time_ms / 1000.0) * fps)) if fps else 0

        frame_count_value = metadata.get("nframes")
        if isinstance(frame_count_value, int) and frame_count_value > 0:
            frame_index = min(frame_index, frame_count_value - 1)

        try:
            frame = reader.get_data(frame_index)
        except Exception:
            fallback_index = (
                max(0, frame_count_value - 1)
                if isinstance(frame_count_value, int) and frame_count_value > 0
                else 0
            )
            frame = reader.get_data(fallback_index)
            frame_index = fallback_index

        image = Image.fromarray(frame)
        image.save(output_path, "PNG")

        return {
            "output_path": output_path,
            "width": image.width,
            "height": image.height,
            "time_ms": int(round((frame_index / fps) * 1000)) if fps else int(time_ms),
            "frame_index": int(frame_index),
        }
    finally:
        reader.close()


def normalize_local_path(file_path: str) -> str:
    return str(Path(file_path).expanduser()).replace("\\", "/")


def resolve_backend_media_path(source_path: str) -> str:
    normalized_path = source_path.replace("\\", "/")

    if normalized_path.startswith("/outputs/"):
        relative_path = normalized_path.replace("/outputs/", "", 1)
        return normalize_local_path(os.path.join(OUTPUT_DIR, relative_path))

    if normalized_path.startswith("file:///"):
        return normalize_local_path(normalized_path.replace("file:///", "", 1))

    return normalize_local_path(normalized_path)


def fit_media_to_canvas(source_image: Image.Image, width: int, height: int, opacity: float) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    image = source_image.convert("RGBA")
    image.thumbnail((width, height), Image.Resampling.LANCZOS)

    if opacity < 1.0:
        alpha = image.getchannel("A")
        alpha = alpha.point(lambda value: int(round(value * opacity)))
        image.putalpha(alpha)

    offset_x = max(0, (width - image.width) // 2)
    offset_y = max(0, (height - image.height) // 2)
    canvas.alpha_composite(image, (offset_x, offset_y))
    return canvas


def extract_video_frame_image(source_path: str, time_ms: int = 0) -> Image.Image:
    reader = imageio.get_reader(source_path)

    try:
        metadata = reader.get_meta_data() or {}
        fps_value = metadata.get("fps")
        fps = float(fps_value) if isinstance(fps_value, (int, float)) and fps_value > 0 else None
        frame_index = max(0, round((time_ms / 1000.0) * fps)) if fps else 0

        frame_count_value = metadata.get("nframes")
        if isinstance(frame_count_value, int) and frame_count_value > 0:
            frame_index = min(frame_index, frame_count_value - 1)

        try:
            frame = reader.get_data(frame_index)
        except Exception:
            fallback_index = (
                max(0, frame_count_value - 1)
                if isinstance(frame_count_value, int) and frame_count_value > 0
                else 0
            )
            frame = reader.get_data(fallback_index)

        return Image.fromarray(frame).convert("RGBA")
    finally:
        reader.close()


def render_timeline_export_frame(
    frame_request: TimelineExportFrameRequest,
    width: int,
    height: int,
    image_cache: Optional[Dict[str, Image.Image]] = None,
) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    reusable_image_cache = image_cache if image_cache is not None else {}

    for layer in frame_request.layers:
        source_path = resolve_backend_media_path(layer.source_path)
        if not os.path.exists(source_path):
            raise FileNotFoundError(f"Missing media source: {source_path}")

        if layer.media_type == "image":
            cached_image = reusable_image_cache.get(source_path)
            if cached_image is None:
                with Image.open(source_path) as opened_image:
                    cached_image = opened_image.convert("RGBA")
                reusable_image_cache[source_path] = cached_image
            source_image = cached_image.copy()
        else:
            source_image = extract_video_frame_image(source_path, time_ms=layer.source_time_ms)

        canvas.alpha_composite(
            fit_media_to_canvas(source_image, width, height, layer.opacity),
        )

    return canvas.convert("RGB")


def export_timeline_video_file(
    export_request: TimelineExportRequest,
    output_path_override: Optional[str] = None,
    progress_callback: Optional[Callable[[float], None]] = None,
) -> Dict[str, Any]:
    output_path = normalize_local_path(output_path_override or export_request.output_path)
    output_dir = os.path.dirname(output_path) or OUTPUT_DIR
    os.makedirs(output_dir, exist_ok=True)

    frame_count = len(export_request.frames)
    writer = imageio.get_writer(output_path, fps=export_request.fps)
    image_cache: Dict[str, Image.Image] = {}

    try:
        for index, frame_request in enumerate(export_request.frames):
            frame_image = render_timeline_export_frame(
                frame_request,
                export_request.width,
                export_request.height,
                image_cache=image_cache,
            )
            writer.append_data(np.asarray(frame_image))

            if progress_callback:
                progress_callback(5.0 + ((index + 1) / max(frame_count, 1)) * 90.0)
    finally:
        writer.close()

    return {
        "video": output_path,
        "output_path": output_path,
        "fps": export_request.fps,
        "duration": frame_count / export_request.fps,
        "frames": frame_count,
        "width": export_request.width,
        "height": export_request.height,
        "sequence_name": export_request.sequence_name,
    }


def build_timeline_audio_volume_expression(layer: TimelineExportAudioLayerRequest) -> str:
    clip_time_expr = f"({layer.clip_offset_ms}+t*1000)"
    terms = [f"{layer.gain:.6f}"]

    if layer.fade_in_ms > 0 and layer.clip_offset_ms < layer.fade_in_ms:
        terms.append(
            f"if(lt({clip_time_expr}\\,{layer.fade_in_ms})\\,({clip_time_expr})/{layer.fade_in_ms}\\,1)"
        )

    if layer.fade_out_ms > 0:
        remaining_expr = f"({layer.clip_duration_ms}-({clip_time_expr}))"
        terms.append(
            f"if(lt({remaining_expr}\\,{layer.fade_out_ms})\\,max(({remaining_expr})/{layer.fade_out_ms}\\,0)\\,1)"
        )

    return "*".join(terms)


def mux_timeline_audio_file(
    video_path: str,
    output_path: str,
    audio_layers: List[TimelineExportAudioLayerRequest],
    export_duration_ms: int,
):
    ffmpeg_executable = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg_executable, "-y", "-i", normalize_local_path(video_path)]
    filter_parts: List[str] = []
    audio_labels: List[str] = []

    for index, layer in enumerate(audio_layers, start=1):
        source_path = resolve_backend_media_path(layer.source_path)
        if not os.path.exists(source_path):
            raise FileNotFoundError(f"Missing audio source: {source_path}")

        command.extend(["-i", source_path])
        label = f"a{index - 1}"
        audio_labels.append(f"[{label}]")
        volume_expression = build_timeline_audio_volume_expression(layer)
        start_seconds = layer.source_time_ms / 1000.0
        duration_seconds = layer.duration_ms / 1000.0
        delay_ms = max(0, int(layer.timeline_offset_ms))
        filter_parts.append(
            f"[{index}:a]"
            f"atrim=start={start_seconds:.6f}:duration={duration_seconds:.6f},"
            f"asetpts=PTS-STARTPTS,"
            f"volume={volume_expression},"
            f"adelay={delay_ms}"
            f"[{label}]"
        )

    if len(audio_labels) == 1:
        filter_parts.append(f"{audio_labels[0]}anull[aout]")
    else:
        filter_parts.append(f"{''.join(audio_labels)}amix=inputs={len(audio_labels)}:normalize=0:dropout_transition=0[aout]")

    command.extend(
        [
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            "0:v:0",
            "-map",
            "[aout]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-t",
            f"{max(export_duration_ms, 1) / 1000.0:.6f}",
            normalize_local_path(output_path),
        ]
    )

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        stderr = (error.stderr or "").strip()
        raise RuntimeError(stderr or "FFmpeg audio mux failed.") from error

    return normalize_local_path(output_path)


def process_timeline_export(job_id: str, export_request: TimelineExportRequest):
    """Render and encode a resolved timeline frame stream into an MP4."""
    try:
        job_manager.update_job(job_id, status=JobStatus.PROCESSING, progress=0.0)
        output_path = normalize_local_path(export_request.output_path)
        silent_video_path = (
            output_path
            if not export_request.audio_layers
            else normalize_local_path(f"{Path(output_path).with_suffix('')}-silent.mp4")
        )
        result = export_timeline_video_file(
            export_request,
            output_path_override=silent_video_path,
            progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
        )
        if export_request.audio_layers:
            job_manager.update_job(job_id, progress=96.0)
            mux_timeline_audio_file(
                video_path=silent_video_path,
                output_path=output_path,
                audio_layers=export_request.audio_layers,
                export_duration_ms=max(1, round((len(export_request.frames) / export_request.fps) * 1000)),
            )
            result["video"] = output_path
            result["output_path"] = output_path
            result["audio_layers"] = len(export_request.audio_layers)
            try:
                os.remove(silent_video_path)
            except OSError:
                logger.warning("Could not remove temporary silent export: %s", silent_video_path)
        job_manager.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            result=result,
            completed_at=datetime.now(),
        )
    except Exception as e:
        logger.error(f"Timeline export failed: {e}", exc_info=True)
        job_manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=datetime.now(),
        )


@app.post("/api/images/crop", response_model=Dict[str, Any], tags=["Images"])
@limiter.limit("30/minute")
async def crop_image(request: Request, edit_request: ImageEditRequest):
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
    if not os.path.exists(edit_request.source_path):
        raise HTTPException(status_code=404, detail="Source image not found")

    output_path, relative_path = create_derived_output_path(edit_request.source_path, "crop")
    result = apply_crop_and_transform(
        edit_request.source_path,
        output_path,
        crop_box=model_to_dict(edit_request.crop_box) if edit_request.crop_box else None,
        rotation=edit_request.rotation,
        flip_horizontal=edit_request.flip_horizontal,
        flip_vertical=edit_request.flip_vertical,
    )
    result["image"] = relative_path
    return result


@app.post("/api/images/upscale", response_model=Dict[str, Any], tags=["Images"])
@limiter.limit("30/minute")
async def upscale_image(request: Request, upscale_request: ImageUpscaleRequest):
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
    if not os.path.exists(upscale_request.source_path):
        raise HTTPException(status_code=404, detail="Source image not found")

    output_path, relative_path = create_derived_output_path(upscale_request.source_path, "upscale")
    result = upscale_image_file(
        upscale_request.source_path,
        output_path,
        scale_factor=upscale_request.scale_factor,
    )
    result["image"] = relative_path
    return result


@app.post("/api/videos/extract-frame", response_model=Dict[str, Any], tags=["Videos"])
@limiter.limit("30/minute")
async def extract_video_frame(request: Request, extract_request: VideoFrameExtractRequest):
    """
    Extract a still frame from a managed or imported video file.

    ### Request Body
    - `source_path`: Absolute path to source video (required)
    - `time_ms`: Desired frame time in milliseconds (default: 0)

    ### Response
    - `image`: Relative URL path to the extracted frame
    - `output_path`: Absolute managed output path to the extracted frame
    - `width`: Extracted frame width in pixels
    - `height`: Extracted frame height in pixels
    - `time_ms`: Resolved extraction time in milliseconds
    - `frame_index`: Resolved frame index
    """
    if not os.path.exists(extract_request.source_path):
        raise HTTPException(status_code=404, detail="Source video not found")

    output_path, relative_path = create_derived_output_path(extract_request.source_path, "frame")
    result = extract_video_frame_file(
        extract_request.source_path,
        output_path,
        time_ms=extract_request.time_ms,
    )
    result["image"] = relative_path
    return result


@app.post("/api/timeline/export", response_model=JobResponse, tags=["Timeline"])
@limiter.limit("5/minute")
async def export_timeline(
    request: Request,
    export_request: TimelineExportRequest,
    background_tasks: BackgroundTasks,
):
    """
    Start an MP4 export for a resolved timeline frame stream.

    The renderer resolves playback frames locally, then submits the ordered frame
    stream and resolved audio plan here for deterministic MP4 encoding through the backend.
    """
    job_id = str(uuid.uuid4())
    normalized_output_path = normalize_local_path(export_request.output_path)
    output_dir = os.path.dirname(normalized_output_path) or OUTPUT_DIR

    job = GenerationJob(
        id=job_id,
        type="video",
        status=JobStatus.PENDING,
        params={
            "source": "timeline-export",
            "output_path": normalized_output_path,
            "sequence_name": export_request.sequence_name,
            "width": export_request.width,
            "height": export_request.height,
            "fps": export_request.fps,
            "frame_count": len(export_request.frames),
        },
        output_dir=output_dir,
    )

    job_manager.add_job(job)
    background_tasks.add_task(process_timeline_export, job_id, export_request)

    return JobResponse(
        job_id=job_id,
        status="pending",
        message="Timeline export started",
    )


# ============= Image Generation =============

@app.post("/api/generate/image", response_model=JobResponse, tags=["Generation"])
@limiter.limit("10/minute")
async def generate_image(
    request: Request,
    gen_request: ImageGenerationRequest,
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
    - `sd3.5-large`: Stable Diffusion 3.5 Large (high quality, lower VRAM)
    - `flux-fill`: FLUX.1 Fill dev (inpainting/outpainting)
    - `sd3.5-medium`: Stable Diffusion 3.5 Medium (balanced quality and VRAM)
    - `flux-schnell`: FLUX.1 schnell (fast generation)
    - `sd-1.5`: Stable Diffusion 1.5 (lightweight)

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
        params=gen_request.dict(),
        output_dir=os.path.join(OUTPUT_DIR, job_id)
    )

    os.makedirs(job.output_dir, exist_ok=True)
    job_manager.add_job(job)

    # Start generation in background
    background_tasks.add_task(
        process_image_generation,
        job_id,
        gen_request
    )

    return JobResponse(
        job_id=job_id,
        status="pending",
        message="Image generation job started"
    )


async def process_image_generation(job_id: str, request: ImageGenerationRequest):
    """Process image generation job"""
    logger.info(f"[Job {job_id}] Starting image generation with model={request.model}, steps={request.steps}")
    try:
        job_manager.update_job(job_id, status=JobStatus.PROCESSING, progress=0.0)

        # Try ComfyUI first, fallback to direct generation
        if comfy_client and comfy_client.connected:
            logger.info(f"[Job {job_id}] Using ComfyUI generator")
            result = await generate_with_comfyui(job_id, request)
        else:
            logger.info(f"[Job {job_id}] ComfyUI not connected, using direct generator. comfy_client={comfy_client is not None}")
            result = await generate_direct(job_id, request)

        logger.info(f"[Job {job_id}] Generation completed, result keys={list(result.keys()) if isinstance(result, dict) else result}")
        job_manager.update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            result=result,
            completed_at=datetime.now()
        )

    except Exception as e:
        logger.error(f"Image generation failed: {e}", exc_info=True)
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

    logger.info(f"[Job {job_id}] Queueing prompt to ComfyUI, workflow nodes={list(workflow.keys())}")
    prompt_id = await comfy_client.queue_prompt(workflow)
    logger.info(f"[Job {job_id}] Prompt queued, prompt_id={prompt_id}")
    job_manager.update_job(job_id, progress=10.0)
    outputs = await comfy_client.wait_for_prompt_completion(
        prompt_id,
        progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
    )
    logger.info(f"[Job {job_id}] ComfyUI returned {len(outputs)} output(s)")

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
        raise RuntimeError(
            "No image generation backend available. Either connect ComfyUI or install "
            "the diffusers library (pip install diffusers torch) for direct generation."
        )
    logger.info(f"[Job {job_id}] Starting direct generation with model={request.model}")
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
    logger.info(f"[Job {job_id}] Direct generation completed")
    return result


# ============= Video Generation =============

@app.post("/api/generate/video", response_model=JobResponse, tags=["Generation"])
@limiter.limit("10/minute")
async def generate_video(
    request: Request,
    video_request: VideoGenerationRequest,
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
        params=video_request.dict(),
        output_dir=os.path.join(OUTPUT_DIR, job_id)
    )

    os.makedirs(job.output_dir, exist_ok=True)
    job_manager.add_job(job)

    background_tasks.add_task(
        process_video_generation,
        job_id,
        video_request
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
            raise RuntimeError(
                "No video generation backend available. Install the required libraries "
                "(pip install diffusers torch) for direct video generation."
            )

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
        logger.error(f"Video generation failed: {e}", exc_info=True)
        job_manager.update_job(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=datetime.now()
        )


# ============= Job Management =============

@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse, tags=["Jobs"])
@limiter.limit("60/minute")
async def get_job_status(request: Request, job_id: str):
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
@limiter.limit("30/minute")
async def cancel_job(request: Request, job_id: str):
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
@limiter.limit("60/minute")
async def list_jobs(request: Request, status: Optional[str] = None, limit: int = 50):
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

@app.get("/api/models", response_model=List[ModelRecordSchema], tags=["Models"])
@limiter.limit("60/minute")
async def list_models(request: Request):
    """List every model in the Foundry registry as ModelRecords."""
    return model_registry.list_records()


@app.get("/api/models/{model_id}", response_model=ModelRecordSchema, tags=["Models"])
@limiter.limit("60/minute")
async def get_model_record(request: Request, model_id: str):
    """Return a single ModelRecord by id (resolving legacy aliases), or 404."""
    record = model_registry.get_record(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return record


@app.post("/api/models/{model_id}/download", tags=["Models"])
@limiter.limit("30/minute")
async def download_model(request: Request, model_id: str, background_tasks: BackgroundTasks):
    """
    Start downloading a model in the background.

    ### Path Parameters
    - `model_id`: The unique model identifier (e.g., "flux-dev", "sd3.5-large", "flux-fill", "sd3.5-medium")

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
@limiter.limit("60/minute")
async def get_model_status(request: Request, model_id: str):
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
@limiter.limit("30/minute")
async def delete_model(request: Request, model_id: str):
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


@app.websocket("/ws")
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
    if BACKEND_AUTH_TOKEN and websocket.query_params.get("token") != BACKEND_AUTH_TOKEN:
        await websocket.close(code=1008)
        return

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
