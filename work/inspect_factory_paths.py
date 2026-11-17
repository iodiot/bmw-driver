import sys
sys.path.insert(0,'work/pdf-libs')
import pymupdf as f
p=f.open('outputs/bmw-m5-f10-factory-press-kit.pdf')[-1]
print('page',p.rect,'images',p.get_images(),'paths',len(p.get_drawings()))
print(p.get_text('dict')['blocks'][:2])
