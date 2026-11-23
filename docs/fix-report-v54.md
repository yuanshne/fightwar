# v54 修复报告：AI 主角/法师取帧管线 与 Boss 前摇抬手

修复对象：`C:\Users\A\Desktop\youxi`（浏览器像素游戏，经典 `<script>` 顺序加载）
交付形式：源码就地修改 + 修复前后截图对比（`.screenshots/`）+ 可复跑的自测脚本（`tools/`）
**未提交、未发布、未删除任何用户文件。**

---

## 0. 一句话结论

五个已确认的「改了没生效」根因全部修掉：20 套骑士皮肤、19 套法师皮肤在运行时**全部为 32×38 AI 帧**（审计范围内 16×16 主角/法师帧从 **406 → 0**），装备外观随 32×38 模型正确叠加不被裁切，14 只 Boss 在 windup 有**一眼可读的举臂姿态**，AI 素材成为永久权威来源（12 秒后不再回流旧帧）。启动 **0 pageerror**，`SPR` 键数 170 → 171（多出的 1 个是幂等标志 `__built`，无删除键）。碰撞框、移动数值、Boss 血量、招式时序、伤害判定**一律未改**。

---

## 1. 逐 bug：根因 → 改动 → 验证

### Bug 1｜新主角模型被装备外观裁成 16×16（「用了还是老模型」）
- **根因**：`ui.js` 的 `heroLook()` 固定建 16×16 canvas，把 16×16 装备层与 32×38 底帧一起画进 16×16；只要有任意装备（`progress.equip.w/h/c` 任一 ≥0）新模型就被裁成左上 16×16。`_lookCache` 只按底帧 img 做 key，尺寸变化不失效。玩家存档通常带装备，所以必现。
- **改动**：`ui.js` `heroLook()` 按底帧真实尺寸建画布（`bw=img.width||16, bh=img.height||16`，兼容 32×38 与 16×16 兜底）；缓存改为两级 Map，复合键 = `尺寸 | 皮肤 id | 三槽装备档 | 攻/冲家族`；`equipSkin()` 追加 `_lookDirty()` 让切皮肤即时失效。
- **装备层对齐**（16×16 覆盖网格比例映射，32×38 时 sx=2、sy=2.375）：披风置底层 → 底帧 1:1 → 武器手侧 → 头饰头顶不遮脸；画序 cape→base→weapon→hat。
- **验证**：穿 `{w:1,h:2,c:3}`（atk+3、生命 7/7）三槽叠加齐全、全身未被裁；脱装 atk=0 三槽空；切皮肤无上一套残留。截图 `.screenshots/ui/before_ingame_equip_cropped.png ↔ after_ingame_equip_32x38.png`。

### Bug 2｜非 blue 皮肤仍走旧 16×16 程序化帧
- **根因**：`art.js` `getHeroSkin()` 对非 blue 走 `_heroSkinFrames(sk.pal)` 重绘 16×16 旧像素模型，只有 blue 返回 AI 帧；`ui.js` `heroPoseImg()` 又优先取 `skinFrames(progress.skin)` —— 于是装备任何掉落皮肤都会退回旧模型。
- **改动**：新增 `hero_skin_ai.js`（20 套骑士）与 `mage_skin_ai.js`（19 套法师），用 **HSL 分区染色**（盔甲/披风/饰件/肤色分区）在 32×38 AI 底帧上生成全状态帧集；`art.js` `getHeroSkin()` 只加一条「AI 层优先、缺失/未就绪/抛错静默回退」分支，`HERO_SKINS` 表与数值未动；法师侧不改 `art.js`，在 `mage_ai.js/mage_skin_ai.js` 里**外部包装**全局 `getMageSkin/getMageLook/mageSkinFrames` 并保留旧实现兜底。
- **验证**：骑士 20 套 + 法师 19 套，`idle/run/jump/fall/attack/dash/cast/squash/die` 全状态 32×38；blue 保持原链路（法师 blue 本命帧 RGBA **100% 精确一致**）；19 套骑士主色最小 RGB 距离 26（可区分）。
- **关键坑（已解决）**：`file://` 下 file 图片会污染 canvas，`getImageData` 抛 `SecurityError` → 染色静默失败回落 16×16。两条线都改为**把底帧 RGBA 像素 base64 内嵌进脚本**，染色在 `Uint8ClampedArray` 上做、`putImageData` 出帧，全程不读被污染的 Image/Canvas。

