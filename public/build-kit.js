import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Buildings beside the road are put together from boxes, prisms and slabs,
// each with its own colour, and joined into one geometry per material, so a
// whole village or a fuel station is drawn in a few calls.
export class Kit {
  constructor() {
    this.parts = [];
  }
  // Adds a geometry (moved by `matrix`) painted one colour.
  add(geometry, colour, matrix = null) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes))
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const c = new THREE.Color(colour);
    const colours = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colours.length; i += 3) colours.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    this.parts.push(g);
    return this;
  }
  // A box of size w × h × d with its base centre at (x, y, z), turned `turn`
  // about the vertical.
  box(w, h, d, x, y, z, colour, turn = 0) {
    const m = new THREE.Matrix4().makeRotationY(turn).setPosition(x, y + h / 2, z);
    return this.add(new THREE.BoxGeometry(w, h, d), colour, m);
  }
  // A gable roof over a w × d plan (ridge along x), eaves at height y, ridge
  // `rise` above them, overhanging by `eave`.
  gable(w, d, rise, x, y, z, colour, eave = 0.4, turn = 0) {
    const half = d / 2 + eave;
    const shape = new THREE.Shape();
    shape.moveTo(-half, 0);
    shape.lineTo(half, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: w + 2 * eave, bevelEnabled: false });
    g.translate(0, 0, -(w + 2 * eave) / 2);
    g.rotateY(Math.PI / 2);
    // A thin slab under it for the soffit.
    const m = new THREE.Matrix4().makeRotationY(turn).setPosition(x, y, z);
    this.add(g, colour, m);
    return this;
  }
  // Moves another kit's parts into this one (by `matrix`): a piece built in
  // its own frame, such as a house or a window, set in place.
  append(other, matrix = null) {
    for (const g of other.parts) {
      if (matrix) g.applyMatrix4(matrix);
      this.parts.push(g);
    }
    other.parts = [];
    return this;
  }
  // A cylinder (posts, chimneys, wells).
  cylinder(r, h, x, y, z, colour, segments = 10) {
    const m = new THREE.Matrix4().setPosition(x, y + h / 2, z);
    return this.add(new THREE.CylinderGeometry(r, r, h, segments), colour, m);
  }
  geometry() {
    const merged = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

// A canvas texture (sRGB) drawn by `draw(context, width, height)`; null
// without a document (in tests).
export function canvasTexture(width, height, draw) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
