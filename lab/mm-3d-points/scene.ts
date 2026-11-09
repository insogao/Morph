import { MAPPINGS, rig } from "./rig";

/*
 * MM16 — 3D point cloud (M5): glTF rocket → glTF lighthouse, part by part.
 * The rocket dissolves from the nose down into ~36k surface points (real part colours); they swirl
 * and settle into the lighthouse, which is built from the base up. Meshes hand off locally: a pixel of
 * the solid mesh vanishes exactly when its point leaves and appears exactly when its point lands.
 */
export const scene = rig("mm-3d-points", "MM16 · 3D 点云：火箭 → 灯塔（glTF 部件映射，M5）", MAPPINGS,
  { label: "POINT CLOUD", cause: [0.3, 1.1], morph: [1.1, 5.6], end: 7.0 });
