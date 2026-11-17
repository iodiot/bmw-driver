from PIL import Image,ImageDraw
im=Image.open('work/factory-drawing-original.jpg').convert('RGB');im=im.crop((830,1210,1230,1700)).resize((1000,1225));d=ImageDraw.Draw(im)
for x in range(850,1230,50):
 xx=(x-830)*2.5;d.line((xx,0,xx,1225),fill=(170,200,230),width=1);d.text((xx+3,2),str(x),fill=(20,70,190))
for y in range(1250,1700,50):
 yy=(y-1210)*2.5;d.line((0,yy,1000,yy),fill=(170,200,230),width=1);d.text((1,yy+2),str(y),fill=(20,70,190))
im.save('work/factory-rear-plan-grid.png')
