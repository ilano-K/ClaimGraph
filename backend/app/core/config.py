"""Application-level constants and paths.

Centralizes user-facing configuration that is derived from the environment
rather than secrets (which live in :mod:`app.core.settings`). Defines where
local app data such as the SQLite database is stored.
"""
from pathlib import Path
import os 

APP_NAME = "claim-graph"
# Platform-agnostic data directory (e.g. %LOCALAPPDATA% on Windows).
LOCAL_APP_DATA = Path(os.getenv("LOCALAPPDATA")) / APP_NAME

# Ensure the directory exists so the database file can be created on first run.
LOCAL_APP_DATA.mkdir(exist_ok=True)

DATABASE_PATH = LOCAL_APP_DATA / "app.db"