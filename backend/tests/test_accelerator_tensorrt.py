"""TensorRT engine cache key + allowlist (M9 S7). Pure helpers - no TRT dep."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.tensorrt_engine import (
    TRT_PROVEN_FAMILIES,
    engine_cache_key,
    engine_cache_path,
    is_trt_eligible,
)


class CacheKeyTests(unittest.TestCase):
    def _key(self, **kw):
        base = dict(family="sdxl", pipeline_class="StableDiffusionXLPipeline",
                    precision="bf16", resolution_bucket="1024x1024",
                    compute_capability=(8, 9), trt_version="10.0.1")
        base.update(kw)
        return engine_cache_key(**base)

    def test_key_is_stable(self):
        self.assertEqual(self._key(), self._key())

    def test_key_varies_with_gpu_capability(self):
        self.assertNotEqual(self._key(compute_capability=(8, 9)),
                            self._key(compute_capability=(8, 6)))

    def test_key_varies_with_resolution(self):
        self.assertNotEqual(self._key(resolution_bucket="1024x1024"),
                            self._key(resolution_bucket="768x768"))

    def test_cache_path_uses_key(self):
        key = self._key()
        path = engine_cache_path("/tmp/engines", key)
        self.assertTrue(path.endswith(f"{key}.plan"))


class AllowlistTests(unittest.TestCase):
    def test_proven_families_are_eligible(self):
        for family in TRT_PROVEN_FAMILIES:
            self.assertTrue(is_trt_eligible(family))

    def test_unvetted_family_not_eligible(self):
        self.assertFalse(is_trt_eligible("ltx"))
        self.assertFalse(is_trt_eligible(None))
