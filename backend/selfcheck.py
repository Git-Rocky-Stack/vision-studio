"""Backend self-check: proves a build carries every runtime the product promises.

Run it three ways:

* ``VisionStudio-Backend --self-check`` - the frozen bundle checks itself
  (main.py hands off here before any server initialization). build-backend.cjs
  runs it right after PyInstaller and fails the build on a non-zero exit;
  scripts/assert-native-backend.cjs runs it again before packaging.
* ``python selfcheck.py`` - the same checks against a source venv (the
  pre-freeze gate in build-backend.cjs).
* ``python selfcheck.py --verify-lock <runtime lock> --torch-lock <lock>...`` -
  asserts the venv holds exactly the hash-locked versions.

This module is also the single source of truth for what main.spec collects:
the spec imports REQUIRED_MODULES, COLLECT_ALL_PACKAGES, BUNDLED_DATA and
SPEC_EXCLUDES from here, so the build and its check cannot drift apart.

It deliberately imports nothing heavy at module load (main.spec imports it at
build time) and prints plain ASCII (a frozen Windows console is cp1252).
"""

from __future__ import annotations

import argparse
import importlib
import importlib.metadata
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

# ---------------------------------------------------------------------------
# What the bundle must carry
# ---------------------------------------------------------------------------

#: Every module the backend imports - at module load or lazily inside a
#: function - that must exist in a release build. main.spec adds all of them
#: to hiddenimports. Submodules are listed where the backend imports them
#: directly or where a lazy loader hides them from PyInstaller's analysis.
REQUIRED_MODULES: Tuple[str, ...] = (
    # HTTP server (uvicorn picks its loop/protocol implementations by name).
    "fastapi",
    "starlette",
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "websockets",
    "pydantic",
    "slowapi",
    # Media
    "PIL.Image",
    "numpy",
    "cv2",
    "imageio",
    "imageio.v2",
    "imageio_ffmpeg",
    # Model management / networking
    "huggingface_hub",
    "safetensors",
    "safetensors.torch",
    "requests",
    "aiohttp",
    "aiofiles",
    "tqdm.auto",
    "psutil",
    # Generation stack
    "torch",
    "torchvision",
    "torchvision.ops",
    "diffusers",
    "diffusers.image_processor",
    "diffusers.models.attention_processor",
    "transformers",
    "accelerate",
    "peft",
    # ControlNet preprocessors (guided/preprocessors.py)
    "controlnet_aux",
    # Edit tools (#34): u2net background removal, Real-ESRGAN, GFPGAN
    "onnxruntime",
    "spandrel",
    "facexlib",
    "facexlib.utils.face_restoration_helper",
    "facexlib.detection",
    "facexlib.parsing",
    # Post-load weight quantization (foundry/accelerator.py)
    "optimum.quanto",
    # Local semantic retrieval (services/retrieval/embedder.py)
    "sentence_transformers",
    # The self-check itself (main.py imports it lazily on --self-check).
    "selfcheck",
    # First-party modules the server wires in at startup (static analysis finds
    # them too; importing them here proves they made it into the bundle).
    "utils.media_paths",
    "utils.log_redaction",
    "utils.timeutil",
    "utils.gpu_gate",
    "utils.job_store",
    "db.migrate",
)

#: Native extension libraries loaded by PATH (torch.ops.load_library), which
#: PyInstaller's analysis never sees. torchvision 0.29.x renamed its op
#: library to the stable-ABI ``_C_stable`` and the contrib hook still names
#: the old ``torchvision._C``, so without this entry the bundle ships no
#: torchvision ops: ``operator torchvision::nms does not exist`` then takes
#: down transformers' modeling stack and every diffusers pipeline with it (the
#: v3.4.0 failure, reproduced by a frozen test build of this branch). main.spec
#: adds them to hiddenimports so they land next to torchvision's modules; the
#: capability check below proves the ops registered.
NATIVE_EXTENSION_MODULES: Tuple[str, ...] = (
    "torchvision._C_stable",
    "torchvision.image_stable",
)

#: db/migrate.py imports each migration by name (``db.migrations.<file>``),
#: which no static analysis can see: main.spec collects the package with
#: collect_submodules AND ships the files as data (the runner lists the
#: directory), and the self-check imports every migration it finds.
MIGRATIONS_PACKAGE = "db.migrations"
MIGRATIONS_DIR = "db/migrations"

