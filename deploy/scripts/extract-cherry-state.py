#!/usr/bin/env python3
"""Extract Cherry Studio redux-persist state from Local Storage leveldb."""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ldb = os.path.join(os.environ["APPDATA"], "CherryStudio", "Local Storage", "leveldb")
blob = b""
for fn in sorted(os.listdir(ldb)):
    if fn.endswith(".ldb") or fn.endswith(".log"):
        blob += open(os.path.join(ldb, fn), "rb").read()

idx = blob.find(b"persist:cherry-studio")
if idx < 0:
    print("persist:cherry-studio not found", file=sys.stderr)
    sys.exit(1)

chunk = blob[idx : idx + 2_000_000]
start = chunk.find(b"{")
if start < 0:
    print("no JSON object found", file=sys.stderr)
    sys.exit(1)

text = chunk[start:].decode("utf-8", errors="ignore")
clean = "".join(c if c.isprintable() or c in "\n\r\t" else "" for c in text[:500_000])

depth = 0
end = 0
for i, ch in enumerate(clean):
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 0:
            end = i + 1
            break

outer = clean[:end]
data = json.loads(outer)
print("TOP_KEYS", list(data.keys()))

out_path = os.path.join(os.path.dirname(__file__), "..", "brain", "cherry-state-raw.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("WROTE", os.path.abspath(out_path))

for k, v in data.items():
    if "provider" in k.lower() or k in ("llm", "settings", "models", "assistants"):
        if isinstance(v, str):
            try:
                inner = json.loads(v)
                inner_path = os.path.join(
                    os.path.dirname(__file__), "..", "brain", f"cherry-{k}.json"
                )
                with open(inner_path, "w", encoding="utf-8") as f:
                    json.dump(inner, f, ensure_ascii=False, indent=2)
                print("INNER", k, "->", os.path.abspath(inner_path))
            except json.JSONDecodeError as e:
                print("INNER_FAIL", k, e, v[:300])
