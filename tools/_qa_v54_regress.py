# -*- coding: utf-8 -*-
"""
_qa_v54_regress.py —— 阶段 B 回归：跑 tools/ 下既有自测，记录通过/失败与输出摘要。

被测对象为主目录当前源码（并发修改中）；本脚本只执行既有测试，不改源码。
输出：.screenshots/qa/regress.json
"""
import json
import pathlib
import re
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOOLS = ROOT / 'tools'
QA = ROOT / '.screenshots' / 'qa'
QA.mkdir(parents=True, exist_ok=True)

PY = r'D:\python\python.exe'

# (脚本, 解释器, 摘要正则)
TESTS = [
    ('_v222_ui_test.py', PY, r'(\d+)\s+OK\s*/\s*(\d+)\s+FAIL'),
    ('_v206_ui_test.py', PY, r'(\d+)\s+OK\s*/\s*(\d+)\s+FAIL'),
    ('_v12_boss_test.js', 'node', r'(\d+)\s+PASS\s*/\s*(\d+)\s+FAIL'),
    ('_v19_mage_test.js', 'node', r'(\d+)\s+PASS\s*/\s*(\d+)\s+FAIL'),
    ('_v209_audit_test.js', 'node', r'(\d+)\s+PASS\s*/\s*(\d+)\s+FAIL'),
    ('_v77_skins_art.js', 'node', r'\[PASS\]|fails\.length'),
]


def run_one(script, interpreter):
    cmd = [interpreter, str(TOOLS / script)] if interpreter != 'node' else ['node', str(TOOLS / script)]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                           cwd=str(ROOT), encoding='utf-8', errors='replace')
        out, err, code = p.stdout, p.stderr, p.returncode
    except subprocess.TimeoutExpired:
        return {'script': script, 'status': 'TIMEOUT', 'exit_code': None,
                'stdout_tail': '', 'stderr_tail': '', 'elapsed_s': round(time.time() - t0, 1)}
    elapsed = round(time.time() - t0, 1)
    return {'script': script, 'status': 'EXIT' if code == 0 else 'FAIL',
            'exit_code': code, 'elapsed_s': elapsed,
            'stdout_tail': (out or '')[-3000:], 'stderr_tail': (err or '')[-1000:]}


def summarize(res, pattern, script):
    text = (res.get('stdout_tail', '') or '') + '\n' + (res.get('stderr_tail', '') or '')
    m = re.search(pattern, text)
    if m and m.lastindex and m.lastindex >= 2:
        return {'passed': int(m.group(1)), 'failed': int(m.group(2))}
    if script.endswith('_v77_skins_art.js'):
        if '[FAIL]' in text:
            return {'passed': None, 'failed': 1}
        if '[PASS]' in text:
            return {'passed': 1, 'failed': 0}
    return {'passed': None, 'failed': None}


def main():
    results = []
    for script, interp, pat in TESTS:
        res = run_one(script, interp)
        res['summary'] = summarize(res, pat, script)
        results.append(res)
        print('%s -> %s (exit=%s) %s' % (script, res['status'], res['exit_code'], res['summary']))

    out = {'meta': {'ran': time.strftime('%Y-%m-%d %H:%M:%S'), 'root': str(ROOT)},
           'results': results}
    (QA / 'regress.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    print('回归结果已写:', QA / 'regress.json')


if __name__ == '__main__':
    main()
