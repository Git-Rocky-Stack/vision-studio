"""
Tests for structured logging configuration.

Tests cover:
- StructuredFormatter produces valid JSON
- All required fields present (timestamp, level, logger, message)
- Extra fields included when provided
- Exception formatting works
- setup_logging() configures handlers correctly
"""

import json
import logging
import os
import sys
from datetime import datetime
from io import StringIO

import pytest

from utils.logging_config import StructuredFormatter, get_logger, setup_logging


class TestStructuredFormatter:
    """Test cases for StructuredFormatter JSON output."""

    def test_produces_valid_json(self):
        """StructuredFormatter output is valid JSON."""
        formatter = StructuredFormatter()
        record = logging.LogRecord(
            name="test_logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)

        # Should not raise
        parsed = json.loads(output)
        assert isinstance(parsed, dict)

    def test_required_fields_present(self):
        """All required fields are present in output."""
        formatter = StructuredFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.WARNING,
            pathname="test.py",
            lineno=42,
            msg="Warning message",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        # Check required fields
        assert "timestamp" in parsed
        assert "level" in parsed
        assert "logger" in parsed
        assert "message" in parsed

    def test_timestamp_iso8601_format(self):
        """Timestamp is in ISO 8601 format with Z suffix."""
        formatter = StructuredFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="test",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        timestamp = parsed["timestamp"]
        # Should end with Z
        assert timestamp.endswith("Z")
        # Should be parseable as ISO 8601
        # Format: 2024-01-15T10:30:45.123Z
        assert "T" in timestamp
        # Verify it's a valid datetime
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    def test_level_correct(self):
        """Log level is correctly set."""
        formatter = StructuredFormatter()

        for level_name, level_value in [
            ("DEBUG", logging.DEBUG),
            ("INFO", logging.INFO),
            ("WARNING", logging.WARNING),
            ("ERROR", logging.ERROR),
            ("CRITICAL", logging.CRITICAL),
        ]:
            record = logging.LogRecord(
                name="test",
                level=level_value,
                pathname="test.py",
                lineno=1,
                msg="test",
                args=(),
                exc_info=None,
            )

            output = formatter.format(record)
            parsed = json.loads(output)

            assert parsed["level"] == level_name

    def test_logger_name_correct(self):
        """Logger name matches record name."""
        formatter = StructuredFormatter()

        for logger_name in ["test", "my.module", "deeply.nested.logger"]:
            record = logging.LogRecord(
                name=logger_name,
                level=logging.INFO,
                pathname="test.py",
                lineno=1,
                msg="test",
                args=(),
                exc_info=None,
            )

            output = formatter.format(record)
            parsed = json.loads(output)

            assert parsed["logger"] == logger_name

    def test_message_formatted(self):
        """Message field contains formatted log message."""
        formatter = StructuredFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Hello %s",
            args=("World",),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        assert parsed["message"] == "Hello World"

    def test_extra_fields_included(self):
        """Extra fields are included when provided via extra={})."""
        formatter = StructuredFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Request processed",
            args=(),
            exc_info=None,
        )
        # Add extra fields
        record.request_id = "req-123"
        record.user_id = "user-456"
        record.duration_ms = 42.5

        output = formatter.format(record)
        parsed = json.loads(output)

        assert parsed["request_id"] == "req-123"
        assert parsed["user_id"] == "user-456"
        assert parsed["duration_ms"] == 42.5

    def test_extra_fields_not_included_when_absent(self):
        """Extra fields are omitted when not provided."""
        formatter = StructuredFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Simple message",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        # Extra fields should not be present
        assert "request_id" not in parsed
        assert "user_id" not in parsed
        assert "duration_ms" not in parsed

    def test_exception_formatting(self):
        """Exception info is included when exc_info is present."""
        formatter = StructuredFormatter()

        try:
            raise ValueError("Test error message")
        except ValueError:
            exc_info = sys.exc_info()

        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="test.py",
            lineno=1,
            msg="An error occurred",
            args=(),
            exc_info=exc_info,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        assert "exception" in parsed
        assert parsed["exception"]["type"] == "ValueError"
        assert parsed["exception"]["message"] == "Test error message"
        assert "traceback" in parsed["exception"]
        assert "ValueError" in parsed["exception"]["traceback"]
        assert "Test error message" in parsed["exception"]["traceback"]

    def test_source_location_included_when_enabled(self):
        """Source location included when include_source_location=True."""
        formatter = StructuredFormatter(include_source_location=True)
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="my_module.py",
            lineno=100,
            msg="test",
            args=(),
            exc_info=None,
            func="my_function",
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        assert "location" in parsed
        assert parsed["location"]["filename"] == "my_module.py"
        assert parsed["location"]["lineno"] == 100
        assert parsed["location"]["function"] == "my_function"

    def test_source_location_excluded_when_disabled(self):
        """Source location excluded when include_source_location=False."""
        formatter = StructuredFormatter(include_source_location=False)
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="my_module.py",
            lineno=100,
            msg="test",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)
        parsed = json.loads(output)

        assert "location" not in parsed

    def test_one_line_per_log(self):
        """Output is a single line (no newlines)."""
        formatter = StructuredFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="test message",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)

        # Should not contain newlines
        assert "\n" not in output

    def test_json_separators_compact(self):
        """JSON uses compact separators (no spaces after : and ,)."""
        formatter = StructuredFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="test",
            args=(),
            exc_info=None,
        )

        output = formatter.format(record)

        # Compact JSON should not have ": " or ", "
        assert ": " not in output
        assert ", " not in output