#: Modules the backend uses when present but that a release does not bundle.
#: (Empty since TensorRT became part of the CUDA builds - see below.)
OPTIONAL_MODULES: Tuple[str, ...] = ()

#: TensorRT ships with the CUDA flavour on Windows and Linux only
#: (build-backend.cjs installs requirements/tensorrt-<platform>-cu132.txt;
#: there is no macOS build, and the CPU developer flavour skips it).
#: ``tensorrt`` is the shim (tensorrt-cu13) that re-exports
#: ``tensorrt_bindings``; ``tensorrt_libs`` holds the runtime libraries the
#: bindings load by path - which no import analysis follows, so main.spec
#: collects all four packages wholesale (binaries, data and metadata) when
#: they are installed. A build that ships them is checked with
#: ``--expect-tensorrt``.
TENSORRT_PLATFORMS: Tuple[str, ...] = ("win32", "linux")
TENSORRT_MODULES: Tuple[str, ...] = ("tensorrt", "tensorrt_bindings", "tensorrt_libs", "torch_tensorrt")
TENSORRT_COLLECT_ALL_PACKAGES: Tuple[str, ...] = TENSORRT_MODULES
#: torch-tensorrt is built against one torch minor (2.14.0 requires
#: torch >= 2.14, < 2.15); a mismatched pair fails at engine build time.
TORCH_TENSORRT_TORCH_MINOR = "2.14"


def tensorrt_collection_enabled(
    platform: str = sys.platform,
    find_spec: Optional[Callable[[str], object]] = None,
) -> bool:
    """Should main.spec collect TensorRT? Only on Windows/Linux, and only
    when the build venv actually has it (the CPU developer flavour does not)."""
    if platform not in TENSORRT_PLATFORMS:
        return False
    if find_spec is None:
        import importlib.util

        find_spec = importlib.util.find_spec
    try:
        return all(find_spec(name) is not None for name in TENSORRT_MODULES)
    except (ImportError, ValueError):
        return False

#: Packages main.spec collects wholesale with collect_all (submodules, data
#: files, binaries): lazy ``__getattr__`` loaders, registries populated by
#: dynamic import, bundled model configs/vocab files, and bundled executables
#: (imageio_ffmpeg's ffmpeg). torch, numpy, scipy, scikit-learn, scikit-image,
#: numba/llvmlite, cv2 and PIL are covered by PyInstaller's own hooks.
COLLECT_ALL_PACKAGES: Tuple[str, ...] = (
    "diffusers",
    "transformers",
    "accelerate",
    "peft",
    "aiohttp",
    "huggingface_hub",
    "tokenizers",
    "safetensors",
    "controlnet_aux",
    "timm",
    "facexlib",
    "spandrel",
    "onnxruntime",
    "optimum.quanto",
    "sentence_transformers",
    "imageio_ffmpeg",
)

#: Attributes resolved through lazy loaders. Importing the package is not
#: enough: diffusers/transformers import their pipelines on first attribute
#: access, which is exactly where a frozen build with missing submodules
#: fails. Every class name the backend resolves by string must be here
#: (tests/test_selfcheck.py enforces it).
LAZY_ATTRIBUTES: Tuple[Tuple[str, str], ...] = tuple(
    ("diffusers", name)
    for name in (
        "AnimateDiffPipeline",
        "AutoPipelineForImage2Image",
        "AutoPipelineForInpainting",
        "AutoPipelineForText2Image",
        "AutoencoderTiny",
        "ControlNetModel",
        "ControlNetUnionModel",
        "DDIMScheduler",
        "DPMSolverMultistepScheduler",
        "EulerAncestralDiscreteScheduler",
        "EulerDiscreteScheduler",
        "FluxControlNetImg2ImgPipeline",
        "FluxControlNetModel",
        "FluxControlNetPipeline",
        "FluxFillPipeline",
        "FluxImg2ImgPipeline",
        "FluxMultiControlNetModel",
        "FluxPipeline",
        "LTXPipeline",
        "MotionAdapter",
        "SD3ControlNetModel",
        "SD3MultiControlNetModel",
        "StableDiffusion3ControlNetPipeline",
        "StableDiffusion3Pipeline",
        "StableDiffusionControlNetPipeline",
        "StableDiffusionImg2ImgPipeline",
        "StableDiffusionInpaintPipeline",
        "StableDiffusionPipeline",
        "StableDiffusionXLControlNetUnionImg2ImgPipeline",
        "StableDiffusionXLControlNetUnionInpaintPipeline",
        "StableDiffusionXLControlNetUnionPipeline",
        "StableDiffusionXLImg2ImgPipeline",
        "StableDiffusionXLPipeline",
        "StableVideoDiffusionPipeline",
        "UniPCMultistepScheduler",
    )
) + (
    ("diffusers.image_processor", "IPAdapterMaskProcessor"),
    ("transformers", "CLIPVisionModelWithProjection"),
    ("controlnet_aux", "MidasDetector"),
    ("controlnet_aux", "NormalBaeDetector"),
    ("controlnet_aux", "OpenposeDetector"),
    ("spandrel", "ModelLoader"),
    ("facexlib.utils.face_restoration_helper", "FaceRestoreHelper"),
    ("optimum.quanto", "quantize"),
    ("optimum.quanto", "freeze"),
    ("optimum.quanto", "qint8"),
    ("optimum.quanto", "qfloat8"),
    ("sentence_transformers", "SentenceTransformer"),
)

