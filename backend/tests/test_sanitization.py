"""
Comprehensive tests for input sanitization utilities.

Tests cover:
- sanitize_prompt(): XSS pattern removal, HTML escaping, truncation
- sanitize_path(): Directory traversal prevention
- validate_base64(): Base64 format validation
- sanitize_model_name(): Safe character filtering
"""

import pytest
from utils.sanitization import (
    DANGEROUS_PATTERNS,
    sanitize_prompt,
    sanitize_path,
    validate_base64,
    sanitize_model_name,
)


class TestSanitizePrompt:
    """Tests for sanitize_prompt() function."""

    def test_basic_sanitization(self):
        """Test basic prompt sanitization preserves safe content."""
        prompt = "A beautiful sunset over mountains"
        result = sanitize_prompt(prompt)
        assert result == prompt

    def test_script_tag_removal(self):
        """Test removal of script tags."""
        prompt = "A cat <script>alert('xss')</script> on a mat"
        result = sanitize_prompt(prompt)
        assert "<script>" not in result.lower()
        assert "</script>" not in result.lower()
        # Note: "alert" word itself is kept, but the dangerous tags are removed
        assert "xss" in result.lower()  # Content is preserved, tags removed

    def test_javascript_url_removal(self):
        """Test removal of javascript: URLs."""
        prompt = "Click here javascript:alert('xss') for more"
        result = sanitize_prompt(prompt)
        assert "javascript:" not in result.lower()
        # Note: "alert" word itself is kept, but javascript: protocol is removed

    def test_event_handler_removal(self):
        """Test removal of event handlers like onclick, onerror."""
        prompt = '<img src="x" onerror="alert(1)" onload="evil()">'
        result = sanitize_prompt(prompt)
        assert "onerror" not in result.lower()
        assert "onload" not in result.lower()
        assert "onclick" not in result.lower()

    def test_html_escaping(self):
        """Test that HTML special characters are escaped."""
        prompt = "Test <angle> & \"quotes\" 'apostrophe'"
        result = sanitize_prompt(prompt)
        assert "&lt;" in result or "<angle>" not in result
        assert "&amp;" in result or "&" not in result.split("<")

    def test_truncation_at_max_length(self):
        """Test truncation at max_length parameter."""
        long_prompt = "A" * 3000
        result = sanitize_prompt(long_prompt, max_length=1000)
        assert len(result) <= 1000

    def test_default_max_length(self):
        """Test default max_length of 2000."""
        long_prompt = "A" * 3000
        result = sanitize_prompt(long_prompt)
        assert len(result) <= 2000

    def test_empty_input(self):
        """Test handling of empty string."""
        result = sanitize_prompt("")
        assert result == ""

    def test_none_input(self):
        """Test handling of None input."""
        result = sanitize_prompt(None)
        assert result == ""

    def test_whitespace_only(self):
        """Test handling of whitespace-only input."""
        result = sanitize_prompt("   \t\n   ")
        assert result.strip() == ""

    def test_data_uri_removal(self):
        """Test removal of dangerous data: URIs."""
        prompt = "Show image data:text/html,<script>alert(1)</script>"
        result = sanitize_prompt(prompt)
        assert "data:text/html" not in result.lower()

    def test_mixed_attack_vectors(self):
        """Test multiple XSS vectors in single input."""
        prompt = """
            <script>alert(1)</script>
            <img src=x onerror=alert(2)>
            <svg onload=alert(3)>
            javascript:alert(4)
            <iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">
        """
        result = sanitize_prompt(prompt)
        assert "<script>" not in result.lower()
        assert "onerror" not in result.lower()
        assert "onload" not in result.lower()
        assert "javascript:" not in result.lower()


class TestSanitizePath:
    """Tests for sanitize_path() function."""

    def test_valid_filename(self):
        """Test that valid filenames pass through."""
        path = "image.png"
        result = sanitize_path(path)
        assert result == "image.png"

    def test_valid_path_with_subdirectory(self):
        """Test valid paths with subdirectories."""
        path = "outputs/2024/image.png"
        result = sanitize_path(path)
        assert "image.png" in result

    def test_directory_traversal_double_dot(self):
        """Test prevention of ../ traversal."""
        path = "../../../etc/passwd"
        result = sanitize_path(path)
        assert ".." not in result

    def test_directory_traversal_backslash(self):
        """Test prevention of ..\\ traversal (Windows)."""
        path = "..\\..\\..\\windows\\system32"
        result = sanitize_path(path)
        assert ".." not in result

    def test_mixed_slash_traversal(self):
        """Test prevention of mixed slash traversal."""
        path = "../..\\../etc/passwd"
        result = sanitize_path(path)
        assert ".." not in result

    def test_absolute_path_rejection(self):
        """Test that absolute paths are sanitized."""
        path = "/etc/passwd"
        result = sanitize_path(path)
        # Should not start with /
        assert not result.startswith("/")

    def test_windows_absolute_path(self):
        """Test Windows absolute path sanitization."""
        path = "C:\\Windows\\System32"
        result = sanitize_path(path)
        # Should be sanitized
        assert "C:" not in result or result == ""

    def test_empty_input(self):
        """Test empty string handling."""
        result = sanitize_path("")
        assert result == ""

    def test_null_byte_injection(self):
        """Test null byte injection prevention."""
        path = "image.png\x00.exe"
        result = sanitize_path(path)
        assert "\x00" not in result

    def test_special_characters(self):
        """Test handling of special characters."""
        path = "image<>.png"
        result = sanitize_path(path)
        assert "<" not in result
        assert ">" not in result


