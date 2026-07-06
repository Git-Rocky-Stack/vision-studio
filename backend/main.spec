# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for bundling Vision Studio Backend
Includes: FastAPI, PyTorch, CUDA, diffusers, transformers
"""

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import copy_metadata, collect_data_files, collect_submodules, collect_all

# Add the backend directory to path.
# PyInstaller executes spec files without defining __file__ in some versions.
backend_dir = os.path.abspath(os.getcwd())
sys.path.insert(0, backend_dir)

block_cipher = None

# Collect package metadata needed at runtime by importlib.metadata.version()
metadata_packages = [
    'imageio', 'imageio-ffmpeg', 'torch', 'torchvision', 'torchaudio',
    'transformers', 'diffusers', 'huggingface-hub', 'accelerate',
    'safetensors', 'pydantic', 'fastapi', 'uvicorn', 'numpy',
    'pillow', 'opencv-python', 'httpx', 'tqdm',
    'onnxruntime', 'spandrel', 'facexlib',
]
extra_datas = []
for pkg in metadata_packages:
    try:
        extra_datas += copy_metadata(pkg)
    except Exception:
        pass  # Package not installed, skip

# Collect ALL submodules, data files, and binaries for packages that use
# lazy/dynamic imports. collect_all is the most aggressive collection method
# and is required for diffusers/transformers which use __getattr__-based lazy
# loading that PyInstaller cannot detect through static analysis.
diffusers_all = collect_all('diffusers')
transformers_all = collect_all('transformers')
accelerate_all = collect_all('accelerate')
aiohttp_all = collect_all('aiohttp')

def categorize(collected, pkg_name):
    """Split collect_all output into hiddenimports, datas, binaries."""
    hidden = []
    datas_list = []
    bins = []
    for item in collected:
        if isinstance(item, tuple) and len(item) == 2:
            # (source_path, dest_path) = data file
            datas_list.append(item)
        elif isinstance(item, str):
            if item.endswith(('.dll', '.so', '.dylib', '.pyd')):
                bins.append(item)
            else:
                hidden.append(item)
    return hidden, datas_list, bins

diffusers_hidden, diffusers_datas, diffusers_bins = categorize(diffusers_all, 'diffusers')
transformers_hidden, transformers_datas, transformers_bins = categorize(transformers_all, 'transformers')
accelerate_hidden, _, accelerate_bins = categorize(accelerate_all, 'accelerate')
aiohttp_hidden, aiohttp_datas, aiohttp_bins = categorize(aiohttp_all, 'aiohttp')

all_hidden = list(set(
    diffusers_hidden + transformers_hidden + accelerate_hidden + aiohttp_hidden
))
all_datas = extra_datas + diffusers_datas + transformers_datas + aiohttp_datas
all_bins = list(set(diffusers_bins + transformers_bins + accelerate_bins + aiohttp_bins))

# Main script
a = Analysis(
    ['main.py'],
    pathex=[backend_dir],
    binaries=all_bins,
    datas=[
        # Include any data files
        ('.env.example', '.'),
        # Include db/migrations directory
        ('db/migrations', 'db/migrations'),
    ] + all_datas,
    hiddenimports=[
        # FastAPI & Uvicorn
        'fastapi',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'starlette',
        'pydantic',
        'pydantic.deprecated.decorator',

        # PyTorch
        'torch',
        'torchvision',
        'torchaudio',
        'torch.cuda',
        'torch.backends',
        'torch.backends.cuda',
        'torch.backends.cudnn',

        # Diffusers (lazy-loaded — collected via collect_submodules above)
        *all_hidden,

        # Other ML libraries
        'numpy',
        'PIL',
        'PIL.Image',
        'cv2',
        'safetensors',
        'huggingface_hub',

        # #34 real edit tools (u2net / Real-ESRGAN / GFPGAN stack)
        'onnxruntime',
        'spandrel',
        'facexlib',
        'facexlib.utils.face_restoration_helper',
        'facexlib.detection',
        'facexlib.parsing',

        # WebSocket
        'websockets',
        'websockets.legacy',
        'websockets.legacy.server',

        # aiohttp (required by ComfyUI client)
        'aiohttp',
        'aiohttp.web',
        'aiohttp.client',

        # Utils
        'python-dotenv',
        'aiofiles',
        'httpx',
        'tqdm',
        'imageio',
        'imageio_ffmpeg',

        # Python standard library modules that might be missed
        'email.mime.multipart',
        'email.mime.text',
        'email.mime.base',
        'email.mime.message',
        'email.mime.application',
        'email.mime.image',
        'email.mime.audio',
        'email.mime.nonmultipart',
        'email.mime.message',
        'colorsys',
        'decimal',
        'fractions',
        'typing_extensions',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary modules to reduce size
        'matplotlib',
        'tkinter',
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
        'wx',
        'wxPython',
        'pandas.tests',
        'numpy.random._examples',
        'scipy',
        'sklearn',
        'tensorflow',
        'tensorboard',
        'pytest',
        '_testcapi',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='VisionStudio-Backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='../build/icon.ico' if os.path.exists('../build/icon.ico') else None,
)
