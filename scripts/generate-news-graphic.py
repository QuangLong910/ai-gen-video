#!/usr/bin/env python3
"""
scripts/generate-news-graphic.py

Tạo thẻ đồ họa tin tức thời sự sắc nét chuẩn mobile (1080x1040),
thương hiệu Hóng Hớt 24/7, loại trừ triệt để nguy cơ bản quyền biểu đồ bên thứ 3.

Sử dụng:
  python3 scripts/generate-news-graphic.py \
    --title "CHÍNH THỨC TỪ NĂM 2026" \
    --subtitle "NGÀY VĂN HÓA VIỆT NAM (24/11)" \
    --items '[{"icon":"LỊCH NGHỈ","tag":"1 NGÀY","title":"Nghỉ ngày 24/11","desc":"Chi tiết...","color":"#ef4444"}]' \
    --out "public/<slug>/evidence/crop_graphic.jpg"
"""

import sys
import os
import json
import argparse
from PIL import Image, ImageDraw, ImageFont

def create_news_graphic(title, subtitle, items, out_path, source="Báo chí chính thống & Cơ quan ban hành", theme="dark_blue"):
    W, H = 1080, 1040
    img = Image.new("RGB", (W, H), "#0b0f19")
    draw = ImageDraw.Draw(img)

    # 1. Background gradient
    for y in range(H):
        r = int(10 + (22 - 10) * (y / H))
        g = int(14 + (28 - 14) * (y / H))
        b = int(26 + (50 - 26) * (y / H))
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # 2. Tech Border & Corner Accents
    accent_color = "#38bdf8" if theme == "cyan" else "#ef4444"
    gold_color = "#facc15"

    draw.rectangle([40, 120, W - 40, 910], outline="#1f293d", width=2)
    draw.rectangle([44, 124, W - 44, 906], outline="#2d3748", width=1)

    draw.line([(35, 120), (75, 120)], fill=accent_color, width=4)
    draw.line([(40, 115), (40, 155)], fill=accent_color, width=4)
    draw.line([(W - 75, 120), (W - 35, 120)], fill=accent_color, width=4)
    draw.line([(W - 40, 115), (W - 40, 155)], fill=accent_color, width=4)

    draw.line([(35, 910), (75, 910)], fill=gold_color, width=4)
    draw.line([(40, 875), (40, 915)], fill=gold_color, width=4)
    draw.line([(W - 75, 910), (W - 35, 910)], fill=gold_color, width=4)
    draw.line([(W - 40, 875), (W - 40, 915)], fill=gold_color, width=4)

    # 3. Fonts
    font_bold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    font_reg = "/Library/Fonts/Arial Unicode.ttf"

    f_badge = ImageFont.truetype(font_bold, 24)
    f_h1 = ImageFont.truetype(font_bold, 50)
    f_h2 = ImageFont.truetype(font_bold, 36)
    f_box_title = ImageFont.truetype(font_bold, 32)
    f_box_text = ImageFont.truetype(font_bold, 28)
    f_box_sub = ImageFont.truetype(font_reg, 25)
    f_footer = ImageFont.truetype(font_reg, 23)

    # 4. Title Section
    bbox1 = f_h1.getbbox(title)
    draw.text(((W - (bbox1[2] - bbox1[0])) // 2, 145), title, font=f_h1, fill=gold_color)

    if subtitle:
        bbox2 = f_h2.getbbox(subtitle)
        draw.text(((W - (bbox2[2] - bbox2[0])) // 2, 218), subtitle, font=f_h2, fill="#ffffff")

    # 5. Cards Section
    count = min(len(items), 3)
    start_y = 295
    card_h = 168 if count == 3 else 220
    gap = 22 if count == 3 else 30

    for i in range(count):
        c = items[i]
        cy = start_y + i * (card_h + gap)
        c_color = c.get("color", "#38bdf8")

        # Card container
        draw.rounded_rectangle([70, cy, W - 70, cy + card_h], radius=14, fill="#131c2e", outline="#23324d", width=2)
        draw.rounded_rectangle([70, cy, 80, cy + card_h], radius=4, fill=c_color)

        # Header tag
        tag_text = c.get("icon", "THÔNG ĐIỆP")
        draw.text((105, cy + 20), tag_text, font=f_box_title, fill=c_color)

        # Badge pill
        b_txt = c.get("tag", "QUY ĐỊNH")
        b_box = f_badge.getbbox(b_txt)
        bb_w = b_box[2] - b_box[0] + 24
        bb_h = b_box[3] - b_box[1] + 12
        bb_x = W - 100 - bb_w
        draw.rounded_rectangle([bb_x, cy + 18, bb_x + bb_w, cy + 18 + bb_h], radius=7, fill=c_color)
        draw.text((bb_x + 12, cy + 22), b_txt, font=f_badge, fill="#ffffff")

        # Main text
        draw.text((105, cy + 70), c.get("title", ""), font=f_box_text, fill="#ffffff")
        draw.text((105, cy + 114), c.get("desc", ""), font=f_box_sub, fill="#94a3b8")

    # 6. Footer
    footer_text = f"Nguồn: {source}"
    f_box = f_footer.getbbox(footer_text)
    draw.text(((W - (f_box[2] - f_box[0])) // 2, 870), footer_text, font=f_footer, fill="#64748b")

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    img.save(out_path, quality=95)
    print(f"✅ Đã tạo thẻ đồ họa thành công: {out_path} ({W}x{H})")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Tạo thẻ đồ họa thời sự Hóng Hớt 24/7")
    parser.add_argument("--title", required=True, help="Tiêu đề chính (Vàng)")
    parser.add_argument("--subtitle", default="", help="Phụ đề (Trắng)")
    parser.add_argument("--items", required=True, help="JSON mảng các mục hiển thị (icon, tag, title, desc, color)")
    parser.add_argument("--source", default="Báo chí chính thống", help="Nguồn trích dẫn")
    parser.add_argument("--theme", default="dark_blue", choices=["dark_blue", "cyan"], help="Giao diện")
    parser.add_argument("--out", required=True, help="Đường dẫn file ảnh đầu ra")

    args = parser.parse_args()
    parsed_items = json.loads(args.items)
    create_news_graphic(args.title, args.subtitle, parsed_items, args.out, args.source, args.theme)
