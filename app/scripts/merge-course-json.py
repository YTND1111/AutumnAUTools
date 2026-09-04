#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
merge-course-json.py —— 以课程通知单 Excel（如「附件3：新生选课课程清单 .xls」）为准，同步已有课程 JSON。

背景
----
- 已有 JSON（如「中国农业大学2026-2027学年秋季学期通知单课表.json」）由附件2（全校总课表）经
  json-trans.py 转换生成，字段固定 19 列：序号、通知单号、校区、开课学院、教师姓名、课程编号、课序号、
  课程名称、课程英文名称、上课班级、班级人数、限选人数、学分、总学时、课程性质、课程属性、上课周次、
  上课时间地点、上课时间。
- 附件3（新生选课课程清单）含 4 个工作表，各表前 7 行为头部说明，表头在第 7 行（0 起索引 6），第 8 行起
  为数据，序号列空即结束。附件3 没有「班级人数」「课程性质」列，「上课周次」可由「上课时间」中的
  {第X周} 片段按出现顺序推导（与附件2 该列语义一致）。

运行模式（--mode）
------------------
sync（默认，覆盖 + 补充）
  以新文件为准：通知单号已存在于 JSON → 用新文件内容覆盖该记录；不存在 → 追加为新记录。
  覆盖语义（关键）：
    - 新文件提供的列（校区/开课学院/教师姓名/课程编号/课序号/课程名称/课程英文名称/上课班级/限选人数/
      学分/总学时/课程属性/上课时间地点/上课时间）一律取新文件值；
    - 「上课周次」始终按新文件「上课时间」重新推导，保证与排课一致；
    - 新文件没有的列（「班级人数」「课程性质」）保留原 JSON 中的旧值（追加的新记录则填空）；
    - 「序号」「通知单号」保持不变。
append（仅补充，原行为）
  通知单号已存在 → 跳过（不重复添加）；不存在 → 追加。

其他说明
--------
- 新文件内部跨工作表同样以「通知单号」去重（先出现的表优先，如「新生选课课程清单」表）。
- 写回前自动备份目标 JSON 为同目录下「同名 .bak」。
- 新增记录的「序号」在目标 JSON 最大序号后依次 +1（浮点形式，与旧数据一致）。

用法
----
    python app/scripts/merge-course-json.py                       # 默认 sync：dist 目录下附件3 + 通知单课表 JSON
    python app/scripts/merge-course-json.py --excel "路径/附件3.xls" --json "路径/目标.json"
    python app/scripts/merge-course-json.py --mode append --dry-run   # 预览，不写盘
