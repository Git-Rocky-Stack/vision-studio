"""IndexService — merges the three index feeds into the registry (spec 4.1).

Feeds: app-managed tree (models_dir), the local HF cache, and user library
roots. State (incremental signatures) persists at <models_dir>/.foundry/.
Scans are synchronous functions; main.py wraps them in asyncio.to_thread.
"""

import json
import os
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from foundry.hf_cache import scan_hf_cache
from foundry.indexer import artifact_to_record, scan_tree
from foundry.library_roots import RootsStore
from foundry.model_record import ModelRecord
from foundry.registry import ModelRegistry

_APP_ROOT_ID = "__app__"

# Filenames too generic to identify a model: never use them for catalog
# reconciliation of discovered loose files (a user's arbitrary
# diffusion_pytorch_model.safetensors is NOT the catalog VAE).
_AMBIGUOUS_FILENAMES = {"diffusion_pytorch_model.safetensors"}

# (path, layout_hint) candidates probed by first-run detection. Patched in tests.
_WELL_KNOWN_CANDIDATES: List[Tuple[str, str]] = [
    (os.path.expanduser(os.path.join("~", "ComfyUI", "models")), "comfyui"),
    (os.path.join("C:", os.sep, "ComfyUI", "models"), "comfyui"),
    (os.path.expanduser(os.path.join("~", "stable-diffusion-webui", "models")), "a1111"),
    (os.path.join("C:", os.sep, "stable-diffusion-webui", "models"), "a1111"),
]


@dataclass
class IndexSnapshot:
    records_indexed: int = 0
    warnings: List[str] = field(default_factory=list)


class IndexService:
    def __init__(
        self,
        registry: ModelRegistry,
        roots_store: RootsStore,
        models_dir: str,
        state_path: str,
    ):
        self._registry = registry
        self._roots = roots_store
        self._models_dir = models_dir
        self._state_path = state_path
        # signatures: root_id ->
        #   {normalized path: [mtime_ns, size, type, identity, tier, tier_reason]}
        # (legacy pre-M4 4-entry values tolerated; see foundry.indexer.Signatures)
        self._signatures: Dict[str, Dict] = {}
        # Last good records per root, kept IN MEMORY ONLY so an unmounted root
        # degrades to 'unavailable' records instead of vanishing (spec 4.6).
        # Known limitation: after a process restart while the root is still
        # unmounted, its records vanish until the root remounts and a scan
        # runs (durable degradation is a tracked follow-up).
        self._last_records: Dict[str, List[ModelRecord]] = {}
        self._load_state()

    # -- persistence --------------------------------------------------------
    def _load_state(self) -> None:
        if os.path.isfile(self._state_path):
            try:
                with open(self._state_path, "r", encoding="utf-8") as handle:
                    loaded = json.load(handle)
                if isinstance(loaded, dict):
                    self._signatures = loaded
            except (OSError, ValueError):
                # Fail-safe: stale state only means a full re-read next scan.
                self._signatures = {}

    def _save_state(self) -> None:
        os.makedirs(os.path.dirname(self._state_path), exist_ok=True)
        with open(self._state_path, "w", encoding="utf-8") as handle:
            json.dump(self._signatures, handle)

    # -- public API ----------------------------------------------------------
    def scan(self) -> IndexSnapshot:
        """Merge all index feeds and push the result into the registry.

        Scans assume serialized invocation (main.py runs them via
        asyncio.to_thread one at a time); concurrent scans are
        last-writer-wins, not corrupting.
        """
        snapshot = IndexSnapshot()
        reconciliation = self._filename_reconciliation()
        indexed: List[ModelRecord] = []

        # Feed 1: the app-managed tree (closes the M1 flat-file presence TODO).
        indexed.extend(self._scan_root(_APP_ROOT_ID, self._models_dir, "comfyui", reconciliation))

        # Feed 2: the HF cache, reconciled by repo_id+revision.
        cache = scan_hf_cache(self._catalog_by_repo())
        indexed.extend(cache.records)
        snapshot.warnings.extend(cache.warnings)

        # Feed 3: user library roots; a missing root degrades, never errors.
        for root in self._roots.list():
            if os.path.isdir(root.path):
                indexed.extend(
                    self._scan_root(root.id, root.path, root.layout_hint, reconciliation)
                )
            else:
                for record in self._last_records.get(root.id, []):
                    record.availability = "unavailable"
                    indexed.append(record)

        self._registry.apply_index(indexed)
        self._save_state()
        snapshot.records_indexed = len(indexed)
        return snapshot

    def remove_root(self, root_id: str) -> int:
        """Drop a root + its referenced-only records. Touches zero bytes."""
        dropped = sum(
            1
            for record in self._registry.list_records()
            if record.get("library_root_id") == root_id
        )
        self._last_records.pop(root_id, None)
        self._signatures.pop(root_id, None)
        self._roots.remove(root_id)
        self.scan()
        return dropped

    def detect_candidates(self) -> List[Dict[str, str]]:
        """First-run detection (spec 4.7): offers only; adding is the user's call."""
        known = {
            os.path.normcase(os.path.normpath(root.path)) for root in self._roots.list()
        }
        offers = []
        for path, hint in _WELL_KNOWN_CANDIDATES:
            if os.path.isdir(path) and os.path.normcase(os.path.normpath(path)) not in known:
                offers.append({"path": path, "layout_hint": hint})
        return offers

    # -- internals ------------------------------------------------------------
    def _scan_root(
        self, root_id: str, path: str, layout_hint: str, reconciliation: Dict[str, str]
    ) -> List[ModelRecord]:
        artifacts, next_signatures = scan_tree(
            path, layout_hint, root_id, self._signatures.get(root_id, {})
        )
        self._signatures[root_id] = next_signatures
        records = [artifact_to_record(artifact, reconciliation) for artifact in artifacts]
        if root_id != _APP_ROOT_ID:
            self._last_records[root_id] = records
        return records

    def _filename_reconciliation(self) -> Dict[str, str]:
        from utils.model_manager import _SINGLE_FILE_FILENAMES

        return {
            filename: model_id
            for model_id, filename in _SINGLE_FILE_FILENAMES.items()
            if filename not in _AMBIGUOUS_FILENAMES
        }

    def _catalog_by_repo(self) -> Dict[Tuple[str, str], str]:
        return {
            (record.repo_id, record.revision): record_id
            for record_id, record in self._registry.records.items()
            if record.repo_id
        }
