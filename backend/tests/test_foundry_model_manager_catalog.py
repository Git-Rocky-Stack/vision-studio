import json
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.model_manager import PREDEFINED_MODELS, ModelInfo  # type: ignore[import-not-found]

CATALOG_PATH = BACKEND_ROOT / "foundry" / "verified-catalog.json"


class FoundryModelManagerCatalogTests(unittest.TestCase):
    def test_predefined_models_are_loaded_from_the_catalog(self):
        with open(CATALOG_PATH, "r", encoding="utf-8") as handle:
            catalog = json.load(handle)

        # Single source of truth: PREDEFINED_MODELS ids exactly match the catalog.
        assert set(PREDEFINED_MODELS.keys()) == set(catalog.keys())

    def test_predefined_entries_preserve_download_coordinates(self):
        # The download path depends on repo_id (and for diffusers, the bundle id).
        flux = PREDEFINED_MODELS["flux-dev"]
        assert isinstance(flux, ModelInfo)
        assert flux.repo_id == "black-forest-labs/FLUX.1-dev"
        animatediff = PREDEFINED_MODELS["animatediff"]
        assert animatediff.aux_repo_id == "guoyww/animatediff-motion-adapter-v1-5-2"

    def test_single_file_models_keep_their_filenames_and_diffusers_do_not(self):
        # flux-dev is single-file -> needs a filename for hf_hub_download.
        assert PREDEFINED_MODELS["flux-dev"].filename == "flux1-dev.safetensors"
        # ltx-video is a diffusers bundle -> no single filename.
        assert PREDEFINED_MODELS["ltx-video"].filename is None
        # type mapping preserved: diffusers bundles keep legacy type "diffusers".
        assert PREDEFINED_MODELS["ltx-video"].type == "diffusers"
        assert PREDEFINED_MODELS["animatediff"].type == "diffusers"
        assert PREDEFINED_MODELS["flux-dev"].type == "checkpoint"
        assert PREDEFINED_MODELS["sdxl-vae"].type == "vae"


if __name__ == "__main__":
    unittest.main()
