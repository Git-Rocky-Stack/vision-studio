"""
Model Manager - Download and manage AI models
"""

import asyncio
import os
import shutil
import tempfile
import urllib.request
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from huggingface_hub import hf_hub_download
    from huggingface_hub import snapshot_download
except ImportError:
    hf_hub_download = None
    snapshot_download = None


@dataclass
class ModelInfo:
    id: str
    name: str
    type: str  # 'checkpoint', 'lora', 'vae', 'controlnet', etc.
    source: str  # 'huggingface', 'civitai', 'local'
    repo_id: Optional[str] = None
    aux_repo_id: Optional[str] = None
    filename: Optional[str] = None
    local_path: Optional[str] = None
    size: str = "Unknown"
    status: str = "not_downloaded"  # 'not_downloaded', 'downloading', 'ready', 'error'
    description: str = ""
    download_url: Optional[str] = None
    progress: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Predefined models
PREDEFINED_MODELS = {
    # FLUX Models
    "flux-dev": ModelInfo(
        id="flux-dev",
        name="FLUX.1 [dev]",
        type="checkpoint",
        source="huggingface",
        repo_id="black-forest-labs/FLUX.1-dev",
        filename="flux1-dev.safetensors",
        size="23.8 GB",
        description="State-of-the-art image generation model by Black Forest Labs"
    ),
    "flux-schnell": ModelInfo(
        id="flux-schnell",
        name="FLUX.1 [schnell]",
        type="checkpoint",
        source="huggingface",
        repo_id="black-forest-labs/FLUX.1-schnell",
        filename="flux1-schnell.safetensors",
        size="23.8 GB",
        description="Fast 4-step image generation model"
    ),
    "flux-fill": ModelInfo(
        id="flux-fill",
        name="FLUX.1 Fill [dev]",
        type="checkpoint",
        source="huggingface",
        repo_id="black-forest-labs/FLUX.1-Fill-dev",
        filename="flux1-fill-dev.safetensors",
        size="23.8 GB",
        description="Inpainting and outpainting model by Black Forest Labs"
    ),

    # SD3.5 Models
    "sd3.5-large": ModelInfo(
        id="sd3.5-large",
        name="Stable Diffusion 3.5 Large",
        type="diffusers",
        source="huggingface",
        repo_id="stabilityai/stable-diffusion-3.5-large",
        size="~16 GB",
        description="Modern MM-DiT architecture with superior composition and typography"
    ),
    "sd3.5-medium": ModelInfo(
        id="sd3.5-medium",
        name="Stable Diffusion 3.5 Medium",
        type="diffusers",
        source="huggingface",
        repo_id="stabilityai/stable-diffusion-3.5-medium",
        size="~5.5 GB",
        description="Strong prompt understanding and versatile output with low VRAM"
    ),

    # Legacy SDXL Models (kept for backwards compatibility)
    "sdxl-base": ModelInfo(
        id="sdxl-base",
        name="Stable Diffusion XL Base",
        type="checkpoint",
        source="huggingface",
        repo_id="stabilityai/stable-diffusion-xl-base-1.0",
        filename="sd_xl_base_1.0.safetensors",
        size="6.9 GB",
        description="High-resolution image generation by Stability AI"
    ),
    "sdxl-refiner": ModelInfo(
        id="sdxl-refiner",
        name="Stable Diffusion XL Refiner",
        type="checkpoint",
        source="huggingface",
        repo_id="stabilityai/stable-diffusion-xl-refiner-1.0",
        filename="sd_xl_refiner_1.0.safetensors",
        size="6.1 GB",
        description="Detail refinement for SDXL by Stability AI"
    ),
    
    # SD 1.5 Models
    "sd-1-5": ModelInfo(
        id="sd-1-5",
        name="Stable Diffusion 1.5",
        type="checkpoint",
        source="huggingface",
        repo_id="runwayml/stable-diffusion-v1-5",
        filename="v1-5-pruned-emaonly.safetensors",
        size="4.3 GB",
        description="Original Stable Diffusion 1.5 by RunwayML"
    ),
    
    # Video Models
    "svd": ModelInfo(
        id="svd",
        name="Stable Video Diffusion",
        type="diffusers",
        source="huggingface",
        repo_id="stabilityai/stable-video-diffusion-img2vid-xt",
        size="9.6 GB",
        description="Image-to-video generation by Stability AI"
    ),
    "ltx-video": ModelInfo(
        id="ltx-video",
        name="LTX Video",
        type="diffusers",
        source="huggingface",
        repo_id="Lightricks/LTX-Video",
        size="9.4 GB",
        description="High-quality text-to-video model by Lightricks"
    ),
    "animatediff": ModelInfo(
        id="animatediff",
        name="AnimateDiff",
        type="diffusers",
        source="huggingface",
        repo_id="runwayml/stable-diffusion-v1-5",
        aux_repo_id="guoyww/animatediff-motion-adapter-v1-5-2",
        size="1.6 GB",
        description="Animation motion module for Stable Diffusion"
    ),
    
    # VAE Models
    "sdxl-vae": ModelInfo(
        id="sdxl-vae",
        name="SDXL VAE",
        type="vae",
        source="huggingface",
        repo_id="madebyollin/sdxl-vae-fp16-fix",
        filename="sdxl.vae.safetensors",
        size="335 MB",
        description="FP16 fixed VAE for SDXL"
    ),
    "sd-vae-ft-mse": ModelInfo(
        id="sd-vae-ft-mse",
        name="SD VAE FT MSE",
        type="vae",
        source="huggingface",
        repo_id="stabilityai/sd-vae-ft-mse",
        filename="diffusion_pytorch_model.safetensors",
        size="335 MB",
        description="Fine-tuned VAE with MSE loss"
    )
}