### Bug 3｜UI 缩略图/肖像未按 32×38 适配
- **根因**：`renderWardrobe()` 把 32×38 强行画进 16×20（压扁）；`renderBag()` 用 `drawImage(pv,44,24,48,48)` 把 32×38 拉成 48×48（变形）；死亡帧也走 `heroLook()` 被裁。
- **改动**：新增 `_fitFrame/_drawFit` 等比适配公共入口（最近邻、整数优先、不模糊）；背包框 44,24,48,48 → 实数 **40×48 居中**；衣橱格 → **19×22 居中**；死亡帧改用 32×38 自然尺寸锚定脚底中心。`renderHeroSelect()` 既有的等比模板作为回归保护未改。
- **验证**：`.screenshots/ui/` 下 `before_bag_stretched ↔ after_bag_aspect`、`before_wardrobe_squashed ↔ after_wardrobe_aspect`、`before_death_frame ↔ after_death_frame`、`before_skin_switch_cache_bust ↔ after_skin_switch_cache_bust`。

### Bug 4｜Boss 前摇没有抬手动作
- **根因**：Boss 是每 kind 一张静态立绘（`boss_1..14.png` 96×110），`ai_sprites.js` `drawBoss()` 的 windup 只有整体下蹲/前倾/缩放/发光，没有手臂关键帧。`ui.js` `renderBoss()` 直接委托 `window.PQAI_BOSS_DRAW`，无法从 ui 侧补动作。
- **改动**：新增 `boss_anim.js`，**包装** `window.PQAI_BOSS_DRAW`（`ui.js` 与 `ai_sprites.js` 的 Boss 函数一行未动）：先原样调用旧函数画身体并透传返回值，仅当 `b.state ∈ {'windup','read'}` 时在身体之上叠加手臂层；`boss_gallery.js` 仅 `VER` v53→v54；`index.html` 负责脚本装配与全项目 `?v=54`。
- **姿态四阶段**：A 起手抬臂（u<.22）→ B 抬到最高（.22~.50，末端越过主体包围盒上缘）→ C 蓄力微抖 + 掌心脉动光（.50~.78）→ D 落下出手（.78~1）；4-5 类臂型（拳砸/爪挥/杖举/法阵托举）按 kind 体型分配，主干 4-6px + 1px 深色外轮廓 + 拳/爪/掌块 + 固定肩部枢轴。
- **验证（确定性口径）**：自检把四阶段相位**钉死**（u = 0.12 / 0.36 / 0.64 / 0.88），身体层与手臂层分别渲染到两张干净离屏画布，`armTop` 直接取手臂层最顶不透明行，不再靠遮挡差分阈值。14/14 B 阶段 `armTop < bodyTop`，**最小余量 9px**（最大 24px）；**连跑 3 次 + 我独立复跑 1 次，4/4 次全部 14/14 通过、最小余量恒为 9px**；四阶段相邻帧像素差 ≥1.9 万；**非 windup 零额外绘制**用函数级调用计数证明（同 b/ctx/tick 下直调原函数与包装函数，`fillRect+drawImage` 次数 14 只全部 `orig=6 wrap=6`）。
- 截图：`.screenshots/boss/after_all14_boss_windup_sheet.png`、`after_windup_kind1..14_f1..f4.png`、`before_arm_kindN ↔ after_arm_kindN`。

### Bug 5｜12 秒后旧素材反压回来
- **根因**：`sprites_external.js` `applyPatch` 在 AI 素材未就绪时用 Kenney 旧帧覆盖 `SPR`；`ai_sprites.js / hero_anim.js / mage_ai.js` 只在前 12 秒每 500ms 重压一次，之后旧帧可能永久回流。
- **改动**（都在各自独占文件内，未改 `sprites_external.js`）：AI 帧就绪后对 `SPR.skins[id]` 装**不可写/不可删描述符**；包装函数打跳过标记（`__pqHeroAnim/__pqStyle/__pqMageSkinAI`）防止 12 秒定时器重复外包把外层包装顶掉；**常驻看门狗**（无截止时间）校验皮肤缓存身份与顶层帧尺寸，被顶替/回流即重装复位；`mage_ai.js` 追加常驻 `mg*` 复位。
- **验证**：15 秒后（越过 12 秒窗口）20 套骑士 + 19 套法师 + 顶层帧仍全 32×38；模拟回流（把顶层写成 16×16 并删除/覆写皮肤缓存）后 1.3 秒内被看门狗复位。截图 `after_guard_15s_32x38.png`、`after_guard_restored.png`。