"""

import argparse
import json
import re
import sys
from pathlib import Path

import xlrd

# 目标 JSON 的 19 字段（顺序与 json-trans.py 产物一致）
JSON_KEYS: list[str] = [
    "序号",
    "通知单号",
    "校区",
    "开课学院",
    "教师姓名",
    "课程编号",
    "课序号",
    "课程名称",
    "课程英文名称",
    "上课班级",
    "班级人数",
    "限选人数",
    "学分",
    "总学时",
    "课程性质",
    "课程属性",
    "上课周次",
    "上课时间地点",
    "上课时间",
]

HEADER_ROW = 6  # 表头行（0 起），Excel 第 7 行
FIRST_DATA_ROW = 7  # 首条数据行（0 起），Excel 第 8 行

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXCEL = REPO_ROOT / "app" / "dist" / "src" / "py" / "附件3：中国农业大学2026-2027学年秋季学期新生选课课程清单.xls"
DEFAULT_JSON = REPO_ROOT / "app" / "dist" / "src" / "py" / "中国农业大学2026-2027学年秋季学期通知单课表.json"


def normalize_value(value: object) -> str:
    """单元格值转字符串：None → ""，整型浮点去尾 .0（与旧 JSON 一致，如 学分 2.0 → "2"）。"""
    if value is None:
        return ""
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else str(value)
    if isinstance(value, int):
        return str(value)
    return str(value).strip()


def normalize_notice_id(value: object) -> str:
    """通知单号（15 位数字）可能以文本或数字存储，统一转规范字符串。"""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, int):
        return str(value)
    return str(value).strip()


def derive_weeks(time_text: str) -> str:
    """从「上课时间」提取 {第X周} 片段，按出现顺序逗号连接（与附件2「上课周次」列语义一致）。"""
    return ",".join(re.findall(r"\{第([^}]*?)周\}", time_text or ""))


def read_excel_records(excel_path: Path) -> list[dict[str, object]]:
    """读取 .xls 全部工作表；以「通知单号」跨表去重（先出现的表优先），返回原始行字典列表。"""
    workbook = xlrd.open_workbook(filename=str(excel_path))
    seen: dict[str, dict[str, object]] = {}
    try:
        for sheet in workbook.sheets():
            headers: list[str] = [
                str(sheet.cell_value(HEADER_ROW, col)).replace("\n", "").strip()
                for col in range(sheet.ncols)
            ]
            for row in range(FIRST_DATA_ROW, sheet.nrows):
                if str(sheet.cell_value(row, 0)).strip() == "":  # 序号列空即结束
                    break
                notice_id = normalize_notice_id(sheet.cell_value(row, 1))
                if not notice_id or notice_id in seen:
                    continue
                seen[notice_id] = {
                    headers[col]: sheet.cell_value(row, col)
                    for col in range(sheet.ncols)
                    if headers[col]
                }
    finally:
        workbook.release_resources()
    return list(seen.values())


def build_record(
    notice_id: str,
    raw: dict[str, object],
    existing: dict[str, object] | None,
    next_seq: float,
) -> dict[str, object]:
    """把新文件原始行映射为 19 字段记录。

    existing 为空 → 全新追加记录（新文件缺失的列填空）；
    existing 非空 → 覆盖：新文件提供的列取新值，缺失列保留旧值，上课周次按新上课时间重推导。
    """
    time_text = normalize_value(raw.get("上课时间", ""))
    record: dict[str, object] = {}
    for key in JSON_KEYS:
        if key == "序号":
            record[key] = existing["序号"] if existing else next_seq
        elif key == "通知单号":
            record[key] = notice_id
        elif key == "上课周次":
            record[key] = derive_weeks(time_text)
        elif key in raw:
            record[key] = normalize_value(raw[key])
        else:  # 新文件缺失该列：覆盖时保留旧值；追加时填空
            record[key] = normalize_value(existing.get(key, "")) if existing else ""
    return record


def changed_fields(old: dict[str, object], new: dict[str, object]) -> list[str]:
    """返回值发生变化的字段名（供报告/预览用）。"""
    return [key for key in JSON_KEYS if str(old.get(key)) != str(new.get(key))]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="以课程通知单 Excel 为准同步已有课程 JSON（按通知单号覆盖/补充）。"
    )
    parser.add_argument(
        "--excel",
        default=str(DEFAULT_EXCEL),
        help=f"课程通知单 Excel 路径（默认：{DEFAULT_EXCEL}）",
    )
    parser.add_argument(
        "--json",
        default=str(DEFAULT_JSON),
        help=f"目标课程 JSON 路径（默认：{DEFAULT_JSON}）",
    )
    parser.add_argument(
        "--mode",
        choices=("sync", "append"),
        default="sync",
        help="sync=覆盖+补充（以新文件为准，默认）；append=仅补充不覆盖",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只统计并预览变化，不写盘",
    )
    args = parser.parse_args()

    excel_path = Path(args.excel).expanduser().resolve()
    json_path = Path(args.json).expanduser().resolve()
    for path in (excel_path, json_path):
        if not path.exists():
            print(f"文件不存在: {path}", file=sys.stderr)
            return 1

    try:
        new_records = read_excel_records(excel_path)
    except Exception as error:
        print(f"读取 Excel 失败: {error}", file=sys.stderr)
        return 1

    try:
        with json_path.open("r", encoding="utf-8") as f:
            existing = json.load(f)
    except Exception as error:
        print(f"读取 JSON 失败: {error}", file=sys.stderr)
        return 1

    existing_by_id: dict[str, dict[str, object]] = {}
    for rec in existing:
        nid = normalize_notice_id(rec.get("通知单号", ""))
        if nid and nid not in existing_by_id:
            existing_by_id[nid] = rec

    appended = 0  # 新增补充
    overwritten = 0  # 覆盖更新（sync）
    changed_overwrites = 0  # 覆盖且确有字段变化
    skipped = 0  # 跳过（append 模式下已存在）
    skipped_no_id = 0  # 通知单号缺失/为空
    preview: list[tuple[str, str, list[str]]] = []  # (通知单号, 课程名称, 变化的字段)

    next_seq = max((float(rec.get("序号", 0)) for rec in existing), default=0.0) + 1.0
    for raw in new_records:
        notice_id = normalize_notice_id(raw.get("通知单号", ""))
        if not notice_id:
            skipped_no_id += 1
            continue
        old = existing_by_id.get(notice_id)
        if old is None:
            # 全新记录 → 追加
            existing.append(build_record(notice_id, raw, None, next_seq))
            existing_by_id[notice_id] = existing[-1]
            next_seq += 1.0
            appended += 1
            continue
        if args.mode == "append":
            skipped += 1
            continue
        # sync：以新文件为准覆盖
        new_record = build_record(notice_id, raw, old, next_seq)
        fields = changed_fields(old, new_record)
        old.clear()
        old.update(new_record)
        overwritten += 1
        if fields:
            changed_overwrites += 1
            if len(preview) < 15:
                preview.append((notice_id, str(new_record.get("课程名称", "")), fields))

    print(f"Excel 解析课程数（跨表去重）: {len(new_records)}")
    print(f"JSON 原记录数: {len(existing) - appended}")
    if args.mode == "append":
        print(f"已存在跳过: {skipped}")
    print(f"新增补充: {appended}")
    if args.mode == "sync":
        print(f"覆盖更新: {overwritten}（其中内容发生变化: {changed_overwrites}，内容相同: {overwritten - changed_overwrites}）")
    if skipped_no_id:
        print(f"通知单号缺失被忽略: {skipped_no_id}")

    if args.mode == "sync" and preview:
        print("变化预览（前 %d 条）:" % len(preview))
        for nid, name, fields in preview:
            print(f"  {nid} {name} -> 变化字段: {'、'.join(fields)}")

    if args.dry_run:
        print("dry-run：未写盘。")
        return 0

    needs_write = appended > 0 or (args.mode == "sync" and changed_overwrites > 0)
    if not needs_write:
        print("没有需要更新的内容，JSON 未改动。")
        return 0

    # 写回前备份
    backup_path = json_path.with_suffix(json_path.suffix + ".bak")
    backup_path.write_bytes(json_path.read_bytes())

    with json_path.open("w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"合并后 JSON 总记录数: {len(existing)}")
    print(f"已备份原 JSON: {backup_path}")
    print(f"已写回: {json_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
