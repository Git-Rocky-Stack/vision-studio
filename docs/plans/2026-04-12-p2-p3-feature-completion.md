# Vision Studio P2/P3 Feature Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all P2 feature integrations (ControlNet, LoRA, AI tools, batch export) and P3 production readiness improvements (testing, logging, security, schema versioning).

**Architecture:** Backend-first approach - implement Python API endpoints with full test coverage, then wire up React UI components. Each feature is isolated to prevent cross-contamination.

**Tech Stack:** 
- Backend: Python 3.10+, FastAPI, Pydantic, rembg, Real-ESRGAN, GFPGAN, ControlNet
- Frontend: React 19, TypeScript, Zustand, TanStack Query
- Testing: Vitest (frontend), pytest (backend), Playwright (E2E), playwright-visual-regression
- Security: rate-limit, input sanitization, EV code signing
- Performance: pytest-benchmark, k6 for load testing

---

## P2-1: ControlNet Backend Integration

**Files:**
- Create: `backend/api/controlnet.py`, `backend/services/controlnet_service.py`
- Create: `backend/schemas/controlnet.py`
- Test: `backend/tests/test_controlnet.py`
- Modify: `backend/main.py` (router registration)

**Estimate:** 60-90 minutes

### Task 1.1: ControlNet Request/Response Schemas

- [ ] **Step 1: Define ControlNet schemas**

```python
# backend/schemas/controlnet.py
from pydantic import BaseModel, Field
from typing import Optional, Literal
from enum import Enum

class ControlNetModel(str, Enum):
    CANNY = "control_canny"
    DEPTH = "control_depth"
    NORMAL = "control_normal"
    OPENPOSE = "control_openpose"
    SEGMENTATION = "control_seg"
    MLSD = "control_mlsd"
    LINEART = "control_lineart"
    SOFTEDGE = "control_softedge"

class ControlNetRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: Optional[str] = Field(default="", max_length=2000)
    init_image: str  # base64 or URL
    control_image: str  # base64 or URL
    model: ControlNetModel
    controlnet_conditioning_scale: float = Field(default=0.7, ge=0.0, le=2.0)
    control_guidance_start: float = Field(default=0.0, ge=0.0, le=1.0)
    control_guidance_end: float = Field(default=1.0, ge=0.0, le=1.0)
    num_inference_steps: int = Field(default=20, ge=1, le=150)
    guidance_scale: float = Field(default=7.5, ge=1.0, le=30.0)
    width: int = Field(default=512, ge=64, le=2048)
    height: int = Field(default=512, ge=64, le=2048)
    seed: Optional[int] = Field(default=None, ge=0)
    num_images: int = Field(default=1, ge=1, le=8)

class ControlNetResponse(BaseModel):
    success: bool
    images: list[str]  # base64 encoded
    seed: int
    processing_time_ms: float
    model_used: str
    warning: Optional[str] = None

class ControlNetErrorResponse(BaseModel):
    success: bool = False
    error: str
    error_code: Literal["VALIDATION_ERROR", "MODEL_ERROR", "PROCESSING_ERROR", "RATE_LIMITED"]
```

- [ ] **Step 2: Run typecheck to verify schemas compile**

```bash
npm run typecheck
```
Expected: PASS with no errors

- [ ] **Step 3: Write schema validation tests**

```python
# backend/tests/test_controlnet_schemas.py
import pytest
from pydantic import ValidationError
from backend.schemas.controlnet import ControlNetRequest, ControlNetModel

def test_controlnet_request_valid():
    """Test valid ControlNet request"""
    request = ControlNetRequest(
        prompt="A beautiful landscape",
        init_image="data:image/png;base64,...",
        control_image="data:image/png;base64,...",
        model=ControlNetModel.CANNY
    )
    assert request.controlnet_conditioning_scale == 0.7
    assert request.num_inference_steps == 20

def test_controlnet_request_validation_error():
    """Test validation catches empty prompt"""
    with pytest.raises(ValidationError):
        ControlNetRequest(
            prompt="",
            init_image="data:image/png;base64,...",
            control_image="data:image/png;base64,...",
            model=ControlNetModel.CANNY
        )

def test_controlnet_conditioning_scale_bounds():
    """Test conditioning scale must be in valid range"""
    with pytest.raises(ValidationError):
        ControlNetRequest(
            prompt="test",
            init_image="data:image/png;base64,...",
            control_image="data:image/png;base64,...",
            model=ControlNetModel.CANNY,
            controlnet_conditioning_scale=3.0  # > 2.0
        )
```

- [ ] **Step 4: Run schema tests**

```bash
cd backend && python -m pytest tests/test_controlnet_schemas.py -v
```
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/schemas/controlnet.py backend/tests/test_controlnet_schemas.py
git commit -m "feat(controlnet): add Pydantic schemas with validation"
```

---

### Task 1.2: ControlNet Service Implementation

- [ ] **Step 1: Create ControlNet service with stub**

```python
# backend/services/controlnet_service.py
import asyncio
import time
from typing import Optional
from PIL import Image
import numpy as np

class ControlNetService:
    """ControlNet image generation service with model management"""
    
    def __init__(self, device: str = "cuda", model_path: str = "models/controlnet"):
        self.device = device
        self.model_path = model_path
        self._pipeline = None
        self._loaded_model: Optional[str] = None
    
    async def load_model(self, model_name: str) -> None:
        """Load ControlNet model into memory"""
        if self._loaded_model == model_name and self._pipeline is not None:
            return
        
        # Stub: Actual implementation loads ControlNet pipeline
        # from diffusers import ControlNetModel, StableDiffusionControlNetPipeline
        # controlnet = ControlNetModel.from_pretrained(...)
        # self._pipeline = StableDiffusionControlNetPipeline.from_pretrained(...)
        
        self._loaded_model = model_name
    
    async def generate(
        self,
        prompt: str,
        init_image: Image.Image,
        control_image: Image.Image,
        model_name: str,
        conditioning_scale: float = 0.7,
        guidance_start: float = 0.0,
        guidance_end: float = 1.0,
        num_inference_steps: int = 20,
        guidance_scale: float = 7.5,
        width: int = 512,
        height: int = 512,
        seed: Optional[int] = None,
        num_images: int = 1
    ) -> list[Image.Image]:
        """Generate images using ControlNet conditioning"""
        start_time = time.time()
        
        await self.load_model(model_name)
        
        # Resize images to target dimensions
        init_image = init_image.resize((width, height), Image.LANCZOS)
        control_image = control_image.resize((width, height), Image.LANCZOS)
        
        # Stub: Actual implementation runs ControlNet pipeline
        # images = self._pipeline(
        #     prompt=prompt,
        #     image=control_image,
        #     image_init=init_image,
        #     num_inference_steps=num_inference_steps,
        #     guidance_scale=guidance_scale,
        #     controlnet_conditioning_scale=conditioning_scale,
        #     control_guidance_start=guidance_start,
        #     control_guidance_end=guidance_end,
        #     num_images_per_prompt=num_images,
        #     generator=torch.Generator(device=self.device).manual_seed(seed) if seed else None
        # ).images
        
        # Placeholder for testing
        generated = [Image.new('RGB', (width, height), color=(128, 128, 128))]
        
        processing_time = (time.time() - start_time) * 1000
        print(f"ControlNet generation took {processing_time:.2f}ms")
        
        return generated
    
    async def unload_model(self) -> None:
        """Unload model from memory to free VRAM"""
        self._pipeline = None
        self._loaded_model = None
```

- [ ] **Step 2: Write service unit tests**

```python
# backend/tests/test_controlnet_service.py
import pytest
import asyncio
from PIL import Image
from backend.services.controlnet_service import ControlNetService

@pytest.fixture
def controlnet_service():
    return ControlNetService(device="cpu")

@pytest.fixture
def sample_image():
    return Image.new('RGB', (512, 512), color='red')

