# -*- coding: utf-8 -*-
"""_qa_v57_strip.py — 合成 before/after 并排对照条图（QA 只读产物）。"""
import pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(r'C:\Users\A\Desktop\youxi')
NOVA = ROOT / '.screenshots' / 'nova_fix'
VFX = ROOT / '.screenshots' / 'vfx_lazy'


def _font(size):
    for f in (r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\arial.ttf'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def strip(left_path, right_path, out_path, left_label, right_label, label_h=34):
    a = Image.open(left_path).convert('RGB')
    b = Image.open(right_path).convert('RGB')
    h = max(a.height, b.height)
    def fit(im):
        if im.height == h:
            return im
        w = round(im.width * h / im.height)
        return im.resize((w, h), Image.LANCZOS)
    a, b = fit(a), fit(b)
    w = a.width + b.width + 20
    canvas = Image.new('RGB', (w, h + label_h), (24, 26, 32))
    d = ImageDraw.Draw(canvas)
    f = _font(18)
    d.text((10, 6), left_label, fill=(255, 120, 120), font=f)
    d.text((a.width + 20 + 10, 6), right_label, fill=(120, 255, 160), font=f)
    canvas.paste(a, (0, label_h))
    canvas.paste(b, (a.width + 20, label_h))
    canvas.save(out_path)
    print('saved', out_path, canvas.size)


strip(NOVA / 'qa_before_8dir_after.png', NOVA / 'qa_after_8dir_after.png',
      NOVA / 'qa_strip_8dir.png', 'BEFORE (.snap_v57) 8dir 释放后', 'AFTER (主目录) 8dir 释放后')

strip(VFX / 'qa_before_boot_timeline.png', VFX / 'qa_after_boot_timeline.png',
      VFX / 'qa_strip_boot.png', 'BEFORE 首屏 7 张 / 3,105,240B', 'AFTER 首屏 0 张 / 0B')
