import json, urllib.request

US_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFiZXBxa2RlenhwYWd1cHRybXliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjcxNTksImV4cCI6MjA5MTEwMzE1OX0.7kqNqnDzlpC764Q1Y0hJjO7GDjoS82U4vm7O76_GX20"
UK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uYnh0dXpsbnN5d2lwanNtcHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNDY1NzMsImV4cCI6MjA4ODYyMjU3M30.vvWpq9lKD13g1idwXZUHWp8Og_bXOGRfjARXjkF7Mb4"

def fetch(host, key, cat="gyuto"):
    url = f"https://{host}/rest/v1/product_categories?select=product_id,products(id,name,slug,price,short_description,stock_status)&category_slug=eq.{cat}"
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req) as r:
        data = json.load(r)
    prods = [row["products"] for row in data if row.get("products")]
    prods.sort(key=lambda p: float(p.get("price") or 0))
    return prods

print("=== US GYUTO (USD) ===")
for p in fetch("qbepqkdezxpaguptrmyb.supabase.co", US_KEY):
    desc = (p.get("short_description") or "").replace("\n", " ")[:80]
    sym = "$"
    print(f"  {sym}{p['price']:>6}  in:{p['stock_status']:<10}  {p['slug'][:55]:<55}  {p['name'][:50]}")

print()
print("=== UK GYUTO (GBP) ===")
for p in fetch("mnbxtuzlnsywipjsmpuh.supabase.co", UK_KEY):
    sym = "£"
    print(f"  {sym}{p['price']:>6}  in:{p['stock_status']:<10}  {p['slug'][:55]:<55}  {p['name'][:50]}")
