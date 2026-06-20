import pathlib
import sys
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.comfy_workflows import (  # type: ignore[import-not-found]
    build_image_workflow,
    build_video_workflow,
    extract_history_image_outputs,
    extract_history_outputs,
)


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

    def test_extract_history_outputs_collects_video_kinds(self):
        history = {
            "p1": {"outputs": {"7": {
                "gifs": [{"filename": "clip.webp", "subfolder": "vid", "type": "output"}],
                "videos": [{"filename": "clip.mp4", "subfolder": "vid", "type": "output"}],
            }}}
        }
        outputs = extract_history_outputs(history, "p1", kinds=("images", "gifs", "videos"))
        names = sorted(item["filename"] for item in outputs)
        self.assertEqual(names, ["clip.mp4", "clip.webp"])

    def test_image_extractor_stays_image_only(self):
        history = {"p1": {"outputs": {"7": {"gifs": [{"filename": "x.webp"}]}}}}
        self.assertEqual(extract_history_image_outputs(history, "p1"), [])

    def test_build_video_workflow_has_save_and_sampler(self):
        workflow, seed = build_video_workflow(
            model="svd", prompt="waves", image_filename="frame.png",
            width=1024, height=576, fps=8, steps=20, seed=99,
        )
        self.assertEqual(seed, 99)
        class_types = {node["class_type"] for node in workflow.values()}
        self.assertIn("KSampler", class_types)
        self.assertTrue(any(ct.startswith("Save") for ct in class_types))


if __name__ == "__main__":
    unittest.main()