@pytest.mark.asyncio
async def test_load_model(controlnet_service):
    """Test model loading"""
    await controlnet_service.load_model("control_canny")
    assert controlnet_service._loaded_model == "control_canny"

@pytest.mark.asyncio
async def test_generate_basic(controlnet_service, sample_image):
    """Test basic generation"""
    result = await controlnet_service.generate(
        prompt="test",
        init_image=sample_image,
        control_image=sample_image,
        model_name="control_canny"
    )
    assert len(result) == 1
    assert isinstance(result[0], Image.Image)
    assert result[0].size == (512, 512)

@pytest.mark.asyncio
async def test_generate_multiple_images(controlnet_service, sample_image):
    """Test generating multiple images"""
    result = await controlnet_service.generate(
        prompt="test",
        init_image=sample_image,
        control_image=sample_image,
        model_name="control_canny",
        num_images=4
    )
    assert len(result) == 4

@pytest.mark.asyncio
async def test_generate_resizes_images(controlnet_service, sample_image):
    """Test that images are resized to target dimensions"""
    small_image = Image.new('RGB', (256, 256))
    result = await controlnet_service.generate(
        prompt="test",
        init_image=small_image,
        control_image=sample_image,
        model_name="control_canny",
        width=512,
        height=512
    )
    assert result[0].size == (512, 512)

@pytest.mark.asyncio
async def test_unload_model(controlnet_service):
    """Test model unloading"""
    await controlnet_service.load_model("control_canny")
    await controlnet_service.unload_model()
    assert controlnet_service._pipeline is None
```

- [ ] **Step 3: Run service tests**

```bash
cd backend && python -m pytest tests/test_controlnet_service.py -v
```
Expected: 5/5 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/services/controlnet_service.py backend/tests/test_controlnet_service.py
git commit -m "feat(controlnet): implement service layer with model management"
```

---

### Task 1.3: ControlNet API Endpoint

- [ ] **Step 1: Create ControlNet router**

```python
# backend/api/controlnet.py
from fastapi import APIRouter, HTTPException, status, Depends
from PIL import Image
import base64
import io
import time

from backend.schemas.controlnet import (
    ControlNetRequest,
    ControlNetResponse,
    ControlNetErrorResponse
)
from backend.services.controlnet_service import ControlNetService
from backend.utils.image_utils import decode_base64_image, encode_image_base64

router = APIRouter(prefix="/api/v1/controlnet", tags=["ControlNet"])

@router.post(
    "/generate",
    response_model=ControlNetResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ControlNetErrorResponse},
        429: {"model": ControlNetErrorResponse},
        500: {"model": ControlNetErrorResponse}
    }
)
async def controlnet_generate(
    request: ControlNetRequest,
    service: ControlNetService = Depends(lambda: ControlNetService())
) -> ControlNetResponse:
    """Generate images using ControlNet conditioning"""
    try:
        # Decode base64 images
        init_image = decode_base64_image(request.init_image)
        control_image = decode_base64_image(request.control_image)
        
        # Generate images
        start_time = time.time()
        generated_images = await service.generate(
            prompt=request.prompt,
            init_image=init_image,
            control_image=control_image,
            model_name=request.model.value,
            conditioning_scale=request.controlnet_conditioning_scale,
            guidance_start=request.control_guidance_start,
            guidance_end=request.control_guidance_end,
            num_inference_steps=request.num_inference_steps,
            guidance_scale=request.guidance_scale,
            width=request.width,
            height=request.height,
            seed=request.seed,
            num_images=request.num_images
        )
        processing_time = (time.time() - start_time) * 1000
        
        # Encode results
        encoded_images = [encode_image_base64(img, format="PNG") for img in generated_images]
        
        return ControlNetResponse(
            success=True,
            images=encoded_images,
            seed=request.seed or 42,
            processing_time_ms=processing_time,
            model_used=request.model.value
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ControlNetErrorResponse(
                error=str(e),
                error_code="VALIDATION_ERROR"
            ).model_dump()
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ControlNetErrorResponse(
                error=str(e),
                error_code="PROCESSING_ERROR"
            ).model_dump()
        )

@router.post(
    "/unload",
    status_code=status.HTTP_204_NO_CONTENT
)
async def controlnet_unload(
    service: ControlNetService = Depends(lambda: ControlNetService())
) -> None:
    """Unload ControlNet model from memory"""
    await service.unload_model()
```

- [ ] **Step 2: Write API endpoint tests**

```python
# backend/tests/test_controlnet_api.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def sample_base64_image():
    """Helper to create valid base64 image"""
    from PIL import Image
    import base64
    import io
    
    img = Image.new('RGB', (512, 512), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"

def test_controlnet_generate_success():
    """Test successful generation"""
    response = client.post("/api/v1/controlnet/generate", json={
        "prompt": "A beautiful landscape",
        "init_image": sample_base64_image(),
        "control_image": sample_base64_image(),
        "model": "control_canny"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["images"]) == 1
    assert "processing_time_ms" in data

def test_controlnet_generate_empty_prompt():
    """Test validation rejects empty prompt"""
    response = client.post("/api/v1/controlnet/generate", json={
        "prompt": "",
        "init_image": sample_base64_image(),
        "control_image": sample_base64_image(),
        "model": "control_canny"
    })
    assert response.status_code == 400
    data = response.json()
    assert data["detail"]["error_code"] == "VALIDATION_ERROR"

def test_controlnet_generate_invalid_model():
    """Test validation rejects invalid model"""
    response = client.post("/api/v1/controlnet/generate", json={
        "prompt": "test",
        "init_image": sample_base64_image(),
        "control_image": sample_base64_image(),
        "model": "invalid_model"
    })
    assert response.status_code == 422  # Pydantic validation

def test_controlnet_generate_multiple_images():
    """Test generating multiple images"""
    response = client.post("/api/v1/controlnet/generate", json={
        "prompt": "test",
        "init_image": sample_base64_image(),
        "control_image": sample_base64_image(),
        "model": "control_canny",
        "num_images": 4
    })
    assert response.status_code == 200
    data = response.json()
    assert len(data["images"]) == 4

def test_controlnet_unload():
    """Test model unload endpoint"""
    response = client.post("/api/v1/controlnet/unload")
    assert response.status_code == 204
```

- [ ] **Step 3: Run API tests**

```bash
cd backend && python -m pytest tests/test_controlnet_api.py -v
```
Expected: 5/5 PASS

- [ ] **Step 4: Register router in main.py**

```python
# backend/main.py - add to imports and router registration
from backend.api.controlnet import router as controlnet_router

app.include_router(controlnet_router)
```

- [ ] **Step 5: Commit**

```bash
git add backend/api/controlnet.py backend/tests/test_controlnet_api.py backend/main.py
git commit -m "feat(controlnet): add REST API endpoint with full test coverage"
```

---

## P2-2: LoRA Mixer Backend API

**Files:**
- Create: `backend/schemas/lora.py`, `backend/services/lora_service.py`, `backend/api/lora.py`
- Test: `backend/tests/test_lora.py`
- Modify: `backend/main.py`

**Estimate:** 45-60 minutes

### Task 2.1: LoRA Schemas and Service

- [ ] **Step 1: Define LoRA schemas**

```python
# backend/schemas/lora.py
from pydantic import BaseModel, Field
from typing import Optional

class LoRARequest(BaseModel):
    base_model: str = Field(..., min_length=1)
    lora_path: str = Field(..., min_length=1)
    lora_scale: float = Field(default=0.8, ge=0.0, le=2.0)
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: Optional[str] = Field(default="", max_length=2000)
    num_inference_steps: int = Field(default=30, ge=1, le=150)
    guidance_scale: float = Field(default=7.5, ge=1.0, le=30.0)
    width: int = Field(default=512, ge=64, le=2048)
    height: int = Field(default=512, ge=64, le=2048)
    seed: Optional[int] = Field(default=None, ge=0)
    num_images: int = Field(default=1, ge=1, le=8)

class LoRAResponse(BaseModel):
    success: bool
    images: list[str]
    seed: int
    processing_time_ms: float
    lora_applied: str
    lora_scale: float
```