### 额外修掉的两处（修复过程中暴露的真实回归）
1. **`buildSprites()` 幂等守卫竞态（P1，会整批丢精灵）**：`art.js` 守卫原为 `if (SPR.heroIdle1) return SPR;`，AI 主角帧 `onload` 抢先写顶层 `heroIdle1` 就触发早退 → `checkOn/checkOff/coin/flag/look`、Boss 等整批未构建（`SPR` 170→63 键、约 1/3 启动概率、`ui.js:2040` `drawImage` TypeError）。改为独立幂等标志 `if (SPR.__built) return SPR;`，构建成功才置位。**10/10 冷启动**：`SPR` 171 键、关键键 0 缺失、0 TypeError、0 pageerror。
2. **顶层 `heroDashWind/heroDashWindL` 与 `mgDashWind/mgDashWindL/mgSquash` 漏网 16×16**：补进各线「顶层源帧表 / AI 帧复位表」，并给自测加**枚举断言**（所有 `/^hero`、`/^mg` 姿态键非 32×38 即 FAIL），防止再漏。

---

## 2. 交付验收矩阵（QA 线独立实测，file:// 正常加载、进关 ≥13 秒）

| 维度 | 期望 | 实测 | 结论 |
|---|---|---|---|
| 启动完整性（10 次冷启动） | 键数 ≥ 基线、关键键齐全、零报错 | 171×7 / 165×3（165 仅 6 个 `*White` 异步敌人帧晚到，基线同现象）；关键键 0 缺失；0 `drawImage`、0 pageerror | PASS |
| 骑士 20 套 × 全状态 | 全 32×38 | 全 32×38，`run` 6 帧、`attack` 3 帧 | PASS |
| 法师 19 套 × 三口径（`getMageSkin` / `mageSkinFrames` / `getMageLook` 装备态） | 全 32×38 | 57 组帧集全 32×38，0 null | PASS |
| 顶层 `hero*` 22 键 | 全 32×38 | 全 32×38（含补回的 dashWind/DashWindL） | PASS |
| 顶层 `mg*` 姿态键 | 全 32×38 | bad=[]（`mgU/mgI/mgO/mgL` 12×12 图标与 `mgSil` 剪影属设计口径，排除） | PASS |
| 装备三态（骑士 + 法师） | 不裁切、无残留、叠加齐全 | 穿 atk+3（骑 7/7、法 6/6）三槽齐全；脱 atk=0 空槽；切皮肤无残留 | PASS |
| Boss 14 只 × idle | 与改动前零额外绘制 | 函数级计数 `orig=6 / wrap=6`，14/14 | PASS |
| Boss 14 只 × windup 四阶段 | 举臂一眼可读、结果确定 | 相位钉死后 14/14 `armTop < bodyTop`，最小余量 9px；连跑 4 次全过；相邻帧差 ≥1.9 万 | PASS |
| `?level=` 各 Boss 关 | 可进、不卡死 | 13 关全可进，Boss 正常现身 | PASS |
| 全流程错误 | 零 pageerror | 0 pageerror；console 仅剩两类既有噪音（Kenney manifest/sprites 在 file:// 下 fetch 失败、6 个 `*White` 异步帧） | PASS |
| **旧帧尺寸审计（核心量化）** | 运行中无 16×16 主角/法师帧 | 审计范围 **406 → 0**（基线：顶层 hero 7 + 骑士皮肤 209 + 法师皮肤 190；12×12 图标/剪影为设计口径不计） | PASS |

**基线 vs 后置**：`SPR` 键数 170 → 171（+`__built`，无删除键）；`renderEntities` `drawImage` TypeError 基线 0 / 最终采样 0（过程中曾出现 55 条，随 P1 竞态修复消失）。

---

## 3. 改动文件清单

