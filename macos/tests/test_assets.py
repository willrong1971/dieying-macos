import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/prepare-assets.py"
spec = importlib.util.spec_from_file_location("prepare_assets", SCRIPT)
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


def glb(uri=None):
    document = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 0}]}
    if uri:
        document["images"] = [{"uri": uri}]
    data = json.dumps(document).encode()
    data += b" " * ((-len(data)) % 4)
    return b"glTF" + struct.pack("<IIII", 2, 20 + len(data), len(data), 0x4E4F534A) + data


class AssetPackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "source"
        self.output = Path(self.temp.name) / "app/Web"
        self.root.mkdir()
        def put(name, data=b"offline"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.put = put
        for name in ["index.html", "solitaire.html", "tile-studio.html", "public/icon.svg", "src/solitaire.js", "src/games/group-a.js", "src/solitaire.css", "vendor/three/build/three.module.js"]:
            put(name)
        for folder in ["ivory-warm", "v2"]:
            for index in range(42):
                put(f"public/tiles/{folder}/face_{index:02d}.png")
        for index in range(10):
            put(f"public/audio/solitaire/voice_{index}.m4a")
        for index in range(12):
            put(f"public/audio/tiles/contact_{index}.wav")
        for theme in assets.THEMES:
            put(f"exports/v2/game/mahjong_42_{theme}_lod1.glb", glb())
        put("exports/high-resolution.glb", b"excluded")
        put("qa/private-data.txt", b"excluded")
        put("public/audio/solitaire/source-recording.wav", b"excluded")

    def tearDown(self):
        self.temp.cleanup()

    def test_runtime_is_complete_minimal_and_reproducible(self):
        manifest = assets.prepare(self.root, self.output)
        self.assertEqual(assets.verify(self.output), manifest)
        paths = {item["path"] for item in manifest["files"]}
        self.assertIn("index.html", paths)
        self.assertIn("solitaire.html", paths)
        self.assertIn("tile-studio.html", paths)
        self.assertIn("src/games/group-a.js", paths)
        self.assertEqual(len([name for name in paths if name.endswith(".glb")]), 3)
        self.assertNotIn("exports/high-resolution.glb", paths)
        self.assertFalse(any(name.startswith("qa/") for name in paths))
        self.assertNotIn("public/audio/solitaire/source-recording.wav", paths)
        self.assertEqual(assets.prepare(self.root, self.output), manifest)

    def test_manifest_verification_catches_changed_asset(self):
        assets.prepare(self.root, self.output)
        (self.output / "src/solitaire.js").write_text("changed")
        with self.assertRaisesRegex(ValueError, "differs from manifest"):
            assets.verify(self.output)

    def test_rebuild_removes_only_obsolete_managed_files(self):
        assets.prepare(self.root, self.output)
        self.put("src/new-module.js")
        (self.output / "obsolete.js").write_text("old")
        manifest = assets.prepare(self.root, self.output)
        self.assertFalse((self.output / "obsolete.js").exists())
        self.assertIn("src/new-module.js", {item["path"] for item in manifest["files"]})
        assets.verify(self.output)

    def test_output_guards_preserve_sources_and_unmanaged_files(self):
        for output in [self.root, self.root.parent, self.root / "src/out"]:
            with self.assertRaises(ValueError):
                assets.prepare(self.root, output)
        self.output.mkdir(parents=True)
        kept = self.output / "unrelated.txt"
        kept.write_text("keep")
        with self.assertRaisesRegex(ValueError, "nonempty folder"):
            assets.prepare(self.root, self.output)
        self.assertEqual(kept.read_text(), "keep")

    def test_manifest_verification_catches_an_added_file(self):
        assets.prepare(self.root, self.output)
        (self.output / "unexpected.txt").write_text("outside manifest")
        with self.assertRaisesRegex(ValueError, "inventory changed"):
            assets.verify(self.output)

    def test_output_rejects_symbolic_links(self):
        assets.prepare(self.root, self.output)
        (self.output / "redirect").symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symbolic links"):
            assets.prepare(self.root, self.output)

    def test_missing_previews_and_external_glb_dependencies_fail(self):
        (self.root / "public/tiles/v2/face_00.png").unlink()
        with self.assertRaisesRegex(ValueError, "42 tile previews"):
            assets.prepare(self.root, self.output)
        self.put("public/tiles/v2/face_00.png")
        self.put("exports/v2/game/mahjong_42_ivory_lod1.glb", glb("https://example.invalid/texture.png"))
        with self.assertRaisesRegex(ValueError, "external asset"):
            assets.prepare(self.root, self.output)


if __name__ == "__main__":
    unittest.main()
