from pathlib import Path
import ast,numpy as np
sy=.9367371792029296;sz=.9845713182727399;sx=.97743871;tx=-.01584192
cut=-2.04;frontx=.7359932065010071
xp=np.array([cut,-1.5,.715]);wp=np.array([cut*sx+tx,-1.482,frontx])
for f in ast.parse((Path(__file__).parent/'repair_sides_v16.py').read_text()).body:
 if isinstance(f,ast.FunctionDef) and f.name in ['X','invX','mapped','smooth','topy','fenderz','original','skin','surface','old_attachment']:exec(compile(ast.Module(body=[f],type_ignores=[]),'side_helpers','exec'))
