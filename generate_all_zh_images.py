import os
import json
import urllib.request
import urllib.parse
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# 確保輸出目錄存在
IMAGE_DIR = "assets/images"
os.makedirs(IMAGE_DIR, exist_ok=True)

# 載入風格數據
with open("data/evaluation_lite.json", "r", encoding="utf-8") as f:
    lite_data = json.load(f)

def download_image(item):
    item_id = item["id"]
    number = item["number"]
    style_en = item.get("name_original", item.get("name", ""))
    
    # nano_01 和 nano_02 使用已經特製的高品質圖片，跳過
    if item_id in ["nano_01", "nano_02"]:
        print(f"[{item_id}] 跳過（已存在特製高品質中文圖）")
        return item_id, True

    target_path = os.path.join(IMAGE_DIR, f"{item_id}.png")
    if os.path.exists(target_path) and os.path.getsize(target_path) > 1000:
        # 已存在且有效，跳過
        return item_id, True

    # 構造針對該風格的中文化提示詞
    prompt = (
        f"An infographic layout in {style_en} style, featuring Traditional Chinese text. "
        "Title: '思緒卡關時的 5 種切換方法'. Numbered items: "
        "'1. 走路能增加靈感', '2. 調整呼吸沉澱思緒', '3. 變換場所重置注意力', "
        "'4. 寫下來整理腦袋', '5. 短暫休息恢復專注力'. "
        "Highly readable, clean design, flat style visual guide."
    )
    
    # 增加隨機種子以獲取多樣化效果，並指定寬高
    url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width=512&height=512&seed={number}&nologo=true"
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    req = urllib.request.Request(url, headers=headers)
    
    retries = 3
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                content = response.read()
                if len(content) > 1000:
                    with open(target_path, "wb") as f:
                        f.write(content)
                    print(f"[{item_id}] 成功生成繁體中文圖：{style_en}")
                    sys.stdout.flush()
                    return item_id, True
        except Exception as e:
            if attempt == retries - 1:
                print(f"[{item_id}] 錯誤（重試失敗）：{e}")
                sys.stdout.flush()
            else:
                import time
                time.sleep(2)
    return item_id, False

def main():
    print("🚀 開始並行生成全站 300 個風格的繁體中文 AI 範例圖...")
    print("正在使用免密鑰的高速 Pollinations.ai 圖像引擎進行批量生成，這大約需要幾分鐘，請稍候...")
    sys.stdout.flush()
    
    # 限制併發數為 3，防止因請求頻率過高被 API 限制 (HTTP 429)
    success_count = 0
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(download_image, item): item for item in lite_data}
        
        for future in as_completed(futures):
            item_id, success = future.result()
            if success:
                success_count += 1
                
    print(f"\n🎉 批量生成任務完成！成功生成 {success_count} / {len(lite_data)} 張繁體中文參考圖！")
    sys.stdout.flush()

if __name__ == "__main__":
    main()
