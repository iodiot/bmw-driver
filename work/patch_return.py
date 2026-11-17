from pathlib import Path
p=Path('work/refine_quarter_v15.py')
s=p.read_text()
needle='# Check every retained mesh, front detail and wheel rig against the source.'
insert='''# Close the lower quarter with a curved return to the rear bumper perimeter.
# This removes the open black slit seen from the side under the new corner.
for sign,label in [(1,'Left'),(-1,'Right')]:
 rows=[]
 for t in np.linspace(0,1,95):
  out=outeredge(t,0);row=[]
  for q in np.linspace(0,1,37):
   z=out[2]*q
   ye=.63-.4*np.maximum(0,1-(q*edgez(.34)/.945)**7)**(1/7)
   xe=rx(q*edgez(.34),ye)
   x=cut+(xe-cut)*t
   y=(1-t)*(.225-.028*(1-q*q))+t*ye
   row.append([x,y,sign*z])
  rows.append(row)
 m=patch(mapped(rows),f'Rear_bumper_lower_return_{label}')
 if m.face_normals[:,1].mean()>0:m.invert()
'''
s=s.replace(needle,insert+'\n'+needle)
p.write_text(s)
