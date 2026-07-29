"""Demo limits and settings.

Everything is overridable via environment variables so the same code can run as
a tightly-limited public demo or a more generous internal instance.
"""

from __future__ import annotations

import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, "1" if default else "0").lower() in ("1", "true", "yes", "on")


class Settings:
    # ---- Data volume limits (the "demo throttle") -------------------------
    MAX_FILE_SIZE_BYTES: int = _int("DEMO_MAX_FILE_BYTES", 2 * 1024 * 1024)  # 2 MB
    MAX_ROWS: int = _int("DEMO_MAX_ROWS", 2000)          # points kept per column
    MAX_COLUMNS: int = _int("DEMO_MAX_COLUMNS", 20)      # columns kept from a file
    MIN_POINTS: int = _int("DEMO_MIN_POINTS", 32)        # minimum history to forecast
    MAX_HORIZON: int = _int("DEMO_MAX_HORIZON", 128)     # max steps ahead
    DEFAULT_HORIZON: int = _int("DEMO_DEFAULT_HORIZON", 24)

    # ---- Rate limiting (per client IP, sliding window) --------------------
    RATE_LIMIT_FORECASTS: int = _int("DEMO_RATE_FORECASTS", 40)
    RATE_LIMIT_WINDOW_SEC: int = _int("DEMO_RATE_WINDOW", 3600)

    # ---- Model ------------------------------------------------------------
    MODEL_MAX_CONTEXT: int = _int("DEMO_MODEL_CONTEXT", 1024)
    MODEL_ID: str = os.getenv("DEMO_MODEL_ID", "google/timesfm-2.5-200m-pytorch")
    FORCE_FALLBACK: bool = _bool("DEMO_FORCE_FALLBACK", False)
    ALLOW_FALLBACK: bool = _bool("DEMO_ALLOW_FALLBACK", True)

    # ---- Branding / lead capture -----------------------------------------
    CONTACT_EMAIL: str = os.getenv("DEMO_CONTACT_EMAIL", "advisory@meridianforecasting.com")
    BRAND: str = os.getenv("DEMO_BRAND", "Meridian")
    BRAND_SUFFIX: str = os.getenv("DEMO_BRAND_SUFFIX", "Forecasting")
    ESTABLISHED: str = os.getenv("DEMO_ESTABLISHED", "MMXXVI")

    def public_dict(self) -> dict:
        """Limits exposed to the frontend so it can enforce/display them."""
        return {
            "max_file_size_bytes": self.MAX_FILE_SIZE_BYTES,
            "max_rows": self.MAX_ROWS,
            "max_columns": self.MAX_COLUMNS,
            "min_points": self.MIN_POINTS,
            "max_horizon": self.MAX_HORIZON,
            "default_horizon": self.DEFAULT_HORIZON,
            "rate_limit_forecasts": self.RATE_LIMIT_FORECASTS,
            "rate_limit_window_sec": self.RATE_LIMIT_WINDOW_SEC,
            "contact_email": self.CONTACT_EMAIL,
            "brand": self.BRAND,
            "brand_suffix": self.BRAND_SUFFIX,
            "established": self.ESTABLISHED,
        }


settings = Settings()
