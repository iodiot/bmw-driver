import sys,inspect
sys.path.insert(0,'work/front-libs')
import trimesh
print(inspect.getsource(trimesh.util.concatenate))
print(inspect.getsource(trimesh.Trimesh.copy))
