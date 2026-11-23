# Traces a coloring page into RexLab coloring geometry (art/coloring.md).
#
#   coloring-trace.py <line-art.png> <out.json> [groups.json]
#
# The page is black line art on white inside a frame. Every enclosed white area
# becomes a paint region; regions grow under the ink so they cover the whole
# picture, and the ink becomes one protected shape drawn above them. An area too
# small for a fingertip (under the raster contract's 24 px solid square) joins
# the neighbour it shares the longest border with. groups.json lists, per
# object, canvas points (920x620) whose areas form one region. Output is in the
# 460x310 logical space with one interior probe per region in canvas pixels.
# Needs numpy, scipy and opencv-python-headless.
import sys, json, cv2, numpy as np
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
g = cv2.imread(src, cv2.IMREAD_GRAYSCALE)
ys, xs = np.where(g < 140)                 # crop to the frame: the margin outside it is wasted scale
g = g[ys.min():ys.max()+1, xs.min():xs.max()+1]
# step inside the page's own frame: drop edge rows and columns that are mostly ink
def inner(a):
    d = a < 140; n = max(1, round(min(a.shape)*0.04))
    rows = [i for i in range(n) if d[i].mean() > 0.5]; t = rows[-1]+1 if rows else 0
    rows = [i for i in range(n) if d[-1-i].mean() > 0.5]; b = a.shape[0]-(rows[-1]+1 if rows else 0)
    return t, b
t, b = inner(g); g = g[t:b]
t, b = inner(g.T); g = g[:, t:b]
# The whole drawing is kept, fitted to the 3:2 canvas and centred. An edge line,
# never drawn, closes the areas that run off the page; they are marked open, so
# they show the paper until filled, as the space round a lone animal does.
g = g.copy(); frame = max(2, round(g.shape[1]/460*1.5))
g[:frame] = 0; g[-frame:] = 0; g[:, :frame] = 0; g[:, -frame:] = 0
H, W = g.shape
s = sy = min(460/(W-1), 310/(H-1)); ox = (460-(W-1)*s)/2; oy = (310-(H-1)*sy)/2
ink = (g < 140).astype(np.uint8)
ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, np.ones((3,3),np.uint8))
drawn = ink.copy()
band = np.zeros_like(drawn, bool); band[:frame] = band[-frame:] = True; band[:, :frame] = band[:, -frame:] = True
drawn[cv2.dilate(band.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool)] = 0  # and the stubs where lines met the frame
# the frame's rounded corners curve inside the trimmed rows: drop ink lying wholly in a corner
cl, cn = ndimage.label(drawn); m = max(1, round(min(H, W)*0.04))
for i, sl in enumerate(ndimage.find_objects(cl), 1):
    y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
    if (y1 <= m or y0 >= H-m) and (x1 <= m or x0 >= W-m): drawn[sl][cl[sl] == i] = 0
seal = 9  # closes gaps up to this many pixels where lines nearly meet
ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(seal,seal)))
lab, n = ndimage.label(1-ink)
# the page outside the frame (touching the image edge) is not a target
edge = set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]]))) - {0}
outside = np.isin(lab, list(edge)); lab[outside] = 0
specks = [i for i in range(1,n+1) if i not in edge and ndimage.sum(lab==i) < 40]
ink[np.isin(lab, specks)] = 1; lab[np.isin(lab, specks)] = 0
minA, minR = 270/(s*s), 6.5/s        # logical area 270 px, inscribed radius 6.5 (13 px square)
SIDE = 24.5  # canvas px; the raster contract needs a 24 px solid square of paintable pixels
def square(m):
    lo, hi = 0, min(m.shape)
    while lo < hi:  # largest k with a k-by-k all-true square, by erosion
        k = (lo + hi + 1) // 2
        if cv2.erode(m.astype(np.uint8), np.ones((k, k), np.uint8)).any(): lo = k
        else: hi = k - 1
    return lo
def ok(i, L):
    m = (L==i) & (drawn==0)
    return m.sum() >= minA and square(m)*2*s >= SIDE
# grow regions under the ink so they tile the picture
inside = ~outside | (ink==1)
_, idx = ndimage.distance_transform_edt(lab == 0, return_indices=True)
full = np.where(outside & (ink==0), 0, lab[idx[0], idx[1]])
# design-time groups: pieces of one object (a plant's leaves, a tail tip and its stripe) become one region
if len(sys.argv) > 3:
    for group in json.load(open(sys.argv[3])):
        ids = []
        for cx, cy in group:
            x, y = int((cx/2-ox)/s), int((cy/2-oy)/sy)
            near = [(abs(dx)+abs(dy), y+dy, x+dx) for dy in range(-6, 7) for dx in range(-6, 7)
                    if 0 <= y+dy < H and 0 <= x+dx < W and lab[y+dy, x+dx]]
            if not near: sys.exit(f"group point {cx},{cy} is on ink or outside the picture")
            _, y, x = min(near)  # a point that lands on a line takes the nearest area
            ids.append(lab[y, x])
        for i in ids[1:]: lab[lab==i] = ids[0]; full[full==i] = ids[0]
# merge undersized regions into the neighbour sharing the longest border
changed = True
while changed:
    changed = False
    ids = [i for i in np.unique(lab) if i]
    small = sorted([i for i in ids if not ok(i, lab)], key=lambda i:(lab==i).sum())
    for i in small[:1]:
        ring = cv2.dilate((full==i).astype(np.uint8), np.ones((3,3),np.uint8)).astype(bool) & (full!=i) & (full!=0)
        if not ring.any(): lab[lab==i]=0; full[full==i]=0; changed=True; continue
        nb = np.bincount(full[ring]).argmax()  # the neighbour sharing the longest border
        lab[lab==i] = nb; full[full==i] = nb; changed = True
def path(cs, eps):
    d=[]
    for c in cs:
        c = cv2.approxPolyDP(c, eps, True)[:,0,:]
        if len(c) >= 3: d.append("M"+" L".join(f"{ox+x*s:.1f} {oy+y*sy:.1f}" for x,y in c)+" Z")
    return " ".join(d)
ids = sorted([i for i in np.unique(lab) if i], key=lambda i:-(lab==i).sum())
regions=[]
for k,i in enumerate(ids):
    m = (full==i).astype(np.uint8)
    cs,_ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    dt = ndimage.distance_transform_edt(np.pad(lab==i,1))[1:-1,1:-1]
    y,x = np.unravel_index(dt.argmax(), dt.shape)
    rim = cv2.dilate(band.astype(np.uint8), np.ones((2*seal+1, 2*seal+1), np.uint8)).astype(bool) & ~band
    regions.append({"open": bool((lab[rim] == i).any()), "id":f"r{k+1:02d}","path":path(cs,2.5),"area":round(float((lab==i).sum())*s*sy),
                    "probe":[round(2*(ox+x*s)), round(2*(oy+y*sy))]})

cs,_ = cv2.findContours((drawn==1).astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
json.dump({"regions":regions,"ink":path(cs,1.2),"size":[W,H]}, open(out,"w"))
print(len(regions), "regions; smallest", min(r["area"] for r in regions), "logical px")
