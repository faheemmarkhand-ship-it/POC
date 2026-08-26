#!/usr/bin/env python3
"""Entry point: runs uvicorn app.main:app on port 8001 with --reload."""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def main():
    os.environ.setdefault("SEED_ON_STARTUP", "1")
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        reload_dirs=[str(HERE)],
    )


if __name__ == "__main__":
    main()