#: Backend data files the frozen app reads relative to its own modules,
#: as (source path relative to backend/, destination dir inside the bundle).
#: Explicit entries (no globs): a moved or renamed file fails the build.
BUNDLED_DATA: Tuple[Tuple[str, str], ...] = (
    ("db/migrations", "db/migrations"),
    ("foundry/verified-catalog.json", "foundry"),
    ("foundry/provision-manifest.json", "foundry"),
    ("foundry/provision-overrides.json", "foundry"),
    ("foundry/license-texts.json", "foundry"),
    ("foundry/runtime-licenses.json", "foundry"),
    ("services/retrieval/prompting_kb", "services/retrieval/prompting_kb"),
    # The bundled ffmpeg (imageio-ffmpeg) is GPL-3.0-or-later: its notice,
    # corresponding-source offer and the license text travel with every copy.
    ("licenses/FFMPEG-NOTICE.md", "licenses"),
    ("licenses/GPL-3.0.txt", "licenses"),
)

#: Modules main.spec excludes. None of them may be a runtime dependency:
#: scipy and scikit-learn used to sit here although controlnet-aux, facexlib
#: and sentence-transformers import them, which silently disabled ControlNet
#: preprocessing, face restoration and semantic retrieval in frozen builds.
#: tests/test_selfcheck.py fails if any of these appears in a runtime lock.
SPEC_EXCLUDES: Tuple[str, ...] = (
    "tkinter",
    "PyQt5",
    "PyQt6",
    "PySide2",
    "PySide6",
    "wx",
    "tensorflow",
    "tensorboard",
    "pytest",
    "_testcapi",
    "IPython",
    "jupyter",
    "notebook",
)

#: Windows: the Visual C++ 2015-2022 runtime DLLs the bundled native code
#: imports (scanned from torch/lib, torchvision, onnxruntime, numba/llvmlite,
#: scikit-learn, scikit-image, tokenizers, safetensors). PyInstaller collects
#: most of these from System32 itself, but its allow-list predates
#: vcruntime140_threads.dll (imported by torch's c10/torch_cpu), which it
#: therefore silently skips: the bundle then loads on the build machine and
#: fails on any PC without a current VC++ redistributable. main.spec ships the
#: whole set app-locally (Microsoft permits local deployment of these files),
#: and the frozen self-check confirms every one is inside the bundle.
WINDOWS_VC_RUNTIME_DLLS: Tuple[str, ...] = (
    "msvcp140.dll",
    "msvcp140_1.dll",
    "vcomp140.dll",
    "vcruntime140.dll",
    "vcruntime140_1.dll",
    "vcruntime140_threads.dll",
)

FFMPEG_TIMEOUT_SECONDS = 60

# ---------------------------------------------------------------------------
# Check machinery
# ---------------------------------------------------------------------------

Importer = Callable[[str], object]
Runner = Callable[..., "subprocess.CompletedProcess[bytes]"]


