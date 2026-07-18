#!/usr/bin/env python3
"""全局框架版本号管理脚本。

用法：
    python scripts/bump-global.py 1.0.2

脚本会把新版本号同步到：
- version-global.json
- js/version-global.js（APP_VERSION_GLOBAL）
- index.html / ca.html / cn.html / qbn.html 中公共资源的 ?v= 参数
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from version_bump import (
    bump_resource_versions,
    validate_version,
    write_json,
    write_version_js,
)


def main() -> int:
    if len(sys.argv) != 2:
        print("用法：python bump-global.py <新版本号>", file=sys.stderr)
        return 1

    new_version = validate_version(sys.argv[1])
    root = Path(__file__).resolve().parent.parent

    write_json(root / "version-global.json", new_version)
    write_version_js(
        root / "js" / "version-global.js", "APP_VERSION_GLOBAL", new_version
    )

    global_resources = {
        "GlobalStyle.css",
        "FloatingWindow.js",
        "index.js",
        "version-global.js",
    }
    for html_name in ("index.html", "ca.html", "cn.html", "qbn.html"):
        bump_resource_versions(root / html_name, global_resources, new_version)

    print(f"全局框架版本号已统一更新为 {new_version}。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
