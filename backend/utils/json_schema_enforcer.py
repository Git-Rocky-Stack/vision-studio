"""
Small JSON Schema runtime enforcer for backend response contracts.

This intentionally implements the subset used by local service contracts:
type, required, properties, additionalProperties, items, and enum.
"""

from typing import Any, Mapping


class JsonSchemaError(ValueError):
    """Raised when data does not match the enforced schema."""


JSON_TYPE_NAMES = {
    "array": "array",
    "boolean": "boolean",
    "integer": "integer",
    "null": "None",
    "number": "number",
    "object": "object",
    "string": "string",
}


def enforce_json_schema(data: Any, schema: Mapping[str, Any], *, path: str = "$") -> Any:
    """
    Validate data against a focused JSON Schema subset and return the original data.

    Returning the original object lets callers enforce contracts inline without copying
    or changing response identity.
    """
    schema_type = schema.get("type")
    if schema_type is not None:
        _enforce_type(data, schema_type, path)

    enum_values = schema.get("enum")
    if enum_values is not None and data not in enum_values:
        allowed = ", ".join(repr(value) for value in enum_values)
        raise JsonSchemaError(f"{path} must be one of: {allowed}")

    if schema_type == "object":
        _enforce_object_schema(data, schema, path)

    if schema_type == "array":
        _enforce_array_schema(data, schema, path)

    return data


def _enforce_object_schema(data: Any, schema: Mapping[str, Any], path: str) -> None:
    if not isinstance(data, dict):
        return

    required = schema.get("required", [])
    if not isinstance(required, list):
        raise JsonSchemaError(f"{path}.required must be an array")

    for property_name in required:
        if property_name not in data:
            raise JsonSchemaError(f"{path} missing required property: {property_name}")

    properties = schema.get("properties", {})
    if not isinstance(properties, dict):
        raise JsonSchemaError(f"{path}.properties must be an object")

    if schema.get("additionalProperties") is False:
        for property_name in data:
            if property_name not in properties:
                raise JsonSchemaError(f"{path} unexpected property: {property_name}")

    for property_name, property_schema in properties.items():
        if property_name in data:
            enforce_json_schema(data[property_name], property_schema, path=f"{path}.{property_name}")


def _enforce_array_schema(data: Any, schema: Mapping[str, Any], path: str) -> None:
    if not isinstance(data, list):
        return

    item_schema = schema.get("items")
    if item_schema is None:
        return

    for index, item in enumerate(data):
        enforce_json_schema(item, item_schema, path=f"{path}[{index}]")


def _enforce_type(data: Any, schema_type: Any, path: str) -> None:
    allowed_types = [schema_type] if isinstance(schema_type, str) else list(schema_type)
    if not any(_matches_json_type(data, allowed_type) for allowed_type in allowed_types):
        expected = " or ".join(JSON_TYPE_NAMES.get(allowed_type, allowed_type) for allowed_type in allowed_types)
        raise JsonSchemaError(f"{path} expected {expected}")


def _matches_json_type(data: Any, schema_type: str) -> bool:
    if schema_type == "array":
        return isinstance(data, list)
    if schema_type == "boolean":
        return isinstance(data, bool)
    if schema_type == "integer":
        return isinstance(data, int) and not isinstance(data, bool)
    if schema_type == "null":
        return data is None
    if schema_type == "number":
        return (isinstance(data, int) or isinstance(data, float)) and not isinstance(data, bool)
    if schema_type == "object":
        return isinstance(data, dict)
    if schema_type == "string":
        return isinstance(data, str)
    raise JsonSchemaError(f"Unsupported JSON Schema type: {schema_type}")
