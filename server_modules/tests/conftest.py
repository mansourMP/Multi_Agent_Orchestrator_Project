from __future__ import annotations

import asyncio
import inspect
import warnings

asyncio.iscoroutinefunction = inspect.iscoroutinefunction


warnings.filterwarnings(
    "error",
    category=DeprecationWarning,
    module=r"server_modules(\..*)?",
)