| 文件 | 性质 | 说明 |
|---|---|---|
| `art.js` | 修改 | `getHeroSkin()` 加 AI 优先分支（带回退）；`buildSprites()` 幂等标志改 `__built` |
| `hero_skin_ai.js` | 新增 | 20 套骑士 AI 染色帧 + 顶层帧看门狗 + 永久守卫（内嵌底帧 RGBA） |
| `mage_ai.js` | 修改 | 导出 AI 帧源；补 `mgDashWind/mgSquash` 复位；常驻 `mg*` 看门狗 |
| `mage_skin_ai.js` | 新增 | 19 套法师 AI 染色帧 + 装备态叠加 + 包装/兜底/守卫（内嵌底帧 RGBA） |
| `ui.js` | 修改 | `heroLook()` 画布尺寸与两级缓存、`_fitFrame/_drawFit`、`renderBag`、`renderWardrobe`、`equipSkin` |
| `boss_anim.js` | 新增 | 包装 `PQAI_BOSS_DRAW`，windup 举臂图层 |
| `boss_gallery.js` | 修改 | 仅 `VER` → `?v=54` |
| `index.html` | 修改 | 全部脚本 `?v=54`；按序插入三个新脚本（`hero_skin_ai.js` 在 `hero_anim.js` 后、`mage_skin_ai.js` 在 `mage_ai.js` 后、`boss_anim.js` 在 `boss_gallery.js` 后） |
| `tools/_v54_*`、`tools/_v55_*`、`tools/_qa_v5*` | 新增 | 各线自测与 QA 验收脚本 |

**未改动**：`sprites_external.js`、`engine.js`、`levels.js`、各 `chapter*.js`（与基线 hash 一致）、任何 Boss/Ui 数值逻辑。

---

## 4. 复跑命令（`D:\python\python.exe`，系统 python 无 playwright）

```
D:\python\python.exe tools\_v54_hero_skins_check.py      # 骑士 20 套 + 守卫（51 OK / 0 FAIL）
D:\python\python.exe tools\_v54_boot_smoke.py            # 冷启动 10 次 + 顶层 hero* 尺寸审计
D:\python\python.exe tools\_v55_mage_file_check.py       # 法师 19 套 × 三口径（file://、≥13s）
D:\python\python.exe tools\_v54_ui_frames_check.py       # UI 取帧/装备/缩略图
D:\python\python.exe tools\_v54_boss_windup_check.py     # Boss 14 只 × 四阶段 + idle 零叠加
D:\python\python.exe tools\_qa_v55_*.py                  # QA 总验收
```
既有回归：`_v77_skins_art.js` PASS、`_v209_audit_test.js` 22 PASS/0 FAIL、`_v255_boss_skills_test.js` 47/47。

---

## 5. 已知遗留（非阻塞）

1. **`tools/_v222_ui_test.py` 侧键绑定失败属存量**：基线 `.snap_before` 与主目录同流程均 5 OK / 5 FAIL，失败项逐条一致（合成 `MouseEvent(button=3)` 与当前事件模型不兼容 + 断言过期），非本轮引入。
2. `tools/_v19_mage_test.js` 6 FAIL（122 PASS）、`tools/_v12_boss_test.js` 的 `boss=null`：均为既有引擎/内容漂移或关卡编号过期，基线同样失败。
3. 6 个 `*White` 敌人帧在 2.5 秒探针时点偶发晚到（基线同现象），建议后续把「异步 AI 帧就绪」纳入启动等待条件。
4. Boss 为「静态立绘 + 叠加手臂层」，长袍/翅膀类（kind 5/8/12/13/14）的手臂仍与剪影相邻，可读性弱于甲壳型；若后续要多骨骼动画，需按 kind 拆件重绘立绘。
5. `.snap_before/`（40MB）是本轮改动前的只读基线副本，供复跑对比，交付后可删除。
6. `file://` 下 blue 皮肤与部分 file 源实体帧的 canvas 不可逐像素采样（`http` 部署无此限制），相关断言已改用引用/尺寸身份校验。

---

## 6. 证据目录

- 骑士：`.screenshots/hero/`（`before_/after_all20_skin_idle_sheet.png`、`after_skin_sprout_run_attack.png`、`after_guard_15s_32x38.png`、`boot_smoke_log.txt`、`notes.md`）
- 法师：`.screenshots/mage/`（`before_/after_all19_mage_idle_sheet.png`、`after_mage_equip_32x38.png`、`after_mage_equip_toggle.png`、`_matrix_v55.json`、`notes.md`）
- UI：`.screenshots/ui/`（装备/背包/衣橱/死亡/切皮肤 6 组成对图 + `notes.md`）
- Boss：`.screenshots/boss/`（`after_all14_boss_windup_sheet.png`、56 张四阶段帧、14 组手臂强化前后对比、`notes.md`）
- QA：`.screenshots/qa/`（`qa_v55_report.md`、`final.json`、`before/` 82 张、`after/` 208 张）

