# 第三方组件与字体

- **Three.js 0.186.1**：运行库位于 `vendor/three/`，保留其原有 MIT 许可：[LICENSE](vendor/three/LICENSE)。
- **Ma Shan Zheng**：牌面字形设计使用该字体。Copyright 2018 The Ma Shan Zheng Project Authors。来源：https://github.com/googlefonts/mashanzheng 。SIL Open Font License 1.1 原文见 [OFL.txt](licenses/fonts/ma-shan-zheng/OFL.txt)。
- **Yuji Syuku**：部分牌面字形设计使用该字体。Copyright 2021 The Yuji Project Authors。来源：https://github.com/Kinutafontfactory/Yuji 。SIL Open Font License 1.1 原文见 [OFL.txt](licenses/fonts/yuji-syuku/OFL.txt)。

仓库包含游戏使用的字形几何与牌面资源，不包含字体安装文件。

普通话配音由本机 Qwen3-TTS 生成；生成信息及台词见 `public/audio/solitaire/manifest.json`。麻将碰牌声为程序合成，信息见 `public/audio/tiles/manifest.json`。运行、编译本应用均不需要语音模型。
