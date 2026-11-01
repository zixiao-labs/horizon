#!/usr/bin/env python3
"""Copy an Ark UI starter without modifying an existing non-empty directory."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parent.parent
VARIANTS = {
    "vanilla": SKILL_ROOT / "assets" / "starter-vanilla",
    "react": SKILL_ROOT / "assets" / "react",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="New or empty output directory")
    parser.add_argument("--variant", choices=sorted(VARIANTS), default="vanilla")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source = VARIANTS[args.variant]
    destination = args.destination.expanduser().resolve()

    if destination.exists() and any(destination.iterdir()):
        raise SystemExit(f"Refusing to overwrite non-empty directory: {destination}")

    destination.mkdir(parents=True, exist_ok=True)
    for item in source.iterdir():
        target = destination / item.name
        if item.is_dir():
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)

    print(f"Created {args.variant} Ark UI starter at {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
