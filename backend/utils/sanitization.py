"""
Input sanitization for user-supplied names and paths.

Used by the ComfyUI graph guard (utils/comfy_graph_guard.py) to neutralize
model names and relative paths inside user-submitted workflow graphs:
- Directory traversal (sanitize_path)
- Model name injection (sanitize_model_name)
"""

import re
from typing import Optional

# Safe characters for model names: alphanumeric, dash, underscore, slash, @, dot
SAFE_MODEL_NAME_PATTERN = re.compile(r'[^a-zA-Z0-9_\-/.@]')


def sanitize_path(path: Optional[str]) -> str:
    """
    Sanitize a file path by preventing directory traversal attacks.

    Removes:
    - ../ and ..\\ sequences
    - Absolute paths (starting with / or drive letters)
    - Null bytes
    - Special characters (<, >, |, etc.)

    Args:
        path: The file path to sanitize

    Returns:
        Sanitized relative path

    Examples:
        >>> sanitize_path("../../../etc/passwd")
        'etc/passwd'
        >>> sanitize_path("image.png")
        'image.png'
    """
    if path is None:
        return ""

    # Convert to string
    path = str(path)

    # Remove null bytes
    path = path.replace('\x00', '')

    # Remove directory traversal sequences
    path = re.sub(r'\.\.+', '', path)  # Remove .. and longer
    path = re.sub(r'\.\\+', '', path)  # Remove .\\ sequences

    # Remove leading slashes (absolute paths)
    path = path.lstrip('/')
    path = path.lstrip('\\')

    # Remove Windows drive letters (C:, D:, etc.)
    path = re.sub(r'^[a-zA-Z]:', '', path)

    # Remove dangerous special characters
    dangerous_chars = '<>|":*?'
    for char in dangerous_chars:
        path = path.replace(char, '')

    # Normalize path separators to forward slashes
    path = path.replace('\\', '/')

    # Remove any remaining leading slashes
    path = path.lstrip('/')

    return path


def sanitize_model_name(name: Optional[str]) -> str:
    """
    Sanitize a model name by allowing only safe characters.

    Safe characters: alphanumeric, dash (-), underscore (_),
    slash (/), at (@), and dot (.)

    Args:
        name: The model name to sanitize

    Returns:
        Sanitized model name with only safe characters

    Examples:
        >>> sanitize_model_name("flux-dev")
        'flux-dev'
        >>> sanitize_model_name("model<script>")
        'model'
        >>> sanitize_model_name("runwayml/stable-diffusion-v1-5")
        'runwayml/stable-diffusion-v1-5'
    """
    if name is None:
        return ""

    name = str(name).strip()

    # Remove dangerous characters
    name = SAFE_MODEL_NAME_PATTERN.sub('', name)

    # Normalize multiple spaces to single space
    name = re.sub(r'\s+', ' ', name)

    # Remove any remaining path traversal attempts
    name = name.replace('..', '')

    return name
