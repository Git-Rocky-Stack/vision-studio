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
]
extra_datas = []
for pkg in metadata_packages:
    try:
        extra_datas += copy_metadata(pkg)
    except Exception:
        pass  # Package not installed, skip

# Collect ALL submodules for packages that use lazy/dynamic imports.
# diffusers, transformers, and accelerate all use __getattr__-based lazy loading
# that PyInstaller cannot detect through static analysis.
diffusers_hidden = collect_submodules('diffusers')
transformers_hidden = collect_submodules('transformers')
accelerate_hidden = collect_submodules('accelerate')

# Collect data files (model configs, tokenizers, etc.) that these packages need at runtime
diffusers_datas = collect_data_files('diffusers')
transformers_datas = collect_data_files('transformers')

all_hidden = list(set(
    diffusers_hidden + transformers_hidden + accelerate_hidden
))

# Main script
a = Analysis(
    ['main.py'],
    pathex=[backend_dir],
    binaries=[],
    datas=[
        # Include any data files
        ('.env.example', '.'),
        # Include db/migrations directory
        ('db/migrations', 'db/migrations'),
    ] + extra_datas + diffusers_datas + transformers_datas,
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

        # WebSocket
        'websockets',
        'websockets.legacy',
        'websockets.legacy.server',

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