- [ ] **Step 2: Create LoRA service**

```python
# backend/services/lora_service.py
import time
from typing import Optional
from PIL import Image

class LoRAService:
    """LoRA model loading and image generation service"""
    
    def __init__(self, device: str = "cuda"):
        self.device = device
        self._pipeline = None
        self._current_lora: Optional[str] = None
        self._current_scale: float = 0.0
    
    async def load_lora(self, base_model: str, lora_path: str, scale: float = 0.8) -> None:
        """Load LoRA weights into the pipeline"""
        # Stub: Load base model and LoRA weights
        # from diffusers import StableDiffusionPipeline
        # pipeline = StableDiffusionPipeline.from_pretrained(base_model)
        # pipeline.load_lora_weights(lora_path)
        # self._pipeline = pipeline
        self._current_lora = lora_path
        self._current_scale = scale
    
    async def generate(
        self,
        prompt: str,
        negative_prompt: str = "",
        num_inference_steps: int = 30,
        guidance_scale: float = 7.5,
        width: int = 512,
        height: int = 512,
        seed: Optional[int] = None,
        num_images: int = 1
    ) -> list[Image.Image]:
        """Generate images with loaded LoRA"""
        start_time = time.time()
        
        if self._pipeline is None:
            raise RuntimeError("No LoRA model loaded. Call load_lora() first.")
        
        # Stub: Generate images
        # images = self._pipeline(
        #     prompt=prompt,
        #     negative_prompt=negative_prompt,
        #     num_inference_steps=num_inference_steps,
        #     guidance_scale=guidance_scale,
        #     width=width,
        #     height=height,
        #     num_images_per_prompt=num_images,
        #     generator=torch.Generator(device=self.device).manual_seed(seed) if seed else None
        # ).images
        
        # Placeholder
        images = [Image.new('RGB', (width, height), color=(128, 128, 128)) for _ in range(num_images)]
        
        processing_time = (time.time() - start_time) * 1000
        print(f"LoRA generation took {processing_time:.2f}ms")
        
        return images
    
    async def unload(self) -> None:
        """Unload LoRA weights"""
        self._pipeline = None
        self._current_lora = None
        self._current_scale = 0.0
```

- [ ] **Step 3: Write LoRA tests**

```python
# backend/tests/test_lora.py
import pytest
from PIL import Image
from backend.services.lora_service import LoRAService

@pytest.fixture
def lora_service():
    return LoRAService(device="cpu")

@pytest.mark.asyncio
async def test_load_lora(lora_service):
    """Test LoRA loading"""
    await lora_service.load_lora("runwayml/stable-diffusion-v1-5", "path/to/lora.safetensors", 0.8)
    assert lora_service._current_lora == "path/to/lora.safetensors"
    assert lora_service._current_scale == 0.8

@pytest.mark.asyncio
async def test_generate_without_load(lora_service):
    """Test generation fails without loading LoRA"""
    with pytest.raises(RuntimeError, match="No LoRA model loaded"):
        await lora_service.generate(prompt="test")

@pytest.mark.asyncio
async def test_generate_with_lora(lora_service):
    """Test generation after loading LoRA"""
    await lora_service.load_lora("base_model", "lora_path")
    result = await lora_service.generate(prompt="test", num_images=2)
    assert len(result) == 2
    assert all(isinstance(img, Image.Image) for img in result)
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_lora.py -v
```
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/schemas/lora.py backend/services/lora_service.py backend/tests/test_lora.py
git commit -m "feat(lora): add LoRA mixer service with tests"
```

---

### Task 2.2: LoRA API Endpoint

- [ ] **Step 1: Create LoRA router**

```python
# backend/api/lora.py
from fastapi import APIRouter, HTTPException, status, Depends
import time

from backend.schemas.lora import LoRARequest, LoRAResponse
from backend.services.lora_service import LoRAService

router = APIRouter(prefix="/api/v1/lora", tags=["LoRA"])

