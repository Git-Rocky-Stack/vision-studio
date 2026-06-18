"""Tests for the curated prompting knowledge base."""

import json
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.retrieval.knowledge_base import KnowledgeBase  # type: ignore[import-not-found]

KB_DIR = BACKEND_ROOT / "services" / "retrieval" / "prompting_kb"
REQUIRED_KINDS = {"positive-convention", "negative-convention", "param-hint", "resolution"}


class KnowledgeBaseTests(unittest.TestCase):
    def test_returns_entries_for_a_known_family(self):
        kb = KnowledgeBase()
        entries = kb.entries_for_family("sdxl")
        self.assertGreater(len(entries), 0)
        self.assertTrue(all(e.text for e in entries))

    def test_unknown_family_falls_back_to_generic(self):
        kb = KnowledgeBase()
        entries = kb.entries_for_family("totally-unknown-arch")
        generic = kb.entries_for_family("generic")
        self.assertEqual([e.text for e in entries], [e.text for e in generic])

    def test_none_family_falls_back_to_generic(self):
        kb = KnowledgeBase()
        self.assertEqual(
            [e.text for e in kb.entries_for_family(None)],
            [e.text for e in kb.entries_for_family("generic")],
        )

    def test_every_shipped_kb_file_validates(self):
        for path in KB_DIR.glob("*.json"):
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertIn("family", data)
            self.assertTrue(data.get("source"), f"{path.name} missing a source attribution")
            self.assertTrue(data.get("entries"), f"{path.name} has no entries")
            for entry in data["entries"]:
                self.assertIn(entry["kind"], REQUIRED_KINDS | {"trigger"}, f"{path.name}: bad kind {entry['kind']}")
                self.assertTrue(entry["text"])


if __name__ == "__main__":
    unittest.main()
