import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.comfy_graph_guard import GraphValidationError, validate_comfy_graph  # type: ignore[import-not-found]

SAFE_GRAPH = {
    "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "flux1-dev.safetensors"}},
    "2": {"class_type": "SaveImage", "inputs": {"filename_prefix": "vision_studio", "images": ["1", 0]}},
}


class GraphGuardTests(unittest.TestCase):
    def test_accepts_first_class_safe_graph(self):
        validate_comfy_graph(SAFE_GRAPH)  # must not raise

    def test_rejects_unsupported_node(self):
        with self.assertRaises(GraphValidationError) as ctx:
            validate_comfy_graph({"1": {"class_type": "ExecArbitraryCode", "inputs": {}}})
        self.assertNotIn("/", str(ctx.exception))  # leak-free

    def test_rejects_path_traversal_in_model_field(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "../../etc/passwd"}}})

    def test_rejects_absolute_filename_prefix(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": {"class_type": "SaveImage", "inputs": {"filename_prefix": "/abs/evil"}}})

    def test_rejects_empty_or_malformed_graph(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({})
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": "not-a-node"})


if __name__ == "__main__":
    unittest.main()
