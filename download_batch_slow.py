import urllib.request
import urllib.parse
import sys
import time
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

IMAGE_DIR = "assets/images"
os.makedirs(IMAGE_DIR, exist_ok=True)

items = [
    {"id": "nano_20", "number": 20, "style": "Constructivism / Red&Black / Propaganda"},
    {"id": "nano_21", "number": 21, "style": "Line art / Botanical / Watercolor"},
    {"id": "nano_22", "number": 22, "style": "Techwear / Matte Black / Utility"},
    {"id": "nano_23", "number": 23, "style": "Pop Art / Halftone / Comic"}
]

print("🚀 開始下載第四批剩餘的繁體中文圖片 (#20 - #23)...")
print("使用 15 秒間隔延遲以繞過 API 頻率限制...")
sys.stdout.flush()

for item in items:
    item_id = item["id"]
    number = item["number"]
    style_en = item["style"]
    
    target_path = os.path.join(IMAGE_DIR, f"{item_id}.png")
    
    prompt = (
        f"An infographic layout in {style_en} style, featuring Traditional Chinese text. "
        "Title: '思緒卡關時的 5 種切換方法'. Numbered items: "
        "'1. 走路能增加靈感', '2. 調整呼吸沉澱思緒', '3. 變換場所重置注意力', "
        "'4. 寫下來整理腦袋', '5. 短暫休息恢復專注力'. "
        "Highly readable, clean design, flat style visual guide."
    )
    url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width=512&height=512&seed={number}&nologo=true"
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    req = urllib.request.Request(url, headers=headers)
    
    success = False
    for attempt in range(3):
        try:
            print(f"正在請求 [{item_id}] ...")
            sys.stdout.flush()
            with urllib.request.urlopen(req, timeout=30) as response:
                content = response.read()
                if len(content) > 1000:
                    with open(target_path, "wb") as f:
                        f.write(content)
                    print(f"[{item_id}] 成功生成並保存！")
                    sys.stdout.flush()
                    success = True
                    break
        except Exception as e:
            print(f"[{item_id}] 嘗試 {attempt+1} 失敗: {e}")
            sys.stdout.flush()
            time.sleep(5)
            
    if success:
        print("等待 15 秒冷卻時間...")
        sys.stdout.flush()
        time.sleep(15)

print("🎉 批量下載結束！")
sys.stdout.flush()
