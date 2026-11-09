/**
 * S0 — geometric baseline shapes (original, drawn for this project; CC0).
 * All shapes live in a 200 × 200 box centred on the origin, y down.
 */
import { circle, compound, fromPath, polygon, shapeFromRings, star, type Shape } from "../../packages/morph-engine/src/vector/shape";
import type { Vec2 } from "../../packages/morph-engine/src/vector/geom";

export const heart: Shape = fromPath(
  "M0,78 C-22,58 -100,12 -100,-30 C-100,-64 -74,-82 -50,-82 C-26,-82 -8,-68 0,-50 " +
  "C8,-68 26,-82 50,-82 C74,-82 100,-64 100,-30 C100,12 22,58 0,78 Z");

export const star8: Shape = shapeFromRings([star([0, 0], 100, 46, 8)]);
export const star5: Shape = shapeFromRings([star([0, 0], 100, 40, 5)]);
export const disc: Shape = shapeFromRings([circle([0, 0], 92)]);
export const square: Shape = polygon([[-85, -85], [85, -85], [85, 85], [-85, 85]]);

export const hourglass: Shape = fromPath(
  "M-82,-95 L82,-95 C82,-34 22,-14 22,0 C22,14 82,34 82,95 L-82,95 C-82,34 -22,14 -22,0 C-22,-14 -82,-34 -82,-95 Z");

const diamond = (c: Vec2, r: number): Vec2[] => [[c[0], c[1] - r], [c[0] + r, c[1]], [c[0], c[1] + r], [c[0] - r, c[1]]];
/** A bold X with a diamond in each gap: five separate pieces. */
export const crossDiamonds: Shape = compound(
  polygon([[-62, -88], [0, -26], [62, -88], [88, -62], [26, 0], [88, 62], [62, 88], [0, 26], [-62, 88], [-88, 62], [-26, 0], [-88, -62]]),
  polygon(diamond([0, -78], 20)), polygon(diamond([78, 0], 20)), polygon(diamond([0, 78], 20)), polygon(diamond([-78, 0], 20)),
);

/** Ring: one piece with a hole. */
export const ring: Shape = shapeFromRings([circle([0, 0], 95), circle([0, 0], 52)]);

export const glyphY: Shape = polygon([[-96, -92], [-44, -92], [0, -36], [44, -92], [96, -92], [30, -4], [30, 96], [-30, 96], [-30, -4]]);

/** 木-like tree mark: bar, stem and two legs as one outline. */
export const glyphTree: Shape = polygon([
  [-18, -100], [18, -100], [18, -52], [96, -52], [96, -16], [42, -16], [100, 66], [64, 94], [18, 28], [18, 100],
  [-18, 100], [-18, 28], [-64, 94], [-100, 66], [-42, -16], [-96, -16], [-96, -52], [-18, -52],
]);

/** 人-like walking mark. */
export const glyphPerson: Shape = polygon([[-16, -100], [16, -100], [16, -36], [100, 72], [70, 100], [0, 8], [-70, 100], [-100, 72], [-16, -36]]);

export const letterE: Shape = polygon([[-70, -100], [70, -100], [70, -60], [-26, -60], [-26, -20], [52, -20], [52, 20], [-26, 20], [-26, 60], [70, 60], [70, 100], [-70, 100]]);
export const letterM: Shape = polygon([[-92, 100], [-92, -100], [-46, -100], [0, -22], [46, -100], [92, -100], [92, 100], [50, 100], [50, -30], [12, 40], [-12, 40], [-50, -30], [-50, 100]]);