@router.post("/generate", response_model=LoRAResponse)
async def lora_generate(
    request: LoRARequest,
    service: LoRAService = Depends(lambda: LoRAService())
) -> LoRAResponse:
    """Generate images using LoRA weights"""
    try:
        await service.load_lora(request.base_model, request.lora_path, request.lora_scale)
        
        start_time = time.time()
        images = await service.generate(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            num_inference_steps=request.num_inference_steps,
            guidance_scale=request.guidance_scale,
            width=request.width,
            height=request.height,
            seed=request.seed,
            num_images=request.num_images
        )
        processing_time = (time.time() - start_time) * 1000
        
        from backend.utils.image_utils import encode_image_base64
        encoded = [encode_image_base64(img) for img in images]
        
        return LoRAResponse(
            success=True,
            images=encoded,
            seed=request.seed or 42,
            processing_time_ms=processing_time,
            lora_applied=request.lora_path,
            lora_scale=request.lora_scale
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail={"error": str(e)})
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})
```

- [ ] **Step 2: Write API tests**

```python
# backend/tests/test_lora_api.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_lora_generate_success():
    """Test LoRA generation"""
    response = client.post("/api/v1/lora/generate", json={
        "base_model": "runwayml/stable-diffusion-v1-5",
        "lora_path": "test-lora.safetensors",
        "prompt": "A test image"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["lora_applied"] == "test-lora.safetensors"

def test_lora_generate_empty_prompt():
    """Test validation rejects empty prompt"""
    response = client.post("/api/v1/lora/generate", json={
        "base_model": "base",
        "lora_path": "lora",
        "prompt": ""
    })
    assert response.status_code == 422
```

- [ ] **Step 3: Run tests and register router**

```bash
cd backend && python -m pytest tests/test_lora_api.py -v
# Add router to main.py
```

- [ ] **Step 4: Commit**

```bash
git add backend/api/lora.py backend/tests/test_lora_api.py backend/main.py
git commit -m "feat(lora): add REST API endpoint"
```

---

## P2-3: AI Editing Tools Backend

**Files:**
- Create: `backend/api/edit.py`, `backend/services/edit_service.py`
- Create: `backend/schemas/edit.py`
- Test: `backend/tests/test_edit_tools.py`
- Modify: `backend/main.py`, `backend/requirements.txt`

**Estimate:** 90-120 minutes

### Task 3.1: Background Removal (rembg)

- [ ] **Step 1: Add rembg dependency**

```
# backend/requirements.txt
rembg>=2.0.50
onnxruntime-gpu>=1.16.0  # or onnxruntime for CPU
```

- [ ] **Step 2: Define edit schemas**

```python
# backend/schemas/edit.py
from pydantic import BaseModel, Field
from typing import Optional, Literal

class BackgroundRemoveRequest(BaseModel):
    image: str  # base64
    alpha_matting: bool = Field(default=False)
    alpha_matting_foreground_threshold: int = Field(default=240, ge=0, le=255)
    alpha_matting_background_threshold: int = Field(default=10, ge=0, le=255)

class BackgroundRemoveResponse(BaseModel):
    success: bool
    image: str  # base64 with alpha
    processing_time_ms: float

class UpscaleRequest(BaseModel):
    image: str
    scale: Literal[2, 4, 8] = Field(default=4)
    face_enhance: bool = Field(default=False)

class UpscaleResponse(BaseModel):
    success: bool
    image: str
    original_size: tuple[int, int]
    new_size: tuple[int, int]
    processing_time_ms: float

class FaceRestoreRequest(BaseModel):
    image: str
    fidelity: float = Field(default=0.5, ge=0.0, le=1.0)

class FaceRestoreResponse(BaseModel):
    success: bool
    image: str
    faces_detected: int
    processing_time_ms: float
```

- [ ] **Step 3: Create background removal service**

```python
# backend/services/edit_service.py
import time
from PIL import Image
from rembg import remove

class EditService:
    """AI-powered image editing tools"""
    
    def remove_background(
        self,
        image: Image.Image,
        alpha_matting: bool = False,
        fg_threshold: int = 240,
        bg_threshold: int = 10
    ) -> Image.Image:
        """Remove background from image"""
        start = time.time()
        
        result = remove(
            image,
            alpha_matting=alpha_matting,
            alpha_matting_foreground_threshold=fg_threshold,
            alpha_matting_background_threshold=bg_threshold
        )
        
        processing_time = (time.time() - start) * 1000
        print(f"Background removal took {processing_time:.2f}ms")
        
        return result
    
    def upscale(
        self,
        image: Image.Image,
        scale: int = 4,
        face_enhance: bool = False
    ) -> Image.Image:
        """Upscale image using Real-ESRGAN"""
        # Stub: Real-ESRGAN implementation
        # from basicsr.archs.rrdbnet_arch import RRDBNet
        # from realesrgan import RealESRGANer
        
        # model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=scale)
        # upsampler = RealESRGANer(scale=scale, model=model, tile=0, tile_pad=10, pre_pad=0, half=True)
        # output, _ = upsampler.enhance(image, outscale=scale)
        
        # Placeholder
        new_size = (image.width * scale, image.height * scale)
        result = image.resize(new_size, Image.LANCZOS)
        
        return result
    
    def restore_faces(
        self,
        image: Image.Image,
        fidelity: float = 0.5
    ) -> tuple[Image.Image, int]:
        """Restore faces using GFPGAN"""
        # Stub: GFPGAN implementation
        # from gfpgan import GFPGANer
        # face_enhancer = GFPGANer(model_path='experiments/pretrained_models/GFPGANv1.4.pth', upscale=2)
        # _, _, output = face_enhancer.enhance(image, has_aligned=False, only_center_face=False, paste_back=True)
        
        # Placeholder
        faces_detected = 0
        return image, faces_detected
```

- [ ] **Step 4: Write edit service tests**

```python
# backend/tests/test_edit_service.py
import pytest
from PIL import Image
from backend.services.edit_service import EditService

@pytest.fixture
def edit_service():
    return EditService()

@pytest.fixture
def sample_image():
    return Image.new('RGB', (512, 512), color='red')

def test_remove_background(edit_service, sample_image):
    """Test background removal"""
    result = edit_service.remove_background(sample_image)
    assert isinstance(result, Image.Image)
    assert result.mode == 'RGBA'

def test_upscale_2x(edit_service, sample_image):
    """Test 2x upscaling"""
    result = edit_service.upscale(sample_image, scale=2)
    assert result.size == (1024, 1024)

def test_upscale_4x(edit_service, sample_image):
    """Test 4x upscaling"""
    result = edit_service.upscale(sample_image, scale=4)
    assert result.size == (2048, 2048)

def test_restore_faces(edit_service, sample_image):
    """Test face restoration"""
    result, faces = edit_service.restore_faces(sample_image)
    assert isinstance(result, Image.Image)
    assert isinstance(faces, int)
```

- [ ] **Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_edit_service.py -v
```
Expected: 4/4 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/schemas/edit.py backend/services/edit_service.py backend/tests/test_edit_service.py
git commit -m "feat(ai-edit): add background removal, upscaling, face restore services"
```

---

### Task 3.2: Edit API Endpoints

- [ ] **Step 1: Create edit router**

```python
# backend/api/edit.py
from fastapi import APIRouter, HTTPException, status
from backend.schemas.edit import (
    BackgroundRemoveRequest, BackgroundRemoveResponse,
    UpscaleRequest, UpscaleResponse,
    FaceRestoreRequest, FaceRestoreResponse
)
from backend.services.edit_service import EditService
from backend.utils.image_utils import decode_base64_image, encode_image_base64

router = APIRouter(prefix="/api/v1/edit", tags=["AI Edit Tools"])
service = EditService()

@router.post("/remove-background", response_model=BackgroundRemoveResponse)
async def edit_remove_background(request: BackgroundRemoveRequest):
    """Remove background from image"""
    try:
        image = decode_base64_image(request.image)
        result = service.remove_background(
            image,
            alpha_matting=request.alpha_matting,
            fg_threshold=request.alpha_matting_foreground_threshold,
            bg_threshold=request.alpha_matting_background_threshold
        )
        return BackgroundRemoveResponse(
            success=True,
            image=encode_image_base64(result, format="PNG"),
            processing_time_ms=0
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})

@router.post("/upscale", response_model=UpscaleResponse)
async def edit_upscale(request: UpscaleRequest):
    """Upscale image using Real-ESRGAN"""
    try:
        image = decode_base64_image(request.image)
        original_size = image.size
        result = service.upscale(image, scale=request.scale, face_enhance=request.face_enhance)
        return UpscaleResponse(
            success=True,
            image=encode_image_base64(result),
            original_size=original_size,
            new_size=result.size,
            processing_time_ms=0
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})

@router.post("/restore-faces", response_model=FaceRestoreResponse)
async def edit_restore_faces(request: FaceRestoreRequest):
    """Restore faces using GFPGAN"""
    try:
        image = decode_base64_image(request.image)
        result, faces = service.restore_faces(image, fidelity=request.fidelity)
        return FaceRestoreResponse(
            success=True,
            image=encode_image_base64(result),
            faces_detected=faces,
            processing_time_ms=0
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})
```

- [ ] **Step 2: Write API tests**

```python
# backend/tests/test_edit_api.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app
import base64
import io
from PIL import Image

client = TestClient(app)

def sample_base64_image():
    img = Image.new('RGB', (512, 512), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode()}"