class ModelManager:
    """Manages AI model downloads and storage"""
    
    def __init__(self, models_dir: str):
        self.models_dir = models_dir
        self.available_models: Dict[str, ModelInfo] = {}
        self.download_tasks: Dict[str, asyncio.Task] = {}
        
        # Create subdirectories
        self.subdirs = {
            'checkpoint': os.path.join(models_dir, 'checkpoints'),
            'lora': os.path.join(models_dir, 'loras'),
            'vae': os.path.join(models_dir, 'vaes'),
            'controlnet': os.path.join(models_dir, 'controlnet'),
            'clip': os.path.join(models_dir, 'clip'),
            'clip_vision': os.path.join(models_dir, 'clip_vision'),
            'diffusers': os.path.join(models_dir, 'diffusers'),
            'unet': os.path.join(models_dir, 'unet'),
        }
        
        for path in self.subdirs.values():
            os.makedirs(path, exist_ok=True)
    
    async def scan_models(self):
        """Scan for available models"""
        self.available_models = {}
        
        # Check predefined models
        for model_id, model_info in PREDEFINED_MODELS.items():
            # Check if already downloaded
            local_path = self._get_local_path(model_info)
            if local_path and os.path.exists(local_path):
                model_info.local_path = local_path
                model_info.status = "ready"
            
            self.available_models[model_id] = model_info
        
        # Scan local models
        await self._scan_local_models()
    
    async def _scan_local_models(self):
        """Scan local model files"""
        for subdir in self.subdirs.values():
            if not os.path.exists(subdir):
                continue
            
            for filename in os.listdir(subdir):
                if not filename.endswith(('.safetensors', '.ckpt', '.pt', '.pth', '.bin')):
                    continue
                
                model_id = filename.replace('.', '_')
                if model_id not in self.available_models:
                    model_type = self._detect_model_type(filename)
                    
                    model_info = ModelInfo(
                        id=model_id,
                        name=filename,
                        type=model_type,
                        source="local",
                        local_path=os.path.join(subdir, filename),
                        status="ready",
                        size=self._format_size(os.path.getsize(os.path.join(subdir, filename)))
                    )
                    
                    self.available_models[model_id] = model_info
    
    def _get_local_path(self, model_info: ModelInfo) -> Optional[str]:
        """Get expected local path for a model"""
        if model_info.type == "diffusers":
            return os.path.join(self.subdirs["diffusers"], model_info.id)

        if not model_info.filename:
            return None
        
        subdir = self.subdirs.get(model_info.type, self.models_dir)
        return os.path.join(subdir, model_info.filename)
    
    def _detect_model_type(self, filename: str) -> str:
        """Detect model type from filename"""
        filename_lower = filename.lower()
        
        if 'vae' in filename_lower:
            return 'vae'
        elif 'lora' in filename_lower:
            return 'lora'
        elif 'control' in filename_lower:
            return 'controlnet'
        elif 'clip' in filename_lower:
            return 'clip'
        else:
            return 'checkpoint'
    
    def _format_size(self, size_bytes: int) -> str:
        """Format size in human-readable format"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} PB"
    
    def get_model_list(self) -> List[Dict[str, Any]]:
        """Get list of all models"""
        return [model.to_dict() for model in self.available_models.values()]
    
    def get_model_status(self, model_id: str) -> Dict[str, Any]:
        """Get model status"""
        model = self.available_models.get(model_id)
        if not model:
            return {"error": "Model not found"}
        return model.to_dict()
    
    async def download_model(self, model_id: str, token: Optional[str] = None):
        """Download a model"""
        model_info = self.available_models.get(model_id)
        if not model_info:
            raise ValueError(f"Model {model_id} not found")
        
        if model_info.status == "ready":
            print(f"Model {model_id} is already downloaded")
            return
        
        if model_info.source == "huggingface":
            await self._download_from_huggingface(model_info, token)
        elif model_info.source == "civitai":
            await self._download_from_civitai(model_info)
        else:
            raise ValueError(f"Unknown source: {model_info.source}")
    
    async def _download_from_huggingface(self, model_info: ModelInfo, token: Optional[str] = None):
        """Download model from HuggingFace"""
        if model_info.type == "diffusers":
            if snapshot_download is None:
                raise RuntimeError("huggingface_hub is not installed")
        elif hf_hub_download is None:
            raise RuntimeError("huggingface_hub is not installed")

        try:
            model_info.status = "downloading"
            model_info.progress = 0.0

            if model_info.type == "diffusers":
                local_path = await asyncio.to_thread(
                    self._download_diffusers_bundle,
                    model_info,
                    token,
                )
            else:
                local_path = hf_hub_download(
                    repo_id=model_info.repo_id,
                    filename=model_info.filename,
                    local_dir=self.subdirs.get(model_info.type, self.models_dir),
                    local_dir_use_symlinks=False,
                    token=token,
                    resume_download=True
                )
            
            model_info.local_path = local_path
            model_info.status = "ready"
            model_info.progress = 100.0
            
            print(f"✅ Downloaded {model_info.name}")
            
        except Exception as e:
            model_info.status = "error"
            print(f"❌ Failed to download {model_info.name}: {e}")
            raise

    def _download_diffusers_bundle(self, model_info: ModelInfo, token: Optional[str] = None) -> str:
        target_path = self._get_local_path(model_info)
        if not target_path:
            raise ValueError(f"Could not resolve target path for model {model_info.id}")

        if os.path.exists(target_path):
            shutil.rmtree(target_path)
        os.makedirs(target_path, exist_ok=True)

        if model_info.id == "animatediff":
            base_path = os.path.join(target_path, "base")
            adapter_path = os.path.join(target_path, "adapter")
            snapshot_download(
                repo_id=model_info.repo_id,
                local_dir=base_path,
                token=token,
                resume_download=True,
            )
            snapshot_download(
                repo_id=model_info.aux_repo_id,
                local_dir=adapter_path,
                token=token,
                resume_download=True,
            )
        else:
            snapshot_download(
                repo_id=model_info.repo_id,
                local_dir=target_path,
                token=token,
                resume_download=True,
            )

        return target_path
    
    async def _download_from_civitai(self, model_info: ModelInfo):
        """Download model from CivitAI"""
        if not model_info.download_url:
            raise ValueError("CivitAI models require a download URL")

        model_info.status = "downloading"
        model_info.progress = 0.0

        target_path = self._get_local_path(model_info)
        if not target_path:
            raise ValueError(f"Could not resolve target path for model {model_info.id}")

        os.makedirs(os.path.dirname(target_path), exist_ok=True)

        temp_fd, temp_path = tempfile.mkstemp(
            suffix=Path(model_info.filename or "model.safetensors").suffix,
            dir=os.path.dirname(target_path),
        )
        os.close(temp_fd)

        try:
            await asyncio.to_thread(
                self._download_file,
                model_info.download_url,
                temp_path,
                self._build_civitai_headers(),
                lambda progress: setattr(model_info, "progress", progress),
            )
            shutil.move(temp_path, target_path)
            model_info.local_path = target_path
            model_info.status = "ready"
            model_info.progress = 100.0
        except Exception:
            model_info.status = "error"
            model_info.progress = 0.0
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise

    def _build_civitai_headers(self) -> Dict[str, str]:
        headers = {"User-Agent": "VisionStudio/0.1.0"}
        token = os.getenv("CIVITAI_API_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def _download_file(
        self,
        url: str,
        destination_path: str,
        headers: Dict[str, str],
        on_progress,
    ) -> None:
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request) as response, open(destination_path, "wb") as output_file:
            total_bytes = int(response.headers.get("Content-Length", "0"))
            downloaded = 0
            chunk_size = 1024 * 1024

            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                output_file.write(chunk)
                downloaded += len(chunk)
                if total_bytes > 0:
                    on_progress(round(downloaded / total_bytes * 100, 2))
    
    async def delete_model(self, model_id: str) -> bool:
        """Delete a local model"""
        model_info = self.available_models.get(model_id)
        if not model_info or not model_info.local_path:
            return False
        
        try:
            if os.path.exists(model_info.local_path):
                if os.path.isdir(model_info.local_path):
                    shutil.rmtree(model_info.local_path)
                else:
                    os.remove(model_info.local_path)
            
            model_info.local_path = None
            model_info.status = "not_downloaded"
            model_info.progress = 0.0
            
            return True
        except Exception as e:
            print(f"Failed to delete model: {e}")
            return False
    
    def get_model_path(self, model_id: str) -> Optional[str]:
        """Get local path for a model"""
        model_info = self.available_models.get(model_id)
        if model_info and model_info.status == "ready":
            return model_info.local_path
        return None
