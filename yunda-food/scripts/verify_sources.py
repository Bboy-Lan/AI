from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'reference/public-baseline.json').read_text(encoding='utf-8'))
changed=[p for p,h in manifest.items() if not (root/p).is_file() or hashlib.sha256((root/p).read_bytes()).hexdigest()!=h]
print(json.dumps({'ok':not changed,'checked':len(manifest),'changed':changed}))
raise SystemExit(bool(changed))
