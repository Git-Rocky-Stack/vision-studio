"""The frozen self-check (selfcheck.py) and its contract with main.spec.

selfcheck.py is both the build-time collection list (main.spec imports it) and
the runtime proof that a bundle carries everything (`--self-check`). These
tests keep the lists honest against the source tree, the dependency locks and
the spec, and exercise the checker with fakes - no torch needed.
"""

from __future__ import annotations

import os
import re
import subprocess
import types
from pathlib import Path

import pytest

import selfcheck

BACKEND = Path(__file__).resolve().parent.parent
SPEC = (BACKEND / "main.spec").read_text(encoding="utf-8")
LOCKS = sorted((BACKEND / "requirements").glob("runtime-*.txt"))
FIRST_PARTY = {"api", "db", "edit_tools", "foundry", "guided", "middleware", "preview",
               "schemas", "services", "tools", "utils", "main", "version", "selfcheck"}

# Import name -> distribution name, where they differ.
DIST_FOR_IMPORT = {
    "PIL": "pillow",
    "cv2": "opencv-python-headless",
    "yaml": "pyyaml",
    "optimum": "optimum-quanto",
    "sklearn": "scikit-learn",
    "skimage": "scikit-image",
    "controlnet_aux": "controlnet-aux",
    "sentence_transformers": "sentence-transformers",
    "huggingface_hub": "huggingface-hub",
    "imageio_ffmpeg": "imageio-ffmpeg",
}


def _locked(lock: Path) -> set:
    return set(selfcheck.read_lock_pins(str(lock)))


def _dist(import_name: str) -> str:
    top = import_name.split(".")[0]
    return selfcheck.normalize_name(DIST_FOR_IMPORT.get(top, top))


# ---------------------------------------------------------------------------
# The spec builds from these lists
# ---------------------------------------------------------------------------


def test_spec_collects_from_selfcheck_lists():
    assert "from selfcheck import" in SPEC
    for name in ("REQUIRED_MODULES", "COLLECT_ALL_PACKAGES", "BUNDLED_DATA",
                 "SPEC_EXCLUDES", "MIGRATIONS_PACKAGE", "NATIVE_EXTENSION_MODULES"):
        assert name in SPEC, f"main.spec no longer uses selfcheck.{name}"
    # collect_all returns (datas, binaries, hiddenimports); the old spec fed
    # that 3-tuple to a helper expecting a flat list and silently dropped it.
    assert re.search(r"\w+_datas, \w+_binaries, \w+_hidden = collect_all\(", SPEC)
    assert "collect_submodules(MIGRATIONS_PACKAGE)" in SPEC


def test_spec_is_one_folder_without_upx():
    assert "COLLECT(" in SPEC
    assert "exclude_binaries=True" in SPEC
    assert "upx=True" not in SPEC
    assert SPEC.count("upx=False") >= 2  # EXE and COLLECT


def test_spec_drops_dead_entries():
    assert "'dotenv'" not in SPEC
    assert "torchaudio" not in SPEC
    assert ".env.example" not in SPEC


def test_bundled_data_exists_in_the_source_tree():
    for source, _destination in selfcheck.BUNDLED_DATA:
        assert (BACKEND / source).exists(), f"BUNDLED_DATA names a missing path: {source}"


def test_required_first_party_modules_exist():
    for module in selfcheck.REQUIRED_MODULES:
        top = module.split(".")[0]
        if top not in FIRST_PARTY:
            continue
        path = BACKEND.joinpath(*module.split("."))
        assert path.with_suffix(".py").is_file() or (path / "__init__.py").is_file(), (
            f"selfcheck requires first-party module {module}, which does not exist")


# ---------------------------------------------------------------------------
# The lists agree with the source tree and the locks
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("lock", LOCKS, ids=lambda p: p.name)
def test_every_third_party_module_is_locked(lock):
    locked = _locked(lock)
    third_party = [m for m in selfcheck.REQUIRED_MODULES + selfcheck.COLLECT_ALL_PACKAGES
                   if m.split(".")[0] not in FIRST_PARTY and m.split(".")[0] not in {"torch", "torchvision"}]
    missing = sorted({_dist(m) for m in third_party} - locked)
    assert not missing, f"{lock.name} does not lock: {missing}"


