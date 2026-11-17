import numpy as np
from scipy.interpolate import CubicSpline
SX=.97743871;SZ=.9845713182727399;TX=-.01584192
u=np.linspace(.576,.825,110);A=np.array([SX*(-2.62+.15*(u[-1]/(SZ*.96))**3)+TX,u[-1]]);E=np.array([-2.24,.926]);slope=SX*.45*.825**2/(SZ*.96)**3;B=np.array([A[0]+slope*(E[1]-A[1]),E[1]])
t=np.linspace(0,1,180)[1:];back=np.column_stack([SX*(-2.62+.15*(u/(SZ*.96))**3)+TX,u]);corner=(1-t[:,None])**2*A+2*(1-t[:,None])*t[:,None]*B+t[:,None]**2*E
pts=np.vstack([back,corner]);s=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pts,axis=0),axis=1))];curve=CubicSpline(s,pts,axis=0);v=curve(np.linspace(.005,s[-1]-.005,3000),1);a=curve(np.linspace(.005,s[-1]-.005,3000),2);R=np.linalg.norm(v,axis=1)**3/np.maximum(1e-9,np.abs(v[:,0]*a[:,1]-v[:,1]*a[:,0]));print('minimum curvature radius mm',R.min()*1000,'spine mm',s[-1]*1000)
