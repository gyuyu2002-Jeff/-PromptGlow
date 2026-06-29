import json
import urllib.request
import urllib.parse
import sys
import time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# 精心整理的設計與風格領域專用簡繁翻譯字典
PRESET_DICT = {
    "Vector art": "向量插畫",
    "Flat illustration": "扁平插畫",
    "Flat": "扁平風",
    "Doodle": "手繪塗鴉",
    "Isometric": "等距視覺",
    "Isometric UI": "等距 UI",
    "Watercolor": "水彩風",
    "Handwritten": "手寫風",
    "Chalk": "粉筆風",
    "Clay": "黏土建模",
    "Manga": "日系漫畫",
    "Minimal": "極簡風",
    "Minimalism": "極簡主義",
    "Line": "線條",
    "Line Art": "線條藝術",
    "Line art": "線條藝術",
    "White": "白色",
    "Map": "地圖",
    "Fantasy": "奇幻風",
    "Corporate": "商務企業",
    "Memphis": "孟菲斯風",
    "Notebook": "筆記本",
    "Blue Ink": "藍色墨水",
    "Colorful": "繽紛色彩",
    "Casual": "休閒隨性",
    "Stopmotion": "定格動畫",
    "Cute": "可愛風",
    "Shoujo": "少女風",
    "Sparkle": "閃耀效果",
    "Blur": "模糊虛化",
    "Corporate Memphis": "企業孟菲斯",
    "3D Render": "3D 渲染",
    "3D": "3D",
    "8-bit": "8位元像素",
    "Pixel Art": "像素藝術",
    "Pixel art": "像素藝術",
    "Blueprint": "藍圖風",
    "Glitch Art": "故障藝術",
    "Glassmorphism": "玻璃擬態",
    "Neumorphism": "新擬物風",
    "Retro": "復古風",
    "Collage": "拼貼剪貼",
    "Neon": "霓虹發光",
    "Cyberpunk": "賽博朋克",
    "Ukiyo-e": "浮世繪",
    "Gothic": "哥德風",
    "Gold Foil": "金箔工藝",
    "Abstract": "抽象風",
    "Bauhaus": "包浩斯",
    "Gradient": "漸層色",
    "Infographic": "資訊圖表",
    "Tech": "科技感",
    "Vaporwave": "蒸氣波",
    "Vintage": "復古懷舊",
    "Organic": "有機自然",
    "Geometric": "幾何圖形",
    "HUD": "科幻 HUD",
    "Sci-fi": "科幻風格",
    "Sci-fi UI": "科幻 UI",
    "Chalkboard": "黑板手寫",
    "Blueprint": "藍圖設計",
    "Paper Craft": "紙藝剪紙",
    "Paper craft": "紙藝剪紙",
    "Paper Cutout": "剪紙工藝",
    "Grid": "網格佈局",
    "Grid-based": "網格系統",
    "Typography": "字體排版",
    "Typography poster": "文字排版海報",
    "Swiss": "瑞士風格",
    "Swiss Style": "瑞士排版風",
    "Swiss style": "瑞士排版風",
    "Simple": "簡約風",
    "Bold": "粗獷感",
    "Ink": "水墨風",
    "Ink Wash": "水墨渲染",
    "Art Deco": "裝飾藝術",
    "Art Nouveau": "新藝術運動"
}

# 暫存已翻譯的詞彙，避免重複請求
translation_cache = {}

def translate_term(term):
    term_clean = term.strip()
    if not term_clean:
        return ""
    
    # 1. 優先匹配手動整理的字典
    if term_clean in PRESET_DICT:
        return PRESET_DICT[term_clean]
    
    # 2. 檢查暫存
    if term_clean in translation_cache:
        return translation_cache[term_clean]
    
    # 3. 呼叫 Google 翻譯 API
    url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=" + urllib.parse.quote(term_clean)
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(url, headers=headers)
    
    try:
        time.sleep(0.1) # 稍微延遲避免頻率限制
        with urllib.request.urlopen(req, timeout=5) as response:
            result = json.loads(response.read().decode('utf-8'))
            trans = result[0][0][0].strip()
            # 轉換部分機器翻譯不精準的詞
            if trans == "最小":
                trans = "極簡"
            elif trans == "企業":
                trans = "企業風"
            
            translation_cache[term_clean] = trans
            print(f"API Translate: '{term_clean}' -> '{trans}'")
            return trans
    except Exception as e:
        print(f"API Error for '{term_clean}': {e}")
        return term_clean

def translate_style_name(name):
    if not name:
        return ""
    parts = [p.strip() for p in name.split('/')]
    translated_parts = [translate_term(p) for p in parts if p]
    return " / ".join(translated_parts)

# 執行翻譯並保存
def run_translation():
    # 1. 翻譯 evaluation_lite.json
    lite_file = "data/evaluation_lite.json"
    print(f"Processing {lite_file}...")
    with open(lite_file, "r", encoding="utf-8") as f:
        lite_data = json.load(f)
        
    for item in lite_data:
        original_name = item.get("name", "")
        item["name_zh"] = translate_style_name(original_name)
        # 生成中文化的 tags
        parts = [p.strip() for p in original_name.split('/')]
        item["tags_zh"] = [translate_term(p) for p in parts if p]
        
    with open(lite_file, "w", encoding="utf-8") as f:
        json.dump(lite_data, f, ensure_ascii=False, indent=2)
    print(f"Saved {lite_file}")

    # 2. 翻譯 evaluation_data.json
    data_file = "data/evaluation_data.json"
    print(f"Processing {data_file}...")
    with open(data_file, "r", encoding="utf-8") as f:
        data_data = json.load(f)
        
    for item in data_data:
        original_name = item.get("name", "")
        item["name_zh"] = translate_style_name(original_name)
        parts = [p.strip() for p in original_name.split('/')]
        item["tags_zh"] = [translate_term(p) for p in parts if p]
        
    with open(data_file, "w", encoding="utf-8") as f:
        json.dump(data_data, f, ensure_ascii=False, indent=2)
    print(f"Saved {data_file}")

if __name__ == "__main__":
    run_translation()
