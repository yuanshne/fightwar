# 像素勇者 · Pixel Quest

一款类超级马里奥的**像素风横版闯关平台游戏**。零依赖、零素材文件——所有像素画、瓦片、
背景、音效与音乐全部由代码生成，双击 `index.html` 即玩，可离线、可上 GitHub Pages。

![Python 3.9+](https://img.shields.io/badge/plain-JavaScript%20Canvas-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## 玩法

- **6 大关卡 · 6 套主题**：草原 → 幽暗洞窟 → 天空栈道 → 齿轮工厂 → 烈焰深渊 → 最终之塔（纵向登顶）
- **14 种机关**：弹簧、单向平台、移动平台（可载人）、崩塌砖、尖刺、熔岩、拉杆切换橙/蓝砖、
  钥匙与门、传送带、大炮、横/竖电锯、冰面、检查点、可踩踏的史莱姆与蝙蝠
- **手感**：土狼时间、跳跃缓冲、长按跳更高、着地/弹簧粒子、屏幕震动
- **星级**：★通关 / ★金币全收 / ★限时；进度与设置 localStorage 持久化
- **音频**：WebAudio 实时合成 15 个音效 + 双轨循环 BGM（M 键开关）

## 操作

| 键 | 功能 |
|---|---|
| ←→ / A D | 移动 |
| ↑ / W / 空格 | 跳跃（长按更高） |
| P | 暂停 ｜ R 重开本关 ｜ Esc 菜单 |
| M | 声音开关 |

## 运行

直接双击 `index.html`；或 `python -m http.server 8765` 后访问
`http://127.0.0.1:8765/index.html`。调试参数：`?level=3` 直跳第 3 关，`?god=1` 无敌模式。

## 工程结构（三子 agent 并行 + 契约 + 确定性门禁）

```
index.html      壳：常量、脚本加载顺序
art.js          像素素材库：精灵/六主题配色/程序化瓦片/视差背景/3x5像素字体
levels.js       关卡 DSL + 六关数据 + validateLevels() 几何断言(间隙/支撑/熔岩/拉杆)
engine.js       物理(逐轴AABB/土狼时间)、14种机关逻辑、敌人AI、世界状态
ui.js           渲染、输入桥接、音频合成、界面状态机、存档、主循环
tools/gate.js   确定性门禁：art=语法+导出 / levels=执行+断言 / engine=六关构造+空转180帧
docs/           设计方案、grilling 拷问记录、模块契约(CONTRACT.md)
```

开发流程见 `docs/specs/2026-10-24-pixel-quest-design.md`：brainstorm 方案 → grilling 拷问 →
三个 GLM-5.3-Flash 子 agent（美术/关卡/引擎）并行开发，每个模块必须通过 `node tools/gate.js`
门禁才能交付，主 agent 负责集成与浏览器实测（`tools/browsertest.py`：控制台零错误、逐关
加载、按键模拟、截图审查）。

## 测试

```bash
node tools/gate.js art      # 素材：语法 + 导出齐全
node tools/gate.js levels   # 关卡：执行 + 几何断言
node tools/gate.js engine   # 引擎：六关构造 + 空转 180 帧
python tools/browsertest.py # 浏览器集成实测（需 playwright + 本地服务器）
```

## License

MIT
