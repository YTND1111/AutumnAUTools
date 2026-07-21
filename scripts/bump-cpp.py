#!/usr/bin/env python3
"""C/C++ 在线编译器版本号管理脚本。

用法：
    python scripts/bump-cpp.py 1.0.1

脚本会把新版本号同步到：
- version-cpp.json
- js/version-cpp.js（APP_VERSION_CPP）
- cpp.html 中编译器模块资源的 ?v= 参数
- cpp.html 工具栏的“C/C++ 在线编译器 vX.Y.Z”标签
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
        print("用法：python bump-cpp.py <新版本号>", file=sys.stderr)
        return 1

    new_version = validate_version(sys.argv[1])
    root = Path(__file__).resolve().parent.parent

    write_json(root / "version-cpp.json", new_version)
    write_version_js(root / "js" / "version-cpp.js", "APP_VERSION_CPP", new_version)

    bump_resource_versions(
        root / "cpp.html", {"version-cpp.js", "JSCPP.es5.min.js"}, new_version
    )
    bump_version_label(root / "cpp.html", "C/C++ 在线编译器", new_version)

    print(f"C/C++ 在线编译器版本号已统一更新为 {new_version}。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
