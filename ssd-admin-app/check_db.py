import sqlite3
conn = sqlite3.connect('ssd_catalog.db')
c = conn.cursor()
sections = c.execute('select count(*) from sections').fetchone()[0]
products = c.execute('select count(*) from products').fetchone()[0]
print('sections', sections)
print('products', products)
peers = c.execute('select count(*) from sections where parent is not null').fetchone()[0]
print('sections with parent', peers)
r = c.execute('select id,name,parent from sections where parent is not null order by parent limit 20').fetchall()
print(r)
conn.close()