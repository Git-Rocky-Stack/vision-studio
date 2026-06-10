import json
import os
import pathlib
import sys
import tempfile
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.safetensors_header import (  # type: ignore[import-not-found]
    HeaderError,
    classify_safetensors,
    detect_diffusers_dir,
    read_safetensors_header,
)
from tests.foundry_fixtures import (
    CHECKPOINT_TENSORS,
    CONTROLNET_TENSORS,
    LORA_TENSORS,
    VAE_TENSORS,
    make_safetensors,
)


class HeaderReadTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-header-")

    def tearDown(self):
        import shutil

        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_reads_header_of_crafted_file(self):
        path = make_safetensors(os.path.join(self.tmp, "a.safetensors"), LORA_TENSORS)
        header = read_safetensors_header(path)
        self.assertIn("lora_unet_down_blocks_0_attentions_0.lora_down.weight", header)

    def test_metadata_block_preserved(self):
        path = make_safetensors(
            os.path.join(self.tmp, "b.safetensors"), CHECKPOINT_TENSORS, {"format": "pt"}
        )
        self.assertEqual(read_safetensors_header(path)["__metadata__"], {"format": "pt"})

    def test_implausible_header_length_raises_typed_error(self):
        path = os.path.join(self.tmp, "not-safetensors.safetensors")
        with open(path, "wb") as handle:
            handle.write(b"\xff" * 64)  # length prefix decodes to an absurd number
        with self.assertRaises(HeaderError):
            read_safetensors_header(path)

    def test_truncated_file_raises_typed_error(self):
        path = os.path.join(self.tmp, "tiny.safetensors")
        with open(path, "wb") as handle:
            handle.write(b"\x01")
        with self.assertRaises(HeaderError):
            read_safetensors_header(path)

    def test_non_dict_json_header_raises_typed_error(self):
        import struct

        body = json.dumps([1, 2, 3]).encode("utf-8")
        path = os.path.join(self.tmp, "list-header.safetensors")
        with open(path, "wb") as handle:
            handle.write(struct.pack("<Q", len(body)))
            handle.write(body)
        with self.assertRaises(HeaderError):
            read_safetensors_header(path)

    def test_non_utf8_header_raises_typed_error(self):
        import struct

        body = b"\xff\xfe\xfd\xfc"
        path = os.path.join(self.tmp, "binary-header.safetensors")
        with open(path, "wb") as handle:
            handle.write(struct.pack("<Q", len(body)))
            handle.write(body)
        with self.assertRaises(HeaderError):
            read_safetensors_header(path)


class ClassifyTests(unittest.TestCase):
    def _header(self, tensors):
        return {name: {"dtype": "F16", "shape": s, "data_offsets": [0, 2]} for name, s in tensors.items()}

    def test_table_driven_classification(self):
        cases = [
            (CHECKPOINT_TENSORS, "checkpoint"),
            (LORA_TENSORS, "lora"),
            ({"lora_te_text_model_encoder_layers_0.lora_up.weight": [4, 4]}, "lora"),
            (VAE_TENSORS, "vae"),
            (CONTROLNET_TENSORS, "controlnet"),
            ({"some.unrecognized.tensor": [4]}, "unknown"),
        ]
        for tensors, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(classify_safetensors(self._header(tensors)), expected)

    def test_header_trumps_folder_metadata_key_ignored(self):
        header = self._header(LORA_TENSORS)
        header["__metadata__"] = {"format": "pt"}
        self.assertEqual(classify_safetensors(header), "lora")


class DiffusersDirTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="foundry-diffusers-")

    def tearDown(self):
        import shutil

        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_model_index_json_marks_diffusers_dir(self):
        with open(os.path.join(self.tmp, "model_index.json"), "w", encoding="utf-8") as handle:
            json.dump({"_class_name": "StableDiffusionPipeline"}, handle)
        self.assertTrue(detect_diffusers_dir(self.tmp))

    def test_plain_dir_is_not_diffusers(self):
        self.assertFalse(detect_diffusers_dir(self.tmp))


if __name__ == "__main__":
    unittest.main()
