from pathlib import Path
p=Path('work/build_taillights_v20.py');s=p.read_text()
s=s.replace("v[:,0]-=hi*weight;m.vertices=v", """v[:,0]-=hi*weight;m.vertices=v
# Analytical normals keep the adjusted bumper highlight continuous across its
# original triangulation; duplicated triangle corners must share the same normal.
def bumper_weight(yz):
 d=np.array([boundaries.distance(Point(p)) for p in yz]);t=np.clip(d/.040,0,1)
 return t*t*(3-2*t)*np.exp(-(yz[:,1]/.70)**4)
yz=v[:,1:3];h=.0001
wy=(bumper_weight(yz+[h,0])-bumper_weight(yz-[h,0]))/(2*h)
wz=(bumper_weight(yz+[0,h])-bumper_weight(yz-[0,h]))/(2*h)
q=(.48-v[:,1]/SY)/.25
base_y=-SX*.14*np.clip(q,0,1)/(.25*SY)*((q>0)&(q<1))
base_z=SX*.45*v[:,2]*np.abs(v[:,2])/(SZ*.96)**3
nn=np.column_stack([-np.ones(len(v)),base_y-hi*wy,base_z-hi*wz]);nn/=np.linalg.norm(nn,axis=1)[:,None];m.vertex_normals=nn""")
p.write_text(s)
