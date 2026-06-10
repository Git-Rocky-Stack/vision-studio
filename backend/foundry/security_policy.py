"""Per-model consent for pickle weights and trust_remote_code. Deny by default.

Spec 5.3: no silent trust elevation, ever - each step up is a deliberate,
logged user action. Storage hardening mirrors RootsStore (atomic replace,
corrupt -> sidecar + deny-everything).
"""

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List

_log = logging.getLogger(__name__)

CONSENT_KINDS = ("pickle", "trust_remote_code")


class ConsentStore:
    """JSON-persisted per-model consent grants plus an append-only audit trail."""

    def __init__(self, path: str):
        self.path = os.path.abspath(path)
        self._consents: Dict[str, Dict[str, bool]] = {}
        self._audit: List[Dict[str, Any]] = []
        self._load()

    def get(self, model_id: str) -> Dict[str, bool]:
        """Consent state for a model. Unknown models are denied everything."""
        entry = self._consents.get(model_id, {})
        return {kind: bool(entry.get(kind)) for kind in CONSENT_KINDS}

    def grant(self, model_id: str, kind: str) -> None:
        self._set(model_id, kind, True, "grant")

    def revoke(self, model_id: str, kind: str) -> None:
        self._set(model_id, kind, False, "revoke")

    def audit(self) -> List[Dict[str, Any]]:
        return list(self._audit)

    # -- internals -----------------------------------------------------------
    def _set(self, model_id: str, kind: str, value: bool, action: str) -> None:
        if kind not in CONSENT_KINDS:
            raise ValueError(f"unknown consent kind: {kind!r}")
        self._consents.setdefault(model_id, {})[kind] = value
        self._audit.append(
            {
                "model_id": model_id,
                "kind": kind,
                "action": action,
                "at": datetime.now(timezone.utc).isoformat(),
            }
        )
        self._save()

    def _load(self) -> None:
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            self._consents = {
                str(k): {kind: bool(v.get(kind)) for kind in CONSENT_KINDS}
                for k, v in dict(data.get("consents", {})).items()
            }
            self._audit = [e for e in data.get("audit", []) if isinstance(e, dict)]
        except (OSError, ValueError, TypeError, AttributeError) as exc:
            # Fail-safe: deny everything rather than trust a corrupt file.
            # Keep the corrupt file for diagnostics and start fresh.
            _log.error(
                "ConsentStore: corrupt store at %s (%s); preserving as .corrupt",
                self.path,
                exc,
            )
            try:
                os.replace(self.path, self.path + ".corrupt")
            except OSError:
                pass
            self._consents, self._audit = {}, []

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        payload = {"consents": self._consents, "audit": self._audit}
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            os.replace(tmp, self.path)
        except Exception:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
