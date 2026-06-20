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


def extract_history_outputs(
    history: Dict, prompt_id: str, kinds: Tuple[str, ...] = ("images",)
) -> List[Dict[str, str]]:
    entry = history.get(prompt_id, {})
    outputs = entry.get("outputs", {})
    collected: List[Dict[str, str]] = []

    for node_output in outputs.values():
        for kind in kinds:
            for item in node_output.get(kind, []):
                if item.get("filename"):
                    collected.append(
                        {
                            "filename": item["filename"],
                            "subfolder": item.get("subfolder", ""),
                            "type": item.get("type", "output"),
                        }
                    )

    return collected


def extract_history_image_outputs(history: Dict, prompt_id: str) -> List[Dict[str, str]]:
    return extract_history_outputs(history, prompt_id, kinds=("images",))


def build_video_workflow(
    model: str,
    prompt: str,
    image_filename: str,
    width: int,
    height: int,
    fps: int,
    steps: int,
    seed: int | None,
    file_prefix: str = "vision_studio",
) -> Tuple[Dict[str, Dict], int]:
    """
    Build a Stable-Video-Diffusion image-to-video workflow. SaveAnimatedWEBP reports
    its result under the history "images" key; VHS custom nodes (if installed) report
    under "gifs"/"videos" - the dispatch extractor collects all three (S8).
    The exact video family is plan-time-tunable against the user's installed nodes.
    """
    normalized_seed = _normalize_seed(seed)

    workflow = {
        "1": {"inputs": {"ckpt_name": "svd_xt.safetensors"}, "class_type": "ImageOnlyCheckpointLoader"},
        "2": {"inputs": {"image": image_filename, "upload": "image"}, "class_type": "LoadImage"},
        "3": {
            "inputs": {
                "width": width,
                "height": height,
                "video_frames": 14,
                "motion_bucket_id": 127,
                "fps": fps,
                "augmentation_level": 0.0,
                "clip_vision": ["1", 1],
                "init_image": ["2", 0],
                "vae": ["1", 2],
            },
            "class_type": "SVD_img2vid_Conditioning",
        },
        "4": {"inputs": {"min_cfg": 1.0, "model": ["1", 0]}, "class_type": "VideoLinearCFGGuidance"},
        "5": {
            "inputs": {
                "seed": normalized_seed,
                "steps": steps,
                "cfg": 2.5,
                "sampler_name": "euler",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["3", 0],
                "negative": ["3", 1],
                "latent_image": ["3", 2],
            },
            "class_type": "KSampler",
        },
        "6": {"inputs": {"samples": ["5", 0], "vae": ["1", 2]}, "class_type": "VAEDecode"},
        "7": {
            "inputs": {"filename_prefix": file_prefix, "fps": fps, "images": ["6", 0]},
            "class_type": "SaveAnimatedWEBP",
        },
    }

    return workflow, normalized_seed
