# 叠影 · Mac 独立版

AppKit 原生应用窗口，使用 macOS 自带的 WebKit 图形内核运行本项目。
游戏、三套立体牌面、配音与牌声全部随 App 打包。运行不需要浏览器、Node.js、本地 HTTP 服务或网络连接。

包含经典麻将对对碰，以及可从菜单进入的 16 种数学教学玩法。

## 本机编译与安装

需要 macOS 14 或更高版本，以及 Xcode 或带有 macOS SDK 的开发工具。
在项目根目录双击 `编译安装Mac版.command`，或者执行：

```sh
./macos/build.sh --universal --install
```

- 输出：`dist/macos/叠影.app`
- 安装：`/Applications/叠影.app`
- `--universal` 同时编译 Apple 芯片与 Intel；省略时只编译本机架构。
- 省略 `--install` 时只构建。已安装的本应用更新前会移到 `dist/macos/previous/` 保留。
- 本机构建使用临时签名，适合这台 Mac 直接安装运行。未配置互联网分发、公证或自动更新。

构建后可用 `./macos/package.sh` 生成带“应用程序”入口的 DMG 安装包。

## 操作

点击选牌；错配保留首牌，再点首牌或空桌取消。鼠标拖动转视角，滚轮缩放。

- `I` / 菜单“显示 → 沉浸牌桌”：沉浸；`Esc`：返回。
- `⌘N`：新牌局；`⌘P`：暂停或继续。
- `⌘T`：提示；`⌘Z`：撤销；`⌘R`：洗牌；`⌘0`：视角复位。
- `⌘1`：对对碰；`⌘2`：数学教学工坊。
- `⌃⌘F` 或窗口绿色按钮：原生窗口全屏。

## 存档

每次操作自动保存，退出前同步最后的计时。原生恢复副本位于：

`~/Library/Application Support/DieYing/saved-games.json`

它与原网页浏览器的存档分开；安装不会更改原网页的牌局。App 内在对对碰和工坊之间切换会保留各自进度。

## 验证

```sh
npm test
node --test macos/tests/native-bridge.test.mjs
python3 -m unittest discover -s macos/tests -p 'test_*.py' -v
mkdir -p macos/build/tests
xcrun swiftc -swift-version 5 -target arm64-apple-macos14.0 \
  -framework Foundation -framework WebKit \
  macos/Sources/AssetSchemeHandler.swift macos/tests/AssetHandlerTests.swift \
  -o macos/build/tests/asset-handler-tests
macos/build/tests/asset-handler-tests
python3 macos/scripts/prepare-assets.py --output 'dist/macos/叠影.app/Contents/Resources/Web' --verify
codesign --verify --deep --strict 'dist/macos/叠影.app'
```

“帮助 → 运行状态…”可查看本机窗口、画布与声音的运行状态；诊断信息只在本机显示。

本机的运行截图与验收记录可保存在 `qa/macos/`，此目录由 Git 忽略。资源清单保存在 App 的 `Contents/Resources/Web/asset-manifest.json`，列出所有资源的尺寸与 SHA-256。
