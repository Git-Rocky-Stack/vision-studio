import pathlib
import sys
import unittest


BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.json_schema_enforcer import JsonSchemaError, enforce_json_schema  # type: ignore[import-not-found]


PROMPT_RESPONSE_SCHEMA = {
    "type": "object",
    "required": ["mode", "prompt", "variations"],
    "additionalProperties": False,
    "properties": {
        "mode": {"type": "string", "enum": ["clarify", "variations"]},
        "prompt": {"type": "string"},
        "variations": {"type": "array", "items": {"type": "string"}},
    },
}


class JsonSchemaEnforcerTests(unittest.TestCase):
    def test_accepts_valid_structured_prompt_response(self):
        response = {
            "mode": "clarify",
            "prompt": "cat on skateboard, clear subject focus",
            "variations": [],
        }

        self.assertIs(enforce_json_schema(response, PROMPT_RESPONSE_SCHEMA), response)

    def test_rejects_missing_required_property(self):
        with self.assertRaisesRegex(JsonSchemaError, "missing required property: prompt"):
            enforce_json_schema({"mode": "clarify", "variations": []}, PROMPT_RESPONSE_SCHEMA)

    def test_rejects_additional_property_when_disallowed(self):
        with self.assertRaisesRegex(JsonSchemaError, "unexpected property: debug"):
            enforce_json_schema(
                {"mode": "clarify", "prompt": "cat", "variations": [], "debug": True},
                PROMPT_RESPONSE_SCHEMA,
            )

    def test_rejects_wrong_array_item_type(self):
        with self.assertRaisesRegex(JsonSchemaError, r"\$\.variations\[1\] expected string"):
            enforce_json_schema(
                {"mode": "variations", "prompt": "cat", "variations": ["cat", 7]},
                PROMPT_RESPONSE_SCHEMA,
            )

    def test_rejects_values_outside_enum(self):
        with self.assertRaisesRegex(JsonSchemaError, r"\$\.mode must be one of"):
            enforce_json_schema(
                {"mode": "unsupported", "prompt": "cat", "variations": []},
                PROMPT_RESPONSE_SCHEMA,
            )


if __name__ == "__main__":
    unittest.main()