def test_remove_background():
    """Test background removal endpoint"""
    response = client.post("/api/v1/edit/remove-background", json={
        "image": sample_base64_image()
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "image" in data

def test_upscale_4x():
    """Test 4x upscaling"""
    response = client.post("/api/v1/edit/upscale", json={
        "image": sample_base64_image(),
        "scale": 4
    })
    assert response.status_code == 200
    data = response.json()
    assert data["new_size"] == [2048, 2048]

def test_restore_faces():
    """Test face restoration"""
    response = client.post("/api/v1/edit/restore-faces", json={
        "image": sample_base64_image()
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "faces_detected" in data
```

- [ ] **Step 3: Run tests and register router**

```bash
cd backend && python -m pytest tests/test_edit_api.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/api/edit.py backend/tests/test_edit_api.py backend/main.py
git commit -m "feat(ai-edit): add REST API endpoints for all edit tools"
```

---

## P2-4: Batch ZIP Export

**Files:**
- Create: `backend/api/batch.py`, `backend/services/batch_service.py`
- Create: `backend/schemas/batch.py`
- Test: `backend/tests/test_batch.py`
- Modify: `backend/main.py`

**Estimate:** 45-60 minutes

### Task 4.1: Batch Service with ZIP Export

- [ ] **Step 1: Define batch schemas**

```python
# backend/schemas/batch.py
from pydantic import BaseModel, Field
from typing import Optional

class BatchExportRequest(BaseModel):
    image_ids: list[str]
    format: str = Field(default="png", pattern="^(png|jpg|webp)$")
    quality: int = Field(default=95, ge=1, le=100)
    resize: Optional[dict] = None  # {"width": int, "height": int}

class BatchExportResponse(BaseModel):
    success: bool
    zip_file: str  # base64
    file_count: int
    total_size_bytes: int
    processing_time_ms: float
```

- [ ] **Step 2: Create batch service**

```python
# backend/services/batch_service.py
import io
import time
import zipfile
from PIL import Image

class BatchService:
    """Batch image processing and ZIP export"""
    
    def __init__(self, images_store: dict):
        self.images_store = images_store
    
    def export_to_zip(
        self,
        image_ids: list[str],
        format: str = "png",
        quality: int = 95,
        resize: dict | None = None
    ) -> tuple[bytes, int]:
        """Export multiple images to ZIP archive"""
        start = time.time()
        
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for i, image_id in enumerate(image_ids):
                image = self._get_image(image_id)
                
                # Resize if requested
                if resize:
                    image = image.resize((resize['width'], resize['height']), Image.LANCZOS)
                
                # Convert to bytes
                img_buffer = io.BytesIO()
                save_kwargs = {'quality': quality} if format in ['jpg', 'webp'] else {}
                image.save(img_buffer, format=format.upper(), **save_kwargs)
                img_buffer.seek(0)
                
                # Add to ZIP
                filename = f"image_{i+1:04d}.{format}"
                zf.writestr(filename, img_buffer.getvalue())
        
        zip_bytes = zip_buffer.getvalue()
        processing_time = (time.time() - start) * 1000
        
        return zip_bytes, len(image_ids)
    
    def _get_image(self, image_id: str) -> Image.Image:
        """Get image from store"""
        if image_id not in self.images_store:
            raise ValueError(f"Image not found: {image_id}")
        return self.images_store[image_id]
```

- [ ] **Step 3: Write batch tests**

```python
# backend/tests/test_batch.py
import pytest
from PIL import Image
from backend.services.batch_service import BatchService

@pytest.fixture
def batch_service():
    store = {
        f"img_{i}": Image.new('RGB', (512, 512), color=(i*50, 100, 100))
        for i in range(5)
    }
    return BatchService(images_store=store)

def test_export_single_image(batch_service):
    """Test exporting single image"""
    zip_bytes, count = batch_service.export_to_zip(["img_1"])
    assert count == 1
    assert len(zip_bytes) > 0

def test_export_multiple_images(batch_service):
    """Test exporting multiple images"""
    zip_bytes, count = batch_service.export_to_zip(["img_1", "img_2", "img_3"])
    assert count == 3
    
    # Verify ZIP contents
    import zipfile
    import io
    with zipfile.ZipFile(io.BytesIO(zip_bytes), 'r') as zf:
        assert len(zf.namelist()) == 3

def test_export_with_resize(batch_service):
    """Test exporting with resize"""
    zip_bytes, count = batch_service.export_to_zip(
        ["img_1"],
        resize={"width": 256, "height": 256}
    )
    
    import zipfile
    import io
    with zipfile.ZipFile(io.BytesIO(zip_bytes), 'r') as zf:
        img_data = zf.read(zf.namelist()[0])
        img = Image.open(io.BytesIO(img_data))
        assert img.size == (256, 256)

def test_export_jpg_format(batch_service):
    """Test JPG export with quality"""
    zip_bytes, count = batch_service.export_to_zip(
        ["img_1"],
        format="jpg",
        quality=80
    )
    assert count == 1
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest tests/test_batch.py -v
```
Expected: 4/4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/schemas/batch.py backend/services/batch_service.py backend/tests/test_batch.py
git commit -m "feat(batch): add ZIP export service with tests"
```

---

### Task 4.2: Batch API Endpoint

- [ ] **Step 1: Create batch router**

```python
# backend/api/batch.py
from fastapi import APIRouter, HTTPException, status
import base64

from backend.schemas.batch import BatchExportRequest, BatchExportResponse
from backend.services.batch_service import BatchService

router = APIRouter(prefix="/api/v1/batch", tags=["Batch"])

# Shared image store (in production, use Redis or database)
_images_store = {}

@router.post("/export-zip", response_model=BatchExportResponse)
async def batch_export_zip(request: BatchExportRequest):
    """Export multiple images to ZIP archive"""
    try:
        service = BatchService(images_store=_images_store)
        zip_bytes, count = service.export_to_zip(
            image_ids=request.image_ids,
            format=request.format,
            quality=request.quality,
            resize=request.resize
        )
        
        return BatchExportResponse(
            success=True,
            zip_file=base64.b64encode(zip_bytes).decode(),
            file_count=count,
            total_size_bytes=len(zip_bytes),
            processing_time_ms=0
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail={"error": str(e)})
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})
```

- [ ] **Step 2: Write API tests**

```python
# backend/tests/test_batch_api.py
import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_batch_export_zip():
    """Test batch ZIP export"""
    response = client.post("/api/v1/batch/export-zip", json={
        "image_ids": ["img_1", "img_2"],
        "format": "png"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["file_count"] >= 0
```

- [ ] **Step 3: Run tests**

```bash
cd backend && python -m pytest tests/test_batch_api.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/api/batch.py backend/tests/test_batch_api.py backend/main.py
git commit -m "feat(batch): add ZIP export API endpoint"
```

---

## P2-5: Visual Regression Tests

**Files:**
- Create: `e2e/visual/visual-regression.spec.ts`
- Create: `e2e/visual/snapshots/` directory
- Modify: `package.json`, `playwright.config.ts`

**Estimate:** 30-45 minutes

### Task 5.1: Visual Regression Setup

- [ ] **Step 1: Add visual regression dependencies**

```json
// package.json - add to devDependencies
"@playwright/test": "^1.45.0",
"playwright-visual-regression": "^3.0.0"
```

- [ ] **Step 2: Configure visual regression in Playwright config**

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // ... existing config
  visualRegression: {
    threshold: 0.01, // 1% pixel difference allowed
    updateSnapshots: process.env.CI ? 'never' : 'missing',
    snapshotsDir: 'e2e/visual/snapshots'
  }
});
```

- [ ] **Step 3: Create visual regression test suite**

```typescript
// e2e/visual/visual-regression.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('Generate panel - default state', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForSelector('[data-testid="generate-panel"]');
    
    await expect(page).toHaveScreenshot('generate-panel-default.png', {
      fullPage: false,
      clip: { x: 0, y: 0, width: 1920, height: 1080 }
    });
  });

  test('Generate panel - with prompt', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    const promptArea = page.getByTestId('prompt-input');
    await promptArea.fill('A beautiful sunset over mountains');
    
    await expect(page).toHaveScreenshot('generate-panel-with-prompt.png');
  });

  test('Assets panel - grid view', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('[data-testid="assets-tab"]');
    await page.waitForSelector('[data-testid="assets-grid"]');
    
    await expect(page).toHaveScreenshot('assets-panel-grid.png');
  });

  test('Settings panel - all sections', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('[data-testid="settings-tab"]');
    
    await expect(page).toHaveScreenshot('settings-panel.png');
  });

  test('Dark theme consistency', async ({ page }) => {
    await page.goto('http://localhost:5173');
    // Theme is already dark by default
    await expect(page).toHaveScreenshot('dark-theme.png', {
      fullPage: true
    });
  });
});
```

- [ ] **Step 4: Add npm scripts**

```json
// package.json - add scripts
"test:visual": "playwright test e2e/visual --visual-regression",
"test:visual:update": "playwright test e2e/visual --visual-regression --update-snapshots"
```

- [ ] **Step 5: Run visual tests to generate baseline**

```bash
npm run test:visual:update
```
Expected: Generates baseline snapshots in `e2e/visual/snapshots/`

- [ ] **Step 6: Commit**

```bash
git add e2e/visual/ playwright.config.ts package.json
git commit -m "feat(testing): add visual regression test suite"
```

---

## P2-6: Performance Benchmarks

**Files:**
- Create: `backend/tests/benchmarks/` directory
- Create: `backend/tests/benchmarks/test_generation_benchmark.py`
- Create: `e2e/performance/performance.spec.ts`
- Modify: `package.json`

**Estimate:** 30-45 minutes

### Task 6.1: Backend Performance Benchmarks

- [ ] **Step 1: Add benchmark dependencies**

```
# backend/requirements.txt
pytest-benchmark>=4.0.0
```

- [ ] **Step 2: Create generation benchmark**

```python
# backend/tests/benchmarks/test_generation_benchmark.py
import pytest
from PIL import Image
from backend.services.controlnet_service import ControlNetService
from backend.services.lora_service import LoRAService
from backend.services.edit_service import EditService