class TestSetupLogging:
    """Test cases for setup_logging() function."""

    def test_configures_console_handler(self):
        """setup_logging() configures console handler."""
        # Clean up any existing handlers
        root_logger = logging.getLogger()
        root_logger.handlers.clear()

        setup_logging(level="INFO")

        # Should have at least one handler (console)
        assert len(root_logger.handlers) >= 1

        # Find console handler
        console_handlers = [
            h for h in root_logger.handlers
            if isinstance(h, logging.StreamHandler)
        ]
        assert len(console_handlers) >= 1

    def test_configures_file_handler_when_log_file_provided(self, tmp_path):
        """setup_logging() configures file handler when log_file is provided."""
        root_logger = logging.getLogger()
        root_logger.handlers.clear()

        log_file = str(tmp_path / "test.log")
        setup_logging(level="INFO", log_file=log_file)

        # Should have console and file handlers
        file_handlers = [
            h for h in root_logger.handlers
            if isinstance(h, logging.FileHandler)
        ]
        assert len(file_handlers) == 1

    def test_creates_log_directory(self, tmp_path):
        """setup_logging() creates log directory if it doesn't exist."""
        root_logger = logging.getLogger()
        root_logger.handlers.clear()

        log_dir = tmp_path / "logs"
        log_file = log_dir / "app.log"

        setup_logging(level="INFO", log_file=str(log_file))

        assert log_dir.exists()
        assert log_file.exists()

    def test_log_level_from_env(self, monkeypatch):
        """setup_logging() uses LOG_LEVEL environment variable."""
        root_logger = logging.getLogger()
        root_logger.handlers.clear()

        monkeypatch.setenv("LOG_LEVEL", "DEBUG")
        setup_logging()

        assert root_logger.level == logging.DEBUG

    def test_log_level_default_info(self):
        """setup_logging() defaults to INFO level."""
        root_logger = logging.getLogger()
        root_logger.handlers.clear()

        setup_logging()

        assert root_logger.level == logging.INFO

    def test_log_level_explicit_parameter(self):
        """setup_logging() uses explicit level parameter."""
        root_logger = logging.getLogger()
        root_logger.handlers.clear()

        setup_logging(level="DEBUG")

        assert root_logger.level == logging.DEBUG

    def test_handlers_use_structured_formatter(self):
        """Configured handlers use StructuredFormatter."""
        root_logger = logging.getLogger()
        root_logger.handlers.clear()

        setup_logging(level="INFO")

        for handler in root_logger.handlers:
            assert isinstance(handler.formatter, StructuredFormatter)

    def test_clears_existing_handlers(self):
        """setup_logging() clears existing handlers first."""
        root_logger = logging.getLogger()
        root_logger.handlers.clear()

        # Add a dummy handler
        dummy_handler = logging.StreamHandler()
        root_logger.addHandler(dummy_handler)

        setup_logging(level="INFO")

        # Dummy handler should be removed
        assert dummy_handler not in root_logger.handlers


class TestGetLogger:
    """Test cases for get_logger() function."""

    def test_returns_logger_instance(self):
        """get_logger() returns a logging.Logger instance."""
        logger = get_logger("test.module")
        assert isinstance(logger, logging.Logger)

    def test_logger_name_matches(self):
        """get_logger() returns logger with matching name."""
        logger = get_logger("my.custom.logger")
        assert logger.name == "my.custom.logger"

    def test_get_logger_with_dunder_name(self):
        """get_logger() works with __name__."""
        logger = get_logger(__name__)
        assert logger.name == __name__


class TestLoggingIntegration:
    """Integration tests for structured logging."""

    def test_log_output_to_stringio(self):
        """Logs can be captured to StringIO for testing."""
        # Create a logger with a string handler
        logger = logging.getLogger("test.integration")
        logger.handlers.clear()
        logger.setLevel(logging.INFO)

        string_buffer = StringIO()
        handler = logging.StreamHandler(string_buffer)
        handler.setFormatter(StructuredFormatter())
        logger.addHandler(handler)

        # Log a message
        logger.info("Test message", extra={"duration_ms": 10.5})

        # Parse output
        output = string_buffer.getvalue()
        parsed = json.loads(output)

        assert parsed["message"] == "Test message"
        assert parsed["duration_ms"] == 10.5

    def test_exception_logging(self, caplog):
        """Exception logging works with pytest caplog."""
        logger = logging.getLogger("test.exception")

        with caplog.at_level(logging.ERROR):
            try:
                raise RuntimeError("Integration test error")
            except RuntimeError:
                logger.exception("Operation failed", extra={"operation": "test"})

        # Check log record
        assert len(caplog.records) == 1
        record = caplog.records[0]
        assert record.levelname == "ERROR"
        assert "Operation failed" in record.getMessage()
