from pathlib import Path
import urllib.request
u='https://upload.wikimedia.org/wikipedia/commons/e/ea/BMW_M5_F10_%286432609993%29.jpg'
r=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'BMW reference study/1.0'}),timeout=30);Path('work/bmw-side-photo.jpg').write_bytes(r.read());print('reference saved')
