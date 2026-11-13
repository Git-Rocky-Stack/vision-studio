"""
Vision Studio - Python Backend
FastAPI server for AI image and video generation
"""

import sys
from typing import Any, Callable, Optional


def make_console_streams_safe() -> None:
    """Never let an unencodable character crash a console write.

    A Windows PyInstaller bundle's stdout/stderr may be cp1252 (or a pipe with
    the ANSI code page); writing a character outside it raises
    UnicodeEncodeError mid-log. Reconfiguring the streams to replace such
    characters fixes that at the source for every writer (logging handlers,
    uvicorn, third-party libraries) without monkeypatching builtins.print.
    Streams that cannot be reconfigured (None under pythonw, or a test
    runner's capture object) are left alone.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(errors="replace")
        except (ValueError, OSError):
            pass


make_console_streams_safe()

# --- Frozen-bundle self-check (D5e): `VisionStudio-Backend --self-check`
# imports every required/optional runtime and probes bundled binaries, then
# exits - BEFORE the module-level startup below (migrations, directories,
# model registry) touches the user's machine. build-backend.cjs runs it right
# after PyInstaller and fails the build on a non-zero exit. -------------------
if __name__ == "__main__" and "--self-check" in sys.argv[1:]:
    from selfcheck import main as _self_check_main

    sys.exit(_self_check_main())
# ---------------------------------------------------------------------------

# --- macOS/MPS: individual ops Metal has not implemented yet fall back to
# CPU instead of aborting the whole generation. Must be set BEFORE torch is
# first imported anywhere in this process (torch reads it at init). ---------
if sys.platform == "darwin":
    import os as _early_os

    _early_os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
# ---------------------------------------------------------------------------

import asyncio
import hashlib
import hmac
import json
import os
import re
import secrets
import subprocess
import time
import uuid
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Literal, Set
from contextlib import asynccontextmanager

import imageio.v2 as imageio
import imageio_ffmpeg
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel, Field, field_validator
from slowapi.errors import RateLimitExceeded

from version import APP_VERSION
from utils.job_manager import JobManager, JobStatus, GenerationJob, GenerationCancelled
from utils.logging_config import setup_logging, get_logger
from utils.comfy_workflows import build_image_workflow, build_video_workflow
from utils.direct_video_generator import DirectVideoGenerator
from utils.model_manager import ModelManager
from utils.direct_generator import DirectGenerator, ModelLoadRefusedError, is_supported_scheduler
from utils.device import process_reserved_vram_bytes
from foundry.accelerator import (
    DEFAULT_ACCELERATION_SETTINGS,
    AccelerationSettingsRequest,
    acceleration_feature_availability,
)
from utils.image_ops import apply_crop_and_transform
from utils.prompt_service import enhance_prompt
from db.migrate import MigrationError, run_migrations
from utils.job_store import JobStore
from middleware.rate_limit import RATE_LIMIT_HANDSHAKE, limiter, rate_limit_exceeded_handler
from utils.media_paths import MediaPathError, configure_media_paths, env_media_roots
from utils.timeutil import utc_now
from utils.log_redaction import install_query_redaction
from foundry import civitai_search, hub_search
from foundry.classifier import classify_repo
from foundry.hub_signals import fetch_repo_signals
from foundry.hardware import probe_hardware
from foundry.model_record import ModelRecord
from foundry.registry import ModelRegistry
from foundry.runtime_resolver import resolve_model_runtime
from foundry.schemas import (
    ConsentRequestSchema,
    ConsentStateSchema,
    ConvertResultSchema,
    DetectedRootSchema,
    DownloadJobSchema,
    HardwareProfileSchema,
    LibraryRootSchema,
    ModelRecordSchema,
    ProvisionStartRequest,
    ProvisionStatusSchema,
    RuntimePlanSchema,
    ScanResultSchema,
    SearchResponseSchema,
    SearchResultSchema,
)
from foundry.convert import ConvertUnavailableError, convert_pickle_to_safetensors
from foundry.download_manager import DownloadManager
from foundry.library_roots import RootsStore
from foundry.index_service import IndexService
from foundry.provisioning import load_provision_manifest
from foundry.provision_orchestrator import ProvisionOrchestrator, UnknownProvisionModelsError
from foundry.download_errors import RemoteCodeUnsupportedError
from foundry.security_policy import ConsentStore

# Initialize logging at module load time
setup_logging(log_file=os.getenv("LOG_FILE"))
logger = get_logger(__name__)
# K2: no request query string (where a token could ride) reaches a log line.
install_query_redaction()
from api.edit import router as edit_router, configure as configure_edit
from api.retrieval import (
    init_service as init_retrieval_service,
    router as retrieval_router,
    semantic_retrieval_availability,
)
from api.comfy_graph import router as comfy_graph_router, configure as configure_comfy_graph
from guided.controlnet_registry import resolve_controlnet_stack
from guided.fit import guided_fit_refusal
from guided.ip_adapter import resolve_ip_reference_stack
from guided.passes import GuidedValidationError, resolve_guided_pass

# #33 live step preview: per-job decoded frames streamed over the WS loop.
from preview.step_preview import step_preview_service

try:
    from utils.comfy_client import ComfyUIClient, VIDEO_PROMPT_TIMEOUT_SECONDS
    COMFY_CLIENT_IMPORT_ERROR: Optional[Exception] = None
except Exception as import_error:
    ComfyUIClient = None  # type: ignore[assignment]
    VIDEO_PROMPT_TIMEOUT_SECONDS = 1800
    COMFY_CLIENT_IMPORT_ERROR = import_error


class ComfyQueueError(RuntimeError):
    """ComfyUI did not accept a job (unreachable or refused before queueing).

    Nothing ran on ComfyUI, so the job falls back to the direct GPU path.
    Failures AFTER a prompt was queued are real job failures, never this.
    """


# Configuration
OUTPUT_DIR = os.getenv("OUTPUT_DIR", os.path.join(os.path.dirname(__file__), "outputs"))
MODELS_DIR = os.getenv("MODELS_DIR", os.path.join(os.path.dirname(__file__), "models"))
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")
DATABASE_PATH = os.getenv("DATABASE_PATH", os.path.join(os.path.dirname(__file__), "data", "vision_studio.db"))
BACKEND_AUTH_HEADER = "x-vision-studio-token"


def resolve_backend_auth_token(configured: Optional[str]) -> str:
    """The token every request must present (fail closed, never logged).

    The auth middleware below only enforces when a token is set, so an unset
    token would leave every non-exempt route (generation, ComfyUI graph
    execution, retrieval ingest) reachable unauthenticated on loopback. The
    packaged app always injects one; a bare `python main.py` gets a generated
    one rather than silently disabling auth. The token itself is NEVER logged
    (log files are shareable support artifacts): a developer who wants to call
    the API by hand sets VISION_STUDIO_BACKEND_AUTH_TOKEN to a value of their
    choosing before starting the server.
    """
    if configured:
        return configured
    logger.warning(
        "VISION_STUDIO_BACKEND_AUTH_TOKEN was not set; generated an ephemeral "
        "backend auth token for this run (not logged). To call the API by hand, "
        "set VISION_STUDIO_BACKEND_AUTH_TOKEN yourself and send it as the %r header.",
        BACKEND_AUTH_HEADER,
    )
    return secrets.token_urlsafe(32)


BACKEND_AUTH_TOKEN = resolve_backend_auth_token(os.getenv("VISION_STUDIO_BACKEND_AUTH_TOKEN"))
# /api/handshake is exempt by design: it proves possession of the token
# without revealing it (HMAC over a client nonce), so the desktop shell can
# verify it is talking to ITS backend before sending the token anywhere.
AUTH_EXEMPT_PATHS = {"/api/health", "/api/handshake", "/api/docs", "/api/redoc", "/api/openapi.json"}


def token_matches(presented: Optional[str], expected: Optional[str] = None) -> bool:
    """Constant-time token comparison (never ``==``/``!=`` on secrets)."""
    expected = BACKEND_AUTH_TOKEN if expected is None else expected
    if not presented or not expected:
        return False
    return secrets.compare_digest(presented.encode("utf-8"), expected.encode("utf-8"))

# Ensure directories exist
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)

# Run database migrations at startup. A failed migration stops the run
# (db/migrate.py, U6) and is logged there; the backend still starts, with job
# history kept in memory only, rather than writing into a half-migrated DB.
try:
    run_migrations(DATABASE_PATH)
    _job_store: Optional[JobStore] = JobStore(DATABASE_PATH)
except MigrationError:
    _job_store = None

# Global instances
# U5: job records persist to the jobs table through a background writer thread
# (never on the event loop) and reload at startup for history listing.
job_manager = JobManager(store=_job_store)
model_manager = ModelManager(MODELS_DIR)
_CATALOG_PATH = os.path.join(os.path.dirname(__file__), "foundry", "verified-catalog.json")

download_manager = DownloadManager(
    registry=None,  # late-bound below once the registry exists
    model_manager=model_manager,
    models_dir=MODELS_DIR,
)


def _composed_status_provider(model_id: str):
    """Manager-download lifecycle first, on-disk model_manager status second."""
    live = download_manager.get_record_status(model_id)
    if live:
        return live
    return model_manager.get_record_status(model_id)


model_registry = ModelRegistry(
    models_dir=MODELS_DIR,
    catalog_path=_CATALOG_PATH,
    status_provider=_composed_status_provider,
)
# Late-bind the registry the manager needs for file resolution at run time.
download_manager._registry = model_registry

_FOUNDRY_STATE_DIR = os.path.join(MODELS_DIR, ".foundry")
roots_store = RootsStore(os.path.join(_FOUNDRY_STATE_DIR, "library_roots.json"))
index_service = IndexService(
    registry=model_registry,
    roots_store=roots_store,
    models_dir=MODELS_DIR,
    state_path=os.path.join(_FOUNDRY_STATE_DIR, "index_state.json"),
)
consent_store = ConsentStore(os.path.join(_FOUNDRY_STATE_DIR, "consents.json"))


def _allowed_media_roots() -> List[str]:
    """Extra readable media roots beyond OUTPUT_DIR (B6): every linked
    library root plus the shell-provided VISION_STUDIO_MEDIA_ROOTS. Read live
    so a root linked or removed at run time takes effect immediately."""
    return [root.path for root in roots_store.list()] + env_media_roots()


# Routed through the module attribute so tests that swap main.OUTPUT_DIR /
# main.roots_store keep working (the policy reads both lazily).
media_path_policy = configure_media_paths(lambda: OUTPUT_DIR, _allowed_media_roots)
# Late-bind (like the registry above): the manager filters pickle-bearing
# files out of repo downloads unless per-model consent exists (review H-2).
# Routed through the module attribute so tests that swap main.consent_store
# are honored.
download_manager._consent_lookup = lambda model_id: consent_store.get(model_id)

# #34 installer PR2: first-run auto-provisioning of the comprehensive auto-set.
# Drives the manifest's models by id through the same consent-gated
# download_manager the manual "Download" flow uses; owns only detection,
# aggregate progress, and the idempotent/resumable start.
_provision_manifest = load_provision_manifest()

# #34 PR4: late-bind the VS-mirror lookup (like the registry/consent above).
# A manifest entry carrying a license-gated `mirror` stanza gives the manager
# an R2 fallback for infrastructure failures; entries without one keep
# today's behavior exactly.
_provision_mirrors = {
    entry["id"]: entry["mirror"]
    for entry in _provision_manifest.get("auto_set", [])
    if entry.get("mirror")
}
download_manager._mirror_lookup = _provision_mirrors.get

provision_orchestrator = ProvisionOrchestrator(
    manifest=_provision_manifest,
    registry=model_registry,
    download_manager=download_manager,
    consent_store=consent_store,
    models_dir=MODELS_DIR,
)


def _verified_repo_ids() -> set:
    """Catalog repo ids — the classifier's Verified short-circuit (spec 5.2)."""
    return {r.repo_id for r in model_registry.records.values() if r.repo_id}


def _search_result_to_record(result) -> ModelRecord:
    """Map a SearchResult to a transient ModelRecord (registry normalizes status).

    revision is intentionally None here: search listings carry no commit sha.
    Pinning happens at the enqueue boundary after fetch_repo_signals returns
    the sha of the tree whose safety signals were actually verified.
    """
    return ModelRecord(
        id=result.id, name=result.name, artifact_type=result.artifact_type,
        capability=result.capability, base_architecture=result.base_architecture,
        source=result.source, repo_id=result.repo_id, size=result.size,
        status="not_found", tier=result.tier, tier_reason=result.tier_reason,
        quality="local", license=result.license, gated=result.gated,
        format=result.format, trust_remote_code=result.trust_remote_code,
        nsfw=result.nsfw, download_url=result.download_url, sha256=result.sha256,
        revision=None,
    )

