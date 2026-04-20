import pathlib
import sys
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.json_schema_enforcer import enforce_json_schema  # type: ignore[import-not-found]
from utils.prompt_service import PROMPT_ENHANCEMENT_SCHEMA, enhance_prompt  # type: ignore[import-not-found]


class PromptServiceTests(unittest.TestCase):
    def test_clarify_mode_preserves_subject_and_adds_structure(self):
        result = enhance_prompt("cat on skateboard", mode="clarify")

        self.assertEqual(result["mode"], "clarify")
        self.assertIn("cat on skateboard", result["prompt"].lower())
        self.assertGreater(len(result["prompt"]), len("cat on skateboard"))

    def test_variations_mode_returns_multiple_distinct_prompts(self):
        result = enhance_prompt("city skyline at dusk", mode="variations")

        self.assertEqual(result["mode"], "variations")
        self.assertEqual(len(result["variations"]), 4)
        self.assertEqual(len(set(result["variations"])), 4)
        self.assertTrue(all("city skyline at dusk" in item.lower() for item in result["variations"]))

    def test_responses_match_prompt_enhancement_schema(self):
        for mode in ["clarify", "cinematic", "concise", "variations"]:
            with self.subTest(mode=mode):
                result = enhance_prompt("city skyline at dusk", mode=mode)

                self.assertEqual(set(result), {"mode", "prompt", "variations"})
                self.assertIs(enforce_json_schema(result, PROMPT_ENHANCEMENT_SCHEMA), result)

    def test_unknown_mode_raises_value_error(self):
        with self.assertRaises(ValueError):
            enhance_prompt("anything", mode="unknown")


if __name__ == "__main__":
    unittest.main()
