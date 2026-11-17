from pathlib import Path
p=Path('work/wrap_taillights_v21.py');s=p.read_text();s=s.replace('smooth((.985-v[:,1])/.05)','smooth((.945-v[:,1])/.025)');s=s.replace("if v[:,0].min()>-2.15 or np.abs(v[:,2]).max()<.78 or v[:,1].max()<.65:continue", "if v[:,0].min()>-2.15 or np.abs(v[:,2]).max()<.78 or v[:,1].max()<.65 or v[:,1].min()>.945:continue")
s=s.replace("stats=export_scene(scene,OUT/'bmw-wrapped-taillights-v21.glb'", "np.savez(ROOT/'work/lamp_spine_v21.npz',s=fullarc,points=full,length=L)\nstats=export_scene(scene,OUT/'bmw-wrapped-taillights-v21.glb'")
p.write_text(s)
