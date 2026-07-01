import importlib
from pathlib import Path


def test_standalone_lora_route_is_gone():
    from main import app

    paths = {getattr(route, "path", "") for route in app.routes}
    assert not any(p.startswith("/api/v1/lora") for p in paths)


def test_peft_declared_in_requirements():
    req = Path(__file__).resolve().parents[1] / "requirements.txt"
    assert "peft" in req.read_text().lower()


def test_stub_modules_removed():
    for name in ("services.lora_service", "api.lora", "schemas.lora"):
        try:
            importlib.import_module(name)
            raise AssertionError(f"{name} should have been removed")
        except ModuleNotFoundError:
            pass
