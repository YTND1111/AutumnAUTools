#!/usr/bin/env python3
"""排课表工具版本号管理脚本。

用法：
    python scripts/bump-ca.py 1.2.3

脚本会把新版本号同步到：
- version-ca.json
- js/version-ca.js（APP_VERSION_CA）
- ca.html 中排课表工具相关资源的 ?v= 参数
- ca.html 右上角的“排课表工具 vX.Y.Z”标签
- cn.html 中排课表工具相关资源的 ?v= 参数
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from version_bump import (
    bump_resource_versions,
    bump_version_label,
    validate_version,
    write_json,
    write_version_js,
)


def main() -> int:
    if len(sys.argv) != 2:
        print("用法：python bump-ca.py <新版本号>", file=sys.stderr)
        return 1

    new_version = validate_version(sys.argv[1])
    root = Path(__file__).resolve().parent.parent

    write_json(root / "version-ca.json", new_version)
    write_version_js(root / "js" / "version-ca.js", "APP_VERSION_CA", new_version)

    bump_resource_versions(
        root / "ca.html", {"version-ca.js", "CourseArrangement.js"}, new_version
    )
    bump_resource_versions(root / "cn.html", {"version-ca.js"}, new_version)
    bump_version_label(root / "ca.html", "排课表工具", new_version)

    print(f"排课表工具版本号已统一更新为 {new_version}。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
