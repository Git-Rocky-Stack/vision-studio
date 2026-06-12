"""Fit estimator math. Spike D: header param-count x dtype-bytes equals file
size at ratio 1.0000 - weight bytes are EXACT; uncertainty lives ONLY in the
labeled activation/runtime bands."""

import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.fit import (  # type: ignore[import-not-found]
    PRECISION_BYTES,
    VramEstimate,
    estimate_vram,
    load_peak_ram_bytes,
    weight_bytes_from_header,
)


def _header(tensors):
    return {
        name: {"dtype": dtype, "shape": shape, "data_offsets": [0, 1]}
        for name, (dtype, shape) in tensors.items()
    }


class WeightBytesTests(unittest.TestCase):
    def test_exact_math_param_count_times_dtype(self):
        # Spike D measured shapes: sd15 unet 859.5M params F32 = 3.202 GiB.
        header = _header({"unet.weight": ("F32", [859_520_964])})
        self.assertEqual(weight_bytes_from_header(header), 859_520_964 * 4)

    def test_metadata_block_ignored_and_mixed_dtypes_summed(self):
        header = _header({"a": ("F16", [10, 10]), "b": ("I64", [5])})
        header["__metadata__"] = {"format": "pt"}
        self.assertEqual(weight_bytes_from_header(header), 100 * 2 + 5 * 8)

    def test_unknown_dtype_assumes_4_bytes_conservative(self):
        header = _header({"a": ("MYSTERY", [10])})
        self.assertEqual(weight_bytes_from_header(header), 40)


class EstimateTests(unittest.TestCase):
    def test_estimate_composes_weights_band_runtime_and_is_labeled(self):
        estimate = estimate_vram(
            weight_bytes_native=4 * 2**30, native_bytes_per_param=4,
            target_precision="fp16", family="sd15",
        )
        self.assertEqual(estimate.weight_bytes, 2 * 2**30)  # fp32 -> fp16 halves
        self.assertGreater(estimate.activation_bytes, 0)
        self.assertGreater(estimate.runtime_bytes, 0)
        self.assertEqual(
            estimate.total_bytes,
            estimate.weight_bytes + estimate.activation_bytes + estimate.runtime_bytes,
        )
        self.assertEqual(estimate.basis, "estimated")

    def test_measured_number_overrides_and_relabels(self):
        estimate = estimate_vram(
            weight_bytes_native=4 * 2**30, native_bytes_per_param=4,
            target_precision="fp16", family="sd15",
            measured_total_bytes=5 * 2**30,
        )
        self.assertEqual(estimate.total_bytes, 5 * 2**30)
        self.assertEqual(estimate.basis, "measured")

    def test_unknown_family_gets_widest_band(self):
        known = estimate_vram(2**30, 4, "fp16", "sd15")
        unknown = estimate_vram(2**30, 4, "fp16", "never-heard-of-it")
        self.assertGreaterEqual(unknown.activation_bytes, known.activation_bytes)


class LoadPeakTests(unittest.TestCase):
    def test_single_file_peak_adds_checkpoint_bytes(self):
        # Spike D: from_single_file is NOT mmap-lazy; conversion holds
        # resident weights + the checkpoint transiently.
        resident = 4 * 2**30
        checkpoint = 2 * 2**30
        self.assertEqual(
            load_peak_ram_bytes(resident, checkpoint_bytes=checkpoint, single_file=True),
            resident + checkpoint,
        )

    def test_diffusers_layout_peak_is_resident_only(self):
        self.assertEqual(
            load_peak_ram_bytes(4 * 2**30, checkpoint_bytes=0, single_file=False),
            4 * 2**30,
        )


if __name__ == "__main__":
    unittest.main()
