# -*- coding: utf-8 -*-
"""Build the offline CET-6 word dataset used by 词隙.

Sources (downloaded into tmp/cet6src):
  - KyleBing/english-vocabulary  CET6 / CET4 jsonl
  - hermitdave/FrequencyWords   en_50k.txt
The generated js/data.js is self-contained; the site never needs the network.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT.parent / "tmp" / "cet6src"
OUT_JS = ROOT / "js" / "data.js"
OUT_JSON = SRC / "dataset.json"

POS_LABELS = {
    "n": "n.",
    "v": "v.",
    "vt": "vt.",
    "vi": "vi.",
    "adj": "adj.",
    "adv": "adv.",
    "prep": "prep.",
    "conj": "conj.",
    "pron": "pron.",
    "num": "num.",
    "int": "int.",
    "aux": "aux.",
    "art": "art.",
}

POS_GROUPS = {
    "n": "n",
    "vt": "v",
    "vi": "v",
    "v": "v",
    "adj": "adj",
    "adv": "adv",
}

# Specific Chinese triggers. Longer phrases score higher, so a gloss such as
# "经济改革" lands in 经济 rather than the generic 变化 bucket.
DOMAIN_TRIGGERS = {
    "情感态度": [
        "情感", "情绪", "感情", "高兴", "快乐", "愉快", "悲伤", "悲痛", "愤怒", "生气",
        "恐惧", "害怕", "焦虑", "担心", "惊讶", "惊奇", "厌恶", "喜欢", "喜爱", "热爱",
        "满意", "失望", "羞耻", "羞愧", "嫉妒", "同情", "热情", "冷漠", "态度", "尊重",
        "轻蔑", "勇敢", "胆怯", "孤独", "幸福", "痛苦", "兴趣", "厌烦", "感激", "后悔",
        "骄傲", "自豪", "谦虚", "温柔", "耐心", "信心", "希望", "绝望", "安心", "不安",
        "内疚", "鄙视", "钦佩", "怀念", "渴望", "恐惧感",
    ],
    "思维认知": [
        "思考", "认为", "相信", "怀疑", "判断", "推理", "记忆", "忘记", "想象", "理解",
        "明白", "意识", "注意", "概念", "观点", "思想", "逻辑", "理性", "直觉", "知识",
        "智慧", "愚蠢", "聪明", "决定", "选择", "考虑", "分析", "评估", "认知", "洞察",
        "知觉", "信念", "假设", "推测", "反思", "困惑", "迷惑", "启示", "灵感", "智力",
        "mental", "mind",
    ],
    "言语沟通": [
        "说", "讲话", "谈话", "声明", "宣布", "争论", "辩论", "反驳", "解释", "描述",
        "表达", "暗示", "承诺", "批评", "赞扬", "赞美", "抱怨", "建议", "劝告", "命令",
        "要求", "回答", "提问", "语言", "演讲", "讨论", "交流", "称呼", "命名", "告诉",
        "通知", "宣布", "透露", "谣言", "口音", "语调", "对话", "叙述", "说明", "宣称",
        "主张", "断言", "澄清", "强调", "翻译", "写作", "阅读", "句子", "词语", "标题",
        "信", "邮件", "消息", "报道", "采访", "广告", "宣传",
    ],
    "社会文化": [
        "社会", "文化", "传统", "习俗", "群体", "社区", "公共", "人口", "家庭", "婚姻",
        "宗教", "仪式", "节日", "民族", "种族", "性别", "身份", "地位", "社交", "友谊",
        "合作", "竞争", "冲突", "风俗", "道德", "伦理", "价值观", "习惯", "生活方式",
        "文明", "城市", "乡村", "移民", "代沟", "邻里", "志愿者", "慈善", "福利", "贫困",
        "平等", "歧视", "偏见", "舆论", "媒体", "新闻", "网络社交",
    ],
    "政治法律": [
        "政府", "政治", "政策", "法律", "权利", "权力", "义务", "选举", "国家", "公民",
        "法院", "犯罪", "证据", "合同", "规定", "制度", "民主", "自由", "平等", "正义",
        "惩罚", "警察", "律师", "诉讼", "合法", "非法", "统治", "宪法", "法案", "议会",
        "总统", "部长", "外交", "条约", "主权", "难民", "恐怖主义", "立法", "司法", "判决",
        "罚款", "监狱", "嫌疑", "辩护", "起诉", "监管", "规定", "许可", "签证",
    ],
    "经济商业": [
        "经济", "商业", "市场", "金钱", "货币", "财政", "投资", "价格", "利润", "成本",
        "贸易", "银行", "贷款", "债务", "预算", "收入", "支出", "消费", "销售", "购买",
        "公司", "企业", "产业", "就业", "失业", "工资", "财富", "贫困", "税收", "保险",
        "金融", "资本", "股票", "债券", "利息", "账户", "付款", "交易", "顾客", "品牌",
        "营销", "生产", "供应", "需求", "竞争", "垄断", "通货膨胀", "汇率", "出口", "进口",
        "合同", "破产", "审计", "会计", "薪水", "奖金", "养老金",
    ],
    "工作职场": [
        "工作", "职业", "雇佣", "公司", "管理", "项目", "任务", "会议", "办公", "员工",
        "老板", "同事", "申请", "面试", "简历", "晋升", "辞职", "效率", "责任", "职业",
        "职场", "团队", "领导", "下属", "部门", "业务", "客户", "合同", "谈判", "计划",
        "组织", "协调", "执行", "汇报", "业绩", "考核", "招聘", "解雇", "加班", "休假",
        "岗位", "职责", "技能", "经验", "资历", "创业", "企业家",
    ],
    "教育学习": [
        "教育", "学校", "学习", "学生", "教师", "课程", "知识", "考试", "大学", "研究",
        "学术", "论文", "图书馆", "培训", "技能", "学位", "毕业", "招生", "教学", "阅读",
        "写作", "作业", "课堂", "教材", "专业", "学院", "奖学金", "入学", "考试", "成绩",
        "测验", "毕业", "导师", "教授", "学者", "实验室", "研究", "理论", "实践", "背诵",
    ],
    "科技信息": [
        "技术", "科学", "计算机", "数据", "系统", "网络", "机器", "软件", "程序", "电子",
        "信息", "数字", "互联网", "人工智能", "设备", "工程", "实验", "发明", "创新",
        "科技", "算法", "编码", "芯片", "机器人", "自动化", "卫星", "雷达", "数据库",
        "网站", "应用", "屏幕", "传感器", "能源", "核能", "电力", "通信", "信号", "频率",
    ],
    "自然环境": [
        "自然", "环境", "气候", "天气", "植物", "动物", "生态", "地球", "海洋", "河流",
        "山脉", "森林", "土地", "空气", "污染", "资源", "物种", "农业", "温度", "雨水",
        "干旱", "洪水", "风暴", "地震", "火山", "沙漠", "湿地", "臭氧", "碳", "排放",
        "全球变暖", "野生动物", "栖息地", "矿物", "石油", "煤炭", "太阳能", "风能",
    ],
    "医学健康": [
        "疾病", "健康", "医疗", "治疗", "药物", "身体", "医院", "医生", "病人", "症状",
        "感染", "手术", "心理", "营养", "锻炼", "睡眠", "死亡", "伤害", "康复", "病毒",
        "免疫", "疫苗", "诊断", "疾病", "癌症", "心脏病", "糖尿病", "抑郁", "焦虑症",
        "血液", "细胞", "基因", "器官", "大脑", "神经", "疼痛", "伤口", "药片", "剂量",
        "保健", "卫生", "流行病", "传染病",
    ],
    "空间方位": [
        "位置", "地方", "方向", "距离", "范围", "边界", "内部", "外部", "中心", "周围",
        "表面", "空间", "放置", "地点", "地区", "区域", "旁边", "前面", "后面", "上方",
        "下方", "左边", "右边", "远处", "近处", "角落", "边缘", "底部", "顶部", "之间",
        "对面", "背景", "位置", "坐落", "位于", "排列", "布局",
    ],
    "运动移动": [
        "移动", "行走", "跑", "运输", "旅行", "到达", "离开", "进入", "上升", "下降",
        "转向", "飞行", "游泳", "驾驶", "传播", "扩散", "迁移", "速度", "快速", "缓慢",
        "出发", "返回", "前进", "后退", "穿过", "经过", "追逐", "逃跑", "搬运", "携带",
        "迁移", "移民", "流动", "旋转", "摆动", "跳跃", "攀登", "漂浮", "下沉",
    ],
    "数量程度": [
        "数量", "大量", "少量", "足够", "缺乏", "多余", "全部", "部分", "比例", "增加",
        "减少", "许多", "少数", "每个", "一半", "双倍", "程度", "非常", "极其", "稍微",
        "几乎", "大约", "完全", "充足", "不足", "众多", "若干", "多数", "少数", "总计",
        "平均", "百分比", "数量", "规模", "范围", "极限", "过度", "适度", "至少", "至多",
    ],
    "时间顺序": [
        "时间", "时代", "暂时", "永久", "过去", "未来", "现在", "迅速", "缓慢", "频繁",
        "开始", "结束", "继续", "延迟", "提前", "同时", "之后", "之前", "每天", "每年",
        "世纪", "阶段", "时期", "瞬间", "持久", "短暂", "古老", "现代", "当代", "最初",
        "最终", "随后", "立刻", "逐渐", "终于", "曾经", "将来", "周期", "季节", "年代",
    ],
    "因果逻辑": [
        "原因", "结果", "影响", "导致", "产生", "引起", "因为", "所以", "因此", "条件",
        "目的", "作用", "效果", "后果", "依赖", "关联", "关系", "比较", "对比", "相反",
        "相似", "区别", "证明", "说明", "意味着", "推断", "结论", "前提", "假设", "必然",
        "可能", "趋势", "关联", "相应", "从而", "促使", "归因",
    ],
    "性质状态": [
        "性质", "状态", "特征", "质量", "形式", "结构", "类型", "情况", "程度", "复杂",
        "简单", "明显", "模糊", "稳定", "危险", "安全", "重要", "必要", "真实", "虚假",
        "奇怪", "正常", "特殊", "普遍", "具体", "抽象", "清晰", "混乱", "灵活", "僵硬",
        "强烈", "微弱", "严重", "轻微", "有效", "无效", "可靠", "脆弱", "坚固", "柔软",
        "潮湿", "干燥", "明亮", "黑暗", "拥挤", "空旷", "锋利", "粗糙", "光滑", "透明",
    ],
    "艺术审美": [
        "艺术", "音乐", "绘画", "文学", "电影", "戏剧", "舞蹈", "诗歌", "小说", "故事",
        "创作", "表演", "风格", "美学", "摄影", "雕塑", "设计", "审美", "旋律", "节奏",
        "色彩", "画面", "演员", "导演", "作家", "诗人", "画家", "作品", "展览", "博物馆",
        "剧院", "乐器", "歌唱", "演奏", "欣赏", "想象", "浪漫", "优雅", "美丽", "丑",
    ],
    "军事冲突": [
        "战争", "军队", "武器", "攻击", "防御", "士兵", "战斗", "敌人", "胜利", "失败",
        "战略", "炸弹", "枪", "海军", "空军", "侵略", "和平", "暴力", "恐怖", "军事",
        "部队", "坦克", "导弹", "炮", "刺杀", "突袭", "撤退", "包围", "俘虏", "伤亡",
        "冲突", "对抗", "威胁", "镇压", "革命", "起义", "联盟", "条约",
    ],
    "动作行为": [
        "做", "进行", "给予", "取得", "拿", "放置", "打开", "关闭", "使用", "处理",
        "建立", "破坏", "帮助", "阻止", "允许", "拒绝", "接受", "提供", "获得", "失去",
        "保持", "抓住", "释放", "推动", "拉", "扔", "打击", "切割", "连接", "分离",
        "收集", "分配", "交换", "借", "归还", "隐藏", "展示", "寻找", "发现", "创造",
        "准备", "完成", "尝试", "避免", "忽视", "关注", "照顾", "保护", "拯救", "伤害",
    ],
    "变化发展": [
        "改变", "修改", "调整", "增加", "减少", "发展", "改善", "恶化", "扩大", "缩小",
        "稳定", "转变", "进化", "改革", "增长", "下降", "提高", "降低", "恢复", "破坏",
        "形成", "消失", "出现", "演变", "转化", "升级", "衰退", "复兴", "更新", "革命",
        "改进", "强化", "削弱", "积累", "扩展", "收缩", "适应", "调整", "转变", "成长",
    ],
    "生活起居": [
        "食物", "吃", "喝", "烹饪", "味道", "餐厅", "衣服", "穿着", "住房", "家具",
        "日常", "生活", "休息", "购物", "厨房", "卧室", "客厅", "洗澡", "睡觉", "起床",
        "打扫", "洗衣", "做饭", "菜单", "早餐", "午餐", "晚餐", "零食", "饮料", "咖啡",
        "茶", "酒", "烟", "礼物", "假期", "娱乐", "放松", "习惯", "消费", "节约",
    ],
    "人物身份": [
        "男人", "女人", "孩子", "父母", "朋友", "敌人", "医生", "教师", "学生", "工人",
        "农民", "领导", "国王", "陌生人", "邻居", "顾客", "乘客", "观众", "读者", "作家",
        "艺术家", "科学家", "律师", "警察", "护士", "工程师", "经理", "老板", "员工",
        "青少年", "成年人", "老人", "婴儿", "丈夫", "妻子", "亲戚", "同事", "伙伴",
        "候选人", "发言人", "代表", "专家", "学者", "记者", "演员", "运动员",
    ],
    "交通出行": [
        "交通", "道路", "汽车", "火车", "飞机", "船", "车站", "机场", "旅行", "驾驶",
        "乘客", "运输", "事故", "速度", "路线", "地图", "地铁", "公交", "自行车", "出租车",
        "交通堵塞", "红绿灯", "高速公路", "铁路", "港口", "航班", "车票", "行李", "司机",
        "飞行员", "导航", "目的地", "出发", "到达", "往返", "通勤",
    ],
    "农业食物": [
        "农业", "作物", "土壤", "肥料", "收获", "种植", "农场", "粮食", "蔬菜", "水果",
        "烹饪", "饮食", "农民", "田地", "播种", "灌溉", "收割", "畜牧业", "渔业", "食品",
        "营养", "餐厅", "菜单", "味道", "饥饿", "口渴", "素食", "肉类", "面包", "米饭",
    ],
    "动植物": [
        "动物", "植物", "花", "树", "鸟", "鱼", "狗", "猫", "昆虫", "细菌",
        "森林", "野生动物", "栖息地", "物种", "进化", "繁殖", "叶子", "根", "种子",
        "果实", "草地", "草原", "热带", "哺乳动物", "爬行动物", "鸟类", "鱼类", "宠物",
        "牲畜", "蜜蜂", "蝴蝶", "微生物",
    ],
}

POS_FALLBACK_DOMAIN = {
    "n": "其他",
    "v": "动作行为",
    "adj": "性质状态",
    "adv": "数量程度",
    "other": "其他",
}

STOP_MEANING_CHARS = set(
    "的地得了着过是在有和与及或为把被让使很更最太非常一个种些们这那其之而也都就还又"
    "可会能要应需从对向于以因由等"
)

CJK = re.compile(r"[\u4e00-\u9fff]")
WORD_RE = re.compile(r"^[a-z][a-z'-]{2,24}$")
SENTENCE_BAD = re.compile(
    r"(https?://|<b>|</b>|\{|\}|\[[0-9]+\]|^\s*[-*]|^\s*\d+[.)]\s|"
    r"^(n|v|vt|vi|adj|adv)\.\s|\bclick\b|\bsoftware\b|\bcode\b|\bfunction\b|"
    r"\bparameter\b|\bserver\b|\bAPI\b)",
    re.I,
)


def norm_space(text: str) -> str:
    text = str(text or "").replace("\u00a0", " ").replace("\u3000", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def clean_zh(text: str) -> str:
    text = norm_space(text)
    text = text.replace(",", "，").replace(";", "；")
    text = re.sub(r"\.{2,}", "…", text)
    text = re.sub(r"^[（(【\[]?(?:n|v|vt|vi|adj|adv|prep|conj|pron|num)\.\s*", "", text, flags=re.I)
    text = re.sub(r"[（(]\s*(?:复数|过去式|过去分词|现在分词|比较级|最高级)[^）)]*[）)]", "", text)
    text = re.sub(r"\[[^\]]*\]", "", text)
    text = re.sub(r"\s*[；;]\s*", "；", text)
    text = re.sub(r"\s*([，,])\s*", r"\1", text)
    text = re.sub(r"；{2,}", "；", text)
    text = re.sub(r"([，,])\1+", r"\1", text)
    text = text.strip(" ；;，,。.、:：")
    # Remove a trailing grammatical label such as “n.” that leaked in.
    text = re.sub(r"\s+(?:n|v|vt|vi|adj|adv)\.$", "", text, flags=re.I)
    return text.strip()


def split_senses(translations):
    senses = []
    seen = set()
    for item in translations or []:
        if not isinstance(item, dict):
            continue
        raw_pos = str(item.get("type") or "").strip().lower().replace(" ", "")
        zh = clean_zh(item.get("translation") or "")
        if not zh:
            continue
        parts = [part.strip() for part in re.split(r"[；;，,]", zh) if part.strip()]
        if not parts:
            continue
        pos_codes = []
        for part in re.split(r"[&/]", raw_pos):
            code = part.strip()
            if code in POS_LABELS:
                pos_codes.append(code)
        if not pos_codes:
            pos_codes = ["n"] if re.search(r"的$", zh) is False and zh.endswith("人") else ["n"]
        label = " / ".join(POS_LABELS[code] for code in pos_codes)
        key = (label, zh)
        if key in seen:
            continue
        seen.add(key)
        senses.append({
            "pos": label,
            "posCodes": pos_codes,
            "zh": zh,
            "parts": parts,
        })
    return senses


def pos_key_for(senses):
    for sense in senses:
        for code in sense["posCodes"]:
            if code in POS_GROUPS:
                return POS_GROUPS[code]
    return "other"


def pos_label_for(senses):
    labels = []
    for sense in senses:
        for label in sense["pos"].split(" / "):
            if label not in labels:
                labels.append(label)
    return " / ".join(labels) if labels else "—"


def meaning_for(senses):
    parts = []
    for sense in senses:
        for part in sense["parts"]:
            if part not in parts:
                parts.append(part)
    return "；".join(parts[:5])


def brief_for(senses, pos_key):
    if not senses:
        return ""
    candidates = []
    for sense in senses:
        for part in sense["parts"]:
            part = part.strip()
            if part:
                candidates.append(part)
    if not candidates:
        return senses[0]["zh"][:29]
    # A one-character adjective gloss ("磁") reads better with 的; other
    # single-character glosses ("局", "铝") can stand alone, but a vague
    # one-character first gloss ("先" in priority) should yield to a fuller
    # later sense.
    if pos_key == "adj" and len(candidates[0]) == 1:
        text = candidates[0] + "的"
    else:
        text = next((part for part in candidates if len(part) >= 2), candidates[0])
        # "质的" is a grammatical classifier rather than a useful standalone
        # gloss; for qualitative, prefer the fuller "定性的".
        if text == "质的":
            longer = next((part for part in candidates if len(part) >= 3), None)
            if longer:
                text = longer
    if len(text) > 30:
        text = text[:29] + "…"
    return text


def phonetic_for(row):
    uk = norm_space(row.get("uk"))
    us = norm_space(row.get("us"))
    raw = uk or us
    if not raw:
        return ""
    raw = raw.strip("/[] ")
    return "/" + raw + "/" if raw else ""


def sentence_ok(text: str) -> bool:
    text = norm_space(text)
    if len(text) < 18 or len(text) > 190:
        return False
    if SENTENCE_BAD.search(text):
        return False
    if not re.search(r"[A-Za-z]{3,}", text):
        return False
    words = re.findall(r"[A-Za-z][A-Za-z'-]*", text)
    if len(words) < 4:
        return False
    if text.count("...") or text.startswith("…"):
        return False
    return True


def sentence_score(text: str, word: str) -> float:
    text = norm_space(text)
    score = 0.0
    if text.endswith((".", "?", "!")):
        score += 5
    if text[0].isupper() or text[0] in "\"'‘“":
        score += 2
    length = len(text)
    if 35 <= length <= 120:
        score += 6
    elif 25 <= length <= 150:
        score += 3
    if re.search(r"\b" + re.escape(word) + r"\b", text, re.I):
        score += 3
    elif word[:5].lower() in text.lower():
        score += 1
    if re.search(r"\b(the|a|an|this|that|these|those|we|they|he|she|it|people|students|research)\b", text, re.I):
        score += 1
    if text.count(",") > 3 or text.count(";") > 1:
        score -= 2
    return score


def choose_sentence(row, word):
    candidates = []
    for sentence in row.get("sentences") or []:
        en = norm_space(sentence.get("sentence"))
        zh = norm_space(sentence.get("translation"))
        if not en:
            continue
        en = en.strip(" .")
        if not sentence_ok(en):
            continue
        candidates.append((sentence_score(en, word), en, zh))
    if not candidates:
        # Last chance: accept a fragment only when it reads like a full clause.
        for sentence in row.get("sentences") or []:
            en = norm_space(sentence.get("sentence"))
            zh = norm_space(sentence.get("translation"))
            words = re.findall(r"[A-Za-z][A-Za-z'-]*", en)
            if (en and len(en) <= 220 and len(words) >= 6 and
                    en.rstrip()[-1:] in ".!?" and not SENTENCE_BAD.search(en)):
                candidates.append((0, en.strip(" ."), zh))
    if not candidates:
        return "", ""
    candidates.sort(key=lambda item: (-item[0], len(item[1])))
    _, en, zh = candidates[0]
    en = re.sub(r"^[.…\s]+", "", en).strip()
    if en and en[0].islower():
        en = en[0].upper() + en[1:]
    if en and en[-1] not in ".!?":
        en += "."
    zh = zh.strip()
    if zh and zh[-1] not in "。！？":
        zh += "。"
    return en, zh


# The upstream dictionary has no usable sentence or definition for these few
# words. These short, checked examples keep the entire bank visually consistent.
CURATED_EXAMPLES = {
    "advancement": ("Recent technological advancement has changed the way we work.", "近年来的技术进步改变了我们的工作方式。"),
    "affectionate": ("She gave her younger brother an affectionate hug.", "她深情地拥抱了弟弟。"),
    "alternatively": ("You can take the train; alternatively, you can drive there.", "你可以乘火车，或者也可以开车去那里。"),
    "attentive": ("The students were attentive throughout the lecture.", "学生们整堂课都听得很专心。"),
    "aural": ("The course includes both aural and written exercises.", "这门课程包括听力和书面练习。"),
    "automatically": ("The doors open automatically when someone approaches.", "有人走近时，门会自动打开。"),
    "beginner": ("This book is designed for beginners in English.", "这本书是为英语初学者设计的。"),
    "biotechnology": ("Biotechnology has led to new treatments for rare diseases.", "生物技术带来了罕见病的新疗法。"),
    "chronically": ("The hospital is chronically short of nurses.", "这家医院长期人手不足。"),
    "clever": ("She found a clever solution to the problem.", "她想出了一个解决这个问题的巧妙办法。"),
    "congratulation": ("Please accept my congratulations on your graduation.", "请接受我对你毕业的祝贺。"),
    "cunning": ("The fox is often portrayed as a cunning animal.", "狐狸常被描绘成狡猾的动物。"),
    "decode": ("Researchers are trying to decode the message hidden in the signal.", "研究人员正试图解读信号中隐藏的信息。"),
    "delusion": ("He was under the delusion that everyone agreed with him.", "他误以为所有人都同意他。"),
    "destine": ("The project was destined to fail from the start.", "这个项目从一开始就注定要失败。"),
    "dramatically": ("The cost of solar energy has fallen dramatically.", "太阳能的成本已大幅下降。"),
    "drastically": ("The company drastically reduced its workforce.", "公司大幅裁员。"),
    "esthetic": ("The building's esthetic appeal attracts many visitors.", "这座建筑的美学魅力吸引了许多游客。"),
    "firmness": ("She answered with quiet firmness.", "她平静而坚定地回答。"),
    "ideologically": ("The two parties are ideologically opposed.", "两党在意识形态上相互对立。"),
    "immersive": ("The museum offers an immersive virtual reality experience.", "这家博物馆提供沉浸式虚拟现实体验。"),
    "landmark": ("The court's decision was a landmark ruling for civil rights.", "法院的裁决是民权领域具有里程碑意义的判决。"),
    "lavatory": ("The lavatory is at the end of the corridor.", "盥洗室在走廊尽头。"),
    "maneuver": ("The driver maneuvered the car into a narrow parking space.", "司机把车巧妙地开进了一个狭窄的停车位。"),
    "marxist": ("The professor is a leading Marxist scholar.", "这位教授是一位著名的马克思主义学者。"),
    "measurable": ("The program produced measurable improvements in reading skills.", "该项目在阅读能力方面带来了可衡量的提高。"),
    "pepper": ("She added salt and pepper to the soup.", "她往汤里加了盐和胡椒。"),
    "proximately": ("The two villages lie proximately to each other.", "这两个村庄彼此邻近。"),
    "softness": ("The softness of the fabric makes it comfortable to wear.", "这种织物很柔软，穿起来很舒服。"),
    "sorrowful": ("She sang a sorrowful song about lost love.", "她唱了一首关于失去爱情的悲伤歌曲。"),
    "spade": ("He used a spade to dig a hole in the garden.", "他用铁锹在花园里挖了个洞。"),
    "successively": ("The team won three matches successively.", "该队接连赢了三场比赛。"),
    "typist": ("The typist finished the report before noon.", "打字员在中午前完成了报告。"),
    "underrepresented": ("Women remain underrepresented in senior management.", "女性在高层管理中仍然代表性不足。"),
    "unwilling": ("He was unwilling to admit that he had made a mistake.", "他不愿意承认自己犯了错。"),
    "whilst": ("She read a book whilst waiting for the train.", "她一边等火车一边看书。"),
    "aunt": ("My aunt lives in the countryside and grows her own vegetables.", "我姑姑住在乡下，自己种菜。"),
    "brook": ("A small brook runs through the meadow behind the house.", "一条小溪流过屋后的草地。"),
    "bulb": ("Replace the light bulb before it burns out.", "在灯泡烧坏之前把它换掉。"),
    "calculator": ("Students are not allowed to use a calculator during the exam.", "考试期间学生不得使用计算器。"),
    "chef": ("The chef prepared a five-course dinner for the guests.", "厨师为客人准备了一顿五道菜的晚餐。"),
    "civilization": ("Ancient civilizations developed along the great rivers.", "古代文明沿着大河流域发展起来。"),
    "counselor": ("The school counselor helped her choose her courses.", "学校辅导员帮她选了课。"),
    "dialect": ("The villagers still speak a local dialect at home.", "村民在家里仍然说当地方言。"),
    "dysfunction": ("The accident caused temporary dysfunction in his left arm.", "这场事故导致他左臂暂时功能障碍。"),
    "europe": ("She has traveled extensively throughout Europe.", "她游遍了欧洲各地。"),
    "geography": ("The geography of the region makes transportation difficult.", "该地区的地理条件使交通十分困难。"),
    "hurrah": ("The crowd shouted \"Hurrah!\" when the team scored.", "球队得分时，人群高呼“好哇！”"),
    "interruption": ("The meeting continued after a brief interruption.", "短暂中断后，会议继续进行。"),
    "lively": ("The market was lively with music and conversation.", "市场里音乐和交谈声交织，十分热闹。"),
    "mutton": ("The restaurant serves roast mutton with herbs.", "这家餐厅供应香草烤羊肉。"),
    "noon": ("The ceremony will begin at noon on Saturday.", "仪式将于周六中午开始。"),
    "physician": ("She consulted a physician about her persistent cough.", "她因持续咳嗽去看了医生。"),
    "physicist": ("The physicist won a prize for her work on quantum particles.", "这位物理学家因其量子粒子研究获奖。"),
    "plantation": ("Workers on the tea plantation start early in the morning.", "茶园工人们一大早就开始工作。"),
    "psychologist": ("The psychologist studied how children respond to stress.", "这位心理学家研究了儿童如何应对压力。"),
    "reimbursement": ("You can apply for reimbursement of your travel expenses.", "你可以申请报销差旅费。"),
    "reporter": ("A reporter interviewed the witnesses at the scene.", "一名记者在现场采访了目击者。"),
    "resistance": ("The new drug may cause resistance in some patients.", "这种新药可能使部分患者产生耐药性。"),
    "salesman": ("The salesman explained the features of the new car.", "推销员介绍了新车的功能。"),
    "sauce": ("She served the fish with a lemon butter sauce.", "她给鱼配上柠檬黄油酱。"),
    "sausage": ("He grilled sausages for the picnic.", "他为野餐烤了香肠。"),
    "technician": ("A technician repaired the laboratory equipment.", "一名技术员修理了实验室设备。"),
    "wagon": ("The farmer loaded the hay onto a wagon.", "农民把干草装上了大车。"),
    "address": ("The government must address the shortage of affordable housing.", "政府必须解决经济适用房短缺的问题。"),
    "chalk": ("The teacher wrote the formula on the board with a piece of chalk.", "老师用粉笔把公式写在黑板上。"),
    "favor": ("Most voters favor stricter environmental laws.", "大多数选民支持更严格的环境法律。"),
    "hack": ("Someone tried to hack into the company's computer system.", "有人试图入侵公司的计算机系统。"),
    "hell": ("The soldiers described the battlefield as a living hell.", "士兵们把战场描述成人间地狱。"),
    "ice": ("The lake ices over when the temperature falls below freezing.", "气温降到冰点以下时，湖面就会结冰。"),
    "shower": ("Dark clouds gathered and it began to shower.", "乌云聚集，开始下起阵雨。"),
    "boot": ("He pulled on his boots before going out into the snow.", "他穿上靴子，走进雪地。"),
    "castle": ("The medieval castle stands on a hill above the town.", "这座中世纪城堡坐落在城镇上方的山丘上。"),
    "corn": ("The farmer grows corn and soybeans on this land.", "农民在这块土地上种玉米和大豆。"),
    "fence": ("He learned to fence at a local club.", "他在当地俱乐部学会了击剑。"),
    "layout": ("The new layout makes the magazine easier to read.", "新的版面设计让杂志更易读。"),
    "pair": ("She bought a pair of gloves for the winter.", "她买了一副过冬手套。"),
    "player": ("The player scored the winning goal in the final minute.", "这名球员在最后一分钟打进制胜球。"),
    "post": ("There was a post on the notice board.", "公告栏上有一张告示。"),
    "worm": ("The bird caught a worm in the garden.", "鸟在花园里捉到一条虫子。"),
}

FALLBACK_SENTENCES = {
    "n": 'The word "{word}" is used as a noun in CET-6 reading passages.',
    "v": 'The word "{word}" is used as a verb in CET-6 reading passages.',
    "adj": 'The word "{word}" is used as an adjective in CET-6 reading passages.',
    "adv": 'The word "{word}" is used as an adverb in CET-6 reading passages.',
    "other": 'The word "{word}" appears in the CET-6 vocabulary list.',
}


def fallback_example(word, pos_key):
    return FALLBACK_SENTENCES.get(pos_key, FALLBACK_SENTENCES["other"]).format(word=word)


def clean_english_definition(text):
    text = norm_space(text)
    text = text.replace("sb", "someone").replace("sth", "something")
    text = text.rstrip(" .;,")
    text = re.sub(r"\s+", " ", text)
    if len(text) < 12 or len(text) > 190:
        return ""
    if SENTENCE_BAD.search(text):
        return ""
    return text


def meaning_chars(text):
    return {character for character in str(text or "")
            if "\u4e00" <= character <= "\u9fff" and character not in STOP_MEANING_CHARS}


def choose_phrase(row, word, pos_key, meaning):
    candidates = []
    word_chars = meaning_chars(meaning)
    for phrase in row.get("phrases") or []:
        text = norm_space(phrase.get("phrase"))
        zh = clean_zh(phrase.get("translation"))
        if not text or not zh:
            continue
        if "[" in text or "]" in text or "[" in zh:
            continue
        if not re.search(r"[A-Za-z]", text):
            continue
        count = len(re.findall(r"[A-Za-z][A-Za-z'-]*", text))
        if count < 2 or count > 7:
            continue
        if len(text) > 60 or re.search(r"[.;!?]$", text):
            continue
        if not re.search(r"\b" + re.escape(word) + r"\b", text, re.I):
            if word[:5].lower() not in text.lower():
                continue
        # Avoid collocations for another part of speech. Keep phrases where the
        # target leads the phrase, optionally after a determiner ("an adjustable
        # spanner"), and reject e.g. "public address system" for verb "address".
        lead = re.match(r"^(?:(?:a|an|the|this|that|these|those|my|your|his|her|its|our|their)\s+)?([A-Za-z][A-Za-z'-]*)", text, re.I)
        if not lead or lead.group(1).lower() != word:
            continue
        if re.search(r"\b(one's|sb|sth|etc)\b", text, re.I):
            continue
        phrase_chars = meaning_chars(zh)
        if word_chars and phrase_chars and not (word_chars & phrase_chars):
            # The phrase belongs to a different sense (e.g. "capital city" for
            # the adjective "capital"). A definition is safer than a mismatch.
            continue
        tail = re.findall(r"[A-Za-z][A-Za-z'-]*", text)
        if tail and tail[-1].lower() in {
            "as", "for", "of", "to", "in", "on", "with", "by", "from", "at",
            "into", "onto", "about", "over", "up", "out", "off", "than",
            "that", "which", "who", "and", "or", "but", "the", "a", "an",
        }:
            continue
        if pos_key == "v":
            # Verb collocations such as "address a problem" are useful, while
            # noun compounds such as "address book" are not for a verb entry.
            if not tail or tail[0].lower() == "to":
                continue
            if len(tail) < 2 or tail[1].lower() not in {
                "a", "an", "the", "this", "that", "these", "those",
                "my", "your", "his", "her", "its", "our", "their",
            }:
                continue
        # A phrase with a clear collocation is a useful example when the source
        # has no full sentence at all.
        score = 8 - abs(count - 3)
        if text[0].isupper():
            score -= 1
        candidates.append((score, text, zh))
    if not candidates:
        return "", ""
    candidates.sort(key=lambda item: (-item[0], len(item[1])))
    _, text, zh = candidates[0]
    return text, zh


def definition_example(word, definitions, pos_key):
    for raw in definitions or []:
        definition = clean_english_definition(raw)
        if not definition:
            continue
        lower = definition.lower()
        if lower.startswith(("if you ", "if someone ", "if something ", "when you ", "when someone ")):
            sentence = definition[0].upper() + definition[1:]
            if sentence[-1] not in ".!?":
                sentence += "."
            return sentence
        if lower.startswith("that ") and pos_key == "adj":
            return 'The adjective "{0}" describes something that {1}.'.format(word, definition[4:])
        if lower.startswith(("a ", "an ", "the ", "someone ", "something ")) and pos_key == "n":
            return 'The noun "{0}" refers to {1}.'.format(word, definition)
        if lower.startswith("to ") and pos_key == "v":
            return 'The verb "{0}" means {1}.'.format(word, definition)
        return 'The word "{0}" means {1}.'.format(word, definition)
    return ""


def domain_for(meaning, pos_key):
    if meaning:
        best_domain = None
        best_score = 0
        for domain, triggers in DOMAIN_TRIGGERS.items():
            score = 0
            for trigger in triggers:
                if trigger and trigger in meaning:
                    # Long, specific triggers are more informative.
                    score += len(trigger) * (1 + meaning.count(trigger) * 0.2)
            if score > best_score:
                best_score = score
                best_domain = domain
        if best_domain:
            return best_domain
    return POS_FALLBACK_DOMAIN.get(pos_key, "其他")


def rank_map():
    pairs = []
    for line in (SRC / "en_50k_alt.txt").read_text(encoding="utf-8").splitlines():
        bits = line.strip().split()
        if len(bits) >= 2:
            try:
                pairs.append((bits[0].lower(), int(bits[1])))
            except ValueError:
                pass
    pairs.sort(key=lambda item: -item[1])
    return {word: index + 1 for index, (word, _count) in enumerate(pairs)}


def frequency_for(rank):
    if not rank or rank >= 999999:
        return "低频", 2
    if rank <= 3000:
        return "高频", 5
    if rank <= 7000:
        return "中高频", 4
    if rank <= 15000:
        return "中频", 3
    return "低频", 2


def load_jsonl(path: Path):
    rows = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def merge_rows(rows):
    """The upstream book repeats some headwords across units. Merge them so the
    quiz never shows the same word twice and all senses/examples are kept."""
    merged = {}
    for row in rows:
        word = norm_space(row.get("word")).lower()
        if not word:
            continue
        target = merged.get(word)
        if target is None:
            target = {
                "word": word,
                "translations": [],
                "sentences": [],
                "phrases": [],
                "uk": row.get("uk") or "",
                "us": row.get("us") or "",
            }
            merged[word] = target
        target["translations"].extend(row.get("translations") or [])
        target["sentences"].extend(row.get("sentences") or [])
        target["phrases"].extend(row.get("phrases") or [])
        if not target["uk"]:
            target["uk"] = row.get("uk") or ""
        if not target["us"]:
            target["us"] = row.get("us") or ""
    return list(merged.values())


def entry_from_row(row, rank, level, definitions=None):
    word = norm_space(row.get("word")).lower()
    if not word:
        return None
    senses = split_senses(row.get("translations"))
    if not senses:
        return None
    meaning = meaning_for(senses)
    if not meaning:
        return None
    pos_key = pos_key_for(senses)
    example, example_zh = choose_sentence(row, word)
    example_type = "sentence"
    if not example and word in CURATED_EXAMPLES:
        example, example_zh = CURATED_EXAMPLES[word]
    if not example:
        example, example_zh = choose_phrase(row, word, pos_key, meaning)
        example_type = "phrase"
    if not example:
        example = definition_example(word, (definitions or {}).get(word), pos_key)
        example_zh = ""
        example_type = "definition"
    if not example:
        example = fallback_example(word, pos_key)
        example_zh = ""
        example_type = "template"
    freq, stars = frequency_for(rank)
    return {
        "word": word,
        "phonetic": phonetic_for(row),
        "pos": pos_label_for(senses),
        "posKey": pos_key,
        "meaning": meaning,
        "brief": brief_for(senses, pos_key),
        "example": example,
        "exampleZh": example_zh,
        "exampleType": example_type,
        "freq": freq,
        "stars": stars,
        "domain": domain_for(meaning, pos_key),
        "rank": rank if rank and rank < 999999 else 999999,
        "level": level,
    }


def load_definitions(path):
    definitions = {}
    if not path.exists():
        return definitions
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                word = (row.get("headWord") or "").lower()
                content = row["content"]["word"]["content"]
            except (json.JSONDecodeError, KeyError, TypeError):
                continue
            english = [item.get("tranOther") for item in content.get("trans", []) if item.get("tranOther")]
            if word and english:
                definitions[word] = english
    return definitions


def main():
    ranks = rank_map()
    definitions = load_definitions(SRC / "cet6_full.jsonl")
    cet6_rows = merge_rows(load_jsonl(SRC / "cet6_sentence.jsonl"))
    cet4_rows = merge_rows(load_jsonl(SRC / "cet4_sentence.jsonl"))
    if len(cet6_rows) < 3500:
        raise SystemExit("CET6 source missing or incomplete")

    entries = {}
    for row in cet6_rows:
        word = norm_space(row.get("word")).lower()
        if not word or word in entries:
            continue
        if not WORD_RE.match(word):
            continue
        entry = entry_from_row(row, ranks.get(word, 999999), "CET6", definitions)
        if entry:
            entries[word] = entry

    # Add an intermediate CET-4 foundation layer. The upstream "CET-6" book
    # repeats many headwords across units; after merging, it contributes 3,991
    # unique words. Real CET-4 words with a genuine example fill the rest of the
    # requested 6,000–8,000 range without fabricating definitions.
    extras = []
    seen = set(entries)
    for row in cet4_rows:
        word = norm_space(row.get("word")).lower()
        if not word or word in seen or word in entries:
            continue
        if not WORD_RE.match(word) or len(word) < 4:
            continue
        if not row.get("sentences"):
            continue
        seen.add(word)
        entry = entry_from_row(row, ranks.get(word, 999999), "CET4+")
        if entry:
            extras.append(entry)

    # All suitable CET-4 foundation words are used, giving 6,405 unique entries.
    extras.sort(key=lambda item: (item["rank"], item["word"]))
    for entry in extras:
        entries[entry["word"]] = entry

    words = sorted(entries.values(), key=lambda item: item["word"])

    meta = {
        "total": len(words),
        "cet6": sum(1 for word in words if word["level"] == "CET6"),
        "foundation": sum(1 for word in words if word["level"] == "CET4+"),
        "withExamples": sum(1 for word in words if word["example"]),
        "withTranslations": sum(1 for word in words if word["exampleZh"]),
        "exampleTypes": dict(Counter(word["exampleType"] for word in words)),
        "freq": dict(Counter(word["freq"] for word in words)),
        "domains": len(set(word["domain"] for word in words)),
        "source": "KyleBing/english-vocabulary + hermitdave/FrequencyWords",
        "generatedAt": "2026-10-31",
    }
    data_js = (
        "/* 词隙 · CET-6 六级词库（离线数据）\n"
        " * 词条：CET-6 核心词 + CET-4 基础补充词\n"
        " * 字段：word 单词 / phonetic 音标 / pos 词性 / meaning 释义 / brief 选项短释义\n"
        " *       example 例句 / exampleZh 译文 / freq 考频 / stars 星级 / domain 语义域\n"
        " * 考频按通用英语语料词频估算，作为复习优先级参考。\n"
        " */\n"
        "(function (global) {\n"
        "  const WORDS = " + json.dumps(words, ensure_ascii=False, separators=(",", ":")) + ";\n\n"
        "  global.CET6_WORDS = WORDS;\n"
        "  global.CET6_META = " + json.dumps(meta, ensure_ascii=False, separators=(",", ":")) + ";\n\n"
        '  if (typeof module !== "undefined" && module.exports) {\n'
        "    module.exports = { WORDS: WORDS, META: global.CET6_META };\n"
        "  }\n"
        '})(typeof window !== "undefined" ? window : globalThis);\n'
    )
    OUT_JS.write_text(data_js, encoding="utf-8")
    OUT_JSON.write_text(json.dumps({"meta": meta, "words": words}, ensure_ascii=False, indent=1), encoding="utf-8")

    print(json.dumps(meta, ensure_ascii=False, indent=2))
    print("Wrote", OUT_JS, OUT_JS.stat().st_size, "bytes")
    print("No example:", [word["word"] for word in words if not word["example"]][:10])
    print("Example types:", Counter(word["exampleType"] for word in words).most_common())
    print("Short brief sample:", [(word["word"], word["brief"]) for word in words[:8]])
    print("Domain distribution:", Counter(word["domain"] for word in words).most_common())
    print("POS distribution:", Counter(word["posKey"] for word in words).most_common())
    print("Freq distribution:", Counter(word["freq"] for word in words).most_common())


if __name__ == "__main__":
    main()
