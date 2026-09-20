"""Vercel serverless entrypoint.

Vercel turns each file under ``api/`` into a Python serverless function and
serves the WSGI callable it finds named ``app``. ``vercel.json`` rewrites every
path here, so Flask does its own routing — pages, blueprints and /static —
exactly as it does under ``python app.py``.
"""

from __future__ import annotations

import os
import sys

# The function is bundled with the repository root one directory up. Put it on
# sys.path so `routes`, `utils` and `config` resolve the same way they do
# locally.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app import app  # noqa: E402,F401
