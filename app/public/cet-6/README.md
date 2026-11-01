# 词隙 · CET-6 Word Lab

一个完全离线的六级单词随机测验网站。随机抽词 → 四选一 → 标记陌词 → 陌生单词库复习 → 导出 Word 生词本。

## 直接打开

双击 `打开词隙.bat`，或直接双击 `index.html`。

网站没有任何第三方运行时依赖，也不需要联网。所有单词、样式、脚本都在本地；学习进度保存在浏览器 `localStorage` 中。

如果使用 Edge / Chrome 打开后需要换一个浏览器，标记记录按浏览器分开保存，这是浏览器的本地存储机制，不是网站账号。

## 功能

- **6,405 个备考词条**：3,991 个六级核心词 + 2,414 个四级基础补充词。六级核心词由多份重复词条合并去重，保留全部词义和例句。
- **随机四选一**：每题优先从同词性、相近语义场的词中挑三个干扰项；选项先只显示中文释义，作答后显示每个选项对应的英文单词和词性。
- **词条信息**：音标、词性、中文释义、例句 / 短语 / 英文释义、考频星级。
- **默认只抽六级核心**：卡片左上角「六级核心」按钮可循环切换 `六级核心 → 全部词库 → 陌生词复习`。
- **自动收集陌词**：答错或点「不认识？直接看答案」会自动标记；也可以随时点「加入陌生词库」手动收藏。
- **陌生单词库**：搜索、按考频筛选、按标记时间 / 字母 / 考频排序、单条移除、清空；可一键进入复习模式。
- **导出 Word**：纯前端生成真正的 `.docx`（OOXML + ZIP Store，无第三方库），包含单词、音标、词性、释义、考频、例句（有译文时附译文）和标记日期。

## 词库说明

| 项目 | 数量 |
| --- | ---: |
| 总词条 | 6,405 |
| 六级核心词 | 3,991 |
| 四级基础补充词 | 2,414 |
| 完整例句 | 5,951 |
| 短语示例 | 291 |
| 英文释义示例 | 163 |

词条例句优先使用完整英文例句；没有完整例句时，依次回退到词组搭配、英文释义。所有词条都至少有一条可读的英文示例，没有用空字段凑数。

**考频不是官方真题频率。** 词频星级按通用英语语料词频排名估算，分为高频 / 中高频 / 中频 / 低频四档，仅用于复习排序和筛词参考。页脚和 Word 文档中也有同样说明。

### 数据来源

- 单词、音标、词性、释义、例句：[KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary)（CET6 / CET4 数据）
- 词频排名：[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)（`en_50k`）
- 词表范围参考：[全国大学英语四、六级考试大纲（2016 年修订版）词表](https://github.com/JavaProgrammerLB/cet-word-list)
- 少量无例句词的例句由本项目补齐，见 `tools/build_data.py` 中的 `CURATED_EXAMPLES`。

生成数据和筛选逻辑都在 `tools/build_data.py`。原始数据下载目录是工作区的 `tmp/cet6src`，不随网站一起分发。

## 文件结构

```
cet6-word-lab/
├─ index.html               页面结构
├─ css/style.css            视觉与响应式样式
├─ js/data.js               内置 6,405 词数据（约 2.2 MB）
├─ js/app.js                抽题、选项、标记、书库、复习逻辑
├─ js/word-export.js        纯前端 .docx 生成
├─ tools/build_data.py      词库构建与数据清洗
├─ tools/test_site.js       jsdom 交互测试
├─ tools/cdp_visual_test.js Edge DevTools 响应式截图测试
├─ tools/test_export.js     混合示例类型的 DOCX 生成测试
└─ 打开词隙.bat              直接打开 index.html
```

## 开发与测试

测试脚本需要 Node.js 和 `jsdom`：

```powershell
pnpm add jsdom tough-cookie
node tools/test_site.js
node tools/test_export.js
```

`tools/test_site.js` 通过本地静态服务器 `http://127.0.0.1:8765/` 加载页面：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

`tools/cdp_visual_test.js` 需要以 `--remote-debugging-port=9223` 启动无头 Edge，并同时运行上面的静态服务器。

## 兼容性

- 现代 Edge / Chrome / Firefox / Safari。
- 推荐桌面端使用；手机端会自动把答题卡放到首屏，标签、书库、导出均适配窄屏。
- 朗读按钮依赖浏览器自带的 `SpeechSynthesis`。不支持时会给出提示，不影响答题。
