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
    hardware_fit,
    load_peak_ram_bytes,
    weight_bytes_from_header,
)
from foundry.hardware import HardwareProfile  # type: ignore[import-not-found]


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
        # The decomposition stays honest: weights remain the exact computed
        # bytes; the measurement's remainder is the non-weight component.
        self.assertEqual(estimate.weight_bytes, 2 * 2**30)
        self.assertEqual(estimate.activation_bytes + estimate.runtime_bytes, 3 * 2**30)
        self.assertEqual(
            estimate.total_bytes,
            estimate.weight_bytes + estimate.activation_bytes + estimate.runtime_bytes,
        )

    def test_measured_below_computed_weights_clamps(self):
        estimate = estimate_vram(
            weight_bytes_native=4 * 2**30, native_bytes_per_param=4,
            target_precision="fp32", family="sd15",
            measured_total_bytes=1 * 2**30,
        )
        self.assertEqual(estimate.total_bytes, 1 * 2**30)
        self.assertEqual(estimate.weight_bytes, 1 * 2**30)
        self.assertEqual(estimate.activation_bytes, 0)

    def test_zero_or_negative_measurement_is_not_a_measurement(self):
        for bogus in (0, -5):
            estimate = estimate_vram(
                weight_bytes_native=4 * 2**30, native_bytes_per_param=4,
                target_precision="fp16", family="sd15",
                measured_total_bytes=bogus,
            )
            self.assertEqual(estimate.basis, "estimated")

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


def _profile(**kw):
    base = dict(
        gpu_available=True, gpu_name="RTX", vram_total_bytes=12 * 2**30,
        vram_free_bytes=10 * 2**30, compute_major=8, compute_minor=6,
        torch_available=True, system_ram_total_bytes=32 * 2**30,
        system_ram_available_bytes=24 * 2**30, disk_free_bytes=500 * 2**30,
    )
    base.update(kw)
    return HardwareProfile(**base)


def _estimate(total, weights=None):
    weights = weights if weights is not None else int(total * 0.7)
    return VramEstimate(
        weight_bytes=weights, activation_bytes=total - weights - 1, runtime_bytes=1,
        total_bytes=total, basis="estimated",
    )


class HardwareFitTests(unittest.TestCase):
    def test_fits_when_total_within_free_vram(self):
        verdict = hardware_fit(_estimate(8 * 2**30), _profile())
        self.assertEqual(verdict, "fits")

    def test_measured_over_budget_is_honest(self):
        # Regression: the measured branch must keep a real weights/non-weights
        # decomposition or over-budget becomes structurally unreachable for
        # measured models (40 GiB measured on 1 GiB VRAM + 1 GiB RAM).
        estimate = estimate_vram(
            weight_bytes_native=38 * 2**30, native_bytes_per_param=2,
            target_precision="fp16", family="flux",
            measured_total_bytes=40 * 2**30,
        )
        profile = _profile(
            vram_free_bytes=1 * 2**30, vram_total_bytes=1 * 2**30,
            system_ram_available_bytes=1 * 2**30,
        )
        self.assertEqual(hardware_fit(estimate, profile), "over-budget")

    def test_measured_offload_still_reachable(self):
        # Weights fit in RAM, the measured non-weight remainder fits in VRAM.
        estimate = estimate_vram(
            weight_bytes_native=11 * 2**30, native_bytes_per_param=2,
            target_precision="fp16", family="sdxl",
            measured_total_bytes=14 * 2**30,
        )
        self.assertEqual(hardware_fit(estimate, _profile()), "fits-with-offload")

    def test_fits_with_offload_when_weights_fit_in_ram(self):
        # 16 GiB total > 10 free VRAM, but offloadable weights fit in RAM.
        verdict = hardware_fit(_estimate(16 * 2**30, weights=11 * 2**30), _profile())
        self.assertEqual(verdict, "fits-with-offload")

    def test_over_budget_when_even_offload_cannot_hold_it(self):
        profile = _profile(system_ram_available_bytes=4 * 2**30)
        verdict = hardware_fit(_estimate(40 * 2**30, weights=38 * 2**30), profile)
        self.assertEqual(verdict, "over-budget")

    def test_cpu_only_when_no_gpu(self):
        verdict = hardware_fit(_estimate(4 * 2**30), _profile(
            gpu_available=False, vram_free_bytes=0, vram_total_bytes=0,
        ))
        self.assertEqual(verdict, "cpu-only")

    def test_boundary_exactly_free_vram_fits(self):
        verdict = hardware_fit(_estimate(10 * 2**30), _profile())
        self.assertEqual(verdict, "fits")


if __name__ == "__main__":
    unittest.main()
