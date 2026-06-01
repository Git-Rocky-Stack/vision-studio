import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_errors import (  # type: ignore[import-not-found]
    DiskSpaceError,
    DownloadCancelledError,
    DownloadError,
    DownloadFailedError,
    GatedModelError,
    map_hf_exception,
)


class DownloadErrorHierarchyTests(unittest.TestCase):
    def test_all_typed_errors_subclass_download_error(self):
        self.assertTrue(issubclass(DiskSpaceError, DownloadError))
        self.assertTrue(issubclass(GatedModelError, DownloadError))
        self.assertTrue(issubclass(DownloadCancelledError, DownloadError))
        self.assertTrue(issubclass(DownloadFailedError, DownloadError))

    def test_disk_space_error_carries_required_and_available(self):
        err = DiskSpaceError(required=100, available=40)
        self.assertEqual(err.required, 100)
        self.assertEqual(err.available, 40)
        # Message is human-readable and contains both numbers.
        self.assertIn("100", str(err))
        self.assertIn("40", str(err))

    def test_gated_model_error_carries_repo_and_gate_url(self):
        err = GatedModelError(repo_id="org/m", gate_url="https://huggingface.co/org/m")
        self.assertEqual(err.repo_id, "org/m")
        self.assertEqual(err.gate_url, "https://huggingface.co/org/m")

    def test_failed_error_carries_reason(self):
        err = DownloadFailedError("integrity")
        self.assertEqual(err.reason, "integrity")


class MapHfExceptionTests(unittest.TestCase):
    def test_http_401_maps_to_gated_with_repo_gate_url(self):
        exc = _http_error(401)
        mapped = map_hf_exception(exc, repo_id="org/gated")
        self.assertIsInstance(mapped, GatedModelError)
        self.assertEqual(mapped.gate_url, "https://huggingface.co/org/gated")

    def test_http_403_maps_to_gated(self):
        mapped = map_hf_exception(_http_error(403), repo_id="org/g")
        self.assertIsInstance(mapped, GatedModelError)

    def test_size_consistency_oserror_maps_to_integrity_failure(self):
        mapped = map_hf_exception(OSError("Consistency check failed: ..."), repo_id="org/m")
        self.assertIsInstance(mapped, DownloadFailedError)
        self.assertEqual(mapped.reason, "integrity")

    def test_value_error_maps_to_generic_failed(self):
        mapped = map_hf_exception(ValueError("bad filename"), repo_id="org/m")
        self.assertIsInstance(mapped, DownloadFailedError)

    def test_an_existing_download_error_passes_through_unchanged(self):
        original = DiskSpaceError(required=5, available=1)
        self.assertIs(map_hf_exception(original, repo_id="org/m"), original)


def _http_error(status_code: int) -> Exception:
    """A stand-in for an HfHubHTTPError carrying an HTTP status code."""
    class _Resp:
        def __init__(self, code):
            self.status_code = code

    exc = Exception(f"HTTP {status_code}")
    exc.response = _Resp(status_code)  # type: ignore[attr-defined]
    return exc


if __name__ == "__main__":
    unittest.main()