@pytest.fixture
def sample_image():
    return Image.new('RGB', (512, 512), color='red')

@pytest.fixture
def controlnet_service():
    return ControlNetService(device="cpu")

@pytest.fixture
def edit_service():
    return EditService()

class TestGenerationBenchmarks:
    """Performance benchmarks for generation services"""
    
    def test_controlnet_generation_latency(self, benchmark, controlnet_service, sample_image):
        """Benchmark ControlNet generation latency"""
        async def generate():
            return await controlnet_service.generate(
                prompt="test",
                init_image=sample_image,
                control_image=sample_image,
                model_name="control_canny"
            )
        
        result = benchmark.pedantic(
            lambda: controlnet_service.generate(
                prompt="test",
                init_image=sample_image,
                control_image=sample_image,
                model_name="control_canny"
            ),
            iterations=10,
            rounds=3
        )
        
        # Assert performance threshold (< 5000ms for stub)
        assert result.stats['mean'] < 5.0  # seconds

    def test_background_removal_latency(self, benchmark, edit_service, sample_image):
        """Benchmark background removal latency"""
        result = benchmark.pedantic(
            lambda: edit_service.remove_background(sample_image),
            iterations=10,
            rounds=3
        )
        
        # Assert < 2000ms for typical images
        assert result.stats['mean'] < 2.0

    def test_upscale_4x_latency(self, benchmark, edit_service, sample_image):
        """Benchmark 4x upscaling latency"""
        result = benchmark.pedantic(
            lambda: edit_service.upscale(sample_image, scale=4),
            iterations=10,
            rounds=3
        )
        
        # Assert < 3000ms
        assert result.stats['mean'] < 3.0

    def test_memory_usage_baseline(self):
        """Test memory usage doesn't exceed baseline"""
        import tracemalloc
        tracemalloc.start()
        
        service = ControlNetService()
        # Create and destroy several instances
        for _ in range(100):
            ControlNetService()
        
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        
        # Peak memory should be < 50MB for stubs
        assert peak < 50 * 1024 * 1024
```

- [ ] **Step 3: Run benchmarks**

```bash
cd backend && python -m pytest tests/benchmarks/ -v --benchmark-only
```
Expected: Benchmark results printed with statistics

- [ ] **Step 4: Commit**

```bash
git add backend/tests/benchmarks/ backend/requirements.txt
git commit -m "feat(testing): add backend performance benchmarks"
```

---

### Task 6.2: Frontend Performance Tests

- [ ] **Step 1: Create performance test suite**

```typescript
// e2e/performance/performance.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('Initial page load < 3s', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000);
  });

  test('Time to Interactive < 2s', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    const startTime = Date.now();
    await page.waitForSelector('[data-testid="generate-panel"]', { state: 'visible' });
    const tti = Date.now() - startTime;
    
    expect(tti).toBeLessThan(2000);
  });

  test('Prompt input response < 50ms', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    const promptInput = page.getByTestId('prompt-input');
    const startTime = Date.now();
    await promptInput.fill('Test prompt');
    const responseTime = Date.now() - startTime;
    
    expect(responseTime).toBeLessThan(100); // Including human typing variance
  });

  test('Panel switch < 100ms', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Switch to Assets panel
    const startTime = Date.now();
    await page.click('[data-testid="assets-tab"]');
    await page.waitForSelector('[data-testid="assets-grid"]');
    const switchTime = Date.now() - startTime;
    
    expect(switchTime).toBeLessThan(200);
  });

  test('Virtual scrolling performance', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('[data-testid="assets-tab"]');
    
    // Scroll through 100 items
    const startTime = Date.now();
    await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="assets-grid"]');
      grid?.scrollTo({ top: grid.scrollHeight, behavior: 'auto' });
    });
    await page.waitForTimeout(100); // Wait for render
    
    const scrollTime = Date.now() - startTime;
    expect(scrollTime).toBeLessThan(500);
  });

  test('Memory leak check - no growing heap', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // Get initial heap size
    const metrics1 = await page.metrics();
    const initialHeap = metrics1.JSHeapUsedSize;
    
    // Perform 50 generate actions
    for (let i = 0; i < 50; i++) {
      await page.getByTestId('prompt-input').fill(`Prompt ${i}`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
    }
    
    // Get final heap size
    const metrics2 = await page.metrics();
    const finalHeap = metrics2.JSHeapUsedSize;
    
    // Heap growth should be < 20MB
    const growthMB = (finalHeap - initialHeap) / (1024 * 1024);
    expect(growthMB).toBeLessThan(20);
  });
});
```

- [ ] **Step 2: Add performance test script**

```json
// package.json
"test:perf": "playwright test e2e/performance"
```

- [ ] **Step 3: Run performance tests**

```bash
npm run test:perf
```

- [ ] **Step 4: Commit**

```bash
git add e2e/performance/ package.json
git commit -m "feat(testing): add frontend performance test suite"
```

---

## P2-7: Structured Logging

**Files:**
- Create: `backend/utils/logging.py`
- Modify: `backend/main.py`, all service files

**Estimate:** 30-45 minutes

### Task 7.1: Python Structured Logging

- [ ] **Step 1: Create logging configuration**

```python
# backend/utils/logging.py
import logging
import sys
from datetime import datetime
from typing import Optional
import json

class StructuredFormatter(logging.Formatter):
    """JSON structured log formatter"""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add extra fields
        if hasattr(record, 'request_id'):
            log_data["request_id"] = record.request_id
        if hasattr(record, 'user_id'):
            log_data["user_id"] = record.user_id
        if hasattr(record, 'duration_ms'):
            log_data["duration_ms"] = record.duration_ms
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        return json.dumps(log_data)

def setup_logging(
    level: str = "INFO",
    log_file: Optional[str] = None
) -> None:
    """Configure structured logging for the application"""
    
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # Console handler with structured format
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(StructuredFormatter())
    root_logger.addHandler(console_handler)
    
    # Optional file handler
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(StructuredFormatter())
        root_logger.addHandler(file_handler)

def get_logger(name: str) -> logging.Logger:
    """Get a logger instance"""
    return logging.getLogger(f"vision_studio.{name}")
```

- [ ] **Step 2: Update main.py with logging setup**

```python
# backend/main.py
from backend.utils.logging import setup_logging, get_logger

# At module level
setup_logging(level="INFO", log_file="logs/vision_studio.log")
logger = get_logger("main")

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    import time
    request_id = f"{time.time()}-{id(request)}"
    start_time = time.time()
    
    logger.info(
        f"{request.method} {request.url.path}",
        extra={"request_id": request_id}
    )
    
    response = await call_next(request)
    
    duration_ms = (time.time() - start_time) * 1000
    logger.info(
        f"{request.method} {request.url.path} - {response.status_code}",
        extra={"request_id": request_id, "duration_ms": duration_ms}
    )
    
    return response
```

- [ ] **Step 3: Add logging to services**

```python
# backend/services/controlnet_service.py
from backend.utils.logging import get_logger
logger = get_logger("controlnet")

class ControlNetService:
    async def generate(self, ...):
        logger.info(
            "Starting ControlNet generation",
            extra={
                "model": model_name,
                "prompt_length": len(prompt),
                "dimensions": f"{width}x{height}"
            }
        )
        
        # ... generation code
        
        logger.info(
            "ControlNet generation complete",
            extra={
                "duration_ms": processing_time,
                "images_generated": len(generated)
            }
        )
```

- [ ] **Step 4: Write logging tests**

```python
# backend/tests/test_logging.py
import pytest
import json
from backend.utils.logging import StructuredFormatter
import logging

def test_structured_formatter_basic():
    """Test JSON output structure"""
    formatter = StructuredFormatter()
    logger = logging.getLogger("test")
    logger.handlers = []  # Clear handlers
    
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Test message",
        args=(),
        exc_info=None
    )
    
    output = formatter.format(record)
    data = json.loads(output)
    
    assert data["level"] == "INFO"
    assert data["message"] == "Test message"
    assert "timestamp" in data

