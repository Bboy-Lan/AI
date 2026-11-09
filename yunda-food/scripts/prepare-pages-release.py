"""Replace the precise isolated Pages worktree with the verified /AI/ build."""
from pathlib import Path
import shutil,json,re
root=Path.cwd().resolve()
dest=(root/'.release/github-pages').resolve()
assert dest.parent==root/'.release' and dest.name=='github-pages' and (dest/'.git').is_file()
html=(root/'dist/index.html').read_text(encoding='utf-8')
assert re.search(r'src="/AI/assets/index-[^"/]+\.js"',html)
for child in dest.iterdir():
    if child.name in ['.git','assets']:continue
    assert child.resolve().parent==dest and not child.is_symlink()
    if child.is_dir():shutil.rmtree(child)
    else:child.unlink()
for child in (root/'dist').iterdir():
    if child.is_dir():shutil.copytree(child,dest/child.name,dirs_exist_ok=True)
    else:shutil.copy2(child,dest/child.name)
(dest/'.nojekyll').touch()
print(json.dumps({'base':'/AI/','files':sum(p.is_file() for p in dest.rglob('*')),'target':str(dest)},ensure_ascii=True))
