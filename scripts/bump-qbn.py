#!/usr/bin/env python3
"""题库版本号管理脚本。

用法：
    python scripts/bump-qbn.py 1.0.1

脚本会把新版本号同步到：
- version-qbn.json
- js/version-qbn.js（APP_VERSION_QBN）
- qbn.html 中题库模块资源的 ?v= 参数
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from version_bump import bump_resource_versions, validate_version, write_json, write_version_js


def main() -> int:
    if len(sys.argv) != 2:
        print("用法：python bump-qbn.py <新版本号>", file=sys.stderr)
        return 1

    new_version = validate_version(sys.argv[1])
    root = Path(__file__).resolve().parent.parent

    write_json(root / "version-qbn.json", new_version)
    write_version_js(root / "js" / "version-qbn.js", "APP_VERSION_QBN", new_version)

    bump_resource_versions(root / "qbn.html", {"version-qbn.js"}, new_version)

    print(f"题库版本号已统一更新为 {new_version}。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
