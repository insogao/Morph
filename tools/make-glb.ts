// Write the M5 3D fixtures as real GLB files (original procedural models, CC0) with named parts.
//
//   npx tsx tools/make-glb.ts fixtures/s3
//
// Each part is one glTF node + mesh with a name (the part id) and a base colour — the 3D analogue
// of SVG part ids. The scenes load them with three's GLTFLoader, so the real glTF path is exercised.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from "three";

interface Part { name: string; geometry: BufferGeometry; color: string; at?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] }

function glb(parts: Part[]): Buffer {
  const chunks: Buffer[] = [], views: object[] = [], accessors: object[] = [], meshes: object[] = [], nodes: object[] = [], materials: object[] = [];
  let offset = 0;
  const push = (data: Float32Array | Uint32Array, target: number) => {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const pad = (4 - (buf.length % 4)) % 4;
    chunks.push(buf, Buffer.alloc(pad));
    views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
    offset += buf.length + pad;
    return views.length - 1;
  };
  for (const part of parts) {
    const g = part.geometry.index ? part.geometry : part.geometry.setIndex([...Array(part.geometry.attributes.position.count).keys()]);
    const m = new Matrix4().compose(new Vector3(...(part.at ?? [0, 0, 0])), new Quaternion().setFromEuler(new Euler(...(part.rot ?? [0, 0, 0]))), new Vector3(...(part.scale ?? [1, 1, 1])));
    const geo = g.clone().applyMatrix4(m);
    geo.computeVertexNormals();
    const pos = new Float32Array(geo.attributes.position.array), nor = new Float32Array(geo.attributes.normal.array), idx = new Uint32Array(geo.index!.array);
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
    const pv = push(pos, 34962), nv = push(nor, 34962), iv = push(idx, 34963);
    accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: "VEC3", min, max });
    accessors.push({ bufferView: nv, componentType: 5126, count: nor.length / 3, type: "VEC3" });
    accessors.push({ bufferView: iv, componentType: 5125, count: idx.length, type: "SCALAR" });
    const hex = part.color.replace("#", ""), c = [0, 2, 4].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2);
    materials.push({ name: part.name, pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: 0, roughnessFactor: 0.55 } });
    const a = accessors.length - 3;
    meshes.push({ name: part.name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: materials.length - 1 }] });
    nodes.push({ name: part.name, mesh: meshes.length - 1 });
  }
  const bin = Buffer.concat(chunks);
  const json = { asset: { version: "2.0", generator: "morph-master make-glb (CC0)" }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: bin.length }] };
  let js = Buffer.from(JSON.stringify(json));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, js, bh, bin]);
}

const fin = (angle: number): Part => ({
  name: ["fin_a", "fin_b", "fin_c"][Math.round(angle / (Math.PI * 2 / 3))], geometry: new BoxGeometry(0.08, 0.72, 0.5), color: "#e94f37",
  at: [Math.sin(angle) * 0.56, -0.62, Math.cos(angle) * 0.56], rot: [0, angle, 0],
});
const rocket: Part[] = [
  { name: "nose", geometry: new ConeGeometry(0.5, 0.95, 40), color: "#e94f37", at: [0, 1.37, 0] },
  { name: "body", geometry: new CylinderGeometry(0.5, 0.5, 1.8, 40), color: "#f2efe8", at: [0, 0, 0] },
  { name: "window", geometry: new TorusGeometry(0.2, 0.06, 16, 40), color: "#3a86ff", at: [0, 0.42, 0.5] },
  fin(0), fin(Math.PI * 2 / 3), fin(Math.PI * 4 / 3),
  { name: "flame", geometry: new ConeGeometry(0.3, 0.6, 24), color: "#ffb627", at: [0, -1.2, 0], rot: [Math.PI, 0, 0] },
];
const lighthouse: Part[] = [
  { name: "cap", geometry: new ConeGeometry(0.42, 0.45, 40), color: "#d62828", at: [0, 1.6, 0] },
  { name: "lamp", geometry: new CylinderGeometry(0.3, 0.3, 0.36, 32), color: "#ffd166", at: [0, 1.2, 0] },
  { name: "gallery", geometry: new TorusGeometry(0.4, 0.05, 12, 48), color: "#2b2d42", at: [0, 1.0, 0], rot: [Math.PI / 2, 0, 0] },
  { name: "tower", geometry: new CylinderGeometry(0.34, 0.55, 1.8, 40), color: "#f2efe8", at: [0, 0.05, 0] },
  { name: "stripe_1", geometry: new CylinderGeometry(0.43, 0.46, 0.22, 40, 1, true), color: "#d62828", at: [0, 0.4, 0] },
  { name: "stripe_2", geometry: new CylinderGeometry(0.5, 0.53, 0.22, 40, 1, true), color: "#d62828", at: [0, -0.35, 0] },
  { name: "door", geometry: new BoxGeometry(0.24, 0.36, 0.08), color: "#5c3d2e", at: [0, -0.62, 0.52] },
  { name: "base", geometry: new CylinderGeometry(0.78, 0.86, 0.28, 32), color: "#8d99ae", at: [0, -0.98, 0] },
];
const planet: Part[] = [
  { name: "globe", geometry: new SphereGeometry(0.8, 48, 32), color: "#4cc9f0", at: [0, 0, 0] },
  { name: "ring", geometry: new TorusGeometry(1.25, 0.08, 8, 96), color: "#f4d58d", at: [0, 0, 0], rot: [Math.PI / 2 - 0.4, 0, 0.25], scale: [1, 1, 0.35] },
  { name: "moon", geometry: new SphereGeometry(0.16, 24, 16), color: "#e0e1dd", at: [1.45, 0.75, 0] },
];

const out = process.argv[2] ?? "fixtures/s3";
mkdirSync(out, { recursive: true });
for (const [name, parts] of [["rocket", rocket], ["lighthouse", lighthouse], ["planet", planet]] as const) {
  const file = join(out, name + ".glb");
  writeFileSync(file, glb(parts as Part[]));
  console.log(file + "  " + (parts as Part[]).map(p => p.name).join(", "));
}
