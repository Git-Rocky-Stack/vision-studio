# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the Vision Studio backend: a ONE-FOLDER bundle.

    dist/VisionStudio-Backend/
        VisionStudio-Backend[.exe]   the launcher Electron spawns
        _internal/                   Python, torch/CUDA, diffusers, data files

Why one-folder: a one-file executable unpacks its whole payload (multi-GB with
torch + CUDA) into a fresh temp directory on EVERY launch - slow starts, and a
hard kill (crash, Task Manager, power loss) leaks the extracted copy in %TEMP%
forever. One-folder runs in place. UPX stays off: it does not shrink CUDA
libraries meaningfully, slows every start, and trips antivirus heuristics.

What gets collected is NOT listed here: backend/selfcheck.py owns the module
list, the wholesale-collected packages, the bundled data files and the
excludes, and the same module runs inside the frozen bundle as
`VisionStudio-Backend --self-check` (build-backend.cjs fails the build when
it does not pass). Edit the lists there.

Build: python -m PyInstaller main.spec --clean --noconfirm   (cwd = backend/)
"""

import importlib.metadata
import os
import sys

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

# PyInstaller executes spec files without __file__; build-backend.cjs runs it
# from backend/.
backend_dir = os.path.abspath(os.getcwd())
sys.path.insert(0, backend_dir)

from selfcheck import (  # noqa: E402 - needs backend_dir on sys.path first
    BUNDLED_DATA,
    COLLECT_ALL_PACKAGES,
    MIGRATIONS_PACKAGE,
    NATIVE_EXTENSION_MODULES,
    REQUIRED_MODULES,
    SPEC_EXCLUDES,
    TENSORRT_COLLECT_ALL_PACKAGES,
    TENSORRT_MODULES,
    WINDOWS_VC_RUNTIME_DLLS,
    tensorrt_collection_enabled,
)

# ---------------------------------------------------------------------------
# Distribution metadata: ALL of it.
#
# transformers, diffusers, accelerate, peft and huggingface_hub decide what is
# available through importlib.metadata (transformers' import-time
# dependency_versions_check; diffusers' is_peft_available / is_*_available).
# A missing dist-info does not crash: it silently turns a feature off - which
# is how LoRA stacking (peft) and earlier generation itself went dark in frozen
# builds. The build venv holds exactly the locked set, so copying the metadata
# of every installed distribution is both complete and small (a few MB).
# ---------------------------------------------------------------------------
metadata_datas = []
for distribution_name in sorted(
    {
        dist.metadata["Name"]
        for dist in importlib.metadata.distributions()
        if dist.metadata and dist.metadata["Name"]
    }
):
    metadata_datas += copy_metadata(distribution_name)

# ---------------------------------------------------------------------------
# Wholesale collection for packages with lazy/dynamic imports, data files or
# bundled executables. collect_all returns (datas, binaries, hiddenimports).
# ---------------------------------------------------------------------------
collected_datas = []
collected_binaries = []
collected_hidden = []
for package in COLLECT_ALL_PACKAGES:
    package_datas, package_binaries, package_hidden = collect_all(package)
    collected_datas += package_datas
    collected_binaries += package_binaries
    collected_hidden += package_hidden

# ---------------------------------------------------------------------------
# TensorRT (CUDA builds on Windows/Linux): torch-tensorrt plus TensorRT's
# `tensorrt` shim, native bindings and runtime libraries. tensorrt_bindings
# loads the libraries in tensorrt_libs BY PATH, which no import analysis sees,
# so all four packages are collected wholesale - binaries, data and (through
# collect_all) their dist-info metadata. Skipped on macOS (no build exists)
# and in a CPU developer venv (not installed); `--self-check --expect-tensorrt`
# proves a CUDA bundle loads them.
# ---------------------------------------------------------------------------
tensorrt_hidden = []
if tensorrt_collection_enabled():
    for package in TENSORRT_COLLECT_ALL_PACKAGES:
        package_datas, package_binaries, package_hidden = collect_all(package)
        collected_datas += package_datas
        collected_binaries += package_binaries
        tensorrt_hidden += package_hidden
    tensorrt_hidden += list(TENSORRT_MODULES)

# db/migrate.py imports migrations by name; ship them as importable modules
# AND as files (the runner lists the directory - see BUNDLED_DATA).
migration_hidden = collect_submodules(MIGRATIONS_PACKAGE)

bundled_data = [(os.path.join(backend_dir, source), destination) for source, destination in BUNDLED_DATA]

# ---------------------------------------------------------------------------
# Windows: ship the Visual C++ runtime app-locally (see
# selfcheck.WINDOWS_VC_RUNTIME_DLLS). PyInstaller skips vcruntime140_threads.dll
# (torch's c10/torch_cpu need it) because it lives in System32 and is missing from
# PyInstaller's VC-runtime allow-list; a bundle without it starts on the build
# machine and nowhere else. A build machine without the current VC++ 2015-2022
# redistributable cannot produce a correct bundle, so that is a hard error.
# ---------------------------------------------------------------------------
vc_runtime_binaries = []
if sys.platform == 'win32':
    system32 = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32')
    for dll in WINDOWS_VC_RUNTIME_DLLS:
        dll_path = os.path.join(system32, dll)
        if not os.path.isfile(dll_path):
            raise SystemExit(
                f'{dll_path} is missing: install the latest Visual C++ 2015-2022 '
                'Redistributable (x64) on the build machine and rebuild.'
            )
        vc_runtime_binaries.append((dll_path, '.'))

a = Analysis(
    ['main.py'],
    pathex=[backend_dir],
    binaries=collected_binaries + vc_runtime_binaries,
    datas=bundled_data + metadata_datas + collected_datas,
    hiddenimports=sorted(
        set(REQUIRED_MODULES)
        | set(NATIVE_EXTENSION_MODULES)
        | set(collected_hidden)
        | set(migration_hidden)
        | set(tensorrt_hidden)
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=list(SPEC_EXCLUDES),
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='VisionStudio-Backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    # macOS: PyInstaller ad-hoc signs the binaries when codesign_identity is
    # None - required for the bundle to spawn at all on Apple Silicon.
    codesign_identity=None,
    entitlements_file=None,
    # .ico is Windows-only; macOS would need .icns and Linux ELF binaries
    # carry no icon. The backend is a headless child process either way.
    icon='../build/icon.ico' if sys.platform == 'win32' and os.path.exists('../build/icon.ico') else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='VisionStudio-Backend',
)
