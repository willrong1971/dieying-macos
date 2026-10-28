#!/bin/zsh
set -euo pipefail
task_root="${0:A:h:h}"
task_macos="$task_root/macos"
task_dist="$task_root/dist/macos"
task_archs=("$(uname -m)")
task_install=0
for task_arg in "$@"; do
  case "$task_arg" in
    --universal) task_archs=(arm64 x86_64) ;;
    --install) task_install=1 ;;
    *) print -u2 "用法：macos/build.sh [--universal] [--install]"; exit 2 ;;
  esac
done
mkdir -p "$task_root/.build" "$task_dist"
task_stage="$(mktemp -d "$task_root/.build/dieying.XXXXXX")"
trap 'rm -rf "$task_stage"' EXIT
task_app="$task_stage/叠影.app"
mkdir -p "$task_app/Contents/MacOS" "$task_app/Contents/Resources"
task_sdk="$(xcrun --sdk macosx --show-sdk-path)"
print "编译叠影：${(j:, :)task_archs}"
task_binaries=()
for task_arch in "${task_archs[@]}"; do
  xcrun swiftc -O -whole-module-optimization -swift-version 5 \
    -target "$task_arch-apple-macos14.0" -sdk "$task_sdk" \
    -framework AppKit -framework WebKit -framework UniformTypeIdentifiers \
    "$task_macos"/Sources/*.swift -o "$task_stage/DieYing-$task_arch"
  task_binaries+=("$task_stage/DieYing-$task_arch")
done
if (( ${#task_archs[@]} > 1 )); then
  xcrun lipo -create "${task_binaries[@]}" -output "$task_app/Contents/MacOS/DieYing"
else
  cp "$task_stage/DieYing-${task_archs[1]}" "$task_app/Contents/MacOS/DieYing"
fi
cp "$task_macos/Info.plist" "$task_app/Contents/Info.plist"
cp "$task_macos/Resources/AppIcon.icns" "$task_app/Contents/Resources/AppIcon.icns"
cp "$task_macos/Resources/NativeBridge.js" "$task_app/Contents/Resources/NativeBridge.js"
/usr/bin/python3 "$task_macos/scripts/prepare-assets.py" --output "$task_app/Contents/Resources/Web"
/usr/bin/plutil -lint "$task_app/Contents/Info.plist"
/usr/bin/codesign --force --sign - "$task_app"
/usr/bin/codesign --verify --deep --strict "$task_app"
if [[ -e "$task_dist/叠影.app" ]]; then
  task_old_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$task_dist/叠影.app/Contents/Info.plist")"
  [[ "$task_old_id" == "local.will.dieying" ]] || { print -u2 "输出位置存在其他应用，已停止。"; exit 1; }
  rm -rf "$task_dist/叠影.app"
fi
mv "$task_app" "$task_dist/叠影.app"
print "构建完成：$task_dist/叠影.app"
du -sh "$task_dist/叠影.app"
if (( task_install )); then "$task_macos/install.sh" "$task_dist/叠影.app"; fi