@pytest.mark.parametrize("lock", LOCKS, ids=lambda p: p.name)
def test_spec_excludes_nothing_the_runtime_depends_on(lock):
    locked = _locked(lock)
    clashes = sorted(m for m in selfcheck.SPEC_EXCLUDES if _dist(m) in locked)
    assert not clashes, f"main.spec excludes runtime dependencies locked in {lock.name}: {clashes}"


def test_scipy_and_sklearn_are_not_excluded():
    # sentence-transformers, controlnet-aux and facexlib import them.
    assert "scipy" not in selfcheck.SPEC_EXCLUDES
    assert "sklearn" not in selfcheck.SPEC_EXCLUDES


def _third_party_imports() -> set:
    """Top-level names of every absolute import (module level or inside functions)."""
    import ast

    found = set()
    for path in BACKEND.rglob("*.py"):
        rel = path.relative_to(BACKEND).parts
        if rel[0] in {"tests", "tools", "venv", "build", "dist"}:
            continue
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                found |= {alias.name.split(".")[0] for alias in node.names}
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                found.add(node.module.split(".")[0])
    return found


def test_every_third_party_import_in_the_backend_is_checked():
    import sys

    stdlib = set(sys.stdlib_module_names)
    checked = {m.split(".")[0] for m in
               selfcheck.REQUIRED_MODULES + selfcheck.OPTIONAL_MODULES + selfcheck.TENSORRT_MODULES}
    unchecked = sorted(
        name for name in _third_party_imports()
        if name not in stdlib and name not in FIRST_PARTY and name not in checked
        and name not in {"__future__", "tensorrt", "torchao"}  # probed by find_spec only
    )
    assert not unchecked, f"backend imports {unchecked} but the self-check never verifies them"


def test_every_diffusers_class_resolved_by_name_is_checked():
    names = set()
    for folder in ("foundry", "guided", "utils", "preview", "edit_tools"):
        for path in (BACKEND / folder).rglob("*.py"):
            names |= set(re.findall(
                r"\"([A-Z][A-Za-z0-9]+(?:Pipeline|Model|Scheduler|Adapter)[A-Za-z0-9]*)\"",
                path.read_text(encoding="utf-8")))
    checked = {attr for module, attr in selfcheck.LAZY_ATTRIBUTES if module == "diffusers"}
    missing = sorted(names - checked)
    assert not missing, f"diffusers classes resolved by name but not self-checked: {missing}"


# ---------------------------------------------------------------------------
# The checker itself, with fakes
# ---------------------------------------------------------------------------


class _Ok:
    returncode = 0


def _fake_world(tmp_path, missing=(), cpu_only=False, peft_visible=True):
    ffmpeg = tmp_path / "ffmpeg.exe"
    ffmpeg.write_bytes(b"")
    modules = {}

    def module(name, **attrs):
        mod = types.SimpleNamespace(**attrs)
        modules[name] = mod
        return mod

    module("torch", ops=types.SimpleNamespace(torchvision=types.SimpleNamespace(nms=object())),
           version=types.SimpleNamespace(cuda=None if cpu_only else "13.2"))
    module("diffusers.utils", is_peft_available=lambda: peft_visible)
    module("transformers.utils", is_torch_available=lambda: True)
    module("imageio_ffmpeg", get_ffmpeg_exe=lambda: str(ffmpeg))
    (tmp_path / "db" / "migrations").mkdir(parents=True, exist_ok=True)
    (tmp_path / "db" / "migrations" / "001_initial_schema.py").write_text("")
    module("db.migrations.001_initial_schema", migrate_up=lambda conn: None)

    def importer(name):
        if name in missing:
            raise ModuleNotFoundError(f"No module named '{name}'")
        if name in modules:
            return modules[name]
        return types.SimpleNamespace(**{attr: object() for _m, attr in selfcheck.LAZY_ATTRIBUTES})

    return importer


