"""Pytest configuration and automatic test categorization for the backend suite.

Test tiers (the ``markers`` in ``pytest.ini``):

  unit         Fast, isolated logic - schemas, services in stub mode,
               sanitization, DB migrations, job manager, image ops, server
               config. No HTTP layer, no real model loading.
  integration  Exercises the FastAPI app / HTTP boundary through ``TestClient``
               (the ``test_*_api.py`` files).
  benchmark    Real diffusion / ControlNet weight loading. Lives in
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

import pytest


def pytest_collection_modifyitems(
    config: pytest.Config, items: list[pytest.Item]
) -> None:
    """Tag every collected test with its tier marker based on file location."""
    for item in items:
        parts = item.path.parts
        if "benchmarks" in parts:
            item.add_marker(pytest.mark.benchmark)
        elif item.path.name.endswith("_api.py"):
            item.add_marker(pytest.mark.integration)
        else:
            item.add_marker(pytest.mark.unit)
