import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import zhconv
except ImportError:
    print("Error: zhconv is not installed yet.")
    sys.exit(1)

input_file = "data/evaluation_data.json"

print(f"Reading {input_file}...")
with open(input_file, "r", encoding="utf-8") as f:
    data = json.load(f)

print("Translating comments to Traditional Chinese (zh-hant)...")
translated_count = 0
for item in data:
    if "comments" in item and isinstance(item["comments"], dict):
        for key, value in item["comments"].items():
            if isinstance(value, str):
                # Convert Simplified Chinese to Traditional Chinese
                traditional_value = zhconv.convert(value, 'zh-hant')
                if traditional_value != value:
                    item["comments"][key] = traditional_value
                    translated_count += 1

print(f"Translation completed. Translated {translated_count} comment sentences.")

print("Saving translated database back to file...")
with open(input_file, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Success! evaluation_data.json is now fully in Traditional Chinese.")