def _run(tmp_path, importer, **kwargs):
    return selfcheck.run_self_check(
        importer=importer,
        run=lambda *a, **k: _Ok(),
        data=(("db/migrations", "db/migrations"),),
        data_root=str(tmp_path),
        **kwargs,
    )


def test_passes_when_everything_is_present(tmp_path):
    report = _run(tmp_path, _fake_world(tmp_path), expect_cuda=True)
    assert report.exit_code == 0, report.render()
    assert "SELF-CHECK PASSED" in report.render()
    assert "db.migrations.001_initial_schema" in report.passed


def test_reports_a_missing_required_module(tmp_path):
    report = _run(tmp_path, _fake_world(tmp_path, missing={"optimum.quanto"}))
    assert report.exit_code == 1
    assert "MISSING  optimum.quanto: ModuleNotFoundError" in report.render()
    assert "SELF-CHECK FAILED" in report.render()


def test_a_missing_optional_module_only_warns(tmp_path):
    report = _run(tmp_path, _fake_world(tmp_path, missing={"some_optional"}), optional=("some_optional",))
    assert report.exit_code == 0
    assert any(name == "some_optional" for name, _ in report.warnings)


# --- TensorRT (CUDA builds on Windows/Linux) ---------------------------------------


def _with_tensorrt(importer, torch_version="2.14.1+cu132", missing=()):
    def wrapped(name):
        if name in missing:
            raise ModuleNotFoundError(f"No module named '{name}'")
        if name == "torch":
            module = importer(name)
            module.__version__ = torch_version
            return module
        if name in selfcheck.TENSORRT_MODULES:
            return types.SimpleNamespace()
        return importer(name)

    return wrapped


def _torch_tensorrt_package(tmp_path, extension=True, runtime=True):
    root = tmp_path / "site" / "torch_tensorrt"
    (root / "lib").mkdir(parents=True, exist_ok=True)
    if extension:
        (root / "_C.cp312-win_amd64.pyd").write_bytes(b"MZ")
    if runtime:
        (root / "lib" / "torchtrt.dll").write_bytes(b"MZ")
    return str(root)


def _check_trt(tmp_path, importer, cuda=False, package=None, trt_version="2.14.0+cu132"):
    report = selfcheck.CheckReport()
    selfcheck.check_tensorrt(
        report, importer,
        cuda_available=lambda: cuda,
        package_dir=lambda name: package if package is not None else _torch_tensorrt_package(tmp_path),
        version_of=lambda name: trt_version,
    )
    return report


def test_tensorrt_is_not_checked_unless_expected(tmp_path):
    # macOS and the CPU developer flavour do not ship it.
    importer = _with_tensorrt(_fake_world(tmp_path), missing=set(selfcheck.TENSORRT_MODULES))
    assert _run(tmp_path, importer).exit_code == 0


def test_tensorrt_on_a_gpu_machine_imports_everything(tmp_path):
    report = _check_trt(tmp_path, _with_tensorrt(_fake_world(tmp_path)), cuda=True)
    assert report.exit_code == 0, report.render()
    for name in selfcheck.TENSORRT_MODULES:
        assert name in report.passed
    assert "torch-tensorrt matches torch" in report.passed


def test_tensorrt_without_a_cuda_device_verifies_files_instead_of_importing(tmp_path):
    # Real behavior of torch-tensorrt 2.14: its import queries the CUDA device
    # and raises "Found no NVIDIA driver" on a GPU-less build runner.
    calls = []

    def importer(name):
        calls.append(name)
        if name == "torch_tensorrt":
            raise RuntimeError("Found no NVIDIA driver on your system.")
        return _with_tensorrt(_fake_world(tmp_path))(name)

    report = _check_trt(tmp_path, importer, cuda=False)
    assert report.exit_code == 0, report.render()
    assert "torch_tensorrt" not in calls
    assert any(name.startswith("torch_tensorrt (files") for name in report.passed)
    assert any(name == "torch_tensorrt" for name, _ in report.warnings)


@pytest.mark.parametrize("extension,runtime,missing", [
    (False, True, "_C extension"),
    (True, False, "lib/ runtime library"),
])
def test_tensorrt_without_a_device_fails_on_incomplete_files(tmp_path, extension, runtime, missing):
    package = _torch_tensorrt_package(tmp_path, extension=extension, runtime=runtime)
    report = _check_trt(tmp_path, _with_tensorrt(_fake_world(tmp_path)), package=package)
    assert missing in dict(report.failed)["torch_tensorrt"]


def test_tensorrt_missing_package_fails(tmp_path):
    report = _check_trt(tmp_path, _with_tensorrt(_fake_world(tmp_path)), package=str(tmp_path / "nowhere"))
    assert "torch_tensorrt" in dict(report.failed)


@pytest.mark.parametrize("missing", ["tensorrt", "tensorrt_libs", "tensorrt_bindings"])
def test_tensorrt_fails_when_a_runtime_part_is_missing(tmp_path, missing):
    report = _check_trt(tmp_path, _with_tensorrt(_fake_world(tmp_path), missing={missing}))
    assert missing in dict(report.failed)


def test_tensorrt_rejects_a_mismatched_torch(tmp_path):
    importer = _with_tensorrt(_fake_world(tmp_path), torch_version="2.15.0+cu132")
    report = _check_trt(tmp_path, importer)
    assert "torch-tensorrt matches torch" in dict(report.failed)
    report = _check_trt(tmp_path, _with_tensorrt(_fake_world(tmp_path)), trt_version=None)
    assert "torch-tensorrt matches torch" in dict(report.failed)


def test_expect_tensorrt_runs_the_tensorrt_check(tmp_path, monkeypatch):
    seen = []
    monkeypatch.setattr(selfcheck, "check_tensorrt", lambda report, importer: seen.append(True))
    _run(tmp_path, _fake_world(tmp_path), expect_tensorrt=True)
    assert seen == [True]


@pytest.mark.parametrize("platform,present,expected", [
    ("win32", True, True),
    ("linux", True, True),
    ("darwin", True, False),   # no macOS build exists
    ("win32", False, False),   # CPU developer venv: not installed
])
def test_tensorrt_collection_only_where_it_ships(platform, present, expected):
    find_spec = (lambda name: object()) if present else (lambda name: None)
    assert selfcheck.tensorrt_collection_enabled(platform, find_spec) is expected


def test_spec_collects_tensorrt_from_the_selfcheck_lists():
    for name in ("TENSORRT_COLLECT_ALL_PACKAGES", "TENSORRT_MODULES", "tensorrt_collection_enabled()"):
        assert name in SPEC, f"main.spec no longer uses selfcheck.{name}"
    assert set(selfcheck.TENSORRT_COLLECT_ALL_PACKAGES) >= {"tensorrt", "tensorrt_libs", "torch_tensorrt"}


TENSORRT_LOCKS = sorted((BACKEND / "requirements").glob("tensorrt-*.txt"))


def test_tensorrt_locks_exist_for_windows_and_linux_only():
    assert [p.name for p in TENSORRT_LOCKS] == ["tensorrt-linux-cu132.txt", "tensorrt-windows-cu132.txt"]


