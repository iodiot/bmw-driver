import sys
from pathlib import Path
sys.path.insert(0,'work/pdf-libs')
import pymupdf as f
D=f.open('outputs/bmw-m5-f10-factory-press-kit.pdf');p=D[-1]
print('drawing bbox',p.get_image_rects(26))
x=D.extract_image(26);Path('work/factory-drawing-original.jpg').write_bytes(x['image']);print('image dimensions',x['width'],x['height'])
