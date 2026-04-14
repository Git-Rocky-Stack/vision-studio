"""
Helpers for building and parsing ComfyUI workflows.
"""

from __future__ import annotations

import random
from typing import Dict, List, Tuple


def _normalize_seed(seed: int | None) -> int:
    if seed is None or seed == -1:
        return random.randint(0, 2**32 - 1)
    return seed


def _normalize_scheduler(scheduler: str) -> tuple[str, str]:
    value = scheduler.strip().lower()
    if value in {"euler", "euler a"}:
        return ("euler" if value == "euler" else "euler_ancestral", "normal")
    if "karras" in value:
        return ("dpmpp_2m", "karras")
    if "ddim" in value:
        return ("ddim", "normal")
    return ("dpmpp_2m", "normal")


def build_image_workflow(
    model: str,
    prompt: str,
    negative_prompt: str,
    width: int,
    height: int,
    steps: int,
    cfg_scale: float,
    scheduler: str,
    seed: int | None,
    file_prefix: str = "vision_studio",
) -> Tuple[Dict[str, Dict], int]:
    normalized_seed = _normalize_seed(seed)
    sampler_name, scheduler_name = _normalize_scheduler(scheduler)
    normalized_model = model.lower()

    checkpoint_name = "flux1-dev.safetensors"
    if "fill" in normalized_model and "flux" in normalized_model:
        checkpoint_name = "flux1-fill-dev.safetensors"
    elif "schnell" in normalized_model:
        checkpoint_name = "flux1-schnell.safetensors"
    elif "sd3.5" in normalized_model and "large" in normalized_model:
        checkpoint_name = "sd3.5_large.safetensors"
    elif "sd3.5" in normalized_model and "medium" in normalized_model:
        checkpoint_name = "sd3.5_medium.safetensors"
    elif "sdxl" in normalized_model:
        checkpoint_name = "sdxl_base.safetensors"
    elif "sd-1-5" in normalized_model or "stable-diffusion-v1-5" in normalized_model:
        checkpoint_name = "v1-5-pruned-emaonly.safetensors"

    workflow = {
        "1": {
            "inputs": {"ckpt_name": checkpoint_name},
            "class_type": "CheckpointLoaderSimple",
        },
        "2": {
            "inputs": {"text": prompt, "clip": ["1", 1]},
            "class_type": "CLIPTextEncode",
        },
        "3": {
            "inputs": {"text": negative_prompt, "clip": ["1", 1]},
            "class_type": "CLIPTextEncode",
        },
        "4": {
            "inputs": {"width": width, "height": height, "batch_size": 1},
            "class_type": "EmptyLatentImage",
        },
        "5": {
            "inputs": {
                "seed": normalized_seed,
                "steps": steps,
                "cfg": cfg_scale,
                "sampler_name": sampler_name,
                "scheduler": scheduler_name,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
            "class_type": "KSampler",
        },
        "6": {
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
            "class_type": "VAEDecode",
        },
        "7": {
            "inputs": {"filename_prefix": file_prefix, "images": ["6", 0]},
            "class_type": "SaveImage",
        },
    }

    return workflow, normalized_seed


def extract_history_image_outputs(history: Dict, prompt_id: str) -> List[Dict[str, str]]:
    entry = history.get(prompt_id, {})
    outputs = entry.get("outputs", {})
    collected: List[Dict[str, str]] = []

    for node_output in outputs.values():
        for image in node_output.get("images", []):
            if image.get("filename"):
                collected.append(
                    {
                        "filename": image["filename"],
                        "subfolder": image.get("subfolder", ""),
                        "type": image.get("type", "output"),
                    }
                )

    return collected
