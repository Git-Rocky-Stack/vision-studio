"""#34 installer PR1: committed provision-manifest.json artifact + drift guard."""
import json
import pathlib
import sys

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.provisioning import (  # noqa: E402
    CATALOG_PATH,
    MANIFEST_PATH,
    SCHEMA,
    load_provision_manifest,
)

COMMITTED = json.loads(pathlib.Path(MANIFEST_PATH).read_text(encoding="utf-8"))


def test_committed_manifest_matches_a_fresh_build():
    # Drift guard: regenerate with `python -m foundry.provisioning` after any
    # catalog / overrides change.
    assert COMMITTED == load_provision_manifest(), (
        "provision-manifest.json is stale - run `python -m foundry.provisioning`")


def test_manifest_schema_and_shape():
    assert COMMITTED["schema"] == SCHEMA
    assert isinstance(COMMITTED["auto_set"], list) and COMMITTED["auto_set"]
    assert isinstance(COMMITTED["excluded_non_commercial"], list)
    assert isinstance(COMMITTED["manual_only"], list)


def test_total_size_is_a_sane_comprehensive_bundle():
    gb = COMMITTED["total_approx_bytes"] / (1024 ** 3)
    assert 30 < gb < 200, f"auto-set total is {gb:.1f} GB"


def test_every_catalog_record_is_partitioned_with_no_silent_drops():
    catalog = json.loads(pathlib.Path(CATALOG_PATH).read_text(encoding="utf-8"))
    catalog_ids = {
        v["id"] for v in catalog.values()
        if isinstance(v, dict) and "id" in v
    }
    auto = {e["id"] for e in COMMITTED["auto_set"]}
    manual = {e["id"] for e in COMMITTED["manual_only"]}
    excluded = set(COMMITTED["excluded_non_commercial"])
    # Exactly one bucket per record; union covers the whole catalog.
    assert auto.isdisjoint(manual) and auto.isdisjoint(excluded)
    assert manual.isdisjoint(excluded)
    assert auto | manual | excluded == catalog_ids
