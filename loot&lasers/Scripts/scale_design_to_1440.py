"""One-time 1920→2560 design conversion: multiply authored UI sizes by 4/3."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCALE = 4.0 / 3.0
SKIP = {"ResolutionRules.gd", "ResolutionManager.gd"}

FONT_PAT = re.compile(r'(add_theme_font_size_override\(\s*["\']font_size["\']\s*,\s*)(\d+)(\s*\))')
FONT_EQ_PAT = re.compile(r"(\.font_size\s*=\s*)(\d+)")
CMIN_XY = re.compile(r"(custom_minimum_size\.(x|y)\s*=\s*)(\d+)")
CMIN_VEC = re.compile(r"(custom_minimum_size\s*=\s*Vector2i?\()(\d+)\s*,\s*(\d+)(\))")
OFFSET_PAT = re.compile(r"(offset_(?:top|bottom|left|right)\s*=\s*)(-?\d+)")


def scale_int(n: int, min_keep: int = 1) -> int:
    if abs(n) <= 4:
        return n
    s = int(round(n * SCALE))
    if n > 0:
        return max(min_keep, s)
    return min(-min_keep, s)


def convert(text: str) -> str:
    text = FONT_PAT.sub(lambda m: f"{m.group(1)}{scale_int(int(m.group(2)))}{m.group(3)}", text)
    text = FONT_EQ_PAT.sub(lambda m: f"{m.group(1)}{scale_int(int(m.group(2)))}", text)
    text = CMIN_XY.sub(lambda m: f"{m.group(1)}{scale_int(int(m.group(3)))}", text)
    text = CMIN_VEC.sub(
        lambda m: f"{m.group(1)}{scale_int(int(m.group(2)))}, {scale_int(int(m.group(3)))}{m.group(4)}",
        text,
    )

    def repl_offset(m: re.Match[str]) -> str:
        n = int(m.group(2))
        if abs(n) < 6:
            return m.group(0)
        return f"{m.group(1)}{scale_int(n)}"

    return OFFSET_PAT.sub(repl_offset, text)


def main() -> None:
    changed: list[str] = []
    for path in ROOT.rglob("*.gd"):
        if path.name in SKIP or ".godot" in path.parts:
            continue
        original = path.read_text(encoding="utf-8")
        updated = convert(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(str(path.relative_to(ROOT)))
    print(f"updated {len(changed)} files")
    for name in changed:
        print(name)


if __name__ == "__main__":
    main()
