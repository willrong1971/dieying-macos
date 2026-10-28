#!/usr/bin/env python3
"""Copy the self-contained web runtime into a macOS app's Resources/Web folder."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
THEMES = ("ivory", "bamboo", "porcelain")
MANIFEST_NAME = "asset-manifest.json"


def runtime_files(root: Path) -> list[Path]:
    files = [root / "index.html", root / "solitaire.html", root / "public/icon.svg"]
    files += sorted(path for path in (root / "src").rglob("*") if path.is_file() and path.suffix in {".js", ".css"})
    files += sorted(path for path in (root / "vendor/three").rglob("*") if path.is_file())
    for folder in ("ivory-warm", "v2"):
        files += sorted((root / "public/tiles" / folder).glob("*.png"))
    files += sorted((root / "public/audio/solitaire").glob("*.m4a"))
    files += sorted((root / "public/audio/tiles").glob("*.wav"))
    files += [root / f"exports/v2/game/mahjong_42_{theme}_lod1.glb" for theme in THEMES]
    return sorted(set(files), key=lambda path: path.relative_to(root).as_posix())


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def validate_glb(path: Path) -> None:
    with path.open("rb") as stream:
        header = stream.read(20)
        if len(header) != 20 or header[:4] != b"glTF":
            raise ValueError(f"Invalid GLB: {path}")
        version, length, json_length, chunk_kind = struct.unpack("<IIII", header[4:])
        if version != 2 or length != path.stat().st_size or chunk_kind != 0x4E4F534A:
            raise ValueError(f"Invalid GLB header: {path}")
        document = json.loads(stream.read(json_length))
    for item in document.get("images", []) + document.get("buffers", []):
        uri = item.get("uri", "")
        if uri and not uri.startswith("data:"):
            raise ValueError(f"GLB requires an external asset: {path}: {uri}")


def validate_source(root: Path, files: list[Path]) -> None:
    for path in files:
        if not path.is_file():
            raise FileNotFoundError(path)
        if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"Runtime asset must be a regular source file: {path}")
    for folder in ("ivory-warm", "v2"):
        if len(list((root / "public/tiles" / folder).glob("*.png"))) != 42:
            raise ValueError(f"Expected all 42 tile previews in {folder}")
    if len(list((root / "public/audio/solitaire").glob("*.m4a"))) != 10:
        raise ValueError("Expected 10 offline narration clips")
    if len(list((root / "public/audio/tiles").glob("*.wav"))) != 12:
        raise ValueError("Expected 12 offline tile contact clips")
    for theme in THEMES:
        validate_glb(root / f"exports/v2/game/mahjong_42_{theme}_lod1.glb")


def prepare(root: Path, output: Path) -> dict:
    root, output = root.resolve(), output.resolve()
    # A mistake in --output must never delete or alter the original sources.
    if output == root or root.is_relative_to(output):
        raise ValueError("Output cannot be the source root or one of its ancestors")
    if output.is_relative_to(root) and output.relative_to(root).parts[0] in {"src", "public", "exports", "vendor"}:
        raise ValueError("Output cannot be inside a runtime source directory")
    if output.exists() and any(path.is_symlink() for path in output.rglob("*")):
        raise ValueError("Runtime output cannot contain symbolic links")
    files = runtime_files(root)
    validate_source(root, files)
    if output.exists() and any(output.iterdir()):
        previous_manifest = output / MANIFEST_NAME
        if not previous_manifest.is_file():
            raise ValueError("Refusing to replace a nonempty folder without an app asset manifest")
        previous = json.loads(previous_manifest.read_text(encoding="utf-8"))
        if previous.get("app") != "mahjong-macos-offline-runtime":
            raise ValueError("Refusing to replace a folder owned by a different manifest")
    output.mkdir(parents=True, exist_ok=True)
    expected = {path.relative_to(root).as_posix() for path in files}
    for previous in sorted(output.rglob("*"), reverse=True):
        if previous.is_file() and previous.relative_to(output).as_posix() not in expected:
            previous.unlink()
        elif previous.is_dir() and not any(previous.iterdir()):
            previous.rmdir()
    records = []
    for source in files:
        relative = source.relative_to(root).as_posix()
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        records.append({"path": relative, "size": target.stat().st_size, "sha256": digest(target)})
    manifest = {
        "schema": 1,
        "app": "mahjong-macos-offline-runtime",
        "entry": "solitaire.html",
        "workshop": "index.html",
        "scheme": "mahjong://app/",
        "file_count": len(records),
        "total_bytes": sum(item["size"] for item in records),
        "files": records,
    }
    (output / MANIFEST_NAME).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def verify(output: Path) -> dict:
    output = output.resolve()
    if any(path.is_symlink() for path in output.rglob("*")):
        raise ValueError("Runtime output cannot contain symbolic links")
    manifest = json.loads((output / MANIFEST_NAME).read_text(encoding="utf-8"))
    expected = {record["path"] for record in manifest["files"]}
    actual = {path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file() and path.name != MANIFEST_NAME}
    if actual != expected:
        raise ValueError(f"Runtime file inventory changed: missing={expected - actual}, extra={actual - expected}")
    for record in manifest["files"]:
        path = output / record["path"]
        if not path.resolve().is_relative_to(output):
            raise ValueError("Manifest asset escapes the runtime folder")
        if path.stat().st_size != record["size"] or digest(path) != record["sha256"]:
            raise ValueError(f"Runtime asset differs from manifest: {record['path']}")
    if manifest["file_count"] != len(expected) or manifest["total_bytes"] != sum(record["size"] for record in manifest["files"]):
        raise ValueError("Runtime inventory totals are inconsistent")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path, help="App Contents/Resources/Web destination")
    parser.add_argument("--source", type=Path, default=PROJECT_ROOT, help="Project root, defaults to this script's project")
    parser.add_argument("--verify", action="store_true", help="Verify an already prepared runtime without modifying it")
    args = parser.parse_args()
    manifest = verify(args.output) if args.verify else prepare(args.source, args.output)
    print(json.dumps({"output": str(args.output.resolve()), "file_count": manifest["file_count"], "total_bytes": manifest["total_bytes"], "verified": args.verify}, ensure_ascii=False))


if __name__ == "__main__":
    main()
