# Creative Morph

一个用代码制作连续变形动画的 Agent Skill。创意计划先为材料和语义部件安排去向，再把运动交给共用时间轴。

Gate 1 作品：

- **雨伞 → 章鱼** `demos/umbrella-octopus`：水面上升，伞骨长成触手，伞杆裂成两根前臂，伞尖熔成双眼，最后喷射游走。
- **墨滴 → 飞鸟** `demos/ink-bird`：墨滴溅出的墨点预示羽尖位置，湿墨长出羽毛去接住它们，鸟离开纸面，留下墨渍。
- **花 → 粒子 → 蝴蝶** `demos/flower-butterfly`：花瓣粒子化，绕花心形成光环，再沿螺旋展开成翅膀。

```sh
npm ci
npm run dev                         # 播放器，可拖动、倒放
npm run build && npm test
npm run check:visual -- umbrella-octopus
node tools/frames.mjs umbrella-octopus 2.5 3 3.5   # 指定时刻对比
npm run export -- umbrella-octopus --width 1920
```

方案与路线见 `docs/roadmap.md`，Skill 入口见 `skills/creative-morph/SKILL.md`。
