import asyncio
import pathlib
import sys
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.comfy_client import ComfyUIClient  # type: ignore[import-not-found]


class ComfyClientPollTests(unittest.TestCase):
    def test_wait_collects_video_kinds(self):
        client = ComfyUIClient()

        async def fake_history(prompt_id=None):
            return {"p1": {"outputs": {"7": {"gifs": [{"filename": "clip.webp"}]}}}}

        client.get_history = fake_history  # type: ignore[assignment]

        outputs = asyncio.run(
            client.wait_for_prompt_completion("p1", poll_interval=0.0, kinds=("images", "gifs", "videos"))
        )
        self.assertEqual(outputs[0]["filename"], "clip.webp")


if __name__ == "__main__":
    unittest.main()