@dataclass
class CheckReport:
    """Outcome of one self-check run."""

    passed: List[str] = field(default_factory=list)
    failed: List[Tuple[str, str]] = field(default_factory=list)
    warnings: List[Tuple[str, str]] = field(default_factory=list)

    def ok(self, name: str) -> None:
        self.passed.append(name)

    def fail(self, name: str, reason: str) -> None:
        self.failed.append((name, reason))

    def warn(self, name: str, reason: str) -> None:
        self.warnings.append((name, reason))

    @property
    def exit_code(self) -> int:
        return 1 if self.failed else 0

    def render(self) -> str:
        lines = [f"ok       {name}" for name in self.passed]
        lines += [f"WARNING  {name}: {reason}" for name, reason in self.warnings]
        lines += [f"MISSING  {name}: {reason}" for name, reason in self.failed]
        verdict = (
            f"SELF-CHECK FAILED: {len(self.failed)} problem(s)"
            if self.failed
            else f"SELF-CHECK PASSED ({len(self.passed)} checks)"
        )
        return "\n".join(lines + [verdict])


def _describe(exc: BaseException) -> str:
    text = f"{type(exc).__name__}: {exc}"
    text = " ".join(text.split())
    return text if len(text) <= 400 else text[:397] + "..."


def _backend_root() -> str:
    """Where bundled data lives: sys._MEIPASS when frozen, else this directory."""
    frozen_root = getattr(sys, "_MEIPASS", None)
    return frozen_root or os.path.dirname(os.path.abspath(__file__))


def check_modules(report: CheckReport, importer: Importer, modules: Iterable[str]) -> None:
    for name in modules:
        try:
            importer(name)
        except BaseException as exc:  # noqa: BLE001 - any import failure is a finding
            if isinstance(exc, KeyboardInterrupt):
                raise
            report.fail(name, _describe(exc))
        else:
            report.ok(name)


def check_optional_modules(report: CheckReport, importer: Importer, modules: Iterable[str]) -> None:
    for name in modules:
        try:
            importer(name)
        except BaseException as exc:  # noqa: BLE001
            if isinstance(exc, KeyboardInterrupt):
                raise
            report.warn(name, f"not bundled ({_describe(exc)})")
        else:
            report.ok(name)


def check_lazy_attributes(
    report: CheckReport, importer: Importer, attributes: Iterable[Tuple[str, str]]
) -> None:
    for module_name, attribute in attributes:
        label = f"{module_name}.{attribute}"
        try:
            module = importer(module_name)
            getattr(module, attribute)
        except BaseException as exc:  # noqa: BLE001
            if isinstance(exc, KeyboardInterrupt):
                raise
            report.fail(label, _describe(exc))
        else:
            report.ok(label)


def check_capabilities(report: CheckReport, importer: Importer, expect_cuda: bool) -> None:
    """Integration facts an import alone does not prove."""

    def capability(label: str, probe: Callable[[], Optional[str]]) -> None:
        try:
            problem = probe()
        except BaseException as exc:  # noqa: BLE001
            if isinstance(exc, KeyboardInterrupt):
                raise
            report.fail(label, _describe(exc))
            return
        if problem:
            report.fail(label, problem)
        else:
            report.ok(label)

    def torchvision_ops() -> Optional[str]:
        # The v3.4.0 failure: a torchvision built for a different torch
        # registers no C++ ops, and diffusers dies on import much later.
        torch = importer("torch")
        importer("torchvision")
        ops = getattr(torch.ops, "torchvision")
        getattr(ops, "nms")
        return None

    def peft_visible_to_diffusers() -> Optional[str]:
        # diffusers detects peft through importlib.metadata; without the
        # dist-info in the bundle, LoRA stacking silently turns off.
        utils = importer("diffusers.utils")
        return None if utils.is_peft_available() else "diffusers cannot see peft (missing metadata)"

    def torch_visible_to_transformers() -> Optional[str]:
        utils = importer("transformers.utils")
        return None if utils.is_torch_available() else "transformers cannot see torch (missing metadata)"

    def cuda_build() -> Optional[str]:
        torch = importer("torch")
        cuda = getattr(getattr(torch, "version", None), "cuda", None)
        return None if cuda else "torch is a CPU-only build; the release must ship the CUDA build"

    capability("torchvision C++ ops (torch.ops.torchvision.nms)", torchvision_ops)
    capability("diffusers sees peft", peft_visible_to_diffusers)
    capability("transformers sees torch", torch_visible_to_transformers)
    if expect_cuda:
        capability("torch CUDA build", cuda_build)