@pytest.mark.parametrize("lock", TENSORRT_LOCKS, ids=lambda p: p.name)
def test_tensorrt_lock_pins_the_runtime_and_nothing_twice(lock):
    pins = _locked(lock)
    assert {"torch-tensorrt", "tensorrt-cu13", "tensorrt-cu13-libs", "tensorrt-cu13-bindings"} <= pins
    platform = lock.name.split("-")[1]
    overlap = pins & (_locked(BACKEND / "requirements" / f"runtime-{platform}.txt")
                      | _locked(BACKEND / "requirements" / f"torch-{platform}-cu132.txt"))
    assert not overlap, f"{lock.name} re-pins packages another lock owns: {sorted(overlap)}"
    text = lock.read_text(encoding="utf-8")
    assert "torch-tensorrt==2.14.0+cu132 \\" in text  # hashed, like every other entry
    torch_minor = selfcheck.read_lock_pins(str(BACKEND / "requirements" / f"torch-{platform}-cu132.txt"))["torch"]
    assert torch_minor.startswith(selfcheck.TORCH_TENSORRT_TORCH_MINOR + ".")


def test_fails_when_diffusers_cannot_see_peft(tmp_path):
    report = _run(tmp_path, _fake_world(tmp_path, peft_visible=False))
    assert report.exit_code == 1
    assert "diffusers sees peft" in dict(report.failed)


def test_expect_cuda_rejects_a_cpu_torch(tmp_path):
    importer = _fake_world(tmp_path, cpu_only=True)
    assert _run(tmp_path, importer).exit_code == 0
    report = _run(tmp_path, importer, expect_cuda=True)
    assert "torch CUDA build" in dict(report.failed)


def test_ffmpeg_that_does_not_run_fails(tmp_path):
    importer = _fake_world(tmp_path)

    def broken(*_args, **_kwargs):
        raise subprocess.TimeoutExpired("ffmpeg", 60)

    report = selfcheck.run_self_check(
        importer=importer, run=broken, data=(), data_root=str(tmp_path))
    assert "ffmpeg binary (imageio_ffmpeg)" in dict(report.failed)


def test_missing_bundled_data_fails(tmp_path):
    report = selfcheck.run_self_check(
        importer=_fake_world(tmp_path), run=lambda *a, **k: _Ok(),
        data=(("foundry/verified-catalog.json", "foundry"),), data_root=str(tmp_path))
    assert "data foundry/verified-catalog.json" in dict(report.failed)


def test_frozen_layout_requires_the_ffmpeg_license_files(tmp_path):
    licenses = [entry for entry in selfcheck.BUNDLED_DATA if entry[1] == "licenses"]
    assert {source for source, _ in licenses} == {"licenses/FFMPEG-NOTICE.md", "licenses/GPL-3.0.txt"}

    def run():
        return selfcheck.run_self_check(
            importer=_fake_world(tmp_path), run=lambda *a, **k: _Ok(),
            data=licenses, data_root=str(tmp_path))

    report = run()
    assert {"data licenses/FFMPEG-NOTICE.md", "data licenses/GPL-3.0.txt"} <= set(dict(report.failed))

    # Frozen layout: <_MEIPASS>/licenses/<file>.
    (tmp_path / "licenses").mkdir()
    for name in ("FFMPEG-NOTICE.md", "GPL-3.0.txt"):
        (tmp_path / "licenses" / name).write_text("x")
    assert run().exit_code == 0


def test_frozen_windows_bundle_must_carry_the_vc_runtime(tmp_path):
    report = selfcheck.CheckReport()
    selfcheck.check_vc_runtime(report, str(tmp_path), "win32", frozen=False)
    assert not report.failed and not report.passed  # source runs use System32

    selfcheck.check_vc_runtime(report, str(tmp_path), "win32", frozen=True)
    assert "bundled vcruntime140_threads.dll" in dict(report.failed)

    for dll in selfcheck.WINDOWS_VC_RUNTIME_DLLS:
        (tmp_path / dll).write_bytes(b"MZ")
    report = selfcheck.CheckReport()
    selfcheck.check_vc_runtime(report, str(tmp_path), "win32", frozen=True)
    assert not report.failed
    assert len(report.passed) == len(selfcheck.WINDOWS_VC_RUNTIME_DLLS)

    report = selfcheck.CheckReport()
    selfcheck.check_vc_runtime(report, str(tmp_path / "nowhere"), "linux", frozen=True)
    assert not report.failed


