# Builds data/sky-data.js from d3-celestial data (github.com/ofrohn/d3-celestial, BSD-3)
# stars.6.json = HYG-derived catalog (Hipparcos), J2000, coordinates [RA deg (-180..180), Dec deg]
import json,csv
D='data/'
stars=json.load(open(D+'stars.6.json'))['features']
names=json.load(open(D+'starnames.json'))
lines=json.load(open(D+'constellations.lines.json'))['features']
cons=json.load(open(D+'constellations.json'))['features']
ra=lambda x: round(x+360 if x<0 else x,4)
dist={}; spect={}; lum={}; hcon={}
for r in csv.DictReader(open('/tmp/hyg.csv')):
    if r['hip']:
        try:
            d=float(r['dist'])
            if 0<d<100000: dist[r['hip']]=round(d*3.26156,1)
        except: pass
        spect[r['hip']]=r['spect']
        try: lum[r['hip']]=round(float(r['lum']),3)
        except: pass
        hcon[r['hip']]=r['con']
out=[]
for f in stars:
    m=f['properties']['mag']
    if m>4.6: continue
    hip=str(f['id']); n=names.get(hip,{})
    try: bv=round(float(f['properties']['bv']),2)
    except: bv=0.6
    lon,lat=f['geometry']['coordinates']
    des=((n.get('desig') or '')+' '+(n.get('c') or '')).strip()
    out.append([ra(lon),round(lat,4),m,bv,n.get('name',''),des,int(hip),dist.get(hip,0),spect.get(hip,''),n.get('c') or hcon.get(hip,''),lum.get(hip,0)])
out.sort(key=lambda s:s[2])
L={f['id']:[[[ra(p[0]),round(p[1],4)] for p in seg] for seg in f['geometry']['coordinates']] for f in lines}
C={}
for f in cons:
    p=f['properties']; lon,lat=f['geometry']['coordinates']
    C[f['id']]={'name':p['name'],'ra':ra(lon),'dec':round(lat,3),'rank':int(p.get('rank',3))}
M=[]
for f in json.load(open(D+'messier.json'))['features']:
    p=f['properties']; lon,lat=f['geometry']['coordinates']
    M.append([p['name'],p.get('alt',''),p.get('type',''),p.get('mag',0),ra(lon),round(lat,4),p.get('desig',''),p.get('dim','')])
data={'messier':M,'source':'d3-celestial (Messier, HYG/Hipparcos stars, IAU star names, Stellarium-style constellation lines) + HYG v4.1 distances, J2000','stars':out,'lines':L,'cons':C}
s='(typeof window!=="undefined"?window:globalThis).SKY_DATA='+json.dumps(data,separators=(',',':'),ensure_ascii=False)+';\nif(typeof module!=="undefined")module.exports=globalThis.SKY_DATA;\n'
open(D+'sky-data.js','w').write(s)
print(len(out),'stars;',sum(1 for x in out if x[4]),'with proper names;',len(L),'figures;',len(s)//1024,'KB')
print(out[:5])

# ---------------- extra data: facts, Milky Way, Messier details, satcat ----------------
import math, re as _re
R='data/raw/'
# Constellation genitive / full names
CON={k:{'name':v['name']} for k,v in C.items()}
for f in cons: CON[f['id']]['gen']=f['properties'].get('gen','')

# Messier details from Wikipedia "Messier object" table (distances in kly, size, type, common name)
mw_=json.load(open(R+'raw_messier_wiki.json'))
MD={}
for k,v in mw_.items():
    MD[k]={'name':v['name'],'type':v['type'],'dist_kly':v['dist_kly'],'con':v['con'],'mag':v['mag'],'dim':v['dim'],'ngc':v['ngc']}

# Milky Way: sample d3-celestial mw.json polygons onto a ~2° equal-area grid
mwj=json.load(open(D+'mw.json'))['features']
def inring(x,y,ring):
    c=False; n=len(ring)
    for i in range(n):
        x1,y1=ring[i]; x2,y2=ring[(i+1)%n]
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: c=not c
    return c
def inpoly(x,y,mp):
    for poly in mp:
        if inring(x,y,poly[0]) and not any(inring(x,y,h) for h in poly[1:]): return True
    return False
MW=[]
dec=-89.0
while dec<90:
    step=2.0/max(0.15,math.cos(math.radians(dec)))
    ra=-180.0
    while ra<180:
        lvl=sum(1 for f in mwj if inpoly(ra,dec,f['geometry']['coordinates']))
        if lvl: MW.append([round(ra+360 if ra<0 else ra,1),round(dec,1),lvl])
        ra+=step
    dec+=2.0
print('milky way points',len(MW))

facts={'planets':json.load(open(R+'nasa_planets.json')),'sun':json.load(open(R+'nasa_sun.json')),
       'showers':json.load(open(R+'raw_ams_showers_2026.json')),'messier':MD,'cons':CON,
       'satcat':json.load(open(R+'satcat_subset.json')),'mw':MW,
       'sources':{'planets':'NASA NSSDCA Planetary Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet)','sun':'NASA NSSDCA Sun Fact Sheet',
                  'showers':'American Meteor Society 2026/2027 calendar (amsmeteors.org/calendar)','messier':'Wikipedia “Messier object” table (SEDS-cited)',
                  'satcat':'CelesTrak SATCAT','mw':'d3-celestial mw.json (Milky Way outline)','stars':'HYG v4.1'}}
s='(typeof window!=="undefined"?window:globalThis).SKY_FACTS='+json.dumps(facts,separators=(',',':'),ensure_ascii=False)+';\nif(typeof module!=="undefined")module.exports=globalThis.SKY_FACTS;\n'
open(D+'facts.js','w').write(s); print('facts.js',len(s)//1024,'KB')
