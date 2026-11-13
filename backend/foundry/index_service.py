"""IndexService — merges the three index feeds into the registry (spec 4.1).

Feeds: app-managed tree (models_dir), the local HF cache, and user library
roots. State (incremental signatures + the last good records of every library
root) persists at <models_dir>/.foundry/index_state.json.

Scans are synchronous functions; main.py wraps them in asyncio.to_thread.
Several routes (index, rescan, add/remove root, post-provisioning refresh)
can trigger a scan at the same time, so every read-modify-write of the
service state runs under one re-entrant lock and the state file is replaced
atomically (write to a temp file, then os.replace).
"""

import dataclasses
import json
import logging
import os
import tempfile
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Tuple

from foundry.hf_cache import scan_hf_cache
from foundry.indexer import artifact_to_record, scan_tree
from foundry.library_roots import RootsStore
from foundry.model_record import ModelRecord
from foundry.registry import ModelRegistry

logger = logging.getLogger(__name__)

_APP_ROOT_ID = "__app__"

# Folders under the app-managed models dir that hold no library models: the
# Foundry's own state, compiler caches, and the AI Director's text embedder
# (services/retrieval/embedder.py EMBEDDER_ARTIFACT_TYPE - a sentence-
# transformers model that would otherwise be indexed as an unknown
# safetensors artifact and listed in the model library).
APP_TREE_EXCLUDED_DIRS = (".foundry", ".cache", "text-embedder")

# index_state.json layout. v1 (legacy) was the bare signatures dict; v2 wraps
# it and adds the last good records per library root so an unmounted root
# survives a restart (spec 4.6).
_STATE_VERSION = 2
_RECORD_FIELDS = frozenset(f.name for f in dataclasses.fields(ModelRecord))

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
        # Last good records per library root. Persisted alongside the
        # signatures so an unmounted root degrades to 'unavailable' records
        # instead of vanishing - also across a restart while it is still
        # unmounted (spec 4.6).
        self._last_records: Dict[str, List[ModelRecord]] = {}
        # Re-entrant: remove_root() holds it while it runs the follow-up scan.
        self._lock = threading.RLock()
        self._load_state()

    # -- persistence --------------------------------------------------------
    def _load_state(self) -> None:
        if not os.path.isfile(self._state_path):
            return
        try:
            with open(self._state_path, "r", encoding="utf-8") as handle:
                loaded = json.load(handle)
        except (OSError, ValueError) as exc:
            # Fail-safe: stale state only means a full re-read next scan.
            logger.warning("Ignoring unreadable index state %s: %s", self._state_path, exc)
            return
        if not isinstance(loaded, dict):
            return
        if loaded.get("version") == _STATE_VERSION:
            signatures = loaded.get("signatures")
            self._signatures = signatures if isinstance(signatures, dict) else {}
            self._last_records = self._decode_last_records(loaded.get("last_records"))
        else:
            # v1: the whole file was the signatures dict.
            self._signatures = loaded

    @staticmethod
    def _decode_last_records(raw: Any) -> Dict[str, List[ModelRecord]]:
        decoded: Dict[str, List[ModelRecord]] = {}
        if not isinstance(raw, dict):
            return decoded
        for root_id, entries in raw.items():
            if not isinstance(entries, list):
                continue
            records: List[ModelRecord] = []
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                try:
                    # Unknown keys (a newer build's fields) are dropped rather
                    # than failing the whole load.
                    records.append(
                        ModelRecord(**{k: v for k, v in entry.items() if k in _RECORD_FIELDS})
                    )
                except TypeError as exc:
                    logger.warning(
                        "Dropping malformed cached record for library root %s: %s", root_id, exc
                    )
            decoded[root_id] = records
        return decoded

    def _save_state(self) -> None:
        directory = os.path.dirname(self._state_path) or "."
        os.makedirs(directory, exist_ok=True)
        payload = {
            "version": _STATE_VERSION,
            "signatures": self._signatures,
            "last_records": {
                root_id: [record.to_dict() for record in records]
                for root_id, records in self._last_records.items()
            },
        }
        # Write-then-rename: a crash or kill mid-write leaves the previous
        # state intact instead of a truncated file.
        fd, tmp_path = tempfile.mkstemp(prefix=".index_state-", suffix=".tmp", dir=directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_path, self._state_path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    # -- public API ----------------------------------------------------------
    def scan(self) -> IndexSnapshot:
        """Merge all index feeds and push the result into the registry.

        Thread-safe: concurrent callers are serialized on the service lock,
        so signatures, cached records, the registry merge and the state file
        never interleave.
        """
        with self._lock:
            return self._scan_locked()

    def remove_root(self, root_id: str) -> int:
        """Drop a root + its referenced-only records. Touches zero bytes."""
        with self._lock:
            dropped = sum(
                1
                for record in self._registry.list_records()
                if record.get("library_root_id") == root_id
            )
            self._last_records.pop(root_id, None)
            self._signatures.pop(root_id, None)
            self._roots.remove(root_id)
            self._scan_locked()
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
    def _scan_locked(self) -> IndexSnapshot:
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
        roots = self._roots.list()
        for root in roots:
            if os.path.isdir(root.path):
                indexed.extend(
                    self._scan_root(root.id, root.path, root.layout_hint, reconciliation)
                )
            else:
                for record in self._last_records.get(root.id, []):
                    record.availability = "unavailable"
                    indexed.append(record)

        # A root removed from the store by any path no longer owns cached
        # records; do not persist them forever.
        live_root_ids = {root.id for root in roots}
        for stale in [rid for rid in self._last_records if rid not in live_root_ids]:
            del self._last_records[stale]

        self._registry.apply_index(indexed)
        self._save_state()
        snapshot.records_indexed = len(indexed)
        return snapshot

    def _scan_root(
        self, root_id: str, path: str, layout_hint: str, reconciliation: Dict[str, str]
    ) -> List[ModelRecord]:
        artifacts, next_signatures = scan_tree(
            path, layout_hint, root_id, self._signatures.get(root_id, {}),
            excluded_top_level_dirs=APP_TREE_EXCLUDED_DIRS if root_id == _APP_ROOT_ID else (),
        )
        self._signatures[root_id] = next_signatures
        records = [artifact_to_record(artifact, reconciliation) for artifact in artifacts]
        if root_id != _APP_ROOT_ID:
            self._last_records[root_id] = records
        return records

    def _filename_reconciliation(self) -> Dict[str, str]:
        from utils.model_manager import _SINGLE_FILE_FILENAMES, single_file_names

        # Values may be a single filename or a list (#34 PR2: the OpenPose
        # annotator is three files); every file reconciles to its record id.
        return {
            filename: model_id
            for model_id in _SINGLE_FILE_FILENAMES
            for filename in (single_file_names(model_id) or [])
            if filename not in _AMBIGUOUS_FILENAMES
        }

    def _catalog_by_repo(self) -> Dict[Tuple[str, str], str]:
        return {
            (record.repo_id, record.revision): record_id
            for record_id, record in self._registry.records.items()
            if record.repo_id
        }
