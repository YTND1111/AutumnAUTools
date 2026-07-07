#!/usr/bin/env python3
"""版本号管理公共辅助函数。"""

import json
import re
import sys
from pathlib import Path


def validate_version(version: str) -> str:
    """校验并返回符合 x.y.z 格式的版本号。"""
    version = version.strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        print(f"版本号格式应为 x.y.z，收到：{version}", file=sys.stderr)
        sys.exit(1)
    return version


def write_json(json_path: Path, version: str) -> None:
    """将版本号写入 JSON 文件。"""
    json_path.write_text(
        json.dumps({"version": version}, ensure_ascii=False, indent=4) + "\n",
        encoding="utf-8",
    )
    print(f"已更新 {json_path.name}: {version}")


def write_version_js(js_path: Path, var_name: str, version: str) -> None:
    """生成前端版本号变量文件。"""
    js_path.write_text(
        f"/* 秋功模块版本号：{var_name} */\n"
        f'const {var_name} = "{version}";\n',
        encoding="utf-8",
    )
    print(f"已更新 {js_path.name}: {version}")


def bump_resource_versions(html_path: Path, filenames: set[str], new_version: str) -> None:
    """只更新指定文件名对应的资源 ?v= 参数。"""
    if not html_path.exists():
        print(f"跳过不存在的文件：{html_path.name}", file=sys.stderr)
        return

    content = html_path.read_text(encoding="utf-8")
    for filename in filenames:
        # 匹配 href/src 中的完整路径 + 文件名，再跟 ?v=x.y.z
        pattern = re.compile(
            rf'(["\'](?:\\./|/)?[^"\'>]*{re.escape(filename)})\?v=\d+\.\d+\.\d+'
        )
        content = pattern.sub(rf"\g<1>?v={new_version}", content)

    html_path.write_text(content, encoding="utf-8")
    print(f"已更新 {html_path.name} 中 {filenames} 的版本戳: {new_version}")


def bump_version_label(html_path: Path, prefix: str, new_version: str) -> None:
    """更新页面右上角版本标签文字。"""
    if not html_path.exists():
        print(f"跳过不存在的文件：{html_path.name}", file=sys.stderr)
        return

    content = html_path.read_text(encoding="utf-8")
    label_re = re.compile(
        rf'(<div id="VersionLabel">{re.escape(prefix)} v)\d+\.\d+\.\d+(</div>)'
    )
    new_content = label_re.sub(rf"\g<1>{new_version}\g<2>", content)
    html_path.write_text(new_content, encoding="utf-8")
    print(f"已更新 {html_path.name} 版本标签: {prefix} v{new_version}")
