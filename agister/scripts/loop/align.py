import sys,re
for p in sys.argv[1:]:
    lines=open(p).read().split('\n'); out=[]; i=0
    while i<len(lines):
        if lines[i].lstrip().startswith('|'):
            j=i
            while j<len(lines) and lines[j].lstrip().startswith('|'): j+=1
            ind=lines[i][:len(lines[i])-len(lines[i].lstrip())]
            rows=[[c.strip() for c in l.strip()[1:-1].split('|')] for l in lines[i:j]]
            w=[max(len(r[k]) for r in rows) for k in range(len(rows[0]))]
            out+=[ind+'| '+' | '.join(c.ljust(w[k]) for k,c in enumerate(r))+' |' for r in rows]
            i=j
        else: out.append(lines[i]); i+=1
    open(p,'w').write('\n'.join(out))