comfy_client: Optional[ComfyUIClient] = None
direct_generator: Optional[DirectGenerator] = None
direct_video_generator: Optional[DirectVideoGenerator] = None


def get_uvicorn_config(reload_enabled: Optional[bool] = None) -> Dict[str, Any]:
    if reload_enabled is None:
        reload_enabled = os.getenv("VISION_STUDIO_BACKEND_RELOAD", "").lower() in {"1", "true", "yes"}

    # Vision Studio is a local-first desktop app: bind to loopback by default so the
    # backend - including the auth-exempt /outputs static mount and the docs/OpenAPI
    # routes - is not reachable from the LAN. Deliberate LAN or debug exposure must be
    # opted into explicitly via VISION_STUDIO_BACKEND_HOST (e.g. "0.0.0.0").
    host = os.getenv("VISION_STUDIO_BACKEND_HOST", "").strip() or "127.0.0.1"

    return {
        "host": host,
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
    # uvicorn's dictConfig ran after import and installed fresh handlers:
    # re-attach the query-string redaction filter to them (idempotent).
    install_query_redaction()

    # Initialize ComfyUI client
    if ComfyUIClient is None:
        logger.warning(f"ComfyUI client unavailable: {COMFY_CLIENT_IMPORT_ERROR}. Will use direct generation as fallback")
    else:
        # U2: never a one-shot connect. ensure_connected() never raises; the
        # background loop reconnects with backoff after a drop, and the job
        # paths reconnect on demand before queueing (_comfy_ready).
        comfy_client = ComfyUIClient(COMFYUI_URL)
        if await comfy_client.ensure_connected():
            logger.info(f"Connected to ComfyUI at {COMFYUI_URL}")
        else:
            logger.info(f"ComfyUI not reachable at {COMFYUI_URL}; using direct generation "
                        "and retrying the connection in the background")
        comfy_client.start_reconnect_loop()

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

    # B9: create the retrieval singleton at startup (loads its index from
    # disk) in a worker thread, instead of lazily - and racily - on the first
    # request that happens to touch it.
    try:
        await asyncio.to_thread(init_retrieval_service, MODELS_DIR)
    except Exception as e:  # noqa: BLE001 - retrieval is optional; routes retry lazily
        logger.warning(f"Could not initialize the retrieval index: {e}")

    # Load available models
    await model_manager.scan_models()
    logger.info(f"Found {len(model_manager.available_models)} models")

    yield

    # Shutdown
    logger.info("Shutting down...")
    if comfy_client:
        await comfy_client.disconnect()
    # Drain the job-history writer so the last status changes reach the DB.
    await asyncio.to_thread(job_manager.close)


# The auth section is built from the constants require_local_auth_token
# enforces, so the served description cannot drift from the middleware.
_AUTH_EXEMPT_DOC = ", ".join(f"`{path}`" for path in sorted(AUTH_EXEMPT_PATHS))

# Create FastAPI app with OpenAPI/Swagger enabled
app = FastAPI(
    title="Vision Studio API",
    description=f"""
## AI Image and Video Generation Backend

Professional-grade API for AI-powered creative content generation.

### Features
- **Image Generation** - FLUX.1, Stable Diffusion 3.5, Stable Diffusion XL, SD 1.5
- **Video Generation** - LTX Video, Stable Video Diffusion, AnimateDiff
- **Image Editing** - crop, rotate and flip; background removal, upscaling and face restoration (`/api/v1/edit`)
- **Model Management** - Download, install, and manage AI models
- **Real-time Updates** - WebSocket-based progress streaming

### Authentication
Every HTTP request must send the backend's token in the `{BACKEND_AUTH_HEADER}` header,
or it is refused with 403 Forbidden; the `/ws` WebSocket takes it in the same
request header and closes with code 1008 without it (a `?token=` query parameter
is not accepted). The desktop app sets the token (`VISION_STUDIO_BACKEND_AUTH_TOKEN`)
when it starts the backend; a bare `python main.py` generates one for that run and
never logs it - set the variable yourself to call the API by hand.
`GET /api/handshake?nonce=<32-128 hex chars>` proves the server holds the token
without revealing it: it returns `{{"proof": hex(HMAC-SHA256(key=token, msg=nonce))}}`.
Exempt: {_AUTH_EXEMPT_DOC}, and files under `/outputs/`.

### Rate Limiting
Limits are per client address and set on each route: generation 10 requests/minute
(including `/api/v1/comfy/run-graph`), edit tools 30/minute, timeline export and
safetensors conversion 5/minute, `/api/handshake` 30/minute. Other routes allow 30
or 60 per minute; `/api/health`, `/ws` and the `/api/v1/retrieval` routes are not
limited. A limited request gets 429 with a `Retry-After` header (seconds). Set
`VISION_STUDIO_DISABLE_RATE_LIMIT=1` to turn limiting off.
    """,
    version=APP_VERSION,
    docs_url="/api/docs",      # Swagger UI
    redoc_url="/api/redoc",    # ReDoc
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
    contact={
        "name": "Vision Studio Team",
        "email": "hello@vision-studio-x.com",
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
        if not token_matches(request.headers.get(BACKEND_AUTH_HEADER)):
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
app.include_router(edit_router)
app.include_router(retrieval_router)
app.include_router(comfy_graph_router)
# `lambda: comfy_client` reads the live module global, which is assigned when the
# ComfyUI connection is established during startup (None until then).
configure_comfy_graph(lambda: comfy_client, job_manager, OUTPUT_DIR)
# #34 real edit tools: job manager + Foundry record resolution for /api/v1/edit.
configure_edit(
    job_manager=job_manager,
    output_dir=OUTPUT_DIR,
    models_dir=MODELS_DIR,
    resolve_record=model_registry.get_record,
)


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

class LoraSelection(BaseModel):
    id: str = Field(..., description="Installed LoRA model id")
    weight: float = Field(default=1.0, ge=0.0, le=2.0, description="Adapter weight (0-2)")


# B14 request bounds. A mask is a canvas polygon/brush stroke: 20k points is
# far beyond any hand-drawn shape but stops a multi-MB payload from turning
# into a rasterization DoS.
MAX_MASK_POINTS = 20_000


class GuidedMaskPayload(BaseModel):
    """#34: vector mask from the canvas drawer, in intrinsic image pixels."""
    type: str = Field(..., description="rectangle | polygon | brush | erase")
    points: List[Dict[str, float]] = Field(default_factory=list, max_length=MAX_MASK_POINTS)
    bounds: Dict[str, float] = Field(default_factory=dict)
    brush_size: Optional[float] = Field(default=None, ge=1, le=512)


class ControlNetLayerPayload(BaseModel):
    """#34: canvas ControlNet layer (SD 1.5 / SDXL / FLUX / SD 3.5 Large real since PR3)."""
    layer_id: str
    layer_name: str = ""
    source_path: str
    preprocessor: str
    strength: float = Field(default=1.0, ge=0.0, le=2.0)
    start_step: float = Field(default=0.0, ge=0.0, le=1.0)
    end_step: float = Field(default=1.0, ge=0.0, le=1.0)
    mask: GuidedMaskPayload
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None


class ReferenceImageLayerPayload(BaseModel):
    """#34: reference layers - one = img2img init; 2+ = IP-Adapter multi-reference (real since PR4)."""
    layer_id: str
    layer_name: str = ""
    source_path: str
    mask: GuidedMaskPayload
    strength: float = Field(default=1.0, ge=0.0, le=2.0)


class InpaintPassPayload(BaseModel):
    """#34: masked edit of the canvas base image."""
    layer_id: str
    layer_name: str = ""
    image_path: str
    mask: GuidedMaskPayload
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None


class OutpaintPassPayload(BaseModel):
    """#34 PR2: AI Expand - the backend grows the canvas and builds the mask.

    Direction membership is validated in resolve_guided_pass (the single
    honesty seam the endpoint pre-flights to 422).
    """
    image_path: str
    directions: List[str] = Field(..., description="subset of up/down/left/right")
    pixels: int = Field(..., ge=64, le=512)
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None


class BackgroundReplacePayload(BaseModel):
    """#34 PR2: background replacement - inverted U2-Net subject mask inpaint.

    The prompt describing the new background rides the request's main prompt.
    """
    image_path: str


# Bounds shared by the generation requests. Seeds are uint32 (torch and
# ComfyUI both take 0..2**32-1); -1 asks for a random one. Latent pipelines
# work on a /8 grid, so dimensions snap DOWN to a multiple of 8 (every bound
# below is itself a multiple of 8, so snapping never leaves the range).
MAX_PROMPT_LENGTH = 4000
SEED_MAX = 2**32 - 1


def snap_to_multiple_of_8(value: int) -> int:
    return value - value % 8


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=MAX_PROMPT_LENGTH, description="Positive prompt for generation")
    negative_prompt: str = Field(default="", max_length=MAX_PROMPT_LENGTH, description="Negative prompt")
    width: int = Field(default=1024, ge=256, le=2048, description="Image width (snapped down to a multiple of 8)")
    height: int = Field(default=1024, ge=256, le=2048, description="Image height (snapped down to a multiple of 8)")
    steps: int = Field(default=25, ge=1, le=100, description="Sampling steps")
    cfg_scale: float = Field(default=7.5, ge=1, le=30, description="CFG Scale")
    seed: int = Field(default=-1, ge=-1, le=SEED_MAX, description="Random seed (-1 for random)")
    model: str = Field(default="flux-dev", description="Model to use")
    scheduler: str = Field(default="euler", max_length=64, description="Scheduler/sampler")
    acceleration_settings: Optional[AccelerationSettingsRequest] = Field(
        default=None, description="M9 acceleration toggles (auto/on/off per optimization)")
    loras: List[LoraSelection] = Field(default_factory=list, description="#136 local LoRA adapters")
    controlnet: List[ControlNetLayerPayload] = Field(
        default_factory=list, description="#34 canvas ControlNet layers")
    reference_images: List[ReferenceImageLayerPayload] = Field(
        default_factory=list, description="#34 reference image layers (img2img)")
    inpaint: Optional[InpaintPassPayload] = Field(
        default=None, description="#34 inpaint pass (base image + mask)")
    outpaint: Optional[OutpaintPassPayload] = Field(
        default=None,
        description="#34 PR2 AI Expand pre-step (canvas growth + border mask)")
    background_replace: Optional[BackgroundReplacePayload] = Field(
        default=None,
        description="#34 PR2 background replacement (inverted u2net mask inpaint)")
    denoising_strength: float = Field(
        default=0.75, ge=0.05, le=1.0, description="#34 img2img/inpaint strength")

    @field_validator("width", "height")
    @classmethod
    def _snap_dimension(cls, value: int) -> int:
        return snap_to_multiple_of_8(value)

    @field_validator("scheduler")
    @classmethod
    def _known_scheduler(cls, value: str) -> str:
        # B14: an unknown sampler used to fall back to Euler a silently.
        if not is_supported_scheduler(value):
            raise ValueError(
                "Unknown scheduler. Choose one of: Euler, Euler a, DPM++ 2M, DPM++ 2M Karras, "
                "DPM++ SDE, DPM++ SDE Karras, DDIM, UniPC.")
        return value.strip()

    @field_validator("prompt")
    @classmethod
    def _prompt_not_blank(cls, value: str) -> str:
        # min_length=1 alone lets "   " through: an image prompt must say something.
        if not value.strip():
            raise ValueError("prompt must not be empty")
        return value


def _guided_payload(request: "ImageGenerationRequest") -> Optional[Dict[str, Any]]:
    """#34: project the request's guided fields into the generator's dict seam."""
    if not (request.controlnet or request.reference_images or request.inpaint
            or request.outpaint or request.background_replace):
        return None
    return {
        "controlnet": [layer.model_dump() for layer in request.controlnet],
        "reference_images": [layer.model_dump() for layer in request.reference_images],
        "inpaint": request.inpaint.model_dump() if request.inpaint else None,
        "outpaint": request.outpaint.model_dump() if request.outpaint else None,
        "background_replace": (
            request.background_replace.model_dump() if request.background_replace else None),
        "denoising_strength": request.denoising_strength,
    }


def resolve_guided_media_paths(request: "ImageGenerationRequest") -> "ImageGenerationRequest":
    """The request with every guided source path resolved inside the allowed
    media roots (B6). Raises MediaPathError for any path outside them."""
    update: Dict[str, Any] = {}
    if request.controlnet:
        update["controlnet"] = [
            layer.model_copy(update={"source_path": resolve_backend_media_path(layer.source_path)})
            for layer in request.controlnet
        ]
    if request.reference_images:
        update["reference_images"] = [
            layer.model_copy(update={"source_path": resolve_backend_media_path(layer.source_path)})
            for layer in request.reference_images
        ]
    for field_name in ("inpaint", "outpaint", "background_replace"):
        payload = getattr(request, field_name)
        if payload is not None:
            update[field_name] = payload.model_copy(
                update={"image_path": resolve_backend_media_path(payload.image_path)})
    return request.model_copy(update=update) if update else request


def resolve_video_input_image(image_path: Optional[str]) -> Optional[str]:
    """Image-to-video input: a data: URL passes through (decoded in memory);
    a file path must resolve inside the allowed media roots (B6)."""
    if not image_path:
        return image_path
    if image_path.startswith("data:image/"):
        return image_path
    return resolve_backend_media_path(image_path)


class VideoGenerationRequest(BaseModel):
    prompt: str = Field(..., max_length=MAX_PROMPT_LENGTH, description="Prompt for video generation")
    image_path: Optional[str] = Field(default=None, description="Optional input image")
    width: int = Field(default=1024, ge=256, le=1920, description="Snapped down to a multiple of 8")
    height: int = Field(default=576, ge=256, le=1080, description="Snapped down to a multiple of 8")
    fps: int = Field(default=24, ge=12, le=60)
    duration: int = Field(default=5, ge=1, le=10, description="Duration in seconds")
    steps: int = Field(default=25, ge=1, le=100)
    model: str = Field(default="ltx-video", description="Model to use")
    seed: int = Field(default=-1, ge=-1, le=SEED_MAX, description="Random seed (-1 for random)")
    acceleration_settings: Optional[AccelerationSettingsRequest] = Field(
        default=None, description="M9 acceleration toggles (auto/on/off per optimization)")
    loras: List[LoraSelection] = Field(default_factory=list, description="#136 local LoRA adapters")

    @field_validator("width", "height")
    @classmethod
    def _snap_dimension(cls, value: int) -> int:
        return snap_to_multiple_of_8(value)


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


PromptEnhancementMode = Literal["clarify", "cinematic", "concise", "expand", "variations"]


class PromptEnhancementRequest(BaseModel):
    prompt: str = Field(..., max_length=MAX_PROMPT_LENGTH, description="Prompt to enhance")
    mode: PromptEnhancementMode = Field(default="clarify", description="Enhancement mode")

    @field_validator("mode", mode="before")
    @classmethod
    def _normalize_mode(cls, value: Any) -> Any:
        # The template engine always accepted " Clarify " - keep that.
        return value.strip().lower() if isinstance(value, str) else value


# Pixel coordinates beyond this are not an image anyone can open (PIL's own
# decompression-bomb guard trips far below 65535^2).
MAX_IMAGE_COORDINATE = 65_535


class CropBoxRequest(BaseModel):
    left: int = Field(..., ge=0, le=MAX_IMAGE_COORDINATE)
    top: int = Field(..., ge=0, le=MAX_IMAGE_COORDINATE)
    width: int = Field(..., ge=1, le=MAX_IMAGE_COORDINATE)
    height: int = Field(..., ge=1, le=MAX_IMAGE_COORDINATE)


class ImageEditRequest(BaseModel):
    source_path: str = Field(..., min_length=1, max_length=4096)
    crop_box: Optional[CropBoxRequest] = None
    # Degrees, clockwise. One full turn either way covers every UI rotation.
    rotation: int = Field(default=0, ge=-360, le=360)
    flip_horizontal: bool = False
    flip_vertical: bool = False


class VideoFrameExtractRequest(BaseModel):
    source_path: str = Field(..., min_length=1, max_length=4096)
    time_ms: int = Field(default=0, ge=0)


# Timeline export bounds (B14): a frame composites at most this many layers
# (one per visible track - generous for any real edit), and an export mixes
# at most this many audio clips into one ffmpeg filter graph.
MAX_TIMELINE_LAYERS_PER_FRAME = 64
MAX_TIMELINE_AUDIO_LAYERS = 128
MAX_SEQUENCE_NAME_LENGTH = 256


class TimelineExportLayerRequest(BaseModel):
    source_path: str = Field(..., min_length=1, max_length=4096)
    media_type: str = Field(pattern="^(image|video)$")
    source_time_ms: int = Field(default=0, ge=0)
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)


class TimelineExportFrameRequest(BaseModel):
    time_ms: int = Field(default=0, ge=0)
    layers: List[TimelineExportLayerRequest] = Field(
        default_factory=list, max_length=MAX_TIMELINE_LAYERS_PER_FRAME)


class TimelineExportAudioLayerRequest(BaseModel):
    source_path: str = Field(..., min_length=1, max_length=4096)
    source_time_ms: int = Field(default=0, ge=0)
    timeline_offset_ms: int = Field(default=0, ge=0)
    duration_ms: int = Field(default=1, ge=1)
    clip_offset_ms: int = Field(default=0, ge=0)
    clip_duration_ms: int = Field(default=1, ge=1)
    gain: float = Field(default=1.0, ge=0.0, le=2.0)
    fade_in_ms: int = Field(default=0, ge=0)
    fade_out_ms: int = Field(default=0, ge=0)


class TimelineExportRequest(BaseModel):
    sequence_name: str = Field(default="Timeline Export", max_length=MAX_SEQUENCE_NAME_LENGTH)
    width: int = Field(default=1920, ge=64, le=4096)
    height: int = Field(default=1080, ge=64, le=4096)
    fps: int = Field(default=24, ge=1, le=60)
    output_path: str = Field(..., max_length=4096)
    frames: List[TimelineExportFrameRequest] = Field(min_length=1, max_length=24000)
    audio_layers: List[TimelineExportAudioLayerRequest] = Field(
        default_factory=list, max_length=MAX_TIMELINE_AUDIO_LAYERS)


class ModelInfo(BaseModel):
    id: str
    name: str
    type: str
    size: str
    status: str
    description: str


class FeatureAvailability(BaseModel):
    """Whether an optional capability can run on THIS install/machine."""
    available: bool
    reason: Optional[str] = Field(
        default=None, description="Why it is unavailable (user-facing); null when available")


class SystemInfo(BaseModel):
    gpu_available: bool
    gpu_name: Optional[str]
    gpu_vram: Optional[str]
    cuda_version: Optional[str]
    comfyui_connected: bool
    models_count: int
    availability: Dict[str, FeatureAvailability] = Field(
        default_factory=dict,
        description=(
            "Optional-feature availability the UI gates its toggles on: "
            "quantization, tensorrt, semanticRetrieval"))


class ImportRootRequest(BaseModel):
    path: str
    layout_hint: str = "generic"


# ============= API Endpoints =============

_HANDSHAKE_NONCE = re.compile(r"^[0-9a-fA-F]{32,128}$")


def handshake_proof(nonce: str, token: str) -> str:
    """hex(HMAC-SHA256(key=token utf-8, msg=nonce utf-8)) - the K1 contract."""
    return hmac.new(token.encode("utf-8"), nonce.encode("utf-8"), hashlib.sha256).hexdigest()


@app.get("/api/handshake", tags=["System"])
@limiter.limit(RATE_LIMIT_HANDSHAKE)
async def handshake(request: Request, nonce: str = Query("")):
    # Length is enforced by the nonce pattern below so EVERY malformed nonce
    # (too short, too long, non-hex, missing) is the contract's 400, never a
    # FastAPI 422.
    """
    Prove this server holds the backend auth token - without revealing it.

    Unauthenticated by design: the desktop shell sends a fresh random nonce and
    compares the proof with its own HMAC before it trusts whatever is listening
    on the port with the token.

    ### Query Parameters
    - `nonce`: 32-128 hexadecimal characters (required)

    ### Response
    - `proof`: lowercase hex HMAC-SHA256 with the token (UTF-8) as the key and
      the nonce exactly as sent (UTF-8) as the message

    ### Errors
    - `400`: Missing or malformed nonce
    - `429`: More than 30 requests per minute
    - `503`: No token is configured (only possible in tests)
    """
    if not _HANDSHAKE_NONCE.fullmatch(nonce or ""):
        raise HTTPException(
            status_code=400, detail="nonce must be 32-128 hexadecimal characters")
    if not BACKEND_AUTH_TOKEN:
        raise HTTPException(status_code=503, detail="Backend auth is not configured")
    return {"proof": handshake_proof(nonce, BACKEND_AUTH_TOKEN)}


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
    # One truthful probe for every backend (CUDA on Windows/Linux, Apple MPS
    # on macOS) - foundry.hardware degrades to no-GPU instead of raising. It
    # runs in a worker thread like /api/hardware: the CUDA query can block
    # briefly on a cold driver, which would stall every other request.
    profile = await asyncio.to_thread(probe_hardware, MODELS_DIR)
    gpu_vram = (
        f"{profile.vram_total_bytes / 1e9:.1f} GB" if profile.gpu_available else None
    )

    return SystemInfo(
        gpu_available=profile.gpu_available,
        gpu_name=profile.gpu_name,
        gpu_vram=gpu_vram,
        cuda_version=profile.cuda_version,
        comfyui_connected=comfy_client is not None and comfy_client.connected,
        models_count=len(model_manager.available_models),
        availability=await asyncio.to_thread(
            optional_feature_availability,
            profile.gpu_available,
            (getattr(profile, "compute_major", 0), getattr(profile, "compute_minor", 0)),
            bool(getattr(profile, "cuda_version", None)),
        ),
    )


def optional_feature_availability(
    gpu_available: bool,
    compute_capability: Optional[tuple] = None,
    cuda: Optional[bool] = None,
) -> Dict[str, Dict[str, Any]]:
    """`{name: {available, reason}}` for the optional capabilities the UI
    exposes as toggles - the renderer's contract (keys are exactly these):

    - quantization: an optimum-quanto int8/fp8 backend is importable (and a
      GPU is present) - foundry.accelerator.quant_backends_available
    - tensorrt: the bundled TensorRT runtime (torch-tensorrt, Windows/Linux
      CUDA builds) is importable, an NVIDIA GPU of compute capability 7.5+ is
      present, AND at least one model family has passed the TensorRT
      correctness sweep. While TRT_PROVEN_FAMILIES is empty this is false with
      "No model family has been verified for TensorRT yet" - never faked.
    - semanticRetrieval: the AI Director's embedding model is provisioned and
      sentence-transformers is importable; while it is not provisioned this is
      false with a reason and retrieval ranks by keywords.

    Probed with find_spec / file-existence checks: nothing heavy is imported
    and nothing is downloaded.
    """
    acceleration = acceleration_feature_availability(
        gpu_available=gpu_available, compute_capability=compute_capability, cuda=cuda)
    return {
        "quantization": acceleration["quantization"],
        "tensorrt": acceleration["tensorrt"],
        "semanticRetrieval": semantic_retrieval_availability(),
    }


@app.post("/api/prompts/enhance", tags=["Prompts"])
@limiter.limit("60/minute")
async def enhance_prompt_endpoint(request: Request, prompt_request: PromptEnhancementRequest):
    """
    Enhance a prompt with the local template engine.

    No model runs here: each mode appends a fixed, mode-specific set of
    descriptors (or condenses the prompt), so the result is deterministic and
    works offline. The AI-backed enhancement (OpenRouter / Hugging Face) runs
    in the desktop app with the user's own key and never reaches this route.

    ## Enhancement Modes:
    - **clarify**: Add detail and structure while preserving the original subject
    - **cinematic**: Lean into film language, dramatic lighting, and atmosphere
    - **concise**: Condense to the most important visual elements
    - **variations**: Generate multiple alternative phrasings (returns array)
    - **expand**: Add more descriptive elements and context

    ### Request Body
    - `prompt`: The prompt to enhance (required, at most 4000 characters)
    - `mode`: Enhancement mode (default: "clarify"), one of the modes above

    ### Response
    Structured JSON with `mode`, `prompt`, and `variations`

    ### Errors
    - `422`: Empty prompt, or an unknown mode

    ### Example
    ```json
    {
      "prompt": "a cat",
      "mode": "clarify"
    }
    ```
    """
    try:
        return enhance_prompt(prompt_request.prompt, prompt_request.mode)
    except ValueError as exc:
        # Empty (whitespace-only) prompt or unknown mode: a bad request, not a
        # server failure. The message never carries the prompt text.
        raise HTTPException(status_code=422, detail=str(exc))


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
    return model.model_dump()


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


_WINDOWS_DRIVE_PREFIX = re.compile(r"^[A-Za-z]:/")


def resolve_timeline_export_path(output_path: str) -> str:
    """Validate a timeline export destination and return it normalized.

    The desktop app sends the absolute path the user picked in the save
    dialog, so absolute paths are allowed - but only to an .mp4 file in a
    folder that already exists. A relative path resolves under OUTPUT_DIR
    and may not climb out of it. The .mp4 requirement means an export can
    never overwrite a non-video file. Raises ValueError with a message safe
    to show the user.
    """
    raw = (output_path or "").strip()
    if not raw or "\x00" in raw:
        raise ValueError("Choose where to save the export.")
    normalized = normalize_local_path(raw)
    if Path(normalized).suffix.lower() != ".mp4":
        raise ValueError("Timeline exports are saved as .mp4 - choose a file name ending in .mp4.")

    if os.path.isabs(normalized) or _WINDOWS_DRIVE_PREFIX.match(normalized):
        target = Path(normalized)
        if not target.parent.is_dir():
            raise ValueError("The folder chosen for the export does not exist.")
    else:
        root = Path(OUTPUT_DIR).resolve()
        target = (root / normalized).resolve()
        if target != root and root not in target.parents:
            raise ValueError("The export path must stay inside the outputs folder.")
    if target.exists() and not target.is_file():
        raise ValueError("The export path points at a folder, not a file.")
    return normalize_local_path(str(target))


def resolve_backend_media_path(source_path: str) -> str:
    """Resolve a renderer media path inside the allowed roots (B6).

    Accepts `/outputs/...` URLs, `file:///` URLs and absolute paths, but only
    when the fully resolved path (`..` collapsed, symlinks followed) is inside
    OUTPUT_DIR, a linked library root, or a VISION_STUDIO_MEDIA_ROOTS entry.
    Raises MediaPathError (-> HTTP 400) otherwise.
    """
    return media_path_policy.resolve(source_path)


def resolve_media_or_400(source_path: str) -> str:
    """resolve_backend_media_path for route handlers: MediaPathError -> 400."""
    try:
        return resolve_backend_media_path(source_path)
    except MediaPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def resolve_timeline_media_paths(export_request: "TimelineExportRequest") -> "TimelineExportRequest":
    """Every layer and audio source resolved inside the allowed roots (B6).

    Runs once in the route, before a job exists, so a path outside the roots
    is a 400 instead of a failed job minutes later. Each distinct path is
    resolved once (a long export repeats the same few sources per frame).
    Raises MediaPathError.
    """
    resolved: Dict[str, str] = {}

    def resolve(path: str) -> str:
        if path not in resolved:
            resolved[path] = resolve_backend_media_path(path)
        return resolved[path]

    frames = [
        frame.model_copy(update={"layers": [
            layer.model_copy(update={"source_path": resolve(layer.source_path)})
            for layer in frame.layers
        ]})
        for frame in export_request.frames
    ]
    audio_layers = [
        layer.model_copy(update={"source_path": resolve(layer.source_path)})
        for layer in export_request.audio_layers
    ]
    return export_request.model_copy(update={"frames": frames, "audio_layers": audio_layers})


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


class TimelineVideoSource:
    """One open decoder for one timeline video source (P2).

    A timeline export used to open a fresh imageio reader - one ffmpeg
    process plus a seek - for every video layer of every frame: up to ~24k
    spawns for a long sequence. A source now keeps ONE reader for the whole
    export. Timeline frames request monotonically increasing indexes, which
    the imageio ffmpeg plugin serves by reading forward without re-seeking;
    a repeated index (held frame, slow motion) is answered from the last
    decoded frame without touching the decoder. Owned by
    TimelineVideoSources, which closes every reader.
    """

    def __init__(self, source_path: str, reader_factory: Callable[[str], Any] = imageio.get_reader):
        self._reader = reader_factory(source_path)
        metadata = self._reader.get_meta_data() or {}
        fps_value = metadata.get("fps")
        self._fps = float(fps_value) if isinstance(fps_value, (int, float)) and fps_value > 0 else None
        frame_count_value = metadata.get("nframes")
        self._frame_count = (
            frame_count_value
            if isinstance(frame_count_value, int) and frame_count_value > 0
            else None
        )
        self._last_index: Optional[int] = None
        self._last_frame: Optional[Image.Image] = None

    def _index_for(self, time_ms: int) -> int:
        frame_index = max(0, round((time_ms / 1000.0) * self._fps)) if self._fps else 0
        if self._frame_count is not None:
            frame_index = min(frame_index, self._frame_count - 1)
        return frame_index

    def frame_at(self, time_ms: int) -> Image.Image:
        frame_index = self._index_for(time_ms)
        if frame_index != self._last_index or self._last_frame is None:
            try:
                frame = self._reader.get_data(frame_index)
            except Exception:
                # Past the real end (nframes is an estimate for some
                # containers): hold the last frame that exists.
                fallback_index = self._frame_count - 1 if self._frame_count else 0
                frame = self._reader.get_data(fallback_index)
            self._last_index = frame_index
            self._last_frame = Image.fromarray(frame).convert("RGBA")
        return self._last_frame.copy()

    def close(self) -> None:
        try:
            self._reader.close()
        except Exception:  # noqa: BLE001 - closing a dead reader is not an export failure
            logger.debug("Closing a timeline video reader failed", exc_info=True)


class TimelineVideoSources:
    """Lazily opened TimelineVideoSource per path; close() releases them all."""

    def __init__(self, reader_factory: Callable[[str], Any] = imageio.get_reader):
        self._reader_factory = reader_factory
        self._sources: Dict[str, TimelineVideoSource] = {}

    def frame_at(self, source_path: str, time_ms: int) -> Image.Image:
        source = self._sources.get(source_path)
        if source is None:
            source = TimelineVideoSource(source_path, self._reader_factory)
            self._sources[source_path] = source
        return source.frame_at(time_ms)

    @property
    def open_count(self) -> int:
        return len(self._sources)

    def close(self) -> None:
        sources, self._sources = self._sources, {}
        for source in sources.values():
            source.close()


def extract_video_frame_image(source_path: str, time_ms: int = 0) -> Image.Image:
    """One frame from a video, opening and closing its own reader."""
    source = TimelineVideoSource(source_path)
    try:
        return source.frame_at(time_ms)
    finally:
        source.close()


def render_timeline_export_frame(
    frame_request: TimelineExportFrameRequest,
    width: int,
    height: int,
    image_cache: Optional[Dict[str, Image.Image]] = None,
    video_sources: Optional[TimelineVideoSources] = None,
) -> Image.Image:
    """Composite one timeline frame.

    Layer paths are already resolved inside the allowed media roots by the
    export route (resolve_timeline_media_paths). Pass a shared video_sources
    for a multi-frame export; without one, each video layer opens and closes
    its own reader (single-frame use).
    """
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    reusable_image_cache = image_cache if image_cache is not None else {}

    for layer in frame_request.layers:
        source_path = layer.source_path
        if not os.path.exists(source_path):
            raise FileNotFoundError(f"Missing media source: {os.path.basename(source_path)}")

        if layer.media_type == "image":
            cached_image = reusable_image_cache.get(source_path)
            if cached_image is None:
                with Image.open(source_path) as opened_image:
                    cached_image = opened_image.convert("RGBA")
                reusable_image_cache[source_path] = cached_image
            source_image = cached_image.copy()
        elif video_sources is not None:
            source_image = video_sources.frame_at(source_path, layer.source_time_ms)
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
    # One decoder per video source for the whole export (P2), always closed.
    video_sources = TimelineVideoSources()

    try:
        for index, frame_request in enumerate(export_request.frames):
            frame_image = render_timeline_export_frame(
                frame_request,
                export_request.width,
                export_request.height,
                image_cache=image_cache,
                video_sources=video_sources,
            )
            writer.append_data(np.asarray(frame_image))

            if progress_callback:
                progress_callback(5.0 + ((index + 1) / max(frame_count, 1)) * 90.0)
    finally:
        video_sources.close()
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


# FFmpeg audio mux budget (B15): stream-copied video plus AAC encoding of the
# mixed audio runs far faster than real time, so a mux still running after a
# generous fixed floor plus 4x the export's duration is hung (a stalled input,
# a filter graph that never ends) and is killed instead of pinning the job.
MUX_TIMEOUT_FLOOR_SECONDS = 120.0
MUX_TIMEOUT_PER_EXPORT_SECOND = 4.0
_MUX_POLL_SECONDS = 0.25


def mux_timeout_seconds(export_duration_ms: int) -> float:
    return MUX_TIMEOUT_FLOOR_SECONDS + MUX_TIMEOUT_PER_EXPORT_SECOND * max(export_duration_ms, 1) / 1000.0


def run_ffmpeg_command(
    command: List[str],
    timeout_seconds: float,
    should_cancel: Optional[Callable[[], bool]] = None,
    job_id: Optional[str] = None,
) -> None:
    """Run ffmpeg to completion, or kill it on timeout / cancel.

    Polls instead of a blocking subprocess.run so a cancelled export stops the
    encoder within ~0.25s. Raises GenerationCancelled on cancel and
    RuntimeError (with ffmpeg's stderr tail) on timeout or a non-zero exit.
    stderr goes to a temp file, not a pipe, so a chatty ffmpeg can never
    deadlock on a full pipe buffer while we poll.
    """
    import tempfile

    with tempfile.TemporaryFile() as stderr_file:
        process = subprocess.Popen(
            command, stdout=subprocess.DEVNULL, stderr=stderr_file, stdin=subprocess.DEVNULL)
        deadline = time.monotonic() + timeout_seconds
        try:
            while True:
                try:
                    returncode = process.wait(timeout=_MUX_POLL_SECONDS)
                    break
                except subprocess.TimeoutExpired:
                    pass
                if should_cancel is not None and should_cancel():
                    raise GenerationCancelled(job_id or "timeline-export")
                if time.monotonic() >= deadline:
                    raise RuntimeError(
                        f"FFmpeg audio mux did not finish within {int(timeout_seconds)}s and was stopped.")
        finally:
            if process.poll() is None:
                process.kill()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    logger.warning("FFmpeg did not exit after kill")
        if returncode != 0:
            stderr_file.seek(0)
            stderr = stderr_file.read()[-4000:].decode("utf-8", errors="replace").strip()
            raise RuntimeError(stderr or "FFmpeg audio mux failed.")


def mux_timeline_audio_file(
    video_path: str,
    output_path: str,
    audio_layers: List[TimelineExportAudioLayerRequest],
    export_duration_ms: int,
    should_cancel: Optional[Callable[[], bool]] = None,
    job_id: Optional[str] = None,
):
    ffmpeg_executable = imageio_ffmpeg.get_ffmpeg_exe()
    command = [ffmpeg_executable, "-y", "-i", normalize_local_path(video_path)]
    filter_parts: List[str] = []
    audio_labels: List[str] = []

    for index, layer in enumerate(audio_layers, start=1):
        # Already resolved inside the allowed media roots by the export route.
        source_path = layer.source_path
        if not os.path.exists(source_path):
            raise FileNotFoundError(f"Missing audio source: {os.path.basename(source_path)}")

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

    run_ffmpeg_command(
        command,
        timeout_seconds=mux_timeout_seconds(export_duration_ms),
        should_cancel=should_cancel,
        job_id=job_id,
    )

    return normalize_local_path(output_path)


def _file_signature(path: Optional[str]) -> Optional[tuple]:
    """(size, mtime_ns) of an existing file, else None."""
    try:
        stat = os.stat(path) if path else None
    except OSError:
        return None
    return (stat.st_size, stat.st_mtime_ns) if stat else None


def _remove_export_files(*paths: Optional[str]) -> None:
    """Delete what a cancelled or failed export wrote; a partial MP4 is not a file anyone wants."""
    for path in dict.fromkeys(p for p in paths if p):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        except OSError:
            logger.warning("Could not remove cancelled export file: %s", path)


def process_timeline_export(job_id: str, export_request: TimelineExportRequest):
    """Render and encode a resolved timeline frame stream into an MP4."""
    output_path: Optional[str] = None
    silent_video_path: Optional[str] = None
    # The destination as it was before this export touched it: a failure
    # must never delete a file the user had there that was never written to.
    output_before: Optional[tuple] = None

    def written_files() -> List[Optional[str]]:
        files: List[Optional[str]] = []
        if silent_video_path and silent_video_path != output_path:
            files.append(silent_video_path)
        if output_path and (output_before is None
                            or _file_signature(output_path) != output_before):
            files.append(output_path)
        return files

    def on_frame_encoded(progress: float) -> None:
        # Runs after every encoded frame: a cancelled export stops here.
        if job_manager.is_cancelled(job_id):
            raise GenerationCancelled(job_id)
        job_manager.update_job(job_id, progress=progress)

    try:
        # An export cancelled while it was still queued never starts.
        if not job_manager.update_unless_cancelled(job_id, status=JobStatus.PROCESSING, progress=0.0):
            logger.info(f"[Job {job_id}] Cancelled before it started")
            return
        output_path = normalize_local_path(export_request.output_path)
        output_before = _file_signature(output_path)
        silent_video_path = (
            output_path
            if not export_request.audio_layers
            else normalize_local_path(f"{Path(output_path).with_suffix('')}-silent.mp4")
        )
        result = export_timeline_video_file(
            export_request,
            output_path_override=silent_video_path,
            progress_callback=on_frame_encoded,
        )
        if export_request.audio_layers:
            job_manager.update_job(job_id, progress=96.0)
            mux_timeline_audio_file(
                video_path=silent_video_path,
                output_path=output_path,
                audio_layers=export_request.audio_layers,
                export_duration_ms=max(1, round((len(export_request.frames) / export_request.fps) * 1000)),
                should_cancel=lambda: job_manager.is_cancelled(job_id),
                job_id=job_id,
            )
            result["video"] = output_path
            result["output_path"] = output_path
            result["audio_layers"] = len(export_request.audio_layers)
            try:
                os.remove(silent_video_path)
            except OSError:
                logger.warning("Could not remove temporary silent export: %s", silent_video_path)
        # A cancel that landed after the last frame still wins: no result, no file.
        if not job_manager.update_unless_cancelled(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            result=result,
            completed_at=utc_now(),
        ):
            _remove_export_files(*written_files())
    except GenerationCancelled:
        logger.info(f"[Job {job_id}] Export stopped by cancel")
        _remove_export_files(*written_files())
    except Exception as e:
        logger.error(f"Timeline export failed: {e}", exc_info=True)
        # A half-written MP4 (and the silent pre-mux file) is not a result.
        _remove_export_files(*written_files())
        job_manager.update_unless_cancelled(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=utc_now(),
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
    source_path = resolve_media_or_400(edit_request.source_path)
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Source image not found")

    output_path, relative_path = create_derived_output_path(source_path, "crop")
    # PIL decode/transform/encode is CPU-bound: run it off the event loop.
    result = await asyncio.to_thread(
        apply_crop_and_transform,
        source_path,
        output_path,
        crop_box=model_to_dict(edit_request.crop_box) if edit_request.crop_box else None,
        rotation=edit_request.rotation,
        flip_horizontal=edit_request.flip_horizontal,
        flip_vertical=edit_request.flip_vertical,
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
    source_path = resolve_media_or_400(extract_request.source_path)
    if not os.path.exists(source_path):
        raise HTTPException(status_code=404, detail="Source video not found")

    output_path, relative_path = create_derived_output_path(source_path, "frame")
    # imageio seeks + decodes the video: run it off the event loop.
    result = await asyncio.to_thread(
        extract_video_frame_file,
        source_path,
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

    `output_path` must end in `.mp4`. An absolute path (the save-dialog choice)
    must be in a folder that exists; a relative path resolves under the
    outputs folder and may not leave it. Anything else is a `422`.
    """
    try:
        normalized_output_path = resolve_timeline_export_path(export_request.output_path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    try:
        # Up to 24k frames of path resolution (filesystem calls): off the loop.
        export_request = await asyncio.to_thread(resolve_timeline_media_paths, export_request)
    except MediaPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    export_request = export_request.model_copy(update={"output_path": normalized_output_path})
    job_id = str(uuid.uuid4())
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
    # B6: every guided source image must live inside the allowed media roots;
    # the request carries the resolved paths from here on.
    try:
        gen_request = resolve_guided_media_paths(gen_request)
    except MediaPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # #34 pre-flight: guided passes either resolve into a real pass or 422 -
    # a job is never created for a request that would silently drop layers.
    guided = _guided_payload(gen_request)
    if guided is not None:
        try:
            pass_plan = resolve_guided_pass(
                guided["controlnet"], guided["reference_images"],
                guided["inpaint"], guided["denoising_strength"],
                outpaint=guided["outpaint"],
                background_replace=guided["background_replace"],
            )
        except GuidedValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        if pass_plan.kind != "none":
            if not os.path.isfile(pass_plan.image_path or ""):
                name = os.path.basename(pass_plan.image_path or "")
                raise HTTPException(
                    status_code=422,
                    detail=f"Guided-pass source image '{name}' was not found on disk.",
                )
            if pass_plan.kind == "inpaint":
                record = model_registry.get_record(gen_request.model) or {}
                if record.get("base_architecture") == "flux":
                    fill = model_registry.get_record("flux-fill") or {}
                    if not any(os.path.exists(loc) for loc in fill.get("locations") or []):
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "FLUX inpainting uses the FLUX.1 Fill model - "
                                "install 'flux-fill' from the Foundry first."
                            ),
                        )
                # #34 PR2: background replacement additionally needs the
                # U2-Net weights - refuse before a job exists.
                if pass_plan.background_replace:
                    u2net = model_registry.get_record("edit-u2net") or {}
                    if not any(os.path.exists(loc)
                               for loc in u2net.get("locations") or []):
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Background replacement uses the U2-Net weights - "
                                "install 'edit-u2net' from the Foundry first."
                            ),
                        )
        cn_stack = []
        if pass_plan.controlnet:
            for layer in pass_plan.controlnet:
                if not os.path.isfile(layer.get("source_path") or ""):
                    name = os.path.basename(layer.get("source_path") or "")
                    raise HTTPException(
                        status_code=422,
                        detail=f"ControlNet source image '{name}' was not found on disk.",
                    )
            record = model_registry.get_record(gen_request.model) or {}
            try:
                cn_stack = resolve_controlnet_stack(
                    pass_plan.controlnet,
                    record.get("base_architecture"),
                    model_registry.get_record,
                    model_id=gen_request.model,
                    kind=pass_plan.kind,
                )
            except GuidedValidationError as exc:
                raise HTTPException(status_code=422, detail=str(exc))

        # #34 PR4: 2+ reference layers resolve (or decline) BEFORE a job exists.
        ip_stack = None
        if pass_plan.ip_references:
            for ref in pass_plan.ip_references:
                if not os.path.isfile(ref.get("source_path") or ""):
                    name = os.path.basename(ref.get("source_path") or "")
                    raise HTTPException(
                        status_code=422,
                        detail=f"Reference source image '{name}' was not found on disk.",
                    )
            record = model_registry.get_record(gen_request.model) or {}
            try:
                ip_stack = resolve_ip_reference_stack(
                    pass_plan.ip_references,
                    record.get("base_architecture"),
                    model_registry.get_record,
                    model_id=gen_request.model,
                )
            except GuidedValidationError as exc:
                raise HTTPException(status_code=422, detail=str(exc))

        # #34 PR3/PR4: refuse over-budget guided stacks up front with the
        # labeled basis instead of letting the job OOM minutes into a run.
        # The gate reads exact installed-header bytes; probe + plan run in
        # the executor like /resolve-runtime does.
        if cn_stack or ip_stack:
            record = model_registry.get_record(gen_request.model) or {}
            if record:
                loop = asyncio.get_running_loop()
                profile = await loop.run_in_executor(None, probe_hardware, MODELS_DIR)
                base_plan = await loop.run_in_executor(
                    None, resolve_model_runtime, record, profile,
                    consent_store.get(gen_request.model))
                cn_dirs = []
                for item in cn_stack:
                    cn_dir = os.path.join(MODELS_DIR, "controlnet", item.record_id)
                    if cn_dir not in cn_dirs:
                        cn_dirs.append(cn_dir)
                ip_dirs = []
                if ip_stack:
                    adapter_dir = os.path.join(
                        MODELS_DIR, "ip-adapter", ip_stack.adapter_record_id)
                    ip_dirs = [adapter_dir] * ip_stack.instances
                    ip_dirs.append(os.path.join(
                        MODELS_DIR, "ip-adapter", ip_stack.encoder_record_id))
                # Memory this process already holds (the resident pipeline,
                # cached guided models) is reclaimable: crediting it stops a
                # loaded checkpoint from being counted twice. The gate reads
                # safetensors headers from disk - both run off the loop.
                reclaimable = await asyncio.to_thread(process_reserved_vram_bytes)
                refusal = await asyncio.to_thread(
                    guided_fit_refusal,
                    base_plan, record.get("base_architecture"), profile,
                    cn_model_dirs=cn_dirs, ip_model_dirs=ip_dirs,
                    reclaimable_bytes=reclaimable)
                if refusal:
                    raise HTTPException(status_code=422, detail=refusal)

    job_id = str(uuid.uuid4())

    # Create job
    job = GenerationJob(
        id=job_id,
        type="image",
        status=JobStatus.PENDING,
        params=gen_request.model_dump(),
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
        # A job cancelled while it was still queued never starts.
        if not job_manager.update_unless_cancelled(job_id, status=JobStatus.PROCESSING, progress=0.0):
            logger.info(f"[Job {job_id}] Cancelled before it started")
            return

        # Try ComfyUI first, fallback to direct generation. Guided passes
        # (#34) run on the direct generator only - routing them to ComfyUI
        # would silently drop the layers, so they force the direct path.
        if _guided_payload(request) is None and await _comfy_ready():
            logger.info(f"[Job {job_id}] Using ComfyUI generator")
            try:
                result = await generate_with_comfyui(job_id, request)
            except ComfyQueueError as exc:
                # ComfyUI went away between the connected check and the
                # queue call: nothing ran there, so the job runs here instead.
                if not direct_generator:
                    raise
                logger.warning(f"[Job {job_id}] ComfyUI did not take the job ({exc}); using direct generator")
                result = await generate_direct(job_id, request)
        else:
            logger.info(f"[Job {job_id}] ComfyUI not connected, using direct generator. comfy_client={comfy_client is not None}")
            result = await generate_direct(job_id, request)

        logger.info(f"[Job {job_id}] Generation completed, result keys={list(result.keys()) if isinstance(result, dict) else result}")
        # A cancel that landed mid-run wins over the result.
        job_manager.update_unless_cancelled(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            result=result,
            completed_at=utc_now()
        )

    except GenerationCancelled:
        logger.info(f"[Job {job_id}] Generation stopped by cancel")
    except ModelLoadRefusedError as e:
        # 409-style: the request was fine - the model refuses to load. The
        # refusal string is user-facing (no paths, no tokens); no traceback.
        logger.warning(f"[Job {job_id}] Model refused to load: {e}")
        job_manager.update_unless_cancelled(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=utc_now()
        )
    except Exception as e:
        logger.error(f"Image generation failed: {e}", exc_info=True)
        job_manager.update_unless_cancelled(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=utc_now()
        )
    finally:
        # #33: free the stored preview frame on every terminal path.
        step_preview_service.discard(job_id)
        _remove_empty_job_dir(job_id)


async def _comfy_ready() -> bool:
    """True when ComfyUI can take a job, reconnecting on demand first."""
    if comfy_client is None:
        return False
    ensure_connected = getattr(comfy_client, "ensure_connected", None)
    if ensure_connected is None:  # minimal test doubles expose only `connected`
        return bool(getattr(comfy_client, "connected", False))
    return bool(await ensure_connected())


def _remove_empty_job_dir(job_id: str) -> None:
    """Drop outputs/<job_id> when a failed or cancelled job left it empty.

    The endpoint creates the directory before the job runs; a job that wrote
    nothing should not leave an empty folder behind. Never raises.
    """
    job_dir = os.path.join(OUTPUT_DIR, job_id)
    try:
        if os.path.isdir(job_dir) and not os.listdir(job_dir):
            os.rmdir(job_dir)
    except OSError:
        pass


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
    try:
        prompt_id = await comfy_client.queue_prompt(workflow)
    except Exception as exc:  # noqa: BLE001 - classified for the direct fallback
        raise ComfyQueueError(str(exc) or type(exc).__name__) from exc
    logger.info(f"[Job {job_id}] Prompt queued, prompt_id={prompt_id}")
    job_manager.update_job(job_id, progress=10.0)
    outputs = await comfy_client.wait_for_prompt_completion(
        prompt_id,
        progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
        should_cancel=lambda: job_manager.is_cancelled(job_id),
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
        # Multi-MB writes: off the event loop (B11).
        await asyncio.to_thread(local_path.write_bytes, image_bytes)
        generated_images.append(f"/outputs/{job_id}/{local_filename}")

    return {
        "images": generated_images,
        "seed": resolved_seed,
        "width": request.width,
        "height": request.height,
        "prompt": request.prompt,
        "model": request.model,
    }


def _write_data_url_image(data_url: str, target_dir: Path) -> str:
    """Decode an image data: URL to <target_dir>/input.png; returns the path."""
    import base64
    from io import BytesIO

    _, _, encoded = data_url.partition(",")
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "input.png"
    with Image.open(BytesIO(base64.b64decode(encoded))) as image:
        image.save(target, "PNG")
    return str(target).replace("\\", "/")


async def generate_video_with_comfyui(job_id: str, request: VideoGenerationRequest) -> Dict:
    """Generate video using a connected ComfyUI server (flat request path)."""
    if not comfy_client:
        raise RuntimeError("ComfyUI client is not available")

    try:
        image_filename = ""
        if request.image_path:
            upload_path = request.image_path
            if upload_path.startswith("data:image/"):
                # ComfyUI's upload takes a file: materialize the data URL in
                # the job's own output folder (off the loop) first.
                upload_path = await asyncio.to_thread(
                    _write_data_url_image, upload_path, Path(OUTPUT_DIR) / job_id)
            image_filename = await comfy_client.upload_image(upload_path)
    except Exception as exc:  # noqa: BLE001 - classified for the direct fallback
        raise ComfyQueueError(str(exc) or type(exc).__name__) from exc

    workflow, resolved_seed = build_video_workflow(
        model=request.model,
        prompt=request.prompt,
        image_filename=image_filename,
        width=request.width,
        height=request.height,
        fps=request.fps,
        steps=request.steps,
        seed=request.seed if request.seed != -1 else None,
        file_prefix=f"vision_studio/{job_id}/video",
    )

    try:
        prompt_id = await comfy_client.queue_prompt(workflow)
    except Exception as exc:  # noqa: BLE001 - classified for the direct fallback
        raise ComfyQueueError(str(exc) or type(exc).__name__) from exc
    job_manager.update_job(job_id, progress=10.0)
    outputs = await comfy_client.wait_for_prompt_completion(
        prompt_id,
        # Video prompts run for minutes: the image budget would time out a
        # healthy clip.
        timeout_seconds=VIDEO_PROMPT_TIMEOUT_SECONDS,
        progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
        kinds=("images", "gifs", "videos"),
        should_cancel=lambda: job_manager.is_cancelled(job_id),
    )

    output_dir = Path(OUTPUT_DIR) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    saved: List[str] = []
    for index, output in enumerate(outputs, start=1):
        data = await comfy_client.get_image(
            output["filename"], output.get("subfolder", ""), output.get("type", "output")
        )
        extension = Path(output["filename"]).suffix or ".webp"
        local_name = f"video_{index:03d}{extension}"
        # Video files are tens of MB: write off the event loop (B11).
        await asyncio.to_thread((output_dir / local_name).write_bytes, data)
        saved.append(f"/outputs/{job_id}/{local_name}")

    return {"videos": saved, "seed": resolved_seed, "prompt": request.prompt, "model": request.model}


def _acceleration_settings_for(requested: Optional[AccelerationSettingsRequest]):
    """The typed request toggles as engine settings (None = all defaults)."""
    return requested.to_settings() if requested is not None else DEFAULT_ACCELERATION_SETTINGS


async def generate_direct(job_id: str, request: ImageGenerationRequest) -> Dict:
    """Generate image using direct diffusers pipeline"""
    if not direct_generator:
        raise RuntimeError(
            "No image generation backend available. Either connect ComfyUI or install "
            "the diffusers library (pip install diffusers torch) for direct generation."
        )
    logger.info(f"[Job {job_id}] Starting direct generation with model={request.model}")
    accel_settings = _acceleration_settings_for(request.acceleration_settings)
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
        acceleration_settings=accel_settings,
        loras=[l.model_dump() for l in request.loras],
        guided=_guided_payload(request),
        progress_callback=lambda p: job_manager.update_job(job_id, progress=p),
        should_cancel=lambda: job_manager.is_cancelled(job_id),
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
    - `ltx-video`: LTX Video model (text-to-video)
    - `svd`: Stable Video Diffusion (image-to-video only)
    - `animatediff`: AnimateDiff (text-to-video with motion modules)

    ### Text-to-Video vs Image-to-Video
    - **Text-to-Video**: Use when `image_path` is null. Model: ltx-video, animatediff.
    - **Image-to-Video**: Provide `image_path`. Model: svd.

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
    try:
        video_request = video_request.model_copy(
            update={"image_path": resolve_video_input_image(video_request.image_path)})
    except MediaPathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    job_id = str(uuid.uuid4())

    job = GenerationJob(
        id=job_id,
        type="video",
        status=JobStatus.PENDING,
        params=video_request.model_dump(),
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


async def generate_video_direct(job_id: str, request: VideoGenerationRequest) -> Dict:
    """Generate video using the direct diffusers video pipelines."""
    accel_settings = _acceleration_settings_for(request.acceleration_settings)
    return await direct_video_generator.generate_video(
        job_id=job_id,
        prompt=request.prompt,
        image_path=request.image_path,
        width=request.width,
        height=request.height,
        fps=request.fps,
        duration=request.duration,
        steps=request.steps,
        model_name=request.model,
        # -1 means "random": the generator draws one and reports it.
        seed=request.seed if request.seed != -1 else None,
        acceleration_settings=accel_settings,
        loras=[l.model_dump() for l in request.loras],
        progress_callback=lambda progress: job_manager.update_job(job_id, progress=progress),
        should_cancel=lambda: job_manager.is_cancelled(job_id),
    )


async def process_video_generation(job_id: str, request: VideoGenerationRequest):
    """Process video generation job"""
    try:
        # A job cancelled while it was still queued never starts.
        if not job_manager.update_unless_cancelled(job_id, status=JobStatus.PROCESSING, progress=0.0):
            logger.info(f"[Job {job_id}] Cancelled before it started")
            return

        comfy_connected = (await _comfy_ready() if request.image_path
                           else bool(comfy_client and comfy_client.connected))
        # ComfyUI only has the fixed SVD image-to-video workflow
        # (build_video_workflow); a text-to-video job sent there would get an
        # empty input image and fail, so it stays on the built-in engine.
        if comfy_connected and request.image_path:
            logger.info(f"[Job {job_id}] Using ComfyUI video generator")
            try:
                result = await generate_video_with_comfyui(job_id, request)
            except ComfyQueueError as exc:
                # Nothing was queued there, so the job runs here instead.
                if not direct_video_generator:
                    raise
                logger.warning(f"[Job {job_id}] ComfyUI did not take the job ({exc}); using direct video generator")
                result = await generate_video_direct(job_id, request)
        else:
            if not direct_video_generator:
                if comfy_connected:
                    raise RuntimeError(
                        "Text-to-video needs the built-in video engine, which is not available. "
                        "The connected ComfyUI server only runs image-to-video: add an input "
                        "image to run this job there."
                    )
                raise RuntimeError(
                    "No video generation backend available. Install the required libraries "
                    "(pip install diffusers torch) for direct video generation."
                )
            result = await generate_video_direct(job_id, request)

        # A cancel that landed mid-run wins over the result.
        job_manager.update_unless_cancelled(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100.0,
            result=result,
            completed_at=utc_now()
        )

    except GenerationCancelled:
        logger.info(f"[Job {job_id}] Generation stopped by cancel")
    except ModelLoadRefusedError as e:
        # 409-style: the request was fine - the model refuses to load.
        logger.warning(f"[Job {job_id}] Model refused to load: {e}")
        job_manager.update_unless_cancelled(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=utc_now()
        )
    except Exception as e:
        logger.error(f"Video generation failed: {e}", exc_info=True)
        job_manager.update_unless_cancelled(
            job_id,
            status=JobStatus.FAILED,
            error=str(e),
            completed_at=utc_now()
        )
    finally:
        _remove_empty_job_dir(job_id)


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
    - If job is `pending`: Sets status to `cancelled`; the job never starts
    - If job is `processing`: Sets status to `cancelled`; the built-in engine stops
      at the end of its current step, and a ComfyUI prompt is removed from the
      queue or interrupted. The job stays `cancelled` and keeps no result.
    - If job is already `completed`, `failed`, or `cancelled`: Returns message indicating current status

    ### Response
    - `message`: Human-readable result description

    ### Errors
    - `404`: Job not found
    """
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job_manager.cancel(job_id):
        return {"message": "Job cancelled"}

    return {"message": f"Job is already {job.status.value}"}


@app.get("/api/jobs", tags=["Jobs"])
@limiter.limit("60/minute")
async def list_jobs(
    request: Request,
    status: Optional[str] = Query(None, max_length=16),
    limit: int = Query(50, ge=1, le=100),
):
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

@app.get("/api/hardware", response_model=HardwareProfileSchema, tags=["Models"])
@limiter.limit("60/minute")
async def get_hardware(request: Request):
    """Truthful hardware probe (spec 6.1). Runs in a worker thread - the
    CUDA query can block briefly on a cold driver."""
    loop = asyncio.get_running_loop()
    profile = await loop.run_in_executor(None, probe_hardware, MODELS_DIR)
    return HardwareProfileSchema(**asdict(profile))


@app.get("/api/models", response_model=List[ModelRecordSchema], tags=["Models"])
@limiter.limit("60/minute")
async def list_models(request: Request):
    """List every model in the Foundry registry as ModelRecords."""
    return model_registry.list_records()


def _job_to_dict(job) -> dict:
    """Serialize a DownloadJob without ever exposing a token (there is none)."""
    return {
        "model_id": job.model_id,
        "status": job.status,
        "progress": job.progress,
        "speed": job.speed,
        "eta": job.eta,
        "total_bytes": job.total_bytes,
        "error": job.error,
        "gate_url": job.gate_url,
    }


@app.get("/api/models/downloads", response_model=List[DownloadJobSchema], tags=["Models"])
@limiter.limit("60/minute")
async def list_downloads(request: Request):
    """Snapshot of every download job (queue + progress).

    Declared BEFORE the dynamic /api/models/{model_id} route so the literal
    'downloads' path is not captured as a model id.
    """
    return [_job_to_dict(job) for job in download_manager.list_jobs()]


@app.get("/api/models/provision/status", response_model=ProvisionStatusSchema, tags=["Models"])
@limiter.limit("60/minute")
async def provision_status_endpoint(request: Request):
    """Aggregate + per-model snapshot of comprehensive auto-provisioning.

    Declared BEFORE the dynamic /api/models/{model_id} routes so the literal
    'provision' segment is never captured as a model id (mirrors the
    'downloads' ordering guard above).
    """
    return provision_orchestrator.status()


@app.post("/api/models/provision/start", response_model=ProvisionStatusSchema, status_code=202, tags=["Models"])
@limiter.limit("30/minute")
async def provision_start_endpoint(request: Request, body: Optional[ProvisionStartRequest] = None):
    """One-click provision of the auto-set, or a subset of it (202 Accepted).

    Optional JSON body `{"model_ids": [...]}`: provision only those manifest
    entries (each must be in the manifest's auto-set, else 400). Omitted or
    empty provisions everything. Missing models enqueue/resume through the
    existing download_manager; pickle-format curated members are granted
    consent with recorded provenance (spec 5.3; informed auto-consent,
    2026-07-07). The optional X-HF-Token header (Electron safeStorage) is
    forwarded for the gated SD3.5 pipelines, never persisted and never logged.
    """
    try:
        return await provision_orchestrator.start(
            hf_token=request.headers.get("X-HF-Token"),
            model_ids=body.model_ids if body else None)
    except UnknownProvisionModelsError as exc:
        raise HTTPException(status_code=400, detail={
            "error_code": "unknown-provision-models",
            "message": str(exc),
            "unknown": exc.unknown,
        })


@app.post("/api/models/provision/{action}", response_model=ProvisionStatusSchema, tags=["Models"])
@limiter.limit("30/minute")
async def provision_control_endpoint(request: Request, action: str):
    """Set-wide pause / resume / cancel / reverify over the auto-set's jobs.

    'resume' re-runs start (resuming paused/errored jobs + enqueuing any still
    missing), so it also forwards the HF token. 'reverify' is the PR3 repair
    path: re-hash present direct-URL entries against the manifest sha256 and
    re-fetch any corrupt copy (spec 6, PR2-deferred capability).
    """
    if action not in {"pause", "resume", "cancel", "reverify"}:
        raise HTTPException(status_code=404, detail=f"Unknown action '{action}'")
    if action == "resume":
        return await provision_orchestrator.start(hf_token=request.headers.get("X-HF-Token"))
    if action == "reverify":
        # B1: hashing many GB runs as a background task off the event loop;
        # this returns at once and status().reverify reports its progress.
        return await provision_orchestrator.start(
            hf_token=request.headers.get("X-HF-Token"), reverify=True)
    return getattr(provision_orchestrator, action)()


@app.post("/api/models/import", response_model=LibraryRootSchema, status_code=201, tags=["Models"])
@limiter.limit("30/minute")
async def import_library_root(request: Request, body: ImportRootRequest):
    """Register a user library root by reference (never copies bytes)."""
    try:
        root = roots_store.add(body.path, body.layout_hint)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    # If the scan below fails the root stays registered (500-but-added):
    # add() is idempotent and scan is freely retriable - do not "fix" by
    # un-persisting, that would break idempotent retry.
    await asyncio.to_thread(index_service.scan)
    return root.to_dict()


@app.post("/api/models/scan", response_model=ScanResultSchema, tags=["Models"])
@limiter.limit("30/minute")
async def scan_libraries(request: Request):
    """Re-index every feed (app tree, HF cache, linked roots)."""
    snapshot = await asyncio.to_thread(index_service.scan)
    return {"records_indexed": snapshot.records_indexed, "warnings": snapshot.warnings}


@app.get("/api/models/libraries", response_model=List[LibraryRootSchema], tags=["Models"])
@limiter.limit("60/minute")
async def list_library_roots(request: Request):
    return [root.to_dict() for root in roots_store.list()]


@app.get("/api/models/libraries/detect", response_model=List[DetectedRootSchema], tags=["Models"])
@limiter.limit("60/minute")
async def detect_library_roots(request: Request):
    """First-run detection: existing ComfyUI/A1111 installs, offers only."""
    return await asyncio.to_thread(index_service.detect_candidates)


@app.delete("/api/models/libraries/{root_id}", tags=["Models"])
@limiter.limit("30/minute")
async def remove_library_root(request: Request, root_id: str):
    """Remove a root: referenced-only records dropped, zero bytes touched."""
    if root_id not in {root.id for root in roots_store.list()}:
        raise HTTPException(status_code=404, detail=f"No library root '{root_id}'")
    dropped = await asyncio.to_thread(index_service.remove_root, root_id)
    return {"removed": True, "records_dropped": dropped}


@app.post("/api/models/consent", response_model=ConsentStateSchema, tags=["Models"])
@limiter.limit("30/minute")
async def set_consent(request: Request, body: ConsentRequestSchema):
    """Grant/revoke per-model consent. Deliberate, logged; deny is the default.

    Declared BEFORE the dynamic /api/models/{model_id} route so the literal
    'consent' path is not captured as a model id.
    """
    try:
        if body.granted:
            consent_store.grant(body.model_id, body.kind)
        else:
            consent_store.revoke(body.model_id, body.kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    state = consent_store.get(body.model_id)
    return ConsentStateSchema(model_id=body.model_id, **state)


_hub_search_cache = hub_search.HubSearchCache()


@app.get("/api/models/search", response_model=SearchResponseSchema, tags=["Models"])
@limiter.limit("30/minute")
async def search_models(
    request: Request,
    q: str = Query("", max_length=256),
    source: str = Query("hf", max_length=16),
    task: Optional[str] = Query(None, max_length=64),
    sort: str = Query("downloads", max_length=32),
    page: int = Query(1, ge=1, le=50),
    nsfw: bool = False,
    author: Optional[str] = Query(None, max_length=128),
):
    """Search HF or CivitAI. Offline-degrading: failures return offline=True,
    never a 5xx - the local library stays fully operational (spec 5.1).

    Declared BEFORE the dynamic /api/models/{model_id} route so the literal
    'search' path is not captured as a model id. Hub tokens arrive per-request
    in headers (Electron safeStorage); NEVER persisted in Python, NEVER logged.

    Param bounds (review M-2): page is clamped because the HF call requests
    limit=page*page_size - without the cap one local request could amplify
    into an unbounded hub request. Violations are FastAPI-native 422s.
    """
    if source not in ("hf", "civitai"):
        raise HTTPException(status_code=400, detail="source must be 'hf' or 'civitai'")
    loop = asyncio.get_running_loop()
    try:
        if source == "hf":
            from huggingface_hub import HfApi

            hf_token = request.headers.get("X-HF-Token")
            api = HfApi(token=hf_token)
            results = await loop.run_in_executor(
                None,
                lambda: hub_search.search_hf(
                    api, query=q, verified_repo_ids=_verified_repo_ids(),
                    task=task, sort=sort, page=page, author=author,
                    # Full-signal verification of Compatible candidates
                    # (review H-1) rides the same per-request token.
                    fetch_signals=lambda rid: fetch_repo_signals(rid, token=hf_token),
                    # P6: TTL cache of listings + signals, namespaced by a
                    # hash of the token (the token itself is never stored).
                    cache=_hub_search_cache,
                    cache_scope=hub_search.token_scope(hf_token),
                ),
            )
        else:
            civitai_token = request.headers.get("X-Civitai-Token")
            results = await loop.run_in_executor(
                None,
                lambda: civitai_search.search_civitai(
                    q, include_nsfw=nsfw, token=civitai_token,
                ),
            )
    except Exception as exc:
        return SearchResponseSchema(
            source=source, query=q, page=page, results=[],
            offline=True, warning=f"search unavailable: {type(exc).__name__}",
        )
    model_registry.register_transient([_search_result_to_record(r) for r in results])
    return SearchResponseSchema(
        source=source, query=q, page=page,
        results=[SearchResultSchema(**asdict(r)) for r in results],
    )


@app.get("/api/models/{model_id}", response_model=ModelRecordSchema, tags=["Models"])
@limiter.limit("60/minute")
async def get_model_record(request: Request, model_id: str):
    """Return a single ModelRecord by id (resolving legacy aliases), or 404."""
    record = model_registry.get_record(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    return record


@app.post("/api/models/{model_id}/download", response_model=DownloadJobSchema, status_code=202, tags=["Models"])
@limiter.limit("30/minute")
async def enqueue_download(request: Request, model_id: str):
    """Enqueue a model download. Returns the DownloadJob (202 Accepted).

    The optional HF token arrives per-request in the X-HF-Token header from the
    Electron main process (safeStorage). It is forwarded to the manager as a
    local parameter and is NEVER persisted in Python and NEVER logged.
    """
    record = model_registry.get_record(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    # Supply-chain boundary (review H-1): transient HF records carry verdicts
    # classified from PARTIAL listing data, which cannot prove "no remote
    # code" or "safetensors tree". Re-fetch full signals and reclassify HERE,
    # before the consent checks, so a stale or crafted search record can
    # never talk its way past consent. CivitAI records are exempt: their
    # verdicts come from explicit per-file metadata (positive SafeTensor
    # marker) and integrity is the mandatory sha256.
    if (
        model_registry.is_transient(model_id)
        and record.get("source") != "civitai"
        and record.get("repo_id")
    ):
        hf_token = request.headers.get("X-HF-Token")
        loop = asyncio.get_running_loop()
        signals = await loop.run_in_executor(
            None, lambda: fetch_repo_signals(record["repo_id"], token=hf_token)
        )
        if not signals.reachable:
            # Fail closed: if safety signals cannot be verified, the bytes
            # cannot be acquired. (Downloads need the network anyway.)
            raise HTTPException(status_code=503, detail={
                "error_code": "repo-signals-unverifiable",
                "message": "Could not verify the repo's safety signals (remote code / weight format). Check your connection and try again.",
            })
        verdict = classify_repo(signals, _verified_repo_ids())
        model_registry.update_transient(
            model_id, tier=verdict.tier, tier_reason=verdict.reason,
            format=verdict.format, trust_remote_code=verdict.trust_remote_code,
            revision=signals.revision,
        )
        record = model_registry.get_record(model_id)
    # Complete-or-explain installs: a record's companions (shared encoders,
    # annotators) download WITH it - a half-install fails at generation time.
    # Every security gate runs for the WHOLE group BEFORE anything enqueues,
    # so a blocked companion refuses the install up front naming itself.
    companions = _companion_closure(record)
    # U3: a model that needs repo-authored code can never load (the runtime
    # resolver refuses every such record and no consent unlocks it), so its
    # bytes are refused up front - for the model and every companion.
    _raise_if_remote_code(record)
    for companion in companions:
        _raise_if_remote_code(companion, companion_of=model_id)
    _raise_unless_consented(record)
    for companion in companions:
        _raise_unless_consented(companion, companion_of=model_id)
    try:
        job = download_manager.enqueue(
            model_id, token=_acquisition_token(request, record))
        for companion in companions:
            download_manager.enqueue(
                companion["id"], token=_acquisition_token(request, companion))
    except RemoteCodeUnsupportedError as exc:
        # Defense in depth: the manager refuses too (its message has no token).
        raise HTTPException(status_code=422, detail={
            "error_code": RemoteCodeUnsupportedError.error_code, "message": str(exc)})
    return _job_to_dict(job)


def _raise_if_remote_code(record: Dict[str, Any], companion_of: Optional[str] = None) -> None:
    """422 for any record that needs trust_remote_code (U3)."""
    if not record.get("trust_remote_code"):
        return
    prefix = f"Its companion '{record['id']}'" if companion_of else "This model"
    raise HTTPException(status_code=422, detail={
        "error_code": RemoteCodeUnsupportedError.error_code,
        "message": (
            f"{prefix} requires running code authored by the repo. Vision Studio never "
            "executes repo code, so it can't be downloaded or run."),
    })


def _companion_closure(record: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Catalog companions this record needs installed - transitive, deduped,
    cycle-safe, excluding records already ready on disk. A companions id that
    resolves to no record is skipped (the catalog test guarantees none exist).
    """
    seen = {record["id"]}
    queue = list(record.get("companions") or [])
    resolved: List[Dict[str, Any]] = []
    while queue:
        companion_id = queue.pop(0)
        if companion_id in seen:
            continue
        seen.add(companion_id)
        companion = model_registry.get_record(companion_id)
        if companion is None:
            continue
        queue.extend(companion.get("companions") or [])
        if companion.get("status") == "ready":
            continue
        resolved.append(companion)
    return resolved


def _raise_unless_consented(record: Dict[str, Any], companion_of: Optional[str] = None) -> None:
    """Spec 5.3 security rail: pickle weights are deny-by-default - downloads
    are blocked until per-model consent exists. (trust_remote_code is not a
    consent question any more: such records are refused outright, U3.)
    """
    prefix = (
        f"Its companion '{record['id']}'" if companion_of else "This model"
    )
    consent = consent_store.get(record["id"])
    if record.get("format") == "pickle" and not consent["pickle"]:
        raise HTTPException(
            status_code=409,
            detail={
                "error_code": "pickle-consent-required",
                "message": f"{prefix} ships pickle weights. Explicit consent is required (Settings > Model Trust).",
            },
        )


def _acquisition_token(request: Request, record: Optional[Dict[str, Any]]) -> Optional[str]:
    """Per-source acquisition token header (Electron safeStorage).

    CivitAI-source records read X-Civitai-Token; everything else reads
    X-HF-Token. NEVER persisted in Python, NEVER logged.
    """
    if record is not None and record.get("source") == "civitai":
        return request.headers.get("X-Civitai-Token")
    return request.headers.get("X-HF-Token")


@app.post("/api/models/{model_id}/download/{action}", response_model=DownloadJobSchema, tags=["Models"])
@limiter.limit("30/minute")
async def control_download(request: Request, model_id: str, action: str):
    """Pause, resume, or cancel an in-flight download."""
    if action not in {"pause", "resume", "cancel"}:
        raise HTTPException(status_code=404, detail=f"Unknown action '{action}'")
    if action == "resume":
        token = _acquisition_token(request, model_registry.get_record(model_id))
        job = download_manager.resume(model_id, token=token)
    else:
        job = getattr(download_manager, action)(model_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No download job for '{model_id}'")
    return _job_to_dict(job)


@app.post("/api/models/{model_id}/convert-safetensors", response_model=ConvertResultSchema, tags=["Models"])
@limiter.limit("5/minute")
async def convert_model_to_safetensors(request: Request, model_id: str):
    """Consent-gated pickle -> safetensors conversion (spec 5.3)."""
    record = model_registry.get_record(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"unknown model: {model_id}")
    if not consent_store.get(model_id)["pickle"]:
        raise HTTPException(status_code=409, detail={
            "error_code": "pickle-consent-required",
            "message": "Converting requires reading the pickle file - grant pickle consent first."})
    src = next((p for p in record.get("locations", [])
                if p.lower().endswith((".ckpt", ".pt", ".pth", ".bin"))
                and os.path.isfile(p)), None)
    if src is None:
        raise HTTPException(status_code=409, detail={
            "error_code": "no-pickle-source",
            "message": "No local pickle file found for this model - download it first."})
    dest = os.path.splitext(src)[0] + ".safetensors"
    if os.path.exists(dest):
        # Never silently clobber an existing (possibly authoritative)
        # safetensors copy; re-convert is an explicit delete-then-convert.
        raise HTTPException(status_code=409, detail={
            "error_code": "already-converted",
            "message": f"A safetensors file already exists at {os.path.basename(dest)} - delete it first to re-convert."})
    loop = asyncio.get_running_loop()
    try:
        tensor_count = await loop.run_in_executor(
            None, convert_pickle_to_safetensors, src, dest)
    except ConvertUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        # convert.py keeps these messages path-free (basename only).
        raise HTTPException(status_code=422, detail=f"conversion failed: {exc}")
    except OSError as exc:
        # OS error strings embed absolute local paths - surface the type only
        # (review L-1); the full detail belongs in server logs.
        logger.warning("convert-safetensors OS error for %s: %s", model_id, exc)
        raise HTTPException(status_code=422, detail=f"conversion failed: {type(exc).__name__}")
    return ConvertResultSchema(model_id=model_id, safetensors_path=dest, tensor_count=tensor_count)


@app.post("/api/models/{model_id}/resolve-runtime", response_model=RuntimePlanSchema, tags=["Models"])
@limiter.limit("30/minute")
async def resolve_runtime(request: Request, model_id: str):
    """The load plan for THIS machine (spec 6.4). Refusals are 200 payloads:
    preflight is informational - 'this will not load, and here is why' is an
    answer, not a server error."""
    record = model_registry.get_record(model_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Model '{model_id}' not found")
    loop = asyncio.get_running_loop()
    profile = await loop.run_in_executor(None, probe_hardware, MODELS_DIR)
    # The plan reads safetensors headers from disk (B11): off the loop too.
    plan = await asyncio.to_thread(
        resolve_model_runtime, record, profile, consent_store.get(model_id))
    data = asdict(plan)
    if plan.vram_plan is not None:
        data["vram_plan"] = asdict(plan.vram_plan)
    return RuntimePlanSchema(**data)


@app.get("/api/models/{model_id}/status", tags=["Models"])
@limiter.limit("60/minute")
async def get_model_status(request: Request, model_id: str):
    """
    Get the legacy model manager's record for a model.

    ### Path Parameters
    - `model_id`: The unique model identifier

    ### Response Fields
    - `id`: Model identifier
    - `name`: Model name
    - `type`: Model kind (checkpoint, lora, vae, controlnet, ...)
    - `source`: Where it comes from (huggingface, civitai, local)
    - `repo_id`: Hugging Face repository, if any
    - `aux_repo_id`: Second repository some models need, if any
    - `filename`: Single-file weight name, if any
    - `local_path`: Where it is installed, once it is
    - `size`: Human-readable size
    - `status`: not_downloaded, downloading, ready or error
    - `description`: Short description
    - `download_url`: Direct download URL, if any
    - `progress`: Download progress (0.0 - 100.0)

    ### Errors
    - `404`: Model ID not found
    """
    status = model_manager.get_model_status(model_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Model not found")
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
    - `409`: Model is a linked library reference — remove its root instead
    """
    record = model_registry.get_record(model_id)
    if record is not None and record.get("source") == "linked":
        raise HTTPException(
            status_code=409,
            detail="This model is a linked library reference - remove its library root instead.",
        )
    # A cached pipeline still holds the weights (and, on Windows, open file
    # handles that block the delete): evict it before the files go.
    # Unloading frees GPU memory (gc + empty_cache) and may wait for an
    # in-flight run to release the GPU gate: off the event loop (B11).
    for generator in (direct_generator, direct_video_generator):
        if generator is not None:
            try:
                await asyncio.to_thread(generator.unload_model, model_id)
            except Exception as exc:  # noqa: BLE001 - eviction is best-effort
                logger.warning("Could not evict cached pipeline for %s: %s", model_id, exc)
    deleted = await model_manager.delete_model(model_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model not found or not installed")
    # Re-index so the Foundry registry stops reporting the deleted files as
    # installed. The files are already gone, so a failed scan is not a failed
    # delete - it is retriable through POST /api/models/scan.
    try:
        await asyncio.to_thread(index_service.scan)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Re-index after deleting %s failed: %s", model_id, exc)
    return {"success": True}


# ============= WebSocket for Real-time Updates =============

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    def disconnect(self, websocket: WebSocket):
        # Idempotent: every exit path of the endpoint calls this.
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)


manager = ConnectionManager()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time generation job updates.

    Connect to this endpoint to receive live progress updates for all active generation jobs.
    This eliminates the need for HTTP polling.

    ### Connection
    ```
    ws://127.0.0.1:8000/ws
    x-vision-studio-token: <backend auth token>   (request header)
    ```
    Without a matching token header the server closes the socket with code
    1008. A `?token=` query parameter is not accepted.

    ### Client Messages
    Send JSON objects with the following structure:
    ```json
    {
      "action": "subscribe",
      "job_id": "job-123"
    }
    ```
    - `subscribe` with a `job_id` narrows this connection's updates to the
      subscribed jobs (repeat it to add more); without a `job_id` it clears
      the filter so every job is reported again (the default).
    - `unsubscribe` with a `job_id` drops that job from the filter.
    Malformed or unknown messages are ignored; they never close the socket.

    ### Server Messages
    The server pushes periodic updates (every 500ms) for processing jobs, plus
    one final update when a job it reported finishes (completed, failed or
    cancelled):
    ```json
    {
      "type": "job_update",
      "job_id": "job-123",
      "status": "processing",
      "progress": 45.5
    }
    ```

    ### Message Fields
    - `type`: "job_update" (or "step_image" for a live preview frame)
    - `job_id`: Unique job identifier
    - `status`: Current job status (pending, processing, completed, failed, cancelled)
    - `progress`: Completion percentage (0.0 - 100.0)

    ### Example (Node, `ws` package - browsers cannot set WebSocket headers)
    ```javascript
    const ws = new WebSocket('ws://127.0.0.1:8000/ws', {
      headers: { 'x-vision-studio-token': token },
    });
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      console.log(`Job ${update.job_id}: ${update.progress}%`);
    };
    ```

    ### Disconnection
    The server automatically removes disconnected clients. Reconnect with exponential backoff
    if the connection is lost.
    """
    # K2: the token rides the x-vision-studio-token request header only. A
    # ?token= query parameter is no longer accepted: query strings end up in
    # access logs, proxies and crash reports.
    if BACKEND_AUTH_TOKEN and not token_matches(websocket.headers.get(BACKEND_AUTH_HEADER)):
        await websocket.close(code=1008)
        return

    await manager.connect(websocket)

    # Job ids this connection subscribed to; empty means every job.
    subscriptions: Set[str] = set()
    # Start background task to send updates
    update_task = asyncio.create_task(send_job_updates(websocket, subscriptions))

    try:
        while True:
            # Receive commands from client
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            apply_ws_command(parse_ws_command(message.get("text")), subscriptions)

    except WebSocketDisconnect:
        pass
    finally:
        # Every exit (disconnect, error, cancellation) releases the socket
        # and stops its update loop.
        manager.disconnect(websocket)
        update_task.cancel()


def parse_ws_command(text: Optional[str]) -> Optional[Dict[str, Any]]:
    """A client command as a dict, or None for bad JSON / non-object / binary."""
    if not text:
        return None
    try:
        data = json.loads(text)
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def apply_ws_command(data: Optional[Dict[str, Any]], subscriptions: Set[str]) -> None:
    """Apply subscribe/unsubscribe to this connection's filter; ignore the rest."""
    if data is None:
        return
    action = data.get("action")
    job_id = data.get("job_id")
    if action == "subscribe":
        if isinstance(job_id, str) and job_id:
            subscriptions.add(job_id)
        elif job_id is None:
            subscriptions.clear()
    elif action == "unsubscribe" and isinstance(job_id, str):
        subscriptions.discard(job_id)


def _ws_wants(job_id: str, subscriptions: Optional[Set[str]]) -> bool:
    return not subscriptions or job_id in subscriptions


def build_ws_updates(
    active_jobs,
    sent_revisions: Dict[str, int],
    subscriptions: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """One WS tick: a job_update per processing job, plus at most one new
    step_image per job whose preview revision this connection has not sent
    yet (#33). Mutates sent_revisions - the per-connection dedup state. The
    500ms tick is what caps the stream at ~2 frames/sec. A non-empty
    subscriptions set limits the tick to those job ids."""
    messages: List[Dict[str, Any]] = []
    for job in active_jobs:
        if not _ws_wants(job.id, subscriptions):
            continue
        messages.append({
            "type": "job_update",
            "job_id": job.id,
            "status": job.status.value,
            "progress": job.progress,
        })
        preview = step_preview_service.latest(job.id)
        if preview and sent_revisions.get(job.id) != preview.revision:
            sent_revisions[job.id] = preview.revision
            messages.append({
                "type": "step_image",
                "job_id": job.id,
                "step": preview.step,
                "total_steps": preview.total_steps,
                "image": preview.image,
            })
    return messages


TERMINAL_JOB_STATUSES = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}


def build_ws_final_updates(
    reported_ids: Set[str],
    active_ids: Set[str],
    sent_revisions: Dict[str, int],
    subscriptions: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """One last job_update for every job this connection reported as
    processing that has since finished, so a client never stalls on the last
    in-flight percentage. Drops finished ids from reported_ids and their
    preview dedup state from sent_revisions."""
    messages: List[Dict[str, Any]] = []
    for job_id in sorted(reported_ids - active_ids):
        job = job_manager.get_job(job_id)
        if job is not None and job.status not in TERMINAL_JOB_STATUSES:
            continue  # not finished (e.g. back to pending): keep watching
        reported_ids.discard(job_id)
        sent_revisions.pop(job_id, None)
        if job is None or not _ws_wants(job_id, subscriptions):
            continue
        messages.append({
            "type": "job_update",
            "job_id": job.id,
            "status": job.status.value,
            "progress": job.progress,
        })
    return messages


async def send_job_updates(websocket: WebSocket, subscriptions: Optional[Set[str]] = None):
    """Send periodic job updates"""
    sent_revisions: Dict[str, int] = {}
    reported_ids: Set[str] = set()
    try:
        while True:
            # Send all active jobs status
            active_jobs = job_manager.list_jobs(status="processing")
            active_ids = {job.id for job in active_jobs}

            messages = build_ws_final_updates(
                reported_ids, active_ids, sent_revisions, subscriptions)
            messages += build_ws_updates(active_jobs, sent_revisions, subscriptions)
            reported_ids |= active_ids

            for message in messages:
                await websocket.send_json(message)

            await asyncio.sleep(0.5)  # Update every 500ms

    except asyncio.CancelledError:
        pass
    except (WebSocketDisconnect, RuntimeError):
        # The socket closed under a send; the endpoint's finally cleans up.
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
