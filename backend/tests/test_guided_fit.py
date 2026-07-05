"""#34 PR3/PR4: guided stacks refuse over-budget up front, with the basis label."""
import json
import struct
from dataclasses import dataclass
from typing import Optional

import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.fit import GUIDED_PASS_OVERHEAD_BYTES, VramEstimate
from guided.fit import guided_fit_refusal, installed_weight_bytes

_GIB = 2 ** 30


@dataclass
class _Plan:
    vram_plan: Optional[VramEstimate] = None
    refusal: Optional[str] = None


@dataclass
class _Profile:
    gpu_available: bool = True
    vram_free_bytes: int = 8 * _GIB
    system_ram_available_bytes: int = 32 * _GIB


def _write_header_only_safetensors(path, param_count, dtype="F16"):
    """A real safetensors prefix+header claiming param_count params; the fit
    math reads ONLY the header, so no tensor bytes are needed."""
    header = json.dumps({
        "weight": {"dtype": dtype, "shape": [param_count],
                   "data_offsets": [0, param_count * 2]},
    }).encode("utf-8")
    with open(path, "wb") as handle:
        handle.write(struct.pack("<Q", len(header)))
        handle.write(header)


def _cn_dir(tmp_path, name, param_count):
    model_dir = tmp_path / name
    model_dir.mkdir()
    _write_header_only_safetensors(
        str(model_dir / "diffusion_pytorch_model.safetensors"), param_count)
    return str(model_dir)


def _ip_dir(tmp_path, name, param_count):
    model_dir = tmp_path / name
    model_dir.mkdir(parents=True)
    _write_header_only_safetensors(
        str(model_dir / "ip_adapter.safetensors"), param_count)
    return str(model_dir)


def _estimate(total_gib, weights_gib, basis="estimated"):
    weights = int(weights_gib * _GIB)
    total = int(total_gib * _GIB)
    return VramEstimate(weight_bytes=weights, activation_bytes=total - weights,
                        runtime_bytes=0, total_bytes=total, basis=basis)


def test_installed_weight_bytes_reads_exact_header_bytes(tmp_path):
    model_dir = _cn_dir(tmp_path, "cn", param_count=1000)
    assert installed_weight_bytes(model_dir) == 2000  # 1000 params x F16


def test_fitting_stack_passes(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=4.0, weights_gib=2.0))
    dirs = [_cn_dir(tmp_path, "cn", param_count=1000)]
    assert guided_fit_refusal(plan, "sd15", _Profile(), cn_model_dirs=dirs) is None


def test_over_budget_stack_refuses_with_basis_and_numbers(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=7.0, weights_gib=5.0))
    # A ControlNet claiming ~4 GiB of F16 params.
    dirs = [_cn_dir(tmp_path, "cn", param_count=2 * _GIB)]
    profile = _Profile(vram_free_bytes=8 * _GIB, system_ram_available_bytes=1 * _GIB)
    message = guided_fit_refusal(plan, "sd15", profile, cn_model_dirs=dirs)
    assert message is not None
    assert "estimated" in message
    assert "GB" in message
    assert "1 ControlNet model" in message  # names what is in the stack
    assert str(profile.system_ram_available_bytes) not in message  # human units only
    assert "\\" not in message and "/" not in message  # never a filesystem path


def test_offload_capable_stack_is_not_refused(tmp_path):
    """Weights fit in system RAM + non-weights fit in VRAM -> the loader's
    offload rung handles it; the gate stays out of the way."""
    plan = _Plan(vram_plan=_estimate(total_gib=7.0, weights_gib=5.0))
    dirs = [_cn_dir(tmp_path, "cn", param_count=2 * _GIB)]
    profile = _Profile(vram_free_bytes=8 * _GIB, system_ram_available_bytes=32 * _GIB)
    assert guided_fit_refusal(plan, "sd15", profile, cn_model_dirs=dirs) is None


def test_cpu_only_and_broken_plans_skip_the_gate(tmp_path):
    dirs = [_cn_dir(tmp_path, "cn", param_count=1000)]
    ok_plan = _Plan(vram_plan=_estimate(4.0, 2.0))
    assert guided_fit_refusal(ok_plan, "sd15", _Profile(gpu_available=False),
                              cn_model_dirs=dirs) is None
    assert guided_fit_refusal(_Plan(refusal="nope"), "sd15", _Profile(),
                              cn_model_dirs=dirs) is None
    assert guided_fit_refusal(_Plan(vram_plan=None), "sd15", _Profile(),
                              cn_model_dirs=dirs) is None
    assert guided_fit_refusal(None, "sd15", _Profile(), cn_model_dirs=dirs) is None


def test_unreadable_weights_never_guess(tmp_path):
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    plan = _Plan(vram_plan=_estimate(100.0, 90.0))  # would refuse if gated
    assert guided_fit_refusal(plan, "sd15", _Profile(),
                              cn_model_dirs=[str(empty_dir)]) is None


def test_overhead_band_covers_all_image_families():
    for family in ("sd15", "sdxl", "flux", "sd35", "default"):
        assert GUIDED_PASS_OVERHEAD_BYTES[family] > 0


def test_ip_adapter_dirs_count_toward_the_budget(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=7.0, weights_gib=5.0))
    # Two adapter INSTANCES (the FLUX shape: same dir listed twice) plus the
    # encoder - each claiming ~2 GiB of F16 params -> 6 GiB extra.
    adapter = _ip_dir(tmp_path, "ip-adapter-flux", param_count=_GIB)
    encoder = _ip_dir(tmp_path, "ip-adapter-encoder-clip-vit-l", param_count=_GIB)
    profile = _Profile(vram_free_bytes=8 * _GIB, system_ram_available_bytes=1 * _GIB)
    message = guided_fit_refusal(plan, "flux", profile,
                                 ip_model_dirs=[adapter, adapter, encoder])
    assert message is not None
    assert "IP-Adapter" in message
    assert "ControlNet" not in message
    assert "GB VRAM" in message


def test_mixed_stack_message_names_both_components(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=7.0, weights_gib=5.0))
    cn = _cn_dir(tmp_path, "cn", param_count=_GIB)
    adapter = _ip_dir(tmp_path, "ip-adapter-sd15", param_count=_GIB)
    profile = _Profile(vram_free_bytes=8 * _GIB, system_ram_available_bytes=1 * _GIB)
    message = guided_fit_refusal(plan, "sd15", profile,
                                 cn_model_dirs=[cn], ip_model_dirs=[adapter])
    assert message is not None
    assert "1 ControlNet model" in message
    assert "IP-Adapter" in message


def test_empty_ip_dirs_change_nothing(tmp_path):
    plan = _Plan(vram_plan=_estimate(total_gib=4.0, weights_gib=2.0))
    dirs = [_cn_dir(tmp_path, "cn", param_count=1000)]
    assert guided_fit_refusal(plan, "sd15", _Profile(), cn_model_dirs=dirs) is None
