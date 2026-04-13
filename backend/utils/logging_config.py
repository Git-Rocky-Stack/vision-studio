"""
Structured JSON logging configuration for Vision Studio backend.

Provides:
- StructuredFormatter: JSON log formatter with ISO 8601 timestamps
- setup_logging(): Configures root logger with console + file handlers
- Support for extra fields: request_id, user_id, duration_ms, exception
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Optional


class StructuredFormatter(logging.Formatter):
    """
    JSON log formatter for structured logging.

    Outputs one JSON object per line with the following fields:
    - timestamp: ISO 8601 format with Z suffix
    - level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    - logger: Logger name
    - message: Log message
    - extra fields: request_id, user_id, duration_ms, etc. (when provided)
    - exception: Stack trace (when applicable)
    """

    # Required fields always present in output
    REQUIRED_FIELDS = ("timestamp", "level", "logger", "message")

    # Optional extra fields to include when provided via extra={}
    EXTRA_FIELDS = ("request_id", "user_id", "duration_ms", "operation", "path", "method")

    def __init__(self, include_source_location: bool = False):
        """
        Initialize the structured formatter.

        Args:
            include_source_location: Include filename/lineno in output (useful for debug)
        """
        super().__init__()
        self.include_source_location = include_source_location

    def format(self, record: logging.LogRecord) -> str:
        """
        Format a log record as JSON.

        Args:
            record: Log record to format

        Returns:
            JSON string (one line)
        """
        log_data: dict[str, Any] = {}

        # Timestamp in ISO 8601 format with Z suffix
        log_data["timestamp"] = datetime.fromtimestamp(
            record.created, tz=timezone.utc
        ).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

        # Log level
        log_data["level"] = record.levelname

        # Logger name
        log_data["logger"] = record.name

        # Message
        log_data["message"] = record.getMessage()

        # Include source location if enabled (debug mode)
        if self.include_source_location:
            log_data["location"] = {
                "filename": record.filename,
                "lineno": record.lineno,
                "function": record.funcName,
            }

        # Include extra fields if provided
        for field in self.EXTRA_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                log_data[field] = value

        # Include exception info if present
        if record.exc_info:
            log_data["exception"] = {
                "type": record.exc_info[0].__name__ if record.exc_info[0] else "Unknown",
                "message": str(record.exc_info[1]) if record.exc_info[1] else "",
                "traceback": self.formatException(record.exc_info),
            }

        # Convert to JSON (one line, no ASCII escaping for Unicode support)
        return json.dumps(log_data, ensure_ascii=False, separators=(",", ":"))


def setup_logging(
    level: Optional[str] = None,
    log_file: Optional[str] = None,
    include_source_location: bool = False,
) -> None:
    """
    Configure root logger with structured JSON formatting.

    Sets up:
    - Console handler (stdout) with JSON formatting
    - Optional file handler with JSON formatting
    - Root logger level from environment or default

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
               Defaults to LOG_LEVEL env var, or INFO if not set.
        log_file: Optional path to log file. If provided, enables file logging.
        include_source_location: Include filename/lineno in JSON output.

    Example:
        setup_logging()  # Uses LOG_LEVEL env var, defaults to INFO
        setup_logging("DEBUG")  # Force DEBUG level
        setup_logging(log_file="logs/app.log")  # With file output
    """
    # Determine log level
    if level is None:
        level_str = os.getenv("LOG_LEVEL", "INFO").upper()
        level = getattr(logging, level_str, logging.INFO)

    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Remove existing handlers to avoid duplicates
    root_logger.handlers.clear()

    # Create formatter
    formatter = StructuredFormatter(
        include_source_location=include_source_location
    )

    # Console handler (stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler (optional)
    if log_file:
        # Ensure log directory exists
        log_dir = os.path.dirname(log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)

        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    # Log initialization message
    root_logger.info(
        "Logging initialized",
        extra={
            "level": logging.getLevelName(level),
            "log_file": log_file or "console-only",
        },
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the given name.

    This is a convenience wrapper around logging.getLogger().

    Args:
        name: Logger name (usually __name__)

    Returns:
        Logger instance
    """
    return logging.getLogger(name)