---

## 7. v55 增量：五个剩余卡点（并行 5 条线）

### A｜长袍/翅膀型 Boss 抬手可读性（kind 5/8/12/13/14）
- 现象：这 5 只手臂落在宽/亮剪影内部，看不出“抬手”。
- 做法：`boss_anim.js` 加 `SPECIAL_ARM` 专用表 + `specialPose` —— 肩位外扩抬高、臂加长、B 阶段近竖直高举；每 kind 单独配色对（亮臂+深描边+受光边 / 深臂+浅描边），主干 6px + 1px 描边 + 9px 拳/掌/爪块。
- 结果（u=0.36 钉死，身体层/手臂层两张干净离屏画布）：

| kind | armTop | bodyTop | margin | 臂端越出 |
|---|---|---|---|---|
| 5 | 9 | 40 | 31px | 327/327 在包围盒外 |
| 8 | 16 | 37 | 21px | 289/289 |
| 12 | 9 | 43 | 34px | 307/307 |
| 13 | 10 | 32 | 22px | 302/302 |
| 14 | 11 | 50 | 39px | 250/250 |

- 14 只整体仍 14/14 全绿（全量最小余量 9px 在非强化型 kind6），连跑 3 次稳定；非 windup 仍 `orig=6 wrap=6` 零额外绘制；零 pageerror。截图 `.screenshots/a_boss2/`（每只 before/after/strip + 5 只拼图 + 14 只拼图）。

### B｜异步素材启动就绪门
- **真根因（不是“晚到”，是“永久放弃”）**：敌图 PNG 在 file:// 下可能早于 `buildSprites()` 填充 SPR，`enemy_art.js` 的 `finish()` 遇到 `SPR[key]` 不存在即 `origNull` bail，500ms 看门狗也无法补建 → 约 30% 冷启动永久缺 6 个 `*White`。
- 做法：新增 `asset_gate.js`（纯观察者，不改 SPR、不挂主循环）：`required` 92 键（含 6 个 `*White`）、`missing()`、`wait(cb, 3000)`（50ms 轮询 + 独立兜底定时器，超时即放行，缺键只降级不黑屏）、`report()`、`notify()`；`ai_sprites.js` 仅在 `applyHero/applyEnemies` 与 4 个 Image 回调末尾加 `gateNotify()`（未动 drawBoss 与取帧）；`enemy_art.js` 加 `pending{}/tryBuild()`，原帧就绪即补建 + 看门狗重试。
- 结果：**20/20 冷启动 SPR 恒定 171 键**、required 0 缺键、`*White` 0 缺帧、0 drawImage、0 pageerror、0 超时兜底；`waitedMs` min 124 / median 138 / max 409ms（远低于 3s）。`node tools/gate.js art|levels|engine` 全绿。

### E｜加载性能：为什么“还是老模型/慢”
- **结论：不是取帧没生效，也不是网络慢，而是首屏并发解码 burst。** AI 各层就绪标志与首 tick 同期置位，帧体积极小（32×38）；首屏共 7.48MB 请求（vfx2 七张 1024² 3.03MB、瓦片材质 2.61MB、dragon.png 1.09MB），file:// 并发受限导致 onload 被推到 290–330ms，玩家先看到兜底程序化/Kenney 美术，AI 图随后替换 —— 这就是“进去还是老模型”的观感来源。
- 冷启动→可操作（median）：file:// L1 283.6→262.6ms；file:// L7 Boss **350.7→256.7ms**；http L7 318.6→236.9ms。FPS 59.4→59.1（无回退），<30fps 帧占比 0.7–1.4%。
- 已落地（仅独占文件，备份在 `.screenshots/e_perf/_backup_opt/`）：`ai_bg.js` 龙图移出首屏、`ensureDragon()` 背景就绪 1s 后懒加载（首屏 −1.09MB，龙图开始时点 26–31ms→1077–1229ms）；`ai_tiles.js` 纹理分阶段（eager 仅 grass/cave ~723KB，其余 8 族 +700ms 补拉、逐族增量烘焙）；`perf_boot.js` 打点/FPS/内存探针。
- **仍需别人配合**：`ai_vfx.js` 7 张 vfx2 共 3.03MB 首屏全量（最大遗留，建议首次技能命中再懒加载）；`art_external.js` 对 `tiles.png` 二次解码，建议复用 `PQASSETS` 已有 Image。

