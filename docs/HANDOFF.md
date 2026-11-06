# 交接文档：Creative Morph Skill

> 最后更新：2026-11-07。仓库为 `insogao/Morph`，工作分支为 `sdf-part-field`。

## 1. 先做这一步：取回代码

上一个会话没有 GitHub 写权限，`sdf-part-field` 分支**还没推送**。完整提交在 git bundle 里：

```sh
cd <本地 Morph 仓库>
git fetch ~/work/mp/gate1/morph-sdf-part-field.bundle sdf-part-field:sdf-part-field
git checkout sdf-part-field
npm ci && npm run build && npm test
git push -u origin sdf-part-field
```

`~/work/mp/_to_delete/` 是一次失败的克隆留下的空目录，可以直接删掉。

## 2. 已交付文件（`~/work/mp/gate1/`）

| 文件 | 说明 |
| --- | --- |
| `creative-morph-player.html` | 离线播放器，含 14 个场景：播放、倒放、拖动。双击用 Chrome / Edge 打开 |
| `umbrella-octopus.mp4` / `ink-bird.mp4` / `flower-butterfly.mp4` | Gate 1 作品，1080p、30fps，帧数已用 ffprobe 核对 |
| `morph-sdf-part-field.bundle` | 完整代码 |
| `README.md` | 本文档的副本 |

网页版（Artifact）：https://claude.ai/artifact/T8n3cCzpA96zJrCF1cS5jq

**播放器已修复的问题：** 点「播放」没反应，只能拖进度条。原因是第一帧 rAF 的时间戳可能早于点击时的 `performance.now()`，算出负时间后播放立刻自停。现在改为以第一帧的时间戳为起点（`app/main.ts` 的 `play()`）。另外，场景渲染出错时，页面会直接显示错误原因。

## 3. 本轮的架构调整：SDF 部件场

原方案中 M2 语义部件、M3 轮廓、M4 液态是串联的三个模块，每次交接都要切换表示，最容易出现跳变（旧版墨滴→飞鸟在 25%→50% 就是这样）。现在每个部件统一写成「骨架曲线 + 半径」，按顺序做平滑并/差/交：

- 部件对应 = 骨架点的对应（`blendStroke`）。沿弧长错开插值，就是拉链式分裂。
- 液态感 = 融合半径 + 低频边缘扰动（wobble）。
- 拓扑变化（分裂、融合、孔洞）不需要重建网格。
- 颜色、光泽、透光度按融合权重混合，没有整体淡入淡出。

### 引擎文件

| 文件 | 作用 |
| --- | --- |
| `packages/morph-engine/src/renderers/sdf-gl.ts` | 两遍 WebGL2 渲染。第一遍把 d、颜色、局部坐标写入浮点目标；第二遍做膨胀高度、光照、次表面透光和投影。图元有 ellipse / capsule / box / halfplane，加 decal 贴花。依赖 `EXT_color_buffer_float` |
| `packages/morph-engine/src/effects/skeleton.ts` | Stroke、`curve`（曲率积分）、`blendStroke`、`strokePrims`、`transformPrims`、确定性随机数和缓动函数 |
| `packages/morph-engine/src/effects/fracture.ts` | Voronoi 碎裂（含 Lloyd 松弛）、`matchCells` 碎片配对、闭合轮廓重采样 |
| `packages/morph-engine/src/effects/growth.ts` | 空间殖民生长（网格加速）+ 管道模型 |
| `packages/morph-engine/src/renderers/shader-layer.ts` | 全屏片元着色器层，用于光线步进的 3D SDF |
| `tools/frames.mjs` | 按指定时刻并排截图：`node tools/frames.mjs <id> 2.5 3 3.5` |

## 4. 场景清单（`npm run dev` 打开播放器）

