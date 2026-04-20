"""
Prompt enhancement helpers.
"""

from typing import Dict, List

from utils.json_schema_enforcer import enforce_json_schema


PROMPT_ENHANCEMENT_SCHEMA = {
    "type": "object",
    "required": ["mode", "prompt", "variations"],
    "additionalProperties": False,
    "properties": {
        "mode": {"type": "string", "enum": ["clarify", "cinematic", "concise", "variations"]},
        "prompt": {"type": "string"},
        "variations": {"type": "array", "items": {"type": "string"}},
    },
}


def _normalize_prompt(prompt: str) -> str:
    normalized = " ".join(prompt.strip().split())
    if not normalized:
        raise ValueError("Prompt cannot be empty")
    return normalized


def _clarify_prompt(prompt: str) -> str:
    return (
        f"{prompt}, clear subject focus, intentional composition, consistent lighting, "
        "well-defined environment, production-ready visual description"
    )


def _cinematic_prompt(prompt: str) -> str:
    return (
        f"{prompt}, cinematic framing, dramatic lighting, rich atmosphere, filmic color contrast, "
        "high production value"
    )


def _concise_prompt(prompt: str) -> str:
    parts = [part.strip() for part in prompt.split(",") if part.strip()]
    if parts:
        return ", ".join(parts[:4])
    return prompt


def _build_variations(prompt: str) -> List[str]:
    modifiers = [
        "cinematic lighting, dynamic perspective",
        "clean commercial styling, crisp detail",
        "moody atmosphere, dramatic shadows",
        "vibrant color palette, bold composition",
    ]
    return [f"{prompt}, {modifier}" for modifier in modifiers]


def _structured_response(mode: str, prompt: str, variations: List[str]) -> Dict[str, object]:
    response: Dict[str, object] = {
        "mode": mode,
        "prompt": prompt,
        "variations": variations,
    }
    return enforce_json_schema(response, PROMPT_ENHANCEMENT_SCHEMA)


def enhance_prompt(prompt: str, mode: str = "clarify") -> Dict[str, object]:
    normalized = _normalize_prompt(prompt)
    normalized_mode = mode.strip().lower()

    if normalized_mode == "clarify":
        return _structured_response(normalized_mode, _clarify_prompt(normalized), [])

    if normalized_mode == "cinematic":
        return _structured_response(normalized_mode, _cinematic_prompt(normalized), [])

    if normalized_mode == "concise":
        return _structured_response(normalized_mode, _concise_prompt(normalized), [])

    if normalized_mode == "variations":
        variations = _build_variations(normalized)
        return _structured_response(normalized_mode, normalized, variations)

    raise ValueError(f"Unsupported enhancement mode: {mode}")
