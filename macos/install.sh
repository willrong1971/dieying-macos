#!/bin/zsh
set -euo pipefail
task_root="${0:A:h:h}"
task_source="${1:-$task_root/dist/macos/叠影.app}"
task_destination="/Applications/叠影.app"
[[ -d "$task_source" ]] || { print -u2 "找不到构建后的叠影.app，请先执行 macos/build.sh。"; exit 1; }
/usr/bin/codesign --verify --deep --strict "$task_source"
if [[ -e "$task_destination" ]]; then
  task_existing_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$task_destination/Contents/Info.plist")"
  [[ "$task_existing_id" == 'local.will.dieying' ]] || { print -u2 "应用程序中存在同名的其他App，未覆盖。"; exit 1; }
  mkdir -p "$task_root/dist/macos/previous"
  task_backup="$task_root/dist/macos/previous/叠影-$(date +%Y%m%d-%H%M%S).app"
  mv "$task_destination" "$task_backup"
  print "上一版本保存在：$task_backup"
fi
/usr/bin/ditto "$task_source" "$task_destination"
/usr/bin/codesign --verify --deep --strict "$task_destination"
print "安装完成：$task_destination"
