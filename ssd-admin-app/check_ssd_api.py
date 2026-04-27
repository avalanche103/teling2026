import requests

apikey = '49078:67660f3465c49b9480a20afb8b791cbd'
urls = ['https://ssd.ru/api/partner/catalog/sections', 'https://ssd.ru/api/partner/catalog/products']

for url in urls:
    try:
        r = requests.get(url, headers={'APIKEY': apikey}, timeout=30)
        print(url, r.status_code)
        print(r.text[:1200])
    except Exception as e:
        print('err', url, repr(e))