#: torch-tensorrt's native C++ runtime, loaded from <package>/lib/ by path.
TORCH_TENSORRT_RUNTIME_LIBRARIES: Tuple[str, ...] = ("torchtrt.dll", "libtorchtrt.so")


def _default_cuda_available(importer: Importer) -> bool:
    try:
        return bool(importer("torch").cuda.is_available())
    except BaseException as exc:  # noqa: BLE001
        if isinstance(exc, KeyboardInterrupt):
            raise
        return False


def _default_package_dir(name: str) -> Optional[str]:
    import importlib.util

    spec = importlib.util.find_spec(name)
    locations = list(getattr(spec, "submodule_search_locations", None) or []) if spec else []
    return locations[0] if locations else None


def check_tensorrt(
    report: CheckReport,
    importer: Importer,
    cuda_available: Optional[Callable[[], bool]] = None,
    package_dir: Optional[Callable[[str], Optional[str]]] = None,
    version_of: Optional[Callable[[str], Optional[str]]] = None,
) -> None:
    """A build that ships TensorRT must be able to load it.

    Importing ``tensorrt`` loads the native bindings, which in turn load the
    TensorRT runtime libraries from ``tensorrt_libs`` by path - so a bundle
    that collected the Python files but not the libraries fails right here,
    not on a user's machine; that import needs no GPU.

    ``torch_tensorrt`` is different: its import queries the CUDA device
    (torch.cuda.get_device_properties), so it raises "Found no NVIDIA driver"
    on a machine without one - every CI build runner, and every CPU-only user
    (the backend only imports it when building an engine on a GPU). Without a
    CUDA device the check therefore proves what an import would: the package,
    its compiled extension and its native runtime library are in the build,
    and its distribution metadata names the right version. With a device it
    imports the package for real.
    """
    check_modules(report, importer, ("tensorrt", "tensorrt_bindings", "tensorrt_libs"))
    version_of = version_of or _installed_version
    package_dir = package_dir or _default_package_dir
    probe_cuda = cuda_available or (lambda: _default_cuda_available(importer))

    label = "torch_tensorrt"
    if probe_cuda():
        check_modules(report, importer, ("torch_tensorrt",))
    else:
        root = package_dir("torch_tensorrt")
        if not root or not os.path.isdir(root):
            report.fail(label, "package not found in this build")
        else:
            has_extension = any(name.startswith("_C.") for name in os.listdir(root))
            lib_dir = os.path.join(root, "lib")
            has_runtime = os.path.isdir(lib_dir) and any(
                name in TORCH_TENSORRT_RUNTIME_LIBRARIES for name in os.listdir(lib_dir))
            if has_extension and has_runtime:
                report.ok(f"{label} (files; import needs a CUDA device)")
                report.warn(label, "import skipped: no CUDA device on this machine "
                            "(torch-tensorrt initializes CUDA at import)")
            else:
                missing = [what for what, ok in (("_C extension", has_extension),
                                                 ("lib/ runtime library", has_runtime)) if not ok]
                report.fail(label, f"incomplete in this build: missing {', '.join(missing)}")

    label = "torch-tensorrt matches torch"
    try:
        torch_version = str(importer("torch").__version__)
    except BaseException as exc:  # noqa: BLE001
        if isinstance(exc, KeyboardInterrupt):
            raise
        report.fail(label, _describe(exc))
        return
    trt_version = version_of("torch-tensorrt") or "nothing"
    minor = TORCH_TENSORRT_TORCH_MINOR
    if torch_version.startswith(minor + ".") and trt_version.startswith(minor + "."):
        report.ok(label)
    else:
        report.fail(label, f"torch {torch_version} with torch-tensorrt {trt_version}; both must be {minor}.x")


def check_ffmpeg(report: CheckReport, importer: Importer, run: Runner) -> None:
    label = "ffmpeg binary (imageio_ffmpeg)"
    try:
        exe = importer("imageio_ffmpeg").get_ffmpeg_exe()
    except BaseException as exc:  # noqa: BLE001
        if isinstance(exc, KeyboardInterrupt):
            raise
        report.fail(label, _describe(exc))
        return
    if not exe or not os.path.isfile(exe):
        report.fail(label, f"not found at {exe!r}")
        return
    try:
        completed = run(
            [exe, "-hide_banner", "-version"],
            capture_output=True,
            timeout=FFMPEG_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        report.fail(label, f"{exe} did not run: {_describe(exc)}")
        return
    if completed.returncode != 0:
        report.fail(label, f"{exe} -version exited {completed.returncode}")
        return
    report.ok(label)


def check_bundled_data(report: CheckReport, root: str, data: Iterable[Tuple[str, str]]) -> None:
    for source, destination in data:
        # Frozen: the file sits at <_MEIPASS>/<destination>/<basename>; a
        # directory entry maps onto <destination> itself.
        candidates = [
            os.path.join(root, source),
            os.path.join(root, destination, os.path.basename(source)),
        ]
        if any(os.path.exists(path) for path in candidates):
            report.ok(f"data {source}")
        else:
            report.fail(f"data {source}", f"not found under {root}")


def check_vc_runtime(report: CheckReport, root: str, platform: str, frozen: bool) -> None:
    """Frozen Windows bundles must carry the VC++ runtime themselves.

    Imports alone cannot prove this on the build machine, where System32
    already has the DLLs; only their presence inside the bundle does.
    """
    if platform != "win32" or not frozen:
        return
    for dll in WINDOWS_VC_RUNTIME_DLLS:
        if os.path.isfile(os.path.join(root, dll)):
            report.ok(f"bundled {dll}")
        else:
            report.fail(f"bundled {dll}", f"not in {root}; PCs without the VC++ redistributable cannot start")


def migration_module_names(root: str) -> List[str]:
    """``db.migrations.<name>`` for every migration file the bundle carries."""
    directory = os.path.join(root, MIGRATIONS_DIR)
    if not os.path.isdir(directory):
        return []
    return sorted(
        f"{MIGRATIONS_PACKAGE}.{filename[:-3]}"
        for filename in os.listdir(directory)
        if filename.endswith(".py") and filename[:1].isdigit()
    )


def check_migrations(report: CheckReport, importer: Importer, root: str) -> None:
    names = migration_module_names(root)
    if not names:
        report.fail("db migrations", f"no migration files under {os.path.join(root, MIGRATIONS_DIR)}")
        return
    for name in names:
        try:
            module = importer(name)
            if not callable(getattr(module, "migrate_up", None)):
                raise AttributeError("no migrate_up(conn)")
        except BaseException as exc:  # noqa: BLE001
            if isinstance(exc, KeyboardInterrupt):
                raise
            report.fail(name, _describe(exc))
        else:
            report.ok(name)


def check_preview_decoders(report: CheckReport, importer: Importer) -> None:
    label = "preview decoders (taesd family)"
    try:
        decoders = importer("preview.decoders")
        root = decoders.resolve_decoders_dir()
    except BaseException as exc:  # noqa: BLE001
        if isinstance(exc, KeyboardInterrupt):
            raise
        report.fail(label, _describe(exc))
        return
    if not root:
        report.fail(label, "the backend cannot locate the preview-decoders directory")
        return
    missing = [
        name
        for name in sorted(set(decoders.FAMILY_DECODERS.values()))
        if not os.path.isfile(os.path.join(root, name, "diffusion_pytorch_model.safetensors"))
    ]
    if missing:
        report.fail(label, f"missing under {root}: {', '.join(missing)}")
    else:
        report.ok(label)


def run_self_check(
    *,
    expect_cuda: bool = False,
    expect_tensorrt: bool = False,
    expect_preview_decoders: bool = False,
    importer: Importer = importlib.import_module,
    run: Runner = subprocess.run,
    required: Sequence[str] = REQUIRED_MODULES,
    optional: Sequence[str] = OPTIONAL_MODULES,
    attributes: Sequence[Tuple[str, str]] = LAZY_ATTRIBUTES,
    data: Sequence[Tuple[str, str]] = BUNDLED_DATA,
    data_root: Optional[str] = None,
) -> CheckReport:
    """Run every check and return the report (callers print it and exit)."""
    if sys.platform == "darwin":
        # Same as main.py: must be set before torch is first imported.
        os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

    report = CheckReport()
    check_modules(report, importer, required)
    check_optional_modules(report, importer, optional)
    check_lazy_attributes(report, importer, attributes)
    check_capabilities(report, importer, expect_cuda)
    if expect_tensorrt:
        check_tensorrt(report, importer)
    check_ffmpeg(report, importer, run)
    root = data_root or _backend_root()
    check_bundled_data(report, root, data)
    check_migrations(report, importer, root)
    check_vc_runtime(report, root, sys.platform, bool(getattr(sys, "frozen", False)))
    if expect_preview_decoders:
        check_preview_decoders(report, importer)
    return report


# ---------------------------------------------------------------------------
# Lock verification (build-backend.cjs, before freezing)
# ---------------------------------------------------------------------------

_PIN = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?==([^\s;\\]+)")


def normalize_name(name: str) -> str:
    """PEP 503 normalized distribution name."""
    return re.sub(r"[-_.]+", "-", name).lower()


def read_lock_pins(path: str) -> Dict[str, str]:
    pins: Dict[str, str] = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            match = _PIN.match(line.strip())
            if match:
                pins[normalize_name(match.group(1))] = match.group(2)
    return pins


def _installed_version(name: str) -> Optional[str]:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def verify_lock(
    runtime_lock: str,
    torch_locks: Sequence[str],
    version_of: Callable[[str], Optional[str]] = _installed_version,
    extra_locks: Sequence[str] = (),
) -> List[str]:
    """Return mismatches between the environment and the locks (empty = exact).

    ``runtime_lock`` and every ``extra_locks`` entry must match exactly; the
    venv must match ONE of ``torch_locks`` (the GPU or the CPU flavour).
    """
    problems: List[str] = []
    for lock in (runtime_lock, *extra_locks):
        for name, wanted in sorted(read_lock_pins(lock).items()):
            have = version_of(name)
            if have != wanted:
                problems.append(f"{name}: locked {wanted}, installed {have or 'nothing'}")

    torch_sets = [read_lock_pins(path) for path in torch_locks]
    if torch_sets:
        installed = {name: version_of(name) for name in torch_sets[0]}
        if not any(all(installed.get(n) == v for n, v in pins.items()) for pins in torch_sets):
            allowed = " | ".join(
                ", ".join(f"{n}=={v}" for n, v in sorted(pins.items())) for pins in torch_sets
            )
            have = ", ".join(f"{n}=={v or 'nothing'}" for n, v in sorted(installed.items()))
            problems.append(f"torch stack: installed {have}; locked {allowed}")
    return problems


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args(argv: Optional[Sequence[str]]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="selfcheck",
        description="Verify a Vision Studio backend build carries every runtime it ships.",
    )
    # Accepted (and ignored) so the frozen entry point can pass its argv as-is.
    parser.add_argument("--self-check", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--expect-cuda", action="store_true", help="fail unless torch is a CUDA build")
    parser.add_argument(
        "--expect-tensorrt",
        action="store_true",
        help="fail unless torch-tensorrt and the TensorRT runtime load (CUDA builds on Windows/Linux)",
    )
    parser.add_argument(
        "--expect-preview-decoders",
        action="store_true",
        help="fail unless the step-preview decoders resolve (packaged layout)",
    )
    parser.add_argument("--verify-lock", metavar="RUNTIME_LOCK", help="compare installed versions to a lock")
    parser.add_argument("--torch-lock", action="append", default=[], metavar="TORCH_LOCK")
    parser.add_argument(
        "--extra-lock",
        action="append",
        default=[],
        metavar="LOCK",
        help="another lock the venv must match exactly (the TensorRT lock)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(sys.argv[1:] if argv is None else argv)

    if args.verify_lock:
        problems = verify_lock(args.verify_lock, args.torch_lock, extra_locks=args.extra_lock)
        for problem in problems:
            sys.stdout.write(f"LOCK MISMATCH  {problem}\n")
        sys.stdout.write("LOCK VERIFIED\n" if not problems else f"{len(problems)} lock mismatch(es)\n")
        sys.stdout.flush()
        return 1 if problems else 0

    report = run_self_check(
        expect_cuda=args.expect_cuda,
        expect_tensorrt=args.expect_tensorrt,
        expect_preview_decoders=args.expect_preview_decoders,
    )
    sys.stdout.write(report.render() + "\n")
    sys.stdout.flush()
    return report.exit_code


if __name__ == "__main__":
    sys.exit(main())
