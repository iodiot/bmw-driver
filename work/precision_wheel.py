import numpy as np
import trimesh

def solid(mesh,color,metal=0,rough=.5):
    mesh.visual=trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(baseColorFactor=color,metallicFactor=metal,roughnessFactor=rough))
    return mesh

def build_wheel():
    parts=[]
    profile=np.array([[.253,-.12],[.310,-.135],[.337,-.115],[.349,-.075],[.350,.055],[.346,.100],[.331,.126],[.308,.138],[.253,.132],[.249,.10],[.249,-.10],[.253,-.12]])
    tire=trimesh.creation.revolve(profile,sections=192)
    parts.append((solid(tire,[1,1,1,255],0,.9),'Tire'))
    barrel=trimesh.creation.revolve([[.241,-.12],[.252,-.12],[.260,-.10],[.260,.12],[.255,.132],[.246,.132],[.241,.118],[.241,-.12]],sections=160)
    parts.append((solid(barrel,[180,188,200,255],.82,.25),'Rim'))
    # Ten identical tapered, bevelled spokes in five pairs.
    for group in range(5):
        for pair in (-1,1):
            angle=np.pi/2+group*2*np.pi/5+pair*.078
            points=[]
            for radius,width,z in [(.065,.010,.085),(.242,.011,.112)]:
                for across,depth in [(-width,-.01),(-width+.003,-.014),(width-.003,-.014),(width,-.01),(width,.01),(width-.003,.014),(-width+.003,.014),(-width,.01)]:
                    points.append([radius*np.cos(angle)-across*np.sin(angle),radius*np.sin(angle)+across*np.cos(angle),z+depth])
            spoke=trimesh.convex.convex_hull(np.array(points))
            parts.append((solid(spoke,[205,211,220,255],.72,.24),f'Spoke_{group}_{pair}'))
    hub=trimesh.creation.cylinder(radius=.074,height=.045,sections=96);hub.apply_translation([0,0,.085])
    parts.append((solid(hub,[150,160,175,255],.6,.28),'Hub'))
    cap=trimesh.creation.cylinder(radius=.032,height=.006,sections=96);cap.apply_translation([0,0,.113])
    parts.append((solid(cap,[2,3,4,255],.2,.35),'Cap'))
    for q in range(4):
        a=np.linspace(q*np.pi/2,(q+1)*np.pi/2,25)
        verts=np.vstack([[0,0,.117],np.column_stack([.025*np.cos(a),.025*np.sin(a),np.full(len(a),.117)])])
        faces=np.array([[0,i,i+1] for i in range(1,len(a))])
        m=trimesh.Trimesh(verts,faces,process=False)
        parts.append((solid(m,[20,100,210,255] if q%2==0 else [230,230,230,255],.1,.3),f'Roundel_{q}'))
    for k in range(5):
        a=2*np.pi*k/5+np.pi/2
        bolt=trimesh.creation.cylinder(radius=.008,height=.010,sections=6);bolt.apply_translation([.049*np.cos(a),.049*np.sin(a),.111])
        parts.append((solid(bolt,[12,14,17,255],.65,.3),f'Lug_{k}'))
    disc=trimesh.creation.cylinder(radius=.209,height=.012,sections=96);disc.apply_translation([0,0,.035])
    parts.append((solid(disc,[8,9,10,255],.5,.55),'Brake_disc'))
    return parts

