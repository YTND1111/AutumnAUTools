#!/usr/bin/env python3
"""秋功版本号管理脚本。

用法：
    python scripts/bump-version.py 1.2.0

脚本会把新版本号同步到：
- version.json（单一事实来源）
- js/version.js（全局 APP_VERSION）
- index.html / ca.html / cn.html 中的 CSS/JS 资源链接 ?v= 参数
- ca.html 页面右上角的版本标签
"""

import json
import re
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("用法：python bump-version.py <新版本号>", file=sys.stderr)
        return 1

    new_version = sys.argv[1].strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", new_version):
        print(f"版本号格式应为 x.y.z，收到：{new_version}", file=sys.stderr)
        return 1

    root = Path(__file__).resolve().parent.parent

    # 1. 更新 version.json
    version_json = root / "version.json"
    version_json.write_text(json.dumps({"version": new_version}, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")
    print(f"已更新 {version_json.name}: {new_version}")

    # 2. 更新 js/version.js
    version_js = root / "js" / "version.js"
    version_js.write_text(
        f"/* 秋功版本号：单一事实来源为根目录 version.json */\n"
        f'const APP_VERSION = "{new_version}";\n',
        encoding="utf-8"
    )
    print(f"已更新 {version_js.name}: {new_version}")

    # 3. 更新 HTML 资源链接的 ?v= 参数
    version_query_re = re.compile(r"\?v=\d+\.\d+\.\d+")
    for html_name in ("index.html", "ca.html", "cn.html"):
        html_path = root / html_name
        if not html_path.exists():
            print(f"跳过不存在的文件：{html_name}", file=sys.stderr)
            continue
        content = html_path.read_text(encoding="utf-8")
        new_content = version_query_re.sub(f"?v={new_version}", content)

        # 同时更新 ca.html 中 #VersionLabel 的显示文本
        if html_name == "ca.html":
            label_re = re.compile(r'(<div id="VersionLabel">秋功 v)\d+\.\d+\.\d+(</div>)')
            new_content = label_re.sub(rf"\g<1>{new_version}\g<2>", new_content)

        html_path.write_text(new_content, encoding="utf-8")
        print(f"已更新 {html_name}: {new_version}")

    print(f"版本号已统一更新为 {new_version}，分发时静态资源 URL 将发生变化，可触发浏览器重新加载。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
