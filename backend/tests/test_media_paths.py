"""B6: renderer media paths resolve only inside the allowed roots."""
import os
import pathlib
import sys

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.media_paths import (  # noqa: E402
    MEDIA_ROOTS_ENV,
    MediaPathError,
    MediaPathPolicy,
    env_media_roots,
)


@pytest.fixture
def layout(tmp_path):
    outputs = tmp_path / "outputs"
    library = tmp_path / "library"
    elsewhere = tmp_path / "elsewhere"
    for folder in (outputs / "job", library, elsewhere):
        folder.mkdir(parents=True)
    (outputs / "job" / "a.png").write_bytes(b"x")
    (library / "b.png").write_bytes(b"x")
    (elsewhere / "secret.txt").write_text("nope")
    return tmp_path, outputs, library, elsewhere


def _norm(path) -> str:
    return str(pathlib.Path(path).resolve()).replace("\\", "/")


def test_outputs_url_resolves_under_outputs(layout):
    _root, outputs, _library, _elsewhere = layout
    policy = MediaPathPolicy(str(outputs), lambda: [])
    assert policy.resolve("/outputs/job/a.png") == _norm(outputs / "job" / "a.png")


def test_absolute_paths_inside_roots_are_allowed(layout):
    _root, outputs, library, _elsewhere = layout
    policy = MediaPathPolicy(str(outputs), lambda: [str(library)])
    assert policy.resolve(str(outputs / "job" / "a.png")) == _norm(outputs / "job" / "a.png")
    assert policy.resolve(str(library / "b.png")) == _norm(library / "b.png")
    # Windows separators and file:/// URLs normalize too.
    assert policy.resolve(str(library / "b.png").replace("/", "\\")) == _norm(library / "b.png")
    assert policy.resolve((library / "b.png").resolve().as_uri()) == _norm(library / "b.png")


@pytest.mark.parametrize("make_path", [
    lambda root, outputs: str(root / "elsewhere" / "secret.txt"),
    lambda root, outputs: "/outputs/../elsewhere/secret.txt",
    lambda root, outputs: "/outputs/job/../../elsewhere/secret.txt",
    lambda root, outputs: str(outputs / ".." / "elsewhere" / "secret.txt"),
    lambda root, outputs: "../elsewhere/secret.txt",
])
def test_paths_outside_every_root_are_rejected(layout, make_path):
    root, outputs, library, _elsewhere = layout
    policy = MediaPathPolicy(str(outputs), lambda: [str(library)])
    with pytest.raises(MediaPathError) as excinfo:
        policy.resolve(make_path(root, outputs))
    assert "secret" not in str(excinfo.value)  # never echoes the path


def test_sibling_prefix_is_not_inside(layout):
    root, outputs, _library, _elsewhere = layout
    sibling = root / "outputs-evil"
    sibling.mkdir()
    (sibling / "x.png").write_bytes(b"x")
    policy = MediaPathPolicy(str(outputs), lambda: [])
    with pytest.raises(MediaPathError):
        policy.resolve(str(sibling / "x.png"))


@pytest.mark.skipif(not hasattr(os, "symlink"), reason="no symlink support")
def test_symlink_escaping_a_root_is_rejected(layout):
    _root, outputs, _library, elsewhere = layout
    link = outputs / "link.txt"
    try:
        os.symlink(elsewhere / "secret.txt", link)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks not permitted for this user")
    policy = MediaPathPolicy(str(outputs), lambda: [])
    with pytest.raises(MediaPathError):
        policy.resolve(str(link))


@pytest.mark.parametrize("bad", ["", "   ", "a\x00b", None, 42])
def test_empty_or_invalid_input_is_rejected(layout, bad):
    _root, outputs, _library, _elsewhere = layout
    with pytest.raises(MediaPathError):
        MediaPathPolicy(str(outputs), lambda: []).resolve(bad)


def test_roots_are_read_live(layout):
    _root, outputs, library, _elsewhere = layout
    roots = []
    policy = MediaPathPolicy(lambda: str(outputs), lambda: roots)
    with pytest.raises(MediaPathError):
        policy.resolve(str(library / "b.png"))
    roots.append(str(library))
    assert policy.resolve(str(library / "b.png")) == _norm(library / "b.png")


def test_env_media_roots_parses_pathsep_list():
    env = {MEDIA_ROOTS_ENV: f" /a {os.pathsep}{os.pathsep}/b "}
    assert env_media_roots(env) == ["/a", "/b"]
    assert env_media_roots({}) == []
