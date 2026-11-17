from pathlib import Path
import trimesh

root = Path(__file__).resolve().parents[1]
source = root / 'outputs/bmw-viewer/bmw-m5-f10-v2.glb'
scene = trimesh.load(source, force='scene', process=False)
for mesh in scene.geometry.values():
    # Preserve the generated geometry and its UV seams.
    material = mesh.visual.material
    material.baseColorFactor = [8, 8, 8, 255]
    material.metallicFactor = 0.05
    material.roughnessFactor = 0.8
    material.normalTexture = None
target = root / 'outputs/bmw-viewer/bmw-m5-f10-refined.glb'
scene.export(target)
print('Saved', target.name, 'vertices', sum(len(m.vertices) for m in scene.geometry.values()))

