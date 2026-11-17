from PIL import Image
im=Image.open('work/factory-drawing-original.jpg')
for name,box in [('side',(55,605,1205,974)),('top',(55,1195,1205,1700)),('ends',(40,20,1210,385))]:
 im.crop(box).resize(((box[2]-box[0])*2,(box[3]-box[1])*2)).save('work/factory-'+name+'-detail.png')
