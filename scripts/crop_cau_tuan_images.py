import os
import glob
from PIL import Image, ImageEnhance, ImageFilter

SLUG = "2026-11-13-cau-tuan-cua-ong-bi-bat-31-ty"
EVIDENCE_DIR = f"public/{SLUG}/evidence"
TARGET_W = 1080
TARGET_H = 1040

def process_image(src_path, dst_path):
    try:
        im = Image.open(src_path).convert("RGB")
        w, h = im.size
        target_ratio = TARGET_W / TARGET_H
        src_ratio = w / h

        if src_ratio > target_ratio:
            new_w = int(h * target_ratio)
            left = (w - new_w) // 2
            im_cropped = im.crop((left, 0, left + new_w, h))
        else:
            new_h = int(w / target_ratio)
            top = (h - new_h) // 2
            im_cropped = im.crop((0, top, w, top + new_h))

        im_resized = im_cropped.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
        im_sharp = im_resized.filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3))
        enhancer = ImageEnhance.Color(im_sharp)
        im_final = enhancer.enhance(1.05)
        
        im_final.save(dst_path, "JPEG", quality=95)
        print(f"Processed: {src_path} -> {dst_path} ({TARGET_W}x{TARGET_H})")
    except Exception as e:
        print(f"Error processing {src_path}: {e}")

if __name__ == "__main__":
    for f in glob.glob(f"{EVIDENCE_DIR}/*.jpg"):
        if "crop_" in f:
            continue
        base = os.path.basename(f)
        out = os.path.join(EVIDENCE_DIR, f"crop_{base}")
        process_image(f, out)
