import assert from 'node:assert/strict';
import test from 'node:test';
import { liquidPath } from '../packages/morph-engine/src/effects/liquid';

type Point = [number, number];

class RecordedPath {
  contours: Point[][] = [];
  open: Point[] | undefined;

  moveTo(x: number, y: number) {
    assert.equal(this.open, undefined, 'previous contour was closed');
    this.open = [[x,y]];
  }

  lineTo(x: number, y: number) {
    this.open!.push([x,y]);
  }

  closePath() {
    const contour = this.open!;
    assert.ok(contour.length >= 3, 'contour is drawable');
    assert.ok(contour.flat().every(Number.isFinite), 'contour vertices are finite');
    this.contours.push(contour);
    this.open = undefined;
  }
}

Object.defineProperty(globalThis, 'Path2D', { value: RecordedPath, configurable: true });

const circle = (x: number, y = 0, radius = 24) => ({x, y, radiusX: radius, radiusY: radius});
const record = (...masses: Parameters<typeof liquidPath>[0]) =>
  (liquidPath(masses,{cellSize:1.5}) as unknown as RecordedPath).contours;

function evenOdd(contours: readonly Point[][], [x,y]: Point) {
  let inside = false;
  for (const path of contours) {
    for (let i = 0; i < path.length; i++) {
      const [ax,ay] = path[i];
      const [bx,by] = path[(i+1)%path.length];
      if ((ay > y) !== (by > y) && x < ax + (bx-ax)*(y-ay)/(by-ay)) inside = !inside;
    }
  }
  return inside;
}

test('nearby liquid lobes form one contour and split when pulled apart', () => {
  const joined = record(circle(-10),circle(10));
  assert.equal(joined.length,1);
  assert.equal(evenOdd(joined,[0,0]),true);
  const split = record(circle(-20),circle(20));
  assert.equal(split.length,2);
  assert.equal(evenOdd(split,[0,0]),false);
  assert.equal(evenOdd(split,[-20,0]),true);
});

test('a closed ring creates an interior contour and preserves its hole', () => {
  const masses = Array.from({length:8},(_,i) => {
    const angle = i*Math.PI/4;
    return circle(22*Math.cos(angle),22*Math.sin(angle),19);
  });
  const contours = record(...masses);
  assert.equal(contours.length,2);
  assert.equal(evenOdd(contours,[0,0]),false);
  assert.equal(evenOdd(contours,[22,0]),true);
});

test('empty and zero-radius masses leave a blank field', () => {
  assert.deepEqual(record(),[]);
  assert.deepEqual(record(circle(0,0,0)),[]);
});

test('non-positive or non-finite grid settings fail explicitly', () => {
  assert.throws(() => liquidPath([circle(0)],{cellSize:0}), RangeError);
  assert.throws(() => liquidPath([circle(0)],{iso:Number.NaN}), RangeError);
});
