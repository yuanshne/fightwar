"""GitHub REST API 推送器 —— github.com:443 不可达、api.github.com 可达时的等价方案。

流程与 git push 相同：上传 blob -> 组装 tree -> 造 commit -> 移动 ref。
服务端若逐字节复现了 author/committer/message，生成 commit sha 与本地 HEAD 一致，
本地 refs/remotes/origin/main 可直接指过去，后续真推送不会分叉。
"""
import base64, datetime, json, os, subprocess, sys, urllib.request

REPO = "yuanshne/fightwar"
API = "https://api.github.com"
TOKEN = subprocess.check_output(
    ["gh", "auth", "token"],
    env={k: v for k, v in os.environ.items()
         if k.lower() not in ("http_proxy", "https_proxy", "all_proxy")},
).decode().strip()


def git(*args, binary=False):
    out = subprocess.check_output(["git", *args])
    return out if binary else out.decode().strip()


def ident(line):
    """'name <email> 1793027746 +0800' -> GitHub API 的 author/committer 对象。"""
    name, rest = line.split(" <", 1)
    email, rest = rest.split("> ", 1)
    ts, tz = rest.split(" ")
    sign = 1 if tz[0] == "+" else -1
    offset = sign * (int(tz[1:3]) * 3600 + int(tz[3:5]) * 60)
    dt = datetime.datetime.fromtimestamp(int(ts), datetime.timezone(datetime.timedelta(seconds=offset)))
    return {"name": name, "email": email, "date": dt.strftime("%Y-%m-%dT%H:%M:%S") + tz[:3] + ":" + tz[3:]}


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("X-GitHub-Api-Version", "2022-11-28")
    if data:
        req.add_header("Content-Type", "application/json")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # 绕开环境代理
    try:
        with opener.open(req, timeout=60) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        print(f"!! {method} {path} -> {e.code}\n{e.read().decode()[:2000]}", file=sys.stderr)
        raise


def main():
    head = git("rev-parse", "HEAD")
    parent = git("rev-parse", "HEAD^")
    base_tree = git("rev-parse", "HEAD^^{tree}")
    expect_tree = git("rev-parse", "HEAD^{tree}")
    raw = git("cat-file", "-p", "HEAD")
    author = committer = None
    for line in raw.splitlines():
        if line.startswith("author "):
            author = line[7:]
        elif line.startswith("committer "):
            committer = line[10:]
    message = raw.split("\n\n", 1)[1]

    remote = call("GET", f"/repos/{REPO}/git/ref/heads/main")
    remote_sha = remote["object"]["sha"]
    print("本地 HEAD :", head)
    print("远端 main :", remote_sha)

    # 远端父提交：GitHub 会把提交时间归一为 UTC，本地 +0800 记录的 commit sha 与远端不同
    # （tree 一致）。这种情况把「远端 tree」当基准做增量，避免整棵树重传，也不要强推。
    if remote_sha == parent:
        base_tree, base_ref, parent_shas = base_tree, parent, [parent]
    else:
        rc = call("GET", f"/repos/{REPO}/git/commits/{remote_sha}")
        rtree = rc["tree"]["sha"]
        if rtree != expect_tree and subprocess.run(
                ["git", "cat-file", "-e", rtree], check=False).returncode != 0:
            sys.exit(f"! 远端 tree {rtree} 本地没有，且与本地 tree 不同，拒绝强推")
        base_tree, base_ref, parent_shas = rtree, rtree, [remote_sha]
        print(f"… 远端 sha 与本地不同但 tree 可对齐，按 {rtree[:10]} 增量")

    entries = []
    for line in git("diff", "--name-status", base_ref, head).splitlines():
        status, path = line.split("\t")
        if status == "D":
            entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
            continue
        blob = git("cat-file", "blob", f"{head}:{path}", binary=True)
        r = call("POST", f"/repos/{REPO}/git/blobs",
                 {"content": base64.b64encode(blob).decode(), "encoding": "base64"})
        entries.append({"path": path, "mode": "100644", "type": "blob", "sha": r["sha"]})
        print(f"  blob {path:36s} {r['sha'][:10]} {len(blob):>7d}B")

    tree = call("POST", f"/repos/{REPO}/git/trees", {"base_tree": base_tree, "tree": entries})
    print("tree :", tree["sha"], "期望", expect_tree, "OK" if tree["sha"] == expect_tree else "不一致")
    if tree["sha"] != expect_tree:
        sys.exit("! 组装出的 tree 与本地不一致，取消推送")

    commit = call("POST", f"/repos/{REPO}/git/commits", {
        "message": message, "tree": tree["sha"], "parents": parent_shas,
        "author": ident(author), "committer": ident(committer),
    })
    print("commit:", commit["sha"])
    ref = call("PATCH", f"/repos/{REPO}/git/refs/heads/main",
               {"sha": commit["sha"], "force": False})
    print("ref   :", ref["object"]["sha"], "-> main 已更新")
    print("本地-远端 sha 是否一致:", commit["sha"] == head)


if __name__ == "__main__":
    main()
