"""ConsentStore - per-model pickle / remote-code consent. Deny by default.

Same hardening pattern as RootsStore: atomic saves (mkstemp + os.replace),
corrupt file -> .corrupt sidecar + start empty (deny-everything fail-safe),
every grant/revoke appended to an audit trail.
"""

import os
import pathlib
import shutil
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.security_policy import ConsentStore  # type: ignore[import-not-found]


class ConsentStoreTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="foundry-consent-")
        self.path = os.path.join(self.dir, "consents.json")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_default_is_deny_everything(self):
        store = ConsentStore(self.path)
        state = store.get("any-model")
        self.assertFalse(state["pickle"])
        self.assertFalse(state["trust_remote_code"])

    def test_grant_persists_and_reloads(self):
        store = ConsentStore(self.path)
        store.grant("m1", "pickle")
        reloaded = ConsentStore(self.path)
        self.assertTrue(reloaded.get("m1")["pickle"])
        self.assertFalse(reloaded.get("m1")["trust_remote_code"])

    def test_revoke(self):
        store = ConsentStore(self.path)
        store.grant("m1", "trust_remote_code")
        store.revoke("m1", "trust_remote_code")
        self.assertFalse(store.get("m1")["trust_remote_code"])

    def test_invalid_kind_rejected(self):
        store = ConsentStore(self.path)
        with self.assertRaises(ValueError):
            store.grant("m1", "root-access")

    def test_corrupt_file_fails_safe_to_deny(self):
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write("{not json")
        store = ConsentStore(self.path)
        self.assertFalse(store.get("m1")["pickle"])
        self.assertTrue(os.path.exists(self.path + ".corrupt"))

    def test_audit_trail_records_every_action(self):
        store = ConsentStore(self.path)
        store.grant("m1", "pickle")
        store.revoke("m1", "pickle")
        audit = store.audit()
        self.assertEqual(len(audit), 2)
        self.assertEqual(audit[0]["action"], "grant")
        self.assertEqual(audit[1]["action"], "revoke")
        self.assertIn("at", audit[0])


if __name__ == "__main__":
    unittest.main()
