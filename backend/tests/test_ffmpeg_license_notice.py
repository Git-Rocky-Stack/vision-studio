"""The bundled ffmpeg (GPL) ships with its license, exact build list and a
source offer that match the imageio-ffmpeg version the release locks."""
import json
import pathlib
import re

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
LICENSES_DIR = BACKEND_ROOT / "licenses"
NOTICE = (LICENSES_DIR / "FFMPEG-NOTICE.md").read_text(encoding="utf-8")
SHIPPED_PLATFORMS = ("windows-x86_64", "linux-x86_64", "macos-aarch64")


def _locked_imageio_ffmpeg_versions():
    versions = set()
    for lock in sorted((BACKEND_ROOT / "requirements").glob("runtime-*.txt")):
        match = re.search(r"^imageio-ffmpeg==([0-9][^\s\\]*)", lock.read_text(encoding="utf-8"), re.M)
        assert match, f"{lock.name} does not lock imageio-ffmpeg"
        versions.add(match.group(1))
    return versions


def test_gpl_text_is_the_canonical_gplv3():
    text = (LICENSES_DIR / "GPL-3.0.txt").read_text(encoding="utf-8")
    assert "GNU GENERAL PUBLIC LICENSE" in text and "Version 3, 29 June 2007" in text
    assert "END OF TERMS AND CONDITIONS" in text


def test_notice_names_the_locked_imageio_ffmpeg():
    versions = _locked_imageio_ffmpeg_versions()
    assert len(versions) == 1, f"platform locks disagree on imageio-ffmpeg: {versions}"
    assert f"imageio-ffmpeg {versions.pop()}" in NOTICE


def test_notice_covers_every_shipped_binary_with_its_source_tarball():
    definitions = pytest.importorskip("imageio_ffmpeg._definitions")
    for platform in SHIPPED_PLATFORMS:
        filename = definitions.FNAME_PER_PLATFORM[platform]
        assert filename in NOTICE, f"{platform} binary {filename} missing from the notice"
        version = re.search(r"-v(\d+(?:\.\d+)*)", filename).group(1)
        assert f"https://ffmpeg.org/releases/ffmpeg-{version}.tar.xz" in NOTICE


def test_notice_states_the_license_and_a_written_offer():
    assert "GPL-3.0-or-later" in NOTICE
    assert "Written offer" in NOTICE and "three years" in NOTICE


def test_runtime_licenses_list_ffmpeg_as_gpl():
    runtime = json.loads((BACKEND_ROOT / "foundry" / "runtime-licenses.json").read_text(encoding="utf-8"))
    ffmpeg = [dep for dep in runtime["python"] if dep["name"].startswith("FFmpeg")]
    assert ffmpeg and ffmpeg[0]["license"] == "GPL-3.0-or-later"
    assert "FFMPEG-NOTICE.md" in ffmpeg[0]["name"]