### C｜存量测试现代化（只改 tools/，游戏代码一行未动）
| 脚本 | 改后 | 基线 `.snap_before` |
|---|---|---|
| `tools/_v12_boss_test.js` | **46 PASS / 0 FAIL / 0 SKIP** | 启动即 `boss=null` 崩溃 |
| `tools/_v19_mage_test.js` | **139 PASS / 0 FAIL / 4 SKIP** | 122 PASS / 6 FAIL |
| `tools/_v222_ui_test.py` | **10 OK / 0 FAIL / 0 SKIP** | 绑定失败 + `player=null` 崩溃 |

- **v12**：`loadLevel(18)` 硬编码 → 改为 `findBossLevel(kind)` 按 kind 动态扫 31 关表；血量/尺寸读 `BAL` 与 meta；两处「行为变更」按现行实现重算（windup 期 Boss 自动转向 → 负例改为正前超 reach；波体自 v41 按 `_engBossScaleByKind` 缩放 → 断言乘系数）。
- **v19**：6 项 FAIL 全部定位为**夹具过期**而非引擎缺陷 —— L1 第 15 列有 v25 新增炸药桶 `q`，爆炸污染了近战伤害与命中判定；新星三方向命中失败还叠加了 v41 新星锚点改到躯干、以及平地向下/水平冰锥即生成即销毁。做法：夹具清桶、三方向拆成三次独立释放、关卡计数与 Boss 关号动态取值、4 个街机关显式 `arcadeOnly` skip（单独计数打印）。
- **v222**：v26 起非 Boss 关改为 ARCADE 街机运行时（不生成玩家），旧标题流程落进街机关 → 改为 `?level=7` 直达平台关，验证侧键 button=3→`Mouse4`、`dashT/dashCd>0`、未绑定键不触发、reload 保留、改绑 N→`KeyN`、零 pageerror。
- 三份脚本的 BASE 路径全部改为从脚本位置推导（原先写死过期绝对路径）。
- **值得人工复核的一条疑似游戏问题**：平地 L1 的霜爆新星，向下/水平冰锥刚生成就销毁，只有向上三枚有效 —— 贴地侧面/下方敌人吃不到冰刺。是否符合“身周解围”设计意图需产品确认（本轮未改游戏代码）。

### D｜31 关全量真机 QA + 30 分钟 bot
- **31/31 关进入 `play`**，0 黑屏、0 逐关卡死、**0 pageerror**；console error 每关 3 条全为 file:// Kenney fetch 同源噪音（与基线 93=93 完全一致）。
- 关卡构成实测：13 Boss 关 + 18 街机关（去重 16 种玩法，`gold`/`dodge` 各重复一关）+ 0 纯平台关。
- 18 个街机关各实操 ~12s（移动/跳/攻击/冲刺）均可响应、可出帧；13 个 Boss 关均截到 windup 帧。
- **FPS 56.7–60.5，无 <30fps 时段**；最差 L08（街机 gold）56.7，其后 L03 58.0、L16 58.4、L12 58.6。
- **30 分钟 bot**：跑满 1800s，覆盖 26/31 关（L27–31 未在时长内到达，已由逐关扫描单独验收），25 次自动跳关，**0 卡死 / 0 黑屏 / 0 pageerror / 0 崩溃**；329 个有效 FPS 采样均值 59.8、最低 57.9（跳关瞬间的跨页 timeOrigin 无效采样已剔除并注明口径）。
- 盯防项已闭环：首遍扫描曾见 L30/L31 各 10 条 `bakeAvailable is not defined`，那是 E 线并行编辑中间态；**定点复测当前源码 L30/L31：`state=play`、`tiles ready`、171 键、0 pageerror、0 console error**。

---

## 8. 总回归（组织者终验，全部改动落定后执行）

| 项目 | 命令 | 结果 |
|---|---|---|
| 语法 | `node --check` × 9 个改动脚本 | 全 OK |
| 冷启动 | `tools/_v54_boot_smoke.py` | **10/10 PASS，键数 min=max=171**（就绪门已消除 165 抖动） |
| 就绪门 | `tools/_v56_gate_check.py --runs 10` | **PASS**；drawImage 0、pageerror 0、其他 console 0、超时兜底 0/10；waitedMs 114/169/408ms |
| Boss | `tools/_v54_boss_windup_check.py` | **14/14 通过，最小余量 9px** |
| 关卡定点 | `tools/_final_l3031.py` | **L30/L31 PASS**（play / tiles ready / 171 键 / 0 报错） |
| 存量测试 | `node _v12` / `node _v19` / `python _v222` | **46-0 / 139-0-4skip / 10-0** |

