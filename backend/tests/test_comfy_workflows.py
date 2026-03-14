import pathlib
import sys
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.comfy_workflows import build_image_workflow, extract_history_image_outputs  # type: ignore[import-not-found]


class ComfyWorkflowTests(unittest.TestCase):
    def test_build_image_workflow_selects_flux_nodes(self):
        workflow, seed = build_image_workflow(
            model="flux-dev",
            prompt="storm over the ocean",
            negative_prompt="",
            width=1024,
            height=768,
            steps=20,
            cfg_scale=1.0,
            scheduler="euler",
            seed=1234,
        )

        save_nodes = [node for node in workflow.values() if node["class_type"] == "SaveImage"]
        self.assertEqual(seed, 1234)
        self.assertEqual(len(save_nodes), 1)
        self.assertTrue(any(node["class_type"] == "CheckpointLoaderSimple" for node in workflow.values()))

    def test_extract_history_image_outputs_collects_filenames(self):
        history = {
            "prompt-1": {
                "outputs": {
                    "7": {
                        "images": [
                            {"filename": "image_001.png", "subfolder": "vision/job", "type": "output"},
                            {"filename": "image_002.png", "subfolder": "vision/job", "type": "output"},
                        ]
                    }
                }
            }
        }

        outputs = extract_history_image_outputs(history, "prompt-1")
        self.assertEqual(len(outputs), 2)
        self.assertEqual(outputs[0]["filename"], "image_001.png")
        self.assertEqual(outputs[1]["subfolder"], "vision/job")


if __name__ == "__main__":
    unittest.main()