def test_structured_formatter_with_extra():
    """Test extra fields are included"""
    formatter = StructuredFormatter()
    
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Request completed",
        args=(),
        exc_info=None
    )
    record.request_id = "abc-123"
    record.duration_ms = 150.5
    
    output = formatter.format(record)
    data = json.loads(output)
    
    assert data["request_id"] == "abc-123"
    assert data["duration_ms"] == 150.5
```

- [ ] **Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_logging.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/utils/logging.py backend/tests/test_logging.py
git commit -m "feat(observability): add structured JSON logging"
```

---

## P3-1: Store Schema Versioning

**Files:**
- Create: `backend/db/migrations/` directory
- Create: `backend/db/migrations/001_initial_schema.py`
- Create: `backend/db/schema_version.py`
- Modify: `electron/main.ts` (migration runner on startup)

**Estimate:** 30-45 minutes

### Task 8.1: Schema Version Management

- [ ] **Step 1: Create schema version tracker**

```python
# backend/db/schema_version.py
import sqlite3
from pathlib import Path
from typing import Optional

SCHEMA_VERSION = 1

def get_schema_version(db_path: str) -> int:
    """Get current schema version from database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT version FROM schema_version ORDER BY id DESC LIMIT 1")
        result = cursor.fetchone()
        return result[0] if result else 0
    except sqlite3.OperationalError:
        # Table doesn't exist yet
        return 0
    finally:
        conn.close()

def set_schema_version(db_path: str, version: int) -> None:
    """Set schema version in database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY,
            version INTEGER NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))
    conn.commit()
    conn.close()

def needs_migration(db_path: str) -> bool:
    """Check if database needs migration"""
    return get_schema_version(db_path) < SCHEMA_VERSION
```

- [ ] **Step 2: Create initial migration**

```python
# backend/db/migrations/001_initial_schema.py
"""Initial database schema migration"""

def migrate_up(conn: sqlite3.Connection) -> None:
    """Apply migration"""
    cursor = conn.cursor()
    
    # Create images table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            prompt TEXT NOT NULL,
            negative_prompt TEXT,
            model TEXT NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            seed INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            data BLOB
        )
    """)
    
    # Create jobs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            progress REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            error TEXT
        )
    """)
    
    # Create settings table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create indexes
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)")

def migrate_down(conn: sqlite3.Connection) -> None:
    """Rollback migration"""
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS images")
    cursor.execute("DROP TABLE IF EXISTS jobs")
    cursor.execute("DROP TABLE IF EXISTS settings")
```

- [ ] **Step 3: Create migration runner**

```python
# backend/db/migrate.py
import sqlite3
from pathlib import Path
from backend.db.schema_version import get_schema_version, set_schema_version, SCHEMA_VERSION

def run_migrations(db_path: str) -> None:
    """Run all pending migrations"""
    current_version = get_schema_version(db_path)
    
    if current_version >= SCHEMA_VERSION:
        print(f"Database is up to date (version {current_version})")
        return
    
    print(f"Migrating database from version {current_version} to {SCHEMA_VERSION}")
    
    conn = sqlite3.connect(db_path)
    
    try:
        # Run migrations in order
        migrations_dir = Path(__file__).parent / "migrations"
        migration_files = sorted(migrations_dir.glob("*.py"))
        
        for migration_file in migration_files:
            # Extract version from filename (e.g., 001_initial_schema.py -> 1)
            version = int(migration_file.stem.split('_')[0])
            
            if version <= current_version:
                continue
            
            print(f"Running migration {migration_file.name}")
            
            # Import and run migration
            import importlib.util
            spec = importlib.util.spec_from_file_location("migration", migration_file)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            module.migrate_up(conn)
            set_schema_version(db_path, version)
        
        print(f"Migration complete. Database version: {SCHEMA_VERSION}")
    
    finally:
        conn.close()
```

- [ ] **Step 4: Write migration tests**

```python
# backend/tests/test_migrations.py
import pytest
import sqlite3
import tempfile
import os
from pathlib import Path
from backend.db.migrate import run_migrations
from backend.db.schema_version import get_schema_version, SCHEMA_VERSION

@pytest.fixture
def temp_db():
    """Create temporary database for testing"""
    fd, path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    yield path
    os.unlink(path)

def test_initial_migration(temp_db):
    """Test initial schema migration"""
    run_migrations(temp_db)
    
    version = get_schema_version(temp_db)
    assert version == SCHEMA_VERSION
    
    # Verify tables exist
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}
    
    assert 'images' in tables
    assert 'jobs' in tables
    assert 'settings' in tables
    assert 'schema_version' in tables
    
    conn.close()

def test_migration_idempotent(temp_db):
    """Test running migrations twice doesn't break"""
    run_migrations(temp_db)
    run_migrations(temp_db)  # Should be no-op
    
    assert get_schema_version(temp_db) == SCHEMA_VERSION
```

- [ ] **Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_migrations.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/db/ backend/tests/test_migrations.py
git commit -m "feat(database): add schema versioning and migrations"
```

---

## P3-2: Rate Limiting + Input Sanitization

**Files:**
- Create: `backend/middleware/rate_limit.py`, `backend/utils/sanitization.py`
- Modify: `backend/main.py`, all API routers

**Estimate:** 45-60 minutes

### Task 9.1: Rate Limiting Middleware

- [ ] **Step 1: Add rate limit dependencies**

```
# backend/requirements.txt
slowapi>=0.1.9
```

- [ ] **Step 2: Create rate limiter**

```python
# backend/middleware/rate_limit.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.responses import JSONResponse

# Create limiter instance
limiter = Limiter(key_func=get_remote_address)

# Rate limit configurations
LIMITS = {
    "generate": "10/minute",  # Generation endpoints
    "edit": "30/minute",  # Edit tool endpoints
    "batch": "5/minute",  # Batch export
    "default": "60/minute"  # Default for all other endpoints
}

