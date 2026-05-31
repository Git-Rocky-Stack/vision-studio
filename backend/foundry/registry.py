"""ModelRegistry — the single backend-owned source of truth for the catalog.

M1 responsibilities: load the verified catalog, list/get ModelRecords as
plain dicts (FastAPI-serializable), resolve legacy id aliases, and reconcile
each record's status against what is actually present in the models dir.
"""

import os
from typing import Any, Dict, List, Optional

from foundry.model_record import LEGACY_ID_ALIASES, ModelRecord, load_catalog


class ModelRegistry:
    def __init__(self, models_dir: str, catalog_path: str):
        self.models_dir = models_dir
        self.catalog_path = catalog_path
        self.records: Dict[str, ModelRecord] = load_catalog(catalog_path)
        # Copy so tests/callers can extend without mutating module state.
        self.legacy_aliases: Dict[str, str] = dict(LEGACY_ID_ALIASES)

    # -- public API --------------------------------------------------------
    def list_records(self) -> List[Dict[str, Any]]:
        return [self._reconciled(record) for record in self.records.values()]

    def get_record(self, model_id: str) -> Optional[Dict[str, Any]]:
        canonical = self.legacy_aliases.get(model_id, model_id)
        record = self.records.get(canonical)
        if record is None:
            return None
        return self._reconciled(record)

    # -- internals ---------------------------------------------------------
    def _reconciled(self, record: ModelRecord) -> Dict[str, Any]:
        data = record.to_dict()
        data["status"] = "ready" if self._is_present(record) else record.status
        return data

    def _is_present(self, record: ModelRecord) -> bool:
        """True when the model's expected files exist in models_dir.

        Detection is per-model and precise: diffusers pipelines / motion
        adapters live under diffusers/<id>/; single-file artifacts are matched
        by their typed subdir + id. A stray unrelated file in a typed subdir
        must NOT mark a different model ready. Filename-aware indexing for flat
        single-file artifacts arrives with the M3 indexer; until then a
        single-file model whose id-named directory is absent stays not_found.
        """
        candidates = []
        if record.artifact_type in {"diffusers-pipeline", "motion-adapter"}:
            candidates.append(os.path.join(self.models_dir, "diffusers", record.id))
        subdir = _ARTIFACT_SUBDIR.get(record.artifact_type)
        if subdir:
            candidates.append(os.path.join(self.models_dir, subdir, record.id))
        for path in candidates:
            if os.path.isdir(path) and os.listdir(path):
                return True
        return False


_ARTIFACT_SUBDIR = {
    "checkpoint": "checkpoints",
    "diffusers-pipeline": "diffusers",
    "motion-adapter": "diffusers",
    "lora": "loras",
    "vae": "vaes",
    "controlnet": "controlnet",
    "embedding": "embeddings",
}
