"""Offered convert-to-safetensors for consented pickle artifacts (spec 5.3).

Security boundary: torch.load(..., weights_only=True) refuses arbitrary
unpickling - only tensor payloads deserialize. Output is staged to
<dest>.converting then os.replace'd: complete-or-absent.
"""

import os


class ConvertUnavailableError(RuntimeError):
    """torch/safetensors not importable (stub mode) - surface as 503."""


def convert_pickle_to_safetensors(src_path: str, dest_path: str) -> int:
    try:
        import torch
        from safetensors.torch import save_file
    except (ImportError, AttributeError) as exc:
        raise ConvertUnavailableError(f"conversion requires torch: {exc}") from exc

    state = torch.load(src_path, map_location="cpu", weights_only=True)
    if isinstance(state, dict) and isinstance(state.get("state_dict"), dict):
        state = state["state_dict"]
    tensors = {k: v for k, v in state.items() if hasattr(v, "shape")}
    if not tensors:
        raise ValueError(f"no tensors found in {src_path}")

    tmp = dest_path + ".converting"
    try:
        save_file(tensors, tmp)
        os.replace(tmp, dest_path)
    except Exception:
        # Complete-or-absent holds for dest; never orphan the staging file.
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
    return len(tensors)
