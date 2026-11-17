from PIL import Image,ImageDraw
im=Image.open('work/factory-drawing-original.jpg').convert('RGB').crop((650,590,980,690)).resize((1320,400));d=ImageDraw.Draw(im)
for x in range(650,981,25):
 xx=(x-650)*4;d.line((xx,0,xx,400),fill=(170,200,230));d.text((xx+3,2),str(x),fill=(0,50,160))
im.save('work/factory-fin-grid.png')
