"""提取遗留页面：将静态 HTML 页面拆分为「样式+结构」与「内联脚本」。

用法：python scripts/extract-legacy-pages.py
输入：项目根目录的 index.html / ca.html / qbn.html
输出：app/public/legacy/{home,ca,qbn}.html      —— <style> 块 + 去除 <script> 的 body 内容
      app/public/legacy/{home,ca,qbn}-inline.js —— 按原顺序拼接的内联脚本（若有）
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGACY_DIR = ROOT / "app" / "public" / "legacy"

PAGES = {
    "home": ROOT / "index.html",
    "ca": ROOT / "ca.html",
    "qbn": ROOT / "qbn.html",
}

STYLE_RE = re.compile(r"<style[^>]*>.*?</style>", re.S | re.I)
BODY_RE = re.compile(r"<body[^>]*>(.*)</body>", re.S | re.I)
SCRIPT_RE = re.compile(r"<script([^>]*)>(.*?)</script>", re.S | re.I)
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S | re.I)


def extract(name: str, path: Path) -> None:
    html = path.read_text(encoding="utf-8")
    head_end = html.lower().find("</head>")
    head = html[:head_end] if head_end != -1 else ""

    styles = STYLE_RE.findall(head)
    title_match = TITLE_RE.search(html)
    title = title_match.group(1).strip() if title_match else ""

    body_match = BODY_RE.search(html)
    if not body_match:
        raise SystemExit(f"[错误] {path.name} 未找到 <body>")
    body = body_match.group(1)

    inline_parts: list[str] = []

    def collect(match: re.Match[str]) -> str:
        attrs, code = match.group(1), match.group(2)
        if "src=" not in attrs and code.strip():
            inline_parts.append(code.strip("\n"))
        return ""  # 从 HTML 中移除所有 <script>

    cleaned_body = SCRIPT_RE.sub(collect, body)

    out_html = "\n".join(styles) + "\n" + cleaned_body.strip() + "\n"
    (LEGACY_DIR / f"{name}.html").write_text(out_html, encoding="utf-8")

    if inline_parts:
        (LEGACY_DIR / f"{name}-inline.js").write_text(
            "\n\n".join(inline_parts) + "\n", encoding="utf-8"
        )

    print(f"[完成] {path.name} -> legacy/{name}.html"
          f"（内联脚本 {len(inline_parts)} 段，标题：{title}）")


def main() -> None:
    LEGACY_DIR.mkdir(parents=True, exist_ok=True)
    for name, path in PAGES.items():
        extract(name, path)


if __name__ == "__main__":
    main()
