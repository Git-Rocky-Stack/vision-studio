"""
Curated, repo-shipped model-prompting knowledge base (M7 S6).

Loads one JSON file per model family from backend/data/prompting_kb/. Keyed by
the Foundry catalog's family classification; an unknown or absent family falls
back to generic.json. The KB is always available (no embedding required) and is
the cold-start retrieval source when the user corpus is empty.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_KB_DIR = Path(__file__).resolve().parent / "prompting_kb"
GENERIC_FAMILY = "generic"


@dataclass
class KbEntry:
    kind: str
    text: str
    tags: List[str]


class KnowledgeBase:
    def __init__(self, kb_dir: Optional[Path] = None):
        self._kb_dir = Path(kb_dir) if kb_dir else DEFAULT_KB_DIR
        self._by_family: Dict[str, List[KbEntry]] = {}
        self._load()

    def _load(self) -> None:
        if not self._kb_dir.exists():
            logger.warning("Prompting KB dir missing: %s", self._kb_dir)
            return
        for path in sorted(self._kb_dir.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                family = str(data["family"]).lower()
                entries = [
                    KbEntry(kind=str(e["kind"]), text=str(e["text"]), tags=list(e.get("tags", [])))
                    for e in data.get("entries", [])
                ]
                self._by_family[family] = entries
            except (KeyError, ValueError, TypeError) as exc:
                logger.error("Skipping malformed KB file %s: %s", path.name, exc)

    def families(self) -> List[str]:
        return sorted(self._by_family.keys())

    def entries_for_family(self, family: Optional[str]) -> List[KbEntry]:
        key = (family or "").lower()
        if key in self._by_family:
            return self._by_family[key]
        return self._by_family.get(GENERIC_FAMILY, [])
