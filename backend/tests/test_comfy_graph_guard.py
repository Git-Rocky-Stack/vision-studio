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

    def test_accepts_valid_numeric_inputs(self):
        graph = {
            "1": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 2}},
            "2": {"class_type": "KSampler", "inputs": {"steps": 20, "latent_image": ["1", 0]}},
        }
        validate_comfy_graph(graph)  # must not raise

    def test_accepts_connection_wired_dimensions(self):
        # Inputs wired from another node ([node_id, slot]) are not literals and
        # must pass through untouched.
        graph = {"1": {"class_type": "EmptyLatentImage",
                       "inputs": {"width": ["9", 0], "height": ["9", 1], "batch_size": 1}}}
        validate_comfy_graph(graph)  # must not raise

    def test_rejects_oversized_latent_dimensions(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": {"class_type": "EmptyLatentImage",
                                        "inputs": {"width": 100000, "height": 1024, "batch_size": 1}}})

    def test_rejects_excessive_batch_size(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": {"class_type": "EmptyLatentImage",
                                        "inputs": {"width": 512, "height": 512, "batch_size": 100000}}})

    def test_rejects_excessive_sampler_steps(self):
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph({"1": {"class_type": "KSampler", "inputs": {"steps": 999999}}})

    def test_rejects_too_many_nodes(self):
        from utils.comfy_graph_guard import MAX_NODES

        big = {str(i): {"class_type": "PreviewImage", "inputs": {}} for i in range(MAX_NODES + 1)}
        with self.assertRaises(GraphValidationError):
            validate_comfy_graph(big)


if __name__ == "__main__":
    unittest.main()
