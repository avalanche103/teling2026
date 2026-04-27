import sqlite3

conn = sqlite3.connect('ssd_catalog.db')
c = conn.cursor()
rows = c.execute('select id,name,parent from sections').fetchall()
conn.close()

nodes = {r[0]: {'id': r[0], 'name': r[1], 'parent': r[2], 'children': []} for r in rows}
root = []
for n in nodes.values():
    p = n['parent']
    if p and p in nodes:
        nodes[p]['children'].append(n)
    else:
        root.append(n)

out = []

def dump(n, l=0):
    out.append('  '*l + f"{n['id']} - {n['name']}")
    for c in sorted(n['children'], key=lambda x: x['name']):
        dump(c, l+1)

for r in sorted(root, key=lambda x: x['name']):
    dump(r)

for line in out[:250]:
    print(line)
print('... total sections', len(rows))