**一页结论（交付口径）**

1. **“改了没生效 / 还是老模型”**：两套原因都已消除 —— 视觉上（`ui.js heroLook()` 16×16 画布裁切 + 非 blue 皮肤走旧帧）已改为 32×38 全链路；观感上（首屏 7.48MB 并发解码 burst 导致先显示兜底美术、AI 图后替换）已把龙图与非关键瓦片移出首屏，Boss 关冷启动 **350.7 → 256.7ms**。
2. **皮肤覆盖**：骑士 20 套 + 法师 19 套，全状态 32×38；审计范围内 16×16 主角/法师帧 **406 → 0**；blue 视觉 RGBA 100% 一致。
3. **装备与 UI**：装备随 32×38 正确叠加不裁切，衣橱/背包/选秀/死亡帧全部等比居中，切皮肤即时失效无残留。
4. **Boss 前摇**：14 只全部有可读举臂；长袍/翅膀类 5 只 margin 21–39px、臂端 100% 越出剪影；非 windup 零额外绘制（`orig=6 wrap=6`）。
5. **稳定性**：冷启动键数恒定 171（就绪门 20/20 稳定）、零 pageerror；31 关全部可玩、FPS ≥56.7、30 分钟 bot 零崩溃。
6. **未改**：碰撞框、移动数值、Boss 血量、招式时序、伤害判定、`engine.js`/`levels.js`/`chapter*.js`（与基线 hash 一致）。
7. **遗留**：`ai_vfx.js` 3.03MB 特效图仍在首屏（最大剩余优化项，建议首次命中再懒加载）；`art_external.js` 对 `tiles.png` 二次解码；平地霜爆新星向下/水平冰刺即生成即销毁（疑似体验问题，需产品确认）；file:// 的 Kenney fetch 报错为环境固有；`.snap_before/`（40MB）为基线副本，可删。

---

## 9. v56：两个追加任务的收口（3 条线并行）

### 9.1 霜爆新星八向冰刺（`engine.js`，只改法师 U）

**根因**：法师碰撞盒 w16 h30、可视高 38，霜爆圆心在 `p.y+11`（脚底上方约 19px），冰锥 7×7 —— 侧向冰锥从 19px 高平飞，掠过 10px 高的贴地矮怪；向下/斜下冰锥约 20px 就撞地板，在 `_engUpdateShots` 的瓦片分支里**静默销毁**（无落地表现、无结算）。

**改动**：
| 位置 | 改动 |
|---|---|
| `_engUpdateSkills()` 八向生成（约 4876-4891） | 水平/斜下/正下冰锥判定盒落到脚底线（h15），覆盖 10px 贴地矮怪；向上三向保持 7×7；新增 `grounded` / `spikeLife=0.45` |
| 新增 `_engShardLand()`（约 5750-5770） | 碰实心瓦片即转换：以下落分量为主→贴地 20×10 地刺；否则→贴墙 10×12 冰爆（`_engClamp` 钳入关卡）；带冰屑/冰环可见表现 |
| 新增 `_engShardHitTargets()`（约 5772-5790） | 落地刺每帧查 Boss→敌人，复用 `_engShotHitEnemy` 结算，沿用 `novaSeq` 去重 |
| `_engUpdateShots()` 存续分支（约 5934-5937） | `grounded` 弹体跳过步进/追踪/瓦片/弹幕/机关，只帧查目标，到期回收 |
| `_engUpdateShots()` 瓦片分支（约 6068-6075） | 撞墙静默销毁 → 落地转换；`q/B/G`（桶/可碎砖/玻璃）分支**先完成既有碎裂再调 `_engShardLand`**，不再 `dead=true` 绕过 |
| 落地地刺纵向覆盖 | 10 → **14px**（仅几何，为了够得着贴地/贴身正下目标） |

