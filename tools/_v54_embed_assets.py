# -*- coding: utf-8 -*-
"""_v54_embed_assets.py — 把骑士 AI 源帧（待机 1 + 跑 4 + 攻 3）base64 内嵌进 hero_skin_ai.js。

背景：file:// 协议下 file URL 图片会污染 canvas，getImageData 被浏览器拦截，
逐像素分区染色无法进行；data URI 同源不污染，因此源帧以 data URI 打包进 JS。

用法：D:/python/python.exe tools/_v54_embed_assets.py
重切 AI 源帧后重跑本脚本即可刷新 EMBED 段（标记 __EMBED_BEGIN__ / __EMBED_END__ 之间）。
"""
import base64
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
JS = ROOT / 'hero_skin_ai.js'

FILES = {
    'idle': ['assets/ai/processed/hero_small.png'],
    'run': ['assets/ai/hero_anim/run_0.png', 'assets/ai/hero_anim/run_1.png',
            'assets/ai/hero_anim/run_2.png', 'assets/ai/hero_anim/run_3.png'],
    'atk': ['assets/ai/hero_anim/attack_0.png', 'assets/ai/hero_anim/attack_1.png',
            'assets/ai/hero_anim/attack_2.png'],
}


def main():
    embed = {}
    total = 0
    for key, rels in FILES.items():
        embed[key] = []
        for rel in rels:
            b = (ROOT / rel).read_bytes()
            total += len(b)
            embed[key].append('data:image/png;base64,' + base64.b64encode(b).decode())
    literal = json.dumps(embed, separators=(',', ':'))

    src = JS.read_text(encoding='utf-8')
    new_block = '  var EMBED = ' + literal + ';'
    pat = re.compile(r'  var EMBED = /\*__EMBED__\*/ \{ idle: \[\], run: \[\], atk: \[\] \};')
    if not pat.search(src):
        raise SystemExit('未找到 EMBED 占位行，请检查 hero_skin_ai.js 标记')
    src = pat.sub(lambda m: new_block, src)
    JS.write_text(src, encoding='utf-8')
    print('EMBED 已刷新：raw %d bytes，b64 %d chars，%d 帧' % (
        total, sum(len(x) for v in embed.values() for x in v),
        sum(len(v) for v in embed.values())))


if __name__ == '__main__':
    main()
