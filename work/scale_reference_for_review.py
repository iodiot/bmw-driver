from pathlib import Path
from PIL import Image
im=Image.open('work/bmw-side-photo.jpg');im.thumbnail((1536,1024));im.save('work/bmw-side-photo-review.jpg',quality=92)
