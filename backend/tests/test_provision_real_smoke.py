"""#34 installer PR4 (spec section 9): the real end-to-end provision smoke.

Set ``VS_REAL_SMOKE=1`` to run locally - the test provisions the SMALLEST
auto-set model through the genuine registry -> orchestrator -> DownloadManager
stack against the real upstream, into a throwaway models dir, and asserts the
bytes actually land and verify. Nothing is mocked anywhere; this is the
honesty gate proving the provisioning pipeline works outside stub CI.

Skipped by default (real network, real bytes); never runs in CI.
"""

import asyncio
import os
import pathlib
import sys
import tempfile
import time
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_manager import DownloadManager  # type: ignore[import-not-found]
from foundry.provision_orchestrator import ProvisionOrchestrator  # type: ignore[import-not-found]
from foundry.provisioning import load_provision_manifest  # type: ignore[import-not-found]
from foundry.registry import ModelRegistry  # type: ignore[import-not-found]
from foundry.security_policy import ConsentStore  # type: ignore[import-not-found]
from utils.model_manager import ModelManager  # type: ignore[import-not-found]

CATALOG_PATH = str(BACKEND_ROOT / "foundry" / "verified-catalog.json")

# Real download of a real model: generous, but bounded.
_DEADLINE_SECONDS = 15 * 60
_POLL_SECONDS = 2.0


@unittest.skipUnless(
    os.environ.get("VS_REAL_SMOKE") == "1",
    "real-network smoke; set VS_REAL_SMOKE=1 to run locally",
)
class RealProvisionSmokeTests(unittest.IsolatedAsyncioTestCase):
    async def test_smallest_auto_set_model_provisions_end_to_end(self):
        manifest = load_provision_manifest()
        smallest = min(
            manifest["auto_set"], key=lambda e: e.get("approx_bytes") or float("inf")
        )
        manifest["auto_set"] = [smallest]

        models_dir = tempfile.mkdtemp(prefix="vs-real-smoke-")
        model_manager = ModelManager(models_dir)
        consent_store = ConsentStore(
            os.path.join(models_dir, ".foundry", "consents.json")
        )
        download_manager = DownloadManager(
            registry=None,
            model_manager=model_manager,
            models_dir=models_dir,
        )

        def status_provider(model_id):
            live = download_manager.get_record_status(model_id)
            if live:
                return live
            return model_manager.get_record_status(model_id)

        registry = ModelRegistry(
            models_dir=models_dir,
            catalog_path=CATALOG_PATH,
            status_provider=status_provider,
        )
        download_manager._registry = registry
        download_manager._consent_lookup = lambda model_id: consent_store.get(model_id)

        orchestrator = ProvisionOrchestrator(
            manifest=manifest,
            registry=registry,
            download_manager=download_manager,
            consent_store=consent_store,
            models_dir=models_dir,
        )

        started = time.monotonic()
        snapshot = orchestrator.start()
        while not snapshot["complete"]:
            if snapshot["error_count"]:
                row = snapshot["models"][0]
                self.fail(f"real provision errored: {row['error']}")
            if time.monotonic() - started > _DEADLINE_SECONDS:
                self.fail(
                    f"real provision did not complete within {_DEADLINE_SECONDS}s "
                    f"(progress {snapshot['overall_progress']:.3f})"
                )
            await asyncio.sleep(_POLL_SECONDS)
            snapshot = orchestrator.status()

        row = snapshot["models"][0]
        self.assertEqual(row["id"], smallest["id"])
        self.assertEqual(row["status"], "ready")
        self.assertEqual(snapshot["ready_count"], 1)

        # The bytes must exist on disk, non-trivially sized.
        landed = 0
        for root, _dirs, names in os.walk(models_dir):
            for name in names:
                if name.endswith((".safetensors", ".ckpt", ".onnx", ".json")):
                    landed += os.path.getsize(os.path.join(root, name))
        self.assertGreater(
            landed, 1024 * 1024, "provisioned model bytes must land on disk"
        )


if __name__ == "__main__":
    unittest.main()