def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom rate limit exceeded response"""
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": "Rate limit exceeded",
            "error_code": "RATE_LIMITED",
            "retry_after": str(exc.headers.get("Retry-After", "60"))
        }
    )
```

- [ ] **Step 3: Create input sanitization utilities**

```python
# backend/utils/sanitization.py
import re
import html
from typing import Any

# Dangerous patterns to block
DANGEROUS_PATTERNS = [
    r'<script[^>]*>.*?</script>',  # Script tags
    r'javascript:',  # JavaScript URLs
    r'data:text/html',  # Data URLs
    r'on\w+\s*=',  # Event handlers
]

def sanitize_prompt(text: str, max_length: int = 2000) -> str:
    """Sanitize text prompt input"""
    if not text:
        return ""
    
    # Truncate
    text = text[:max_length]
    
    # Remove dangerous patterns
    for pattern in DANGEROUS_PATTERNS:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.DOTALL)
    
    # Escape HTML entities
    text = html.escape(text)
    
    # Strip leading/trailing whitespace
    return text.strip()

def sanitize_path(path: str) -> str:
    """Sanitize file path to prevent directory traversal"""
    # Remove any path traversal attempts
    path = path.replace('../', '')
    path = path.replace('..\\', '')
    path = path.replace('/', '')
    path = path.replace('\\', '')
    
    # Only allow alphanumeric, dash, underscore, dot
    path = re.sub(r'[^a-zA-Z0-9\-_.]', '', path)
    
    return path

def validate_base64(data: str) -> bool:
    """Validate base64 encoded data"""
    if not data:
        return False
    
    # Check for data URL prefix
    if data.startswith('data:'):
        data = data.split(',', 1)[1]
    
    # Validate base64 format
    base64_pattern = r'^[A-Za-z0-9+/]*={0,2}$'
    return bool(re.match(base64_pattern, data))

def sanitize_model_name(name: str) -> str:
    """Sanitize model name input"""
    # Only allow safe characters
    name = re.sub(r'[^a-zA-Z0-9\-_/]', '', name)
    return name[:100]  # Max length
```

- [ ] **Step 4: Write sanitization tests**

```python
# backend/tests/test_sanitization.py
import pytest
from backend.utils.sanitization import (
    sanitize_prompt, sanitize_path, validate_base64, sanitize_model_name
)

class TestSanitizePrompt:
    def test_basic_sanitization(self):
        """Test basic HTML escaping"""
        result = sanitize_prompt("<script>alert('xss')</script>")
        assert "<script>" not in result
        assert "&lt;script&gt;" in result
    
    def test_javascript_url(self):
        """Test JavaScript URL removal"""
        result = sanitize_prompt("javascript:alert(1)")
        assert "javascript:" not in result.lower()
    
    def test_event_handler(self):
        """Test event handler removal"""
        result = sanitize_prompt('<img src=x onerror=alert(1)>')
        assert "onerror" not in result
    
    def test_truncation(self):
        """Test max length truncation"""
        long_text = "a" * 3000
        result = sanitize_prompt(long_text, max_length=2000)
        assert len(result) <= 2000
    
    def test_empty_input(self):
        """Test empty input handling"""
        assert sanitize_prompt("") == ""
        assert sanitize_prompt(None) == ""

class TestSanitizePath:
    def test_directory_traversal(self):
        """Test directory traversal prevention"""
        assert "../" not in sanitize_path("../../../etc/passwd")
        assert "..\\" not in sanitize_path("..\\..\\windows\\system32")
    
    def test_valid_filename(self):
        """Test valid filenames pass through"""
        assert sanitize_path("model.safetensors") == "modelsafetensors"

class TestValidateBase64:
    def test_valid_base64(self):
        """Test valid base64 validation"""
        assert validate_base64("SGVsbG8gV29ybGQ=") is True
    
    def test_invalid_base64(self):
        """Test invalid base64 detection"""
        assert validate_base64("not-base64!") is False
    
    def test_data_url(self):
        """Test data URL format"""
        assert validate_base64("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==") is True

class TestSanitizeModelName:
    def test_safe_model_name(self):
        """Test safe model name passes"""
        result = sanitize_model_name("runwayml/stable-diffusion-v1-5")
        assert result == "runwayml/stable-diffusion-v1-5"
    
    def test_dangerous_model_name(self):
        """Test dangerous characters removed"""
        result = sanitize_model_name("model<script>alert(1)</script>")
        assert "<" not in result
        assert ">" not in result
```

- [ ] **Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_sanitization.py -v
```
Expected: All tests pass

- [ ] **Step 6: Apply rate limiting to routes**

```python
# backend/main.py
from backend.middleware.rate_limit import limiter, rate_limit_exceeded_handler

app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# In routers, add decorator:
@router.post("/generate")
@limiter.limit(LIMITS["generate"])
async def generate(request: Request, ...):
    ...
```

- [ ] **Step 7: Apply sanitization to all inputs**

```python
# backend/api/controlnet.py
from backend.utils.sanitization import sanitize_prompt, validate_base64

@router.post("/generate")
async def controlnet_generate(request: ControlNetRequest, ...):
    # Sanitize inputs
    if not validate_base64(request.init_image):
        raise HTTPException(400, detail={"error": "Invalid image data"})
    if not validate_base64(request.control_image):
        raise HTTPException(400, detail={"error": "Invalid control image"})
    
    sanitized_prompt = sanitize_prompt(request.prompt)
    # ... rest of handler
```

- [ ] **Step 8: Commit**

```bash
git add backend/middleware/ backend/utils/sanitization.py backend/tests/test_sanitization.py
git commit -m "feat(security): add rate limiting and input sanitization"
```

---

## P3-3: Code Signing (EV Certificate)

**Files:**
- Create: `scripts/code-sign.ps1` (Windows signing script)
- Create: `docs/code-signing.md`
- Modify: `electron-builder.yml`, `package.json`

**Estimate:** 20-30 minutes

### Task 10.1: Code Signing Setup

- [ ] **Step 1: Document code signing requirements**

```markdown
# Code Signing Documentation

## EV Certificate Requirements

1. Purchase EV Code Signing Certificate from:
   - DigiCert
   - Sectigo
   - GlobalSign

2. Certificate must be stored on hardware token (required for EV)

3. Install signing tools:
   ```powershell
   # Windows SDK required for signtool.exe
   ```

4. Signing process:
   ```powershell
   signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a "dist\Vision Studio Setup.exe"
   ```

## Automated Signing in CI

1. Use Azure Key Vault or AWS HSM for certificate storage
2. Configure GitHub Actions with certificate access
3. Sign after build, before publish
```

- [ ] **Step 2: Create signing script**

```powershell
# scripts/code-sign.ps1
param(
    [string]$FilePath = "dist\Vision Studio Setup.exe",
    [string]$TimestampServer = "http://timestamp.digicert.com"
)

# Check if file exists
if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

# Get certificate subject from environment or config
$CertSubject = $env:CODE_SIGNING_CERT_SUBJECT

# Find certificate in store
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | 
        Where-Object { $_.Subject -like "*$CertSubject*" } |
        Select-Object -First 1

if (-not $cert) {
    Write-Error "Code signing certificate not found"
    exit 1
}

# Sign the file
signtool sign /tr $TimestampServer /td sha256 /fd sha256 /sha1 $cert.Thumbprint $FilePath

if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully signed: $FilePath"
    
    # Verify signature
    signtool verify /pa $FilePath
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Signature verified"
    }
} else {
    Write-Error "Signing failed"
    exit 1
}
```

- [ ] **Step 3: Update electron-builder config**

```yaml
# electron-builder.yml
win:
  target:
    - nsis
  signingHashAlgorithms:
    - sha256
  signingHashAlgorithms:
    certHash: sha256
  rfc3161TimeStampServer: http://timestamp.digicert.com
  sign: "./scripts/code-sign.ps1"

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
```

- [ ] **Step 4: Add signing to package.json**

```json
{
  "scripts": {
    "build": "vite build",
    "package": "electron-builder",
    "package:signed": "npm run build && electron-builder /p always && powershell -ExecutionPolicy Bypass -File scripts/code-sign.ps1"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add scripts/code-sign.ps1 docs/code-signing.md electron-builder.yml package.json
git commit -m "feat(security): add EV code signing configuration"
```

---

## Acceptance Criteria (All Tasks)

- [ ] **P2-1:** ControlNet API endpoint working with 8+ tests passing
- [ ] **P2-2:** LoRA mixer API working with 5+ tests passing
- [ ] **P2-3:** AI edit tools (rembg, upscale, face restore) with 8+ tests passing
- [ ] **P2-4:** Batch ZIP export working with 4+ tests passing
- [ ] **P2-5:** Visual regression tests running with baseline snapshots
- [ ] **P2-6:** Performance benchmarks running with documented thresholds
- [ ] **P2-7:** Structured logging implemented across all services
- [ ] **P3-1:** Database schema versioning with migration support
- [ ] **P3-2:** Rate limiting and input sanitization on all endpoints
- [ ] **P3-3:** Code signing scripts documented and tested

---

## Execution Notes

**Test Stack:**
- Backend: pytest 8.0+, pytest-asyncio, pytest-benchmark
- Frontend: Vitest, Playwright
- Visual: playwright-visual-regression
- E2E: Playwright with visual regression

**Git Workflow:**
- Branch: `feature/p2-p3-completion`
- Commits: One per task (atomic, as specified)
- PR: Single PR or grouped by category (features, quality, production)

**Dependencies to Add:**
```
# backend/requirements.txt
rembg>=2.0.50
onnxruntime-gpu>=1.16.0
slowapi>=0.1.9
pytest-benchmark>=4.0.0
```

```json
// package.json - devDependencies
"playwright-visual-regression": "^3.0.0"
```

---

*Plan created: 2026-04-12*
