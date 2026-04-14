"""
Direct Generator - Generate images using diffusers directly
Fallback when ComfyUI is not available
"""

import os
import torch
from typing import Optional, Callable, Dict, Any
from pathlib import Path
from PIL import Image
import asyncio
from concurrent.futures import ThreadPoolExecutor

# These imports will fail if torch/diffusers not installed
# The app should handle this gracefully
try:
    from diffusers import (
        StableDiffusionPipeline,
        StableDiffusionXLPipeline,
        StableDiffusion3Pipeline,
        FluxPipeline,
        FluxFillPipeline,
        DPMSolverMultistepScheduler,
        EulerDiscreteScheduler,
        EulerAncestralDiscreteScheduler,
        DDIMScheduler,
        UniPCMultistepScheduler,
    )
    DIFFUSERS_AVAILABLE = True
except ImportError as e:
    DIFFUSERS_AVAILABLE = False
    print(f"⚠️ diffusers import failed: {e}. Direct image generation disabled.")


class DirectGenerator:
    """Direct image generation using diffusers"""
    
    def __init__(self, models_dir: str, output_dir: str):
        self.models_dir = models_dir
        self.output_dir = output_dir
        self.pipelines: Dict[str, Any] = {}
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.executor = ThreadPoolExecutor(max_workers=1)
        
        if not DIFFUSERS_AVAILABLE:
            raise RuntimeError("diffusers library not available")
        
        print(f"🖥️ DirectGenerator using device: {self.device}")
        
        if self.device == "cuda":
            print(f"   GPU: {torch.cuda.get_device_name(0)}")
            print(f"   VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    
    def _load_pipeline(self, model_name: str):
        """Load or get cached pipeline"""
        if model_name in self.pipelines:
            return self.pipelines[model_name]
        
        print(f"📥 Loading model: {model_name}")
        
        # Map model names to HuggingFace repo IDs
        model_map = {
            "sd-1-5": "runwayml/stable-diffusion-v1-5",
            "sdxl": "stabilityai/stable-diffusion-xl-base-1.0",
            "sdxl-base": "stabilityai/stable-diffusion-xl-base-1.0",
            "sd3.5-large": "stabilityai/stable-diffusion-3.5-large",
            "sd3.5-medium": "stabilityai/stable-diffusion-3.5-medium",
            "flux-dev": "black-forest-labs/FLUX.1-dev",
            "flux-schnell": "black-forest-labs/FLUX.1-schnell",
            "flux-fill": "black-forest-labs/FLUX.1-Fill-dev",
        }
        
        repo_id = model_map.get(model_name, model_name)
        
        # Load appropriate pipeline
        if "flux-fill" in model_name.lower():
            pipeline = FluxFillPipeline.from_pretrained(
                repo_id,
                torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
                use_safetensors=True
            )
        elif "flux" in model_name.lower():
            pipeline = FluxPipeline.from_pretrained(
                repo_id,
                torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
                use_safetensors=True
            )
        elif "sd3.5" in model_name.lower() or "stable-diffusion-3" in model_name.lower():
            pipeline = StableDiffusion3Pipeline.from_pretrained(
                repo_id,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            )
        elif "xl" in model_name.lower():
            pipeline = StableDiffusionXLPipeline.from_pretrained(
                repo_id,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                use_safetensors=True
            )
        else:
            pipeline = StableDiffusionPipeline.from_pretrained(
                repo_id,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                use_safetensors=True
            )
        
        # Move to device
        pipeline = pipeline.to(self.device)
        
        # Enable memory optimizations
        if self.device == "cuda":
            pipeline.enable_attention_slicing()
            # Try to enable xformers if available
            try:
                pipeline.enable_xformers_memory_efficient_attention()
                print("   ✅ xformers enabled")
            except:
                pass
        
        self.pipelines[model_name] = pipeline
        print(f"   ✅ Model loaded")
        
        return pipeline

    def _configure_scheduler(self, pipeline, scheduler_name: str):
        normalized = scheduler_name.strip().lower()
        scheduler_cls = EulerAncestralDiscreteScheduler

        if normalized == "euler":
            scheduler_cls = EulerDiscreteScheduler
        elif normalized in {"euler a", "euler_a", "euler ancestral"}:
            scheduler_cls = EulerAncestralDiscreteScheduler
        elif normalized in {
            "dpm++ 2m",
            "dpm++ 2m karras",
            "dpm++ sde",
            "dpm++ sde karras",
        }:
            scheduler_cls = DPMSolverMultistepScheduler
        elif normalized == "ddim":
            scheduler_cls = DDIMScheduler
        elif normalized == "unipc":
            scheduler_cls = UniPCMultistepScheduler

        pipeline.scheduler = scheduler_cls.from_config(pipeline.scheduler.config)
        if "karras" in normalized and hasattr(pipeline.scheduler.config, "use_karras_sigmas"):
            pipeline.scheduler.config.use_karras_sigmas = True
        return pipeline
    
    async def generate_image(
        self,
        job_id: str,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        steps: int = 25,
        cfg_scale: float = 7.5,
        seed: Optional[int] = None,
        model_name: str = "sdxl",
        scheduler: str = "Euler a",
        progress_callback: Optional[Callable[[float], None]] = None
    ) -> Dict[str, Any]:
        """Generate an image"""
        
        output_dir = os.path.join(self.output_dir, job_id)
        os.makedirs(output_dir, exist_ok=True)
        
        # Set seed
        if seed is None:
            import random
            seed = random.randint(0, 2**32 - 1)
        
        # Progress tracking
        def progress_callback_fn(step, timestep, latents):
            progress = (step + 1) / steps * 100
            if progress_callback:
                # Schedule callback in event loop
                asyncio.get_event_loop().call_soon_threadsafe(
                    lambda: progress_callback(progress)
                )
        
        # Run generation in thread pool (to not block event loop)
        loop = asyncio.get_event_loop()
        
        try:
            result = await loop.run_in_executor(
                self.executor,
                self._generate_sync,
                prompt,
                negative_prompt,
                width,
                height,
                steps,
                cfg_scale,
                seed,
                model_name,
                scheduler,
                progress_callback_fn,
                output_dir
            )
            
            return result
            
        except Exception as e:
            print(f"❌ Generation failed: {e}")
            raise
    
    def _generate_sync(
        self,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        cfg_scale: float,
        seed: int,
        model_name: str,
        scheduler: str,
        progress_callback_fn: Callable,
        output_dir: str
    ) -> Dict[str, Any]:
        """Synchronous generation (runs in thread pool)"""
        
        # Load pipeline
        pipeline = self._load_pipeline(model_name)
        pipeline = self._configure_scheduler(pipeline, scheduler)
        
        # Set generator for reproducibility
        generator = torch.Generator(device=self.device).manual_seed(seed)
        
        # Generate
        print(f"🎨 Generating: {width}x{height}, {steps} steps, seed={seed}")
        
        with torch.inference_mode():
            output = pipeline(
                prompt=prompt,
                negative_prompt=negative_prompt if negative_prompt else None,
                width=width,
                height=height,
                num_inference_steps=steps,
                guidance_scale=cfg_scale,
                generator=generator,
                callback=progress_callback_fn if model_name.startswith("sd") else None,
                callback_steps=1
            )
        
        # Save image
        image = output.images[0]
        output_path = os.path.join(output_dir, "generated.png")
        image.save(output_path, "PNG")
        
        print(f"✅ Saved: {output_path}")
        
        return {
            "images": [f"/outputs/{os.path.basename(output_dir)}/generated.png"],
            "seed": seed,
            "width": width,
            "height": height,
            "prompt": prompt,
            "model": model_name
        }
    
    def unload_model(self, model_name: str):
        """Unload a model to free VRAM"""
        if model_name in self.pipelines:
            del self.pipelines[model_name]
            torch.cuda.empty_cache()
            print(f"🗑️ Unloaded model: {model_name}")
    
    def get_memory_usage(self) -> Dict[str, float]:
        """Get GPU memory usage"""
        if self.device == "cuda":
            allocated = torch.cuda.memory_allocated() / 1e9
            reserved = torch.cuda.memory_reserved() / 1e9
            total = torch.cuda.get_device_properties(0).total_memory / 1e9
            
            return {
                "allocated_gb": round(allocated, 2),
                "reserved_gb": round(reserved, 2),
                "total_gb": round(total, 2),
                "free_gb": round(total - allocated, 2)
            }
        return {"device": "cpu"}
