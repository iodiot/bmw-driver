import sys
from pathlib import Path
sys.path.insert(0, str(Path('work/front-libs').resolve()))
import numpy as np
import trimesh
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union


def build_rotor(radius, zmin, zmax):
    outer = Point(0, 0).buffer(radius, quad_segments=96)
    inner = Point(0, 0).buffer(radius * 0.073, quad_segments=48)
    holes = []
    for i in range(24):
        angle = 2 * np.pi * i / 24
        for j in [0.118, 0.149, 0.179]:
            hole = Point(radius * 0.0043 * np.cos(angle + j), radius * 0.0043 * np.sin(angle + j)).buffer(radius * 0.0043, quad_segments=8)
            holes.append(hole)
    polygon = outer.difference(unary_union(holes))
    assert len(polygon.interiors) == 73
    mesh = trimesh.creation.extrude_polygon(polygon, height=0.016, engine='earcut')
    if zmax > 0:
        mesh.apply_translation([0, 0, zmax - 0.016])
    else:
        mesh.apply_translation([0, 0, zmin])
    assert mesh.is_watertight and mesh.is_winding_consistent and mesh.euler_number == -144
    metrics = {
        'radius_m': radius,
        'thickness_mm': 16,
        'holes': 72,
        'hole_diameter_mm': 8.6,
        'vertices': mesh.vertices.shape[0],
        'triangles': mesh.faces.shape[0],
        'watertight': mesh.is_watertight,
        'winding_consistent': mesh.is_winding_consistent,
        'euler': mesh.euler_number
    }
    return mesh, metrics