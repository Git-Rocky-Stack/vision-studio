"""ModelRegistry — the single backend-owned source of truth for the catalog.

M1 responsibilities: load the verified catalog, list/get ModelRecords as
plain dicts (FastAPI-serializable), resolve legacy id aliases, and reconcile
each record's status against what is actually present in the models dir.

M3 adds an indexed layer: records discovered by the IndexService (HF cache,
linked roots, app tree) are merged via apply_index, following the spec 4.6
reconciliation rules.
"""

import os
from typing import Any, Callable, Dict, List, Optional

from foundry.model_record import LEGACY_ID_ALIASES, ModelRecord, load_catalog


class ModelRegistry:
    def __init__(
        self,
        models_dir: str,
        catalog_path: str,
        status_provider: Optional[Callable[[str], Optional[str]]] = None,
    ):
        self.models_dir = models_dir
        self.catalog_path = catalog_path
        self.records: Dict[str, ModelRecord] = load_catalog(catalog_path)
        # Copy so tests/callers can extend without mutating module state.
        self.legacy_aliases: Dict[str, str] = dict(LEGACY_ID_ALIASES)
        # Optional authority for live status (the model_manager in the running
        # app). It knows how flat single-file artifacts are stored and tracks
        # in-flight downloads, which the dir-based check below cannot.
        self._status_provider = status_provider
        # M3: indexed records (HF cache / linked roots / app tree), applied by
        # the IndexService. Keyed by canonical id; replaced wholesale per scan.
        self._indexed: Dict[str, ModelRecord] = {}

    # -- public API --------------------------------------------------------
    def list_records(self) -> List[Dict[str, Any]]:
        records = [self._reconciled(record) for record in self.records.values()]
        known = set(self.records.keys())
        records.extend(
            self._reconciled(record)
            for record_id, record in self._indexed.items()
            if record_id not in known
        )
        return records

    def get_record(self, model_id: str) -> Optional[Dict[str, Any]]:
        canonical = self.legacy_aliases.get(model_id, model_id)
        record = self.records.get(canonical) or self._indexed.get(canonical)
        if record is None:
            return None
        return self._reconciled(record)

    def apply_index(self, indexed: List[ModelRecord]) -> None:
        """Replace the indexed layer (spec 4.6 reconciliation).

        Catalog ids gain locations/identity and report ready while available;
        unknown ids become first-class records; duplicate ids merge locations.
        """
        merged: Dict[str, ModelRecord] = {}
        for record in indexed:
            existing = merged.get(record.id)
            if existing is None:
                merged[record.id] = record
            else:
                for location in record.locations:
                    if location not in existing.locations:
                        existing.locations.append(location)
                if existing.availability == "unavailable" and record.availability == "available":
                    existing.availability = "available"
        self._indexed = merged

    # -- internals ---------------------------------------------------------
    def _reconciled(self, record: ModelRecord) -> Dict[str, Any]:
        data = record.to_dict()
        indexed = self._indexed.get(record.id)
        if indexed is not None and indexed is not record:
            data["locations"] = list(indexed.locations)
            data["identity"] = indexed.identity
            data["availability"] = indexed.availability
            data["library_root_id"] = indexed.library_root_id
        data["status"] = self._live_status(record)
        return data

    def _live_status(self, record: ModelRecord) -> str:
        """Resolve a record's live status.

        Precedence (spec 4.6):
          1. Wired status_provider — authoritative; detects flat single-file
             artifacts and in-flight downloads.
          2. Indexed layer with an available location — reports ready.
          3. On-disk directory check — fallback for catalog-known records.
          4. Indexed entry exists but no available location — not_found.
          5. Catalog default (record.status).
        """
        if self._status_provider is not None:
            provided = self._status_provider(record.id)
            if provided:
                return provided
        indexed = self._indexed.get(record.id)
        if indexed is not None and indexed.locations and indexed.availability == "available":
            return "ready"
        if self._is_present(record):
            return "ready"
        if indexed is not None:
            return "not_found"
        return record.status

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