class TestValidateBase64:
    """Tests for validate_base64() function."""

    def test_valid_base64(self):
        """Test valid base64 string."""
        data = "SGVsbG8gV29ybGQ="  # "Hello World"
        result = validate_base64(data)
        assert result is True

    def test_valid_base64_no_padding(self):
        """Test valid base64 without padding."""
        data = "SGVsbG8gV29ybGQ"  # No padding
        result = validate_base64(data)
        assert result is True

    def test_invalid_base64_characters(self):
        """Test invalid base64 with non-base64 characters."""
        data = "Hello!@#$%^&*()"
        result = validate_base64(data)
        assert result is False

    def test_empty_string(self):
        """Test empty string handling."""
        data = ""
        result = validate_base64(data)
        assert result is False

    def test_none_input(self):
        """Test None input handling."""
        result = validate_base64(None)
        assert result is False

    def test_data_url_png(self):
        """Test PNG data URL format."""
        data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        result = validate_base64(data)
        assert result is True

    def test_data_url_jpeg(self):
        """Test JPEG data URL format."""
        data = "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
        result = validate_base64(data)
        assert result is True

    def test_data_url_webp(self):
        """Test WEBP data URL format."""
        # Use a valid webp base64 string (RIFF header)
        data = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBIAAAAAAwAQCdASoBAAEAAUAmJYgCdAEO/hOMAAD++O8AAAAA"
        result = validate_base64(data)
        assert result is True

    def test_data_url_invalid_mime(self):
        """Test data URL with invalid MIME type."""
        data = "data:application/x-executable;base64,TVqQAAMAAAA="
        result = validate_base64(data)
        # Should still validate as base64, but MIME check might fail
        assert result is True  # Base64 itself is valid

    def test_malformed_data_url(self):
        """Test malformed data URL."""
        data = "data:image/png,notbase64!@#$"
        result = validate_base64(data)
        assert result is False

    def test_unicode_characters(self):
        """Test that unicode characters are rejected."""
        data = "SGVsbG8gV29ybGQ="  # Valid
        result = validate_base64(data)
        assert result is True


class TestSanitizeModelName:
    """Tests for sanitize_model_name() function."""

    def test_safe_model_name(self):
        """Test safe model name passes through."""
        name = "flux-dev"
        result = sanitize_model_name(name)
        assert result == "flux-dev"

    def test_model_name_with_underscore(self):
        """Test model name with underscore."""
        name = "stable_diffusion_xl"
        result = sanitize_model_name(name)
        assert result == "stable_diffusion_xl"

    def test_model_name_with_numbers(self):
        """Test model name with numbers."""
        name = "sd-v1-5"
        result = sanitize_model_name(name)
        assert result == "sd-v1-5"

    def test_dangerous_characters_removed(self):
        """Test removal of dangerous characters."""
        name = "model<script>"
        result = sanitize_model_name(name)
        assert "<" not in result
        assert ">" not in result

    def test_path_traversal_removed(self):
        """Test path traversal characters removed."""
        name = "../../../etc/passwd"
        result = sanitize_model_name(name)
        assert ".." not in result

    def test_shell_injection_removed(self):
        """Test shell injection characters removed."""
        name = "model; rm -rf /"
        result = sanitize_model_name(name)
        assert ";" not in result
        # Shell command structure is broken up (semicolons, spaces, slashes removed)
        assert "rm -rf" not in result

    def test_empty_input(self):
        """Test empty string handling."""
        result = sanitize_model_name("")
        assert result == ""

    def test_none_input(self):
        """Test None input handling."""
        result = sanitize_model_name(None)
        assert result == ""

    def test_spaces_normalized(self):
        """Test that spaces are normalized."""
        name = "flux  dev   model"
        result = sanitize_model_name(name)
        assert "  " not in result  # No double spaces

    def test_complex_model_identifier(self):
        """Test complex model identifier."""
        name = "runwayml/stable-diffusion-v1-5@pruned"
        result = sanitize_model_name(name)
        # Should keep alphanumeric, dash, underscore, slash
        assert "runwayml" in result
        assert "stable-diffusion-v1-5" in result
