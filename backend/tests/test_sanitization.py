"""
Comprehensive tests for input sanitization utilities.

Tests cover:
- sanitize_path(): Directory traversal prevention
- sanitize_model_name(): Safe character filtering
"""

import pytest
from utils.sanitization import (
    sanitize_path,
    sanitize_model_name,
)


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
