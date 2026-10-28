#!/bin/zsh
set -euo pipefail
script_dir="${0:A:h}"
resource_dir="${script_dir:h}/Resources"
work_dir="$(mktemp -d -t mahjong-icon)"
trap 'rm -rf "$work_dir"' EXIT
mkdir -p "$resource_dir" "$work_dir/AppIcon.iconset"
swift "$script_dir/generate-icon.swift" "$work_dir/master.png"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$work_dir/master.png" --out "$work_dir/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  double_size=$((size * 2))
  sips -z "$double_size" "$double_size" "$work_dir/master.png" --out "$work_dir/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$work_dir/AppIcon.iconset" -o "$resource_dir/AppIcon.icns"
cp "$work_dir/master.png" "$resource_dir/AppIcon.png"
printf '%s\n' "$resource_dir/AppIcon.icns"