| 场景 | 机制 | 状态 |
| --- | --- | --- |
| `demos/umbrella-octopus` 雨伞→章鱼 | 液态部件场。水面上升唤醒雨伞；伞骨 i → 触手 i，先滴水，触手尖再接住水珠；伞杆从弯钩向上裂成两根前臂；伞尖熔成珠子，分成两只眼；最后喷射游动 | Gate 1 核心验收，有 MP4 |
| `demos/ink-bird` 墨滴→飞鸟 | 溅射预示：卫星墨点落在未来羽尖的位置，羽毛长出去接住；鸟离开纸面时阴影分离，留下墨渍 | 重做，有 MP4 |
| `demos/flower-butterfly` 花→粒子→蝴蝶 | 粒子先螺旋汇聚成轨道光环，再展开成翅膀 | 中段已改，有 MP4 |
| `lab/glyph-fish` 鱼字→锦鲤 | 字形笔画即骨架：⺈→头，田→鳞身，底横→分叉尾 | 网页 Demo |
| `lab/vase-whale` 青花瓶→鲸 | Voronoi 碎裂；碎片正面画瓶、背面画鲸，空中翻面 | 网页 Demo |
| `lab/line-cat-deer` 猫→鹿 | 一笔画：任何时刻都是同一条线 | 网页 Demo |
| `lab/seed-rabbit` 种子→兔 | 空间殖民生长，只长在兔子轮廓内 | 网页 Demo |
| `lab/donut-mug` 甜甜圈→咖啡杯 | 3D 光线步进 SDF，亏格 1 同胚：环 = 杯把 | 网页 Demo（Gate 3） |
| `demos/volume-vessel`、`examples/hourglass-jellyfish` | Three.js 网格 / 混合机制 | 旧作品 |

## 5. Skill 文档

- `skills/creative-morph/SKILL.md`：入口，已重写。
- `references/planning.md`：创意规划，包括环境起因、预示、物质搬运、目标专属动作，以及时间轴配比。
- `references/sdf-field.md`：部件场的用法和踩过的坑。
- `references/effect-catalog.md`：10 种已实现机制、组合规则，以及 10 种待实现机制的实现草图。
- `docs/roadmap.md`：中文方案修订、Gate 状态和下一步计划。

## 6. 验证状态（三项分开看）

- **编译**：`tsc --noEmit` 通过。
- **自动测试**：`npm test` 20 项全部通过。`npm run check:visual` 下 10 个场景正向、反向拖动得到的帧一致，无页面报错。播放和倒放已在 Chromium 中实测可用。
- **视觉**：关键时刻已逐帧检查。已知还不够好的地方：
  - 锦鲤的鳍偏细、偏僵。
  - 瓷瓶碎片翻到侧面时很薄，画面稀疏。
  - 章鱼形变中段（约 3.3s），扇形波边在伞杆处刻出一个拱形缺口。
  - 蝴蝶的轨道光环叠加后偏白。
- **性能**：软件渲染（SwiftShader）下 720p 导出约 1 秒/帧，用 GPU 应快很多。用户要求后续**不渲染视频**，只做网页 Demo。

## 7. 下一步

1. 请用户确认 HTML 播放器在他的浏览器里能播放。
2. **Gate 4 盲测**：开一个新会话，只给 Skill，做一个没预设过的 A→B（比如「钥匙→蜂鸟」），根据失败点修订 Skill。
3. 从 `effect-catalog.md` 的待实现清单里补机制（折纸、翻牌、揭开、烟雾流体、鸟群、影子戏、微距穿越、燃烧、结晶、磁流体），每个做成 `lab/<id>` 网页 Demo。
4. 在 `sdf-gl` 旁边加一个「从距离场表面采样粒子」的工具，让部件场和粒子能在同一个作品里交接。
5. 修第 6 节列出的视觉问题。

## 8. 常用命令

```sh
npm run dev                                  # 播放器（?scene=<id>）
npm run build && npm test
npm run check:visual -- <id>                 # 0/10/25/50/75/90/100% 联系表 → .morph/
node tools/frames.mjs <id> 2.5 3 3.5         # 指定时刻对比 → .morph/<id>-frames.jpg
npm run export -- <id> --width 1920          # MP4 + 离线 HTML → gallery/（较慢）
```
