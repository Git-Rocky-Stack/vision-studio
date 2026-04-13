"""
Input sanitization utilities for Vision Studio API.

Provides functions to sanitize and validate user inputs to prevent:
- XSS (Cross-Site Scripting) attacks
- Directory traversal attacks
- Base64 injection
- Model name injection
"""

import base64
import html
import re
from typing import Optional

# Dangerous patterns that indicate XSS or injection attempts
DANGEROUS_PATTERNS = [
    # Script tags
    r'<script[^>]*>',
    r'</script>',

    # JavaScript URLs
    r'javascript:',
    r'vbscript:',

    # Data URIs that can execute code
    r'data:text/html',
    r'data:application/x-msdownload',
    r'data:application/x-executable',

    # Event handlers (onclick, onerror, onload, etc.)
    r'\bon\w+\s*=',

    # HTML tags that can be dangerous
    r'<iframe[^>]*>',
    r'<object[^>]*>',
    r'<embed[^>]*>',
    r'<link[^>]*>',
    r'<meta[^>]*>',
    r'<svg[^>]*on\w+',

    # Expression/eval patterns
    r'expression\s*\(',
    r'eval\s*\(',

    # Shell injection patterns
    r';\s*\w+',
    r'\|\s*\w+',
    r'`[^`]+`',
    r'\$\([^)]+\)',
]

# Compile patterns for efficiency
COMPILED_DANGEROUS_PATTERNS = [re.compile(pattern, re.IGNORECASE) for pattern in DANGEROUS_PATTERNS]

# Safe characters for model names: alphanumeric, dash, underscore, slash, @, dot
SAFE_MODEL_NAME_PATTERN = re.compile(r'[^a-zA-Z0-9_\-/.@]')

# Directory traversal patterns
DIR_TRAVERSAL_PATTERNS = [
    r'\.\.',      # Double dots
    r'\.\\',      # Dot backslash
    r'\\\. ',     # Backslash dot
]


def sanitize_prompt(text: Optional[str], max_length: int = 2000) -> str:
    """
    Sanitize a text prompt by removing XSS patterns and escaping HTML.

    Args:
        text: The input text to sanitize
        max_length: Maximum allowed length (default: 2000)

    Returns:
        Sanitized text with dangerous patterns removed and HTML escaped

    Examples:
        >>> sanitize_prompt("<script>alert('xss')</script>Hello")
        'Hello'
        >>> sanitize_prompt("javascript:alert(1)")
        ''
    """
    if text is None:
        return ""

    # Convert to string if not already
    text = str(text)

    # Strip leading/trailing whitespace
    text = text.strip()

    # Remove dangerous patterns
    for pattern in COMPILED_DANGEROUS_PATTERNS:
        text = pattern.sub('', text)

    # Escape HTML special characters
    text = html.escape(text)

    # Truncate to max length
    if len(text) > max_length:
        text = text[:max_length]

    return text


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


def validate_base64(data: Optional[str]) -> bool:
    """
    Validate that a string is valid base64-encoded data.

    Supports:
    - Plain base64 strings
    - Data URLs (data:image/png;base64,...)

    Args:
        data: The string to validate

    Returns:
        True if valid base64, False otherwise

    Examples:
        >>> validate_base64("SGVsbG8gV29ybGQ=")
        True
        >>> validate_base64("data:image/png;base64,iVBORw0KGgo=")
        True
        >>> validate_base64("invalid!@#$")
        False
    """
    if data is None:
        return False

    data = str(data).strip()

    if not data:
        return False

    # Handle data URL format
    if data.startswith('data:'):
        # Validate data URL format: data:[<mime-type>][;base64],<data>
        match = re.match(
            r'^data:([a-zA-Z0-9\-+/]+(?:/[a-zA-Z0-9\-+/]+)?)?(;base64)?,(.*)$',
            data
        )
        if not match:
            return False

        # Extract the base64 portion
        data = match.group(3)

    # Check for valid base64 characters (A-Z, a-z, 0-9, +, /, =)
    if not re.match(r'^[A-Za-z0-9+/]*={0,2}$', data):
        return False

    # Check length is multiple of 4 (base64 requirement)
    # Padding may be omitted, so we need to check the actual decoded length
    if len(data) % 4 != 0:
        # Add padding if missing
        padding_needed = 4 - (len(data) % 4)
        if padding_needed < 4:
            data += '=' * padding_needed
        else:
            return False

    try:
        base64.b64decode(data, validate=True)
        return True
    except Exception:
        return False


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
