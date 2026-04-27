import sqlite3, json
conn = sqlite3.connect('ssd_catalog.db')
c = conn.cursor()
rows = c.execute('select id,name,parent,external_id,metadata from sections limit 5').fetchall()
print('rows:', rows)
for r in rows:
    print('----')
    print('id', r[0], 'name', r[1], 'parent', r[2], 'external', r[3])
    raw=json.loads(r[4] if r[4] else '{}')
    print('raw keys', raw.keys())
    print(raw)
conn.close()