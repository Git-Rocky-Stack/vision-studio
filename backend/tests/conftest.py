"""Pytest configuration and automatic test categorization for the backend suite.

Test tiers (the ``markers`` in ``pytest.ini``):

  unit         Fast, isolated logic - schemas, services in stub mode,
               sanitization, DB migrations, job manager, image ops, server
               config. No HTTP layer, no real model loading.
  integration  Exercises the FastAPI app / HTTP boundary through ``TestClient``
               (the ``test_*_api.py`` files).
  benchmark    Real diffusion weight loading. Lives in
               ``tests/benchmarks/`` and is excluded from default runs (see the
               ``addopts`` ``--ignore`` in ``pytest.ini``). This tier *is* the
               hardware / model-loading tier: no non-benchmark test loads real
               weights, so there is intentionally no separate ``hardware`` marker
               (it would have zero members).

Markers are applied automatically by file location in
``pytest_collection_modifyitems`` below, so contributors never have to remember
to decorate each test:

  * anything under ``tests/benchmarks``  -> benchmark
  * files named ``test_*_api.py``        -> integration
  * everything else under ``tests/``     -> unit

Run one tier:

    python -m pytest -m unit
    python -m pytest -m integration
    python -m pytest                    # unit + integration (benchmarks excluded)
    python -m pytest tests/benchmarks -o addopts="" --benchmark-only
"""
from __future__ import annotations

import atexit
import os
import shutil
import tempfile

import pytest

# Rate limiting is ON by default in every process (middleware/rate_limit.py has
# no test-runner heuristic any more). The suite drives many requests through
# one in-process TestClient whose peer address never changes, so every test
# would share a single per-minute bucket; switch limiting off explicitly here,
# BEFORE any test module imports the limiter. Tests that exercise limiting
# (test_rate_limit_api.py) enable it on their own app.
os.environ["VISION_STUDIO_DISABLE_RATE_LIMIT"] = "1"

# main.py persists job history to DATABASE_PATH (U5). Point it at a per-run
# scratch database BEFORE any test imports main, so the suite never writes job
# rows into a developer's real backend/data/vision_studio.db.
_TEST_DATA_DIR = tempfile.mkdtemp(prefix="vision-studio-tests-")
os.environ.setdefault("DATABASE_PATH", os.path.join(_TEST_DATA_DIR, "vision_studio.db"))
atexit.register(shutil.rmtree, _TEST_DATA_DIR, True)


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    """Tag every collected test with its tier marker based on file location."""
    for item in items:
        parts = item.path.parts
        if "benchmarks" in parts:
            item.add_marker(pytest.mark.benchmark)
        elif item.path.name.endswith("_api.py") or item.path.name.startswith("test_foundry_"):
            # Every test_foundry_* file drives the real app via TestClient (the
            # civitai download file does not use the _api.py suffix).
            item.add_marker(pytest.mark.integration)
        else:
            item.add_marker(pytest.mark.unit)


@pytest.fixture(autouse=True)
def _disable_backend_auth_for_integration(request):
    """Integration tests drive the real FastAPI app via TestClient without an
    auth token. The backend fails closed (a token is always configured) for
    production safety - see main and test_backend_auth.py - so disable
    enforcement for these tests rather than threading a token through every
    client. Unit tests are untouched and never import main.
    """
    if request.node.get_closest_marker("integration") is None:
        yield
        return

    import main  # already imported by the integration test module

    previous = main.BACKEND_AUTH_TOKEN
    main.BACKEND_AUTH_TOKEN = None
    try:
        yield
    finally:
        main.BACKEND_AUTH_TOKEN = previous
