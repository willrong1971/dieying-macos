#!/bin/zsh
set -euo pipefail
task_root="${0:A:h:h}"
task_app="$task_root/dist/macos/叠影.app"
task_dmg="$task_root/dist/macos/叠影-1.0.0-通用版.dmg"
[[ -d "$task_app" ]] || { print -u2 "请先执行 macos/build.sh --universal。"; exit 1; }
/usr/bin/codesign --verify --deep --strict "$task_app"
task_stage="$(mktemp -d "$task_root/.build/dieying-package.XXXXXX")"
trap 'rm -rf "$task_stage"' EXIT
/usr/bin/ditto "$task_app" "$task_stage/叠影.app"
ln -s /Applications "$task_stage/应用程序"
cat > "$task_stage/安装说明.txt" <<'TEXT'
叠影 · 麻将对对碰

把“叠影.app”拖入“应用程序”，然后从应用程序或启动台打开。
如果旧版本正在运行，请先退出旧版本再安装。

全部模型、图片和声音已内置，游戏运行不需要浏览器、本地服务或网络。
支持 Apple 芯片和 Intel，要求 macOS 14 或更新版本。

本机存档：~/Library/Application Support/DieYing/saved-games.json
TEXT
/usr/bin/hdiutil create -volname "叠影" -srcfolder "$task_stage" -format UDZO -ov "$task_dmg"
/usr/bin/hdiutil verify "$task_dmg"
print "安装包：$task_dmg"