def test_spec_ships_the_vc_runtime_on_windows():
    assert "WINDOWS_VC_RUNTIME_DLLS" in SPEC
    assert "vc_runtime_binaries" in SPEC


def test_main_accepts_the_frozen_argv_and_returns_the_exit_code(monkeypatch, capsys):
    calls = {}

    def fake_run(**kwargs):
        calls.update(kwargs)
        report = selfcheck.CheckReport()
        report.fail("x", "y")
        return report

    monkeypatch.setattr(selfcheck, "run_self_check", fake_run)
    assert selfcheck.main(["--self-check", "--expect-cuda"]) == 1
    assert calls == {"expect_cuda": True, "expect_tensorrt": False, "expect_preview_decoders": False}
    assert selfcheck.main(["--self-check", "--expect-cuda", "--expect-tensorrt"]) == 1
    assert calls["expect_tensorrt"] is True
    assert "MISSING  x: y" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# Lock verification
# ---------------------------------------------------------------------------


def test_verify_lock_reports_drift(tmp_path):
    runtime = tmp_path / "runtime.txt"
    runtime.write_text("fastapi==1.0.0 \\\n    --hash=sha256:aa\nPillow==12.0.0 \\\n    --hash=sha256:bb\n")
    gpu = tmp_path / "torch-gpu.txt"
    gpu.write_text("torch==2.14.1+cu132 \\\n    --hash=sha256:cc\ntorchvision==0.29.1+cu132\n")
    cpu = tmp_path / "torch-cpu.txt"
    cpu.write_text("torch==2.14.1+cpu\ntorchvision==0.29.1+cpu\n")

    installed = {"fastapi": "1.0.0", "pillow": "12.0.0", "torch": "2.14.1+cpu", "torchvision": "0.29.1+cpu"}
    assert selfcheck.verify_lock(str(runtime), [str(gpu), str(cpu)], installed.get) == []

    installed.update({"pillow": "11.0.0", "torchvision": "0.29.1+cu132"})
    problems = selfcheck.verify_lock(str(runtime), [str(gpu), str(cpu)], installed.get)
    assert any(p.startswith("pillow: locked 12.0.0, installed 11.0.0") for p in problems)
    assert any(p.startswith("torch stack:") for p in problems)


def test_verify_lock_checks_extra_locks_exactly(tmp_path):
    runtime = tmp_path / "runtime.txt"
    runtime.write_text("fastapi==1.0.0 \\\n    --hash=sha256:aa\n")
    trt = tmp_path / "tensorrt.txt"
    trt.write_text("torch-tensorrt==2.14.0+cu132 \\\n    --hash=sha256:dd\ntensorrt-cu13==11.1.0.106\n")
    installed = {"fastapi": "1.0.0", "torch-tensorrt": "2.14.0+cu132", "tensorrt-cu13": "11.1.0.106"}
    assert selfcheck.verify_lock(str(runtime), [], installed.get, extra_locks=[str(trt)]) == []
    installed.pop("tensorrt-cu13")
    problems = selfcheck.verify_lock(str(runtime), [], installed.get, extra_locks=[str(trt)])
    assert problems == ["tensorrt-cu13: locked 11.1.0.106, installed nothing"]


def test_real_locks_parse():
    for lock in LOCKS:
        pins = selfcheck.read_lock_pins(str(lock))
        assert "fastapi" in pins and "diffusers" in pins, lock.name
        assert all(re.match(r"^\d", version) for version in pins.values()), lock.name


def test_module_is_import_light():
    # main.spec imports selfcheck at build time; it must not drag torch in.
    source = (BACKEND / "selfcheck.py").read_text(encoding="utf-8")
    top_level_imports = re.findall(r"^(?:import|from) (\w+)", source, re.MULTILINE)
    assert set(top_level_imports) <= {"__future__", "argparse", "importlib", "os", "re",
                                      "subprocess", "sys", "dataclasses", "typing"}
    assert os.path.basename(selfcheck.__file__) == "selfcheck.py"
