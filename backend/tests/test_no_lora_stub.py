import importlib
import re
from pathlib import Path


def test_standalone_lora_route_is_gone():
    from main import app

    paths = {getattr(route, "path", "") for route in app.routes}
    assert not any(p.startswith("/api/v1/lora") for p in paths)


def test_peft_declared_in_requirements():
    # LoRA stacking needs peft in the shipped bundle: it must be a reviewed
    # runtime input AND a pinned entry of every platform's hash lock.
    requirements = Path(__file__).resolve().parents[1] / "requirements"
    assert "peft" in (requirements / "runtime.in").read_text().lower()
    locks = sorted(requirements.glob("runtime-*.txt"))
    assert locks, "no runtime locks found"
    for lock in locks:
        assert re.search(r"^peft==\d", lock.read_text(), re.MULTILINE), f"peft not pinned in {lock.name}"


def test_stub_modules_removed():
    for name in ("services.lora_service", "api.lora", "schemas.lora"):
        try:
            importlib.import_module(name)
            raise AssertionError(f"{name} should have been removed")
        except ModuleNotFoundError:
            pass
