"""The Spike C corpus is the classifier's regression gate.

Every fixture must reproduce its ground-truth tier, and the false-Compatible
count must be exactly zero. If a fixture's ground truth ever changes, that is
an evidence-based relabel documented in the spike doc - never a test tweak.
"""

import json
import os
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.classifier import classify_repo  # type: ignore[import-not-found]
from foundry.hub_signals import signals_from_fixture  # type: ignore[import-not-found]
from foundry.model_record import load_catalog  # type: ignore[import-not-found]

CORPUS = pathlib.Path(__file__).parent / "fixtures" / "classifier_corpus"
CATALOG = os.path.join(os.path.dirname(__file__), "..", "foundry", "verified-catalog.json")


def verified_repo_ids():
    return {
        record.repo_id
        for record in load_catalog(CATALOG).values()
        if record.repo_id
    }


class CorpusRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.verified = verified_repo_ids()
        cls.fixtures = [
            json.loads(p.read_text(encoding="utf-8"))
            for p in sorted(CORPUS.glob("*.json"))
            if p.name != "index.json"
        ]

    def test_corpus_is_complete(self):
        self.assertEqual(len(self.fixtures), 41)

    def test_every_fixture_reproduces_ground_truth(self):
        for fixture in self.fixtures:
            gt = fixture["ground_truth"]["tier"]
            with self.subTest(repo=fixture["repo_id"]):
                verdict = classify_repo(signals_from_fixture(fixture), self.verified)
                if gt == "unavailable" or not fixture.get("reachable", False):
                    if fixture["repo_id"] not in self.verified:
                        self.assertFalse(verdict.available)
                        continue
                self.assertEqual(verdict.tier, gt)
                self.assertTrue(verdict.reason)

    def test_false_compatible_is_zero(self):
        offenders = []
        for fixture in self.fixtures:
            verdict = classify_repo(signals_from_fixture(fixture), self.verified)
            if verdict.tier == "compatible" and fixture["ground_truth"]["tier"] != "compatible":
                offenders.append(fixture["repo_id"])
        self.assertEqual(offenders, [])

    def test_every_verdict_has_a_reason(self):
        offenders = []
        for fixture in self.fixtures:
            verdict = classify_repo(signals_from_fixture(fixture), self.verified)
            if not verdict.reason:
                offenders.append(fixture["repo_id"])
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