**验证**：
- 八向矩阵 **8/8 命中**，每向 伤害=3 / 冻结=0.8s / `novaSeq` 只记名 1 次；
- 贴身去重：30 血史莱姆叠玩家身上吃满 8 枚，只扣 3 血（30→27）；
- 贴墙场景结局统计：出膛 8 / 落地转换 3 / 到期消散 3 / 命中结算 2 / **静默消失 0**；
- 平台场景 4/4 命中（基线下 sideL/sideR 均 miss）；
- **数值零漂移**：`cd 7 / mana 25 / n 8 / dmg 3 / v 300 / life 0.36 / freeze 0.8 / w 7 / h 7`。

**QA 提出的 3 项 FAIL 与处置**：①纯左向在密集八向环里漏打 → 孤立单目标复测 左/右 均命中，属斜下邻怪挡弹道 + `pierce=0` 预期互挡；②正下目标陷进地面瓦片 → 部分为 QA 摆放问题，引擎侧把地刺覆盖加到 14px 兜底，flush 贴地与贴身正下均命中；③贴墙 2 枚静默消失 → **真缺陷**（`'B'` 可碎砖分支抢先把弹体 `dead=true`），已改为碎砖后仍落地转换，静默归零。

### 9.2 特效图懒加载（`ai_vfx.js` / `ai_skillfx.js` / `combatfx.js`）

**改动**：`ai_vfx.js` 去掉启动即并发的 7 张 `load()`，改为 state 机（idle/loading/loaded/error）+ `ensure(name) / get(name) / status(name) / onReady(cb)`，旧 `PQAI_VFX[name]` 属性保留（idle/error 为 `null`，loading/loaded 挂 Image 引用，消费方原有 `width>0` 判定继续有效）；`combatfx.js` 的 `aiImg()` 改为 `ensure` + `get`，未就绪返回 `null` 走程序化特效；`ai_skillfx.js` 改为逐图读取 + 首次交互（keydown/pointerdown/touchstart）懒加载技能源图 + `onReady` 补烘焙，并将 `shieldBubble` 改为**启动即烘焙 24×24 程序化圣光盾**（heal 图到后再覆盖升级），保证就绪门不会因缺键走到 3 秒兜底。

**量化**：
| 指标 | 改前 | 改后 |
|---|---|---|
| 首屏 vfx 大图请求 | 7 张 | **0 张** |
| 首屏大图字节 | 3,105,240 B | **0 B** |
| 首次攻击 slash 加载 | 启动即载 | 108.2 ms（QA 侧实测 5.4ms 起、最晚 641ms 发起） |
| 20 次冷启动 pageerror | — | **0** |
| 非 Fetch console error | — | **0** |
| SPR 键数 | 171 | **171**（min=max） |
| 就绪门 | — | `ready`、`missing=[]`、**`waitedMs=0`、未走超时兜底** |

### 9.3 总回归（本轮改动落定后，版本号已统一升 v55）

| 项目 | 结果 |
|---|---|
| 语法 `node --check` engine/ai_vfx/ai_skillfx/combatfx | 全 OK |
| `index.html` | 全部 34 个脚本统一 `?v=55`（原 v54），三个新脚本位置不变 |
| `tools/_v54_boot_smoke.py` | **10/10 PASS**，键数 min=max=**171** |
| `tools/_v19_mage_test.js` | **139 PASS / 0 FAIL / 4 SKIP** |
| `tools/_v57_nova_check.py matrix` | **8/8 向通过 + 贴身去重 PASS** |
| `tools/_v57_vfx_lazy_check.py` | **20/20 ALL PASS**；首屏字节 3,105,240 → **0**；键数 171/171 |
| `tools/_v54_boss_windup_check.py` | 14/14（此前已验收，本轮未受影响的项） |

**v56 一页结论**：霜爆八向现在**每一向都能命中与冻结**（伤害 3 / CD 7 / 耗蓝 25 / 冻结 0.8s 一个没改），碰地/碰墙不再静默消失而是转成 0.45s 地刺或冰爆并结算一次（`novaSeq` 去重仍在，贴身八枚只吃 3 血），贴地矮怪、贴墙、平台上下三场景全部验证通过；`ai_vfx` 首屏 **3.05MB → 0**，首次攻击 108ms 内就位、未就绪时静默走程序化特效，20 次冷启动零报错、`SPR` 恒定 171、就绪门 `waitedMs=0` 未触发兜底。唯一遗留是纯左向在「八向密集环」里会被斜下邻怪按 `pierce=0` 规则吃掉弹道 —— 这是 piercing 设计行为，孤立侧目标已验证命中，若你希望「一枚冰刺可穿透多敌」，那是另一项数值改动，需你确认后再动。
