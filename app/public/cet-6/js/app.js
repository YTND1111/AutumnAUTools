(function () {
  "use strict";

  const WORDS = window.CET6_WORDS || [];
  const META = window.CET6_META || {};
  const STORAGE_KEY = "cixi-cet6-state-v1";
  const LETTERS = ["A", "B", "C", "D"];
  const WORD_MAP = new Map(WORDS.map(function (word) { return [word.word, word]; }));
  const CORE_WORDS = WORDS.filter(function (word) { return word.level === "CET6"; });
  const POS_POOLS = new Map();
  const DOMAIN_POOLS = new Map();

  WORDS.forEach(function (word) {
    const posKey = word.posKey || "other";
    const domainKey = posKey + "|" + (word.domain || "其他");
    if (!POS_POOLS.has(posKey)) POS_POOLS.set(posKey, []);
    POS_POOLS.get(posKey).push(word);
    if (!DOMAIN_POOLS.has(domainKey)) DOMAIN_POOLS.set(domainKey, []);
    DOMAIN_POOLS.get(domainKey).push(word);
  });

  const $ = function (id) { return document.getElementById(id); };

  const refs = {
    viewQuiz: $("view-quiz"),
    viewLibrary: $("view-library"),
    heroWordCount: $("heroWordCount"),
    navLinks: Array.prototype.slice.call(document.querySelectorAll("[data-view-link]")),
    navCount: $("navCount"),
    quizCard: $("quizCard"),
    quizMode: $("quizMode"),
    questionNo: $("questionNo"),
    questionFreq: $("questionFreq"),
    wordText: $("wordText"),
    phonetic: $("phonetic"),
    posText: $("posText"),
    speakBtn: $("speakBtn"),
    markBtn: $("markBtn"),
    markBtnText: $("markBtnText"),
    exampleLabel: $("exampleLabel"),
    exampleEn: $("exampleEn"),
    exampleZh: $("exampleZh"),
    options: $("options"),
    answerPanel: $("answerPanel"),
    answerIcon: $("answerIcon"),
    answerTitle: $("answerTitle"),
    answerText: $("answerText"),
    answerMark: $("answerMark"),
    answerDetails: $("answerDetails"),
    skipBtn: $("skipBtn"),
    nextBtn: $("nextBtn"),
    captionIndex: $("captionIndex"),
    statAnswered: $("statAnswered"),
    statAccuracy: $("statAccuracy"),
    statStreak: $("statStreak"),
    libraryCount: $("libraryCount"),
    libraryToolbar: $("libraryToolbar"),
    libraryGrid: $("libraryGrid"),
    searchInput: $("searchInput"),
    filterFreq: $("filterFreq"),
    sortSelect: $("sortSelect"),
    clearBtn: $("clearBtn"),
    exportBtn: $("exportBtn"),
    reviewBtn: $("reviewBtn"),
    emptyState: $("emptyState"),
    emptyTitle: $("emptyTitle"),
    emptyText: $("emptyText"),
    emptyCta: $("emptyCta"),
    emptyMark: document.querySelector(".empty-mark"),
    modal: $("modal"),
    modalTitle: $("modalTitle"),
    modalText: $("modalText"),
    modalConfirm: $("modalConfirm"),
    modalCancel: $("modalCancel"),
    modalClose: $("modalClose"),
    toast: $("toast")
  };

  const state = {
    marked: [],
    stats: {
      answered: 0,
      correct: 0,
      streak: 0,
      best: 0
    }
  };

  let currentWord = null;
  let optionItems = [];
  let answered = false;
  let quizMode = "core";
  let questionCount = 0;
  let emptyAction = "quiz";
  let modalCallback = null;
  let lastFocusedElement = null;
  let toastTimer = null;
  let animationTimer = null;

  /* ================= storage ================= */

  function loadState() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      raw = null;
    }

    if (!raw) return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return;
    }

    if (!parsed || typeof parsed !== "object") return;

    const seen = new Set();
    if (Array.isArray(parsed.marked)) {
      parsed.marked.forEach(function (entry) {
        const wordKey = typeof entry === "string" ? entry : entry && entry.word;
        if (!wordKey || !WORD_MAP.has(wordKey) || seen.has(wordKey)) return;

        const markedAt = entry && Number.isFinite(entry.markedAt) ? entry.markedAt : Date.now();
        seen.add(wordKey);
        state.marked.push({ word: wordKey, markedAt: markedAt });
      });
    }

    if (parsed.stats && typeof parsed.stats === "object") {
      const cleanCount = function (value) {
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
      };
      state.stats.answered = cleanCount(parsed.stats.answered);
      state.stats.correct = Math.min(cleanCount(parsed.stats.correct), state.stats.answered);
      state.stats.streak = cleanCount(parsed.stats.streak);
      state.stats.best = Math.max(cleanCount(parsed.stats.best), state.stats.streak);
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Private browsing or file:// restrictions: the site still works for this session.
    }
  }

  /* ================= helpers ================= */

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      const temporary = copy[index];
      copy[index] = copy[randomIndex];
      copy[randomIndex] = temporary;
    }
    return copy;
  }

  function normalizeMeaning(value) {
    return String(value || "").replace(/[（）()]/g, "").replace(/\s+/g, "").toLowerCase();
  }

  function optionMeaning(word) {
    return word.brief || word.meaning || "";
  }

  function meaningsOverlap(first, second) {
    const left = normalizeMeaning(first);
    const right = normalizeMeaning(second);
    if (!left || !right) return true;
    if (left === right) return true;
    if (left.length >= 2 && right.length >= 2 && (left.indexOf(right) !== -1 || right.indexOf(left) !== -1)) {
      return true;
    }
    // Reject near-identical glosses such as 放弃 / 抛弃: they would make the
    // "correct" choice ambiguous for a learner.
    if (left.length === right.length && left.length >= 2) {
      let differences = 0;
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) differences += 1;
        if (differences > 1) break;
      }
      if (differences <= 1) return true;
    }
    return false;
  }

  function formatStars(stars) {
    const count = Math.max(0, Math.min(5, Number(stars) || 0));
    return "★".repeat(count) + "☆".repeat(5 - count);
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "刚刚";
    const now = new Date();
    const options = date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" };
    return date.toLocaleDateString("zh-CN", options);
  }

  function freqBadgeHtml(word, compact) {
    const bars = [1, 2, 3, 4, 5].map(function (number) {
      return '<i class="' + (number <= word.stars ? "is-on" : "") + '"></i>';
    }).join("");
    return '<span class="freq-label">' + escapeHtml(word.freq) + '</span>' +
      '<span class="freq-bars" aria-hidden="true">' + bars + "</span>";
  }

  function highlightText(text, query) {
    const source = String(text == null ? "" : text);
    if (!query) return escapeHtml(source);
    const index = source.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return escapeHtml(source);
    return escapeHtml(source.slice(0, index)) +
      "<mark>" + escapeHtml(source.slice(index, index + query.length)) + "</mark>" +
      escapeHtml(source.slice(index + query.length));
  }

  function exampleLabel(word) {
    if (word.exampleType === "phrase") return "PHRASE";
    if (word.exampleType === "definition") return "英文释义";
    if (word.exampleType === "template") return "用法提示";
    return "EXAMPLE";
  }

  function highlightWordInSentence(sentence, word) {
    const source = String(sentence || "");
    let match = null;
    try {
      match = source.match(new RegExp("\\b" + escapeRegExp(word) + "\\b", "i"));
    } catch (error) {
      match = null;
    }
    if (!match || typeof match.index !== "number") return escapeHtml(source);
    return escapeHtml(source.slice(0, match.index)) +
      "<strong>" + escapeHtml(source.slice(match.index, match.index + match[0].length)) + "</strong>" +
      escapeHtml(source.slice(match.index + match[0].length));
  }

  function detailItem(label, value, extraClass) {
    return '<div class="detail-item"><span>' + escapeHtml(label) + "</span>" +
      '<strong' + (extraClass ? ' class="' + extraClass + '"' : "") + ">" +
      escapeHtml(value) + "</strong></div>";
  }

  /* ================= marked words ================= */

  function getMarkedEntries() {
    return state.marked.map(function (entry) {
      const word = WORD_MAP.get(entry.word);
      if (!word) return null;
      return Object.assign({}, word, { markedAt: entry.markedAt });
    }).filter(Boolean);
  }

  function isMarked(wordKey) {
    return state.marked.some(function (entry) { return entry.word === wordKey; });
  }

  function addMark(word, silent) {
    if (!word || isMarked(word.word)) return false;
    state.marked.unshift({ word: word.word, markedAt: Date.now() });
    saveState();
    updateCounts();
    if (currentWord && currentWord.word === word.word) updateMarkButton(true);
    if (!silent) showToast("已加入陌生单词库");
    return true;
  }

  function removeMark(wordKey, silent) {
    const before = state.marked.length;
    state.marked = state.marked.filter(function (entry) { return entry.word !== wordKey; });
    if (state.marked.length === before) return false;

    saveState();
    updateCounts();
    updateMarkButton();
    updateModeLabel();
    renderLibrary();
    if (!silent) showToast("已移出陌生单词库");
    return true;
  }

  function updateMarkButton(pulse) {
    if (!currentWord) return;
    const marked = isMarked(currentWord.word);
    refs.markBtn.classList.toggle("is-marked", marked);
    refs.markBtn.setAttribute("aria-pressed", String(marked));
    refs.markBtnText.textContent = marked ? "已标记 · 移出" : "加入陌生词库";
    refs.markBtn.title = marked ? "点击移出陌生单词库" : "遇到不会的词，点这里标记";

    if (pulse) {
      refs.markBtn.classList.remove("just-marked");
      void refs.markBtn.offsetWidth;
      refs.markBtn.classList.add("just-marked");
      window.setTimeout(function () {
        refs.markBtn.classList.remove("just-marked");
      }, 480);
    }
  }

  /* ================= quiz ================= */

  function getDistractors(word) {
    const targetMeaning = optionMeaning(word);
    const domainPool = DOMAIN_POOLS.get((word.posKey || "other") + "|" + (word.domain || "其他")) || [];
    const posPool = POS_POOLS.get(word.posKey || "other") || [];
    const basePool = domainPool.length >= 18 ? domainPool : posPool;
    const chosen = [];
    const usedMeanings = new Set([normalizeMeaning(targetMeaning)]);

    function tryPool(pool) {
      const candidates = pool.filter(function (item) {
        if (!item || item.word === word.word) return false;
        if (chosen.some(function (picked) { return picked.word === item.word; })) return false;
        const candidateMeaning = optionMeaning(item);
        if (!candidateMeaning) return false;
        if (candidateMeaning.length <= 1) return false;
        if (candidateMeaning.length === 2 && candidateMeaning.endsWith("的")) return false;
        if (usedMeanings.has(normalizeMeaning(candidateMeaning))) return false;
        if (meaningsOverlap(candidateMeaning, targetMeaning)) return false;
        // Options of a similar difficulty feel fairer than a rare word mixed
        // into an otherwise common-vocabulary question.
        return Math.abs((Number(item.stars) || 0) - (Number(word.stars) || 0)) <= 2;
      });
      const sameBand = candidates.filter(function (item) {
        return item.stars === word.stars;
      });
      const ordered = shuffle(sameBand.length >= 3 ? sameBand : candidates);
      for (let index = 0; index < ordered.length && chosen.length < 3; index += 1) {
        const item = ordered[index];
        const candidateMeaning = optionMeaning(item);
        if (usedMeanings.has(normalizeMeaning(candidateMeaning))) continue;
        if (meaningsOverlap(candidateMeaning, targetMeaning)) continue;
        chosen.push(item);
        usedMeanings.add(normalizeMeaning(candidateMeaning));
      }
    }

    tryPool(basePool);
    if (chosen.length < 3) tryPool(posPool);
    if (chosen.length < 3) tryPool(WORDS);

    return chosen.slice(0, 3);
  }

  function pickRandom(pool) {
    if (!pool.length) return null;
    const candidates = pool.length > 1 && currentWord
      ? pool.filter(function (word) { return word.word !== currentWord.word; })
      : pool;
    const source = candidates.length ? candidates : pool;
    return source[Math.floor(Math.random() * source.length)];
  }

  function quizPool() {
    if (quizMode === "marked") return getMarkedEntries();
    if (quizMode === "all") return WORDS;
    return CORE_WORDS;
  }

  function modeLabel() {
    if (quizMode === "marked") return "陌生词复习";
    if (quizMode === "all") return "全部词库";
    return "六级核心";
  }

  function updateModeLabel() {
    const isReview = quizMode === "marked";
    refs.quizMode.textContent = modeLabel();
    refs.quizMode.classList.toggle("is-review", isReview);
    refs.quizMode.title = isReview
      ? "点击退出复习，回到六级核心词库"
      : (state.marked.length
        ? "点击切换：六级核心 → 全部词库 → 陌生词复习"
        : "点击切换：六级核心 → 全部词库");
  }

  function nextQuestion() {
    let pool = quizPool();

    if (!pool.length) {
      quizMode = "core";
      pool = CORE_WORDS;
      showToast("陌生词库还是空的，已切回六级核心");
    }

    const next = pickRandom(pool);
    if (!next) return;

    currentWord = next;
    answered = false;
    optionItems = [];
    questionCount += 1;

    updateModeLabel();
    renderQuestion();
  }

  function renderQuestion() {
    if (!currentWord) return;

    const correct = { data: currentWord, correct: true };
    const distractors = getDistractors(currentWord).map(function (word) {
      return { data: word, correct: false };
    });
    optionItems = shuffle([correct].concat(distractors));

    refs.wordText.textContent = currentWord.word;
    refs.phonetic.textContent = currentWord.phonetic;
    refs.posText.textContent = currentWord.pos;
    refs.questionNo.textContent = String(questionCount).padStart(2, "0");
    refs.questionFreq.innerHTML = freqBadgeHtml(currentWord, false);
    refs.questionFreq.setAttribute("aria-label", "考频：" + currentWord.freq + "，" + currentWord.stars + " 星");
    refs.questionFreq.title = "考频按通用英语语料词频估算，仅作复习优先级参考";

    refs.exampleLabel.textContent = exampleLabel(currentWord);
    refs.exampleEn.innerHTML = highlightWordInSentence(currentWord.example, currentWord.word);
    refs.exampleZh.textContent = currentWord.exampleZh || "";
    refs.exampleZh.hidden = true;

    refs.options.innerHTML = optionItems.map(function (item, index) {
      const meaning = optionMeaning(item.data);
      return '<button class="option" type="button" data-option="' + index + '" ' +
        'aria-label="' + LETTERS[index] + ". " + escapeHtml(meaning) + '">' +
        '<span class="option-key" aria-hidden="true">' + LETTERS[index] + "</span>" +
        '<span class="option-body">' +
        '<span class="option-meaning">' + escapeHtml(meaning) + "</span>" +
        '<span class="option-word">' + escapeHtml(item.data.word) + " · " + escapeHtml(item.data.pos) + "</span>" +
        "</span>" +
        '<span class="option-status" aria-hidden="true"></span>' +
        "</button>";
    }).join("");

    Array.prototype.forEach.call(refs.options.querySelectorAll(".option"), function (button) {
      button.addEventListener("click", function () {
        chooseOption(Number(button.getAttribute("data-option")));
      });
    });

    refs.answerPanel.hidden = true;
    refs.answerPanel.className = "answer-panel";
    refs.answerIcon.innerHTML = "";
    refs.answerTitle.textContent = "";
    refs.answerText.textContent = "";
    refs.answerMark.textContent = "";
    refs.answerDetails.innerHTML = "";
    refs.skipBtn.hidden = false;
    refs.nextBtn.hidden = true;

    const wordIndex = WORDS.findIndex(function (word) { return word.word === currentWord.word; });
    refs.captionIndex.textContent = String(wordIndex + 1).padStart(3, "0");

    updateMarkButton();
    animateCard();
  }

  function animateCard() {
    window.clearTimeout(animationTimer);
    refs.quizCard.classList.remove("is-entering");
    void refs.quizCard.offsetWidth;
    refs.quizCard.classList.add("is-entering");
    animationTimer = window.setTimeout(function () {
      refs.quizCard.classList.remove("is-entering");
    }, 760);
  }

  function chooseOption(index) {
    if (answered || !currentWord) return;
    if (index < 0 || index >= optionItems.length) return;
    evaluateAnswer(index, false);
  }

  function evaluateAnswer(selectedIndex, skipped) {
    if (answered || !currentWord) return;
    answered = true;

    const correctItem = optionItems.find(function (item) { return item.correct; });
    if (!correctItem) return;

    const selectedItem = selectedIndex >= 0 ? optionItems[selectedIndex] : null;
    const isCorrect = !skipped && selectedItem && selectedItem.correct;

    Array.prototype.forEach.call(refs.options.querySelectorAll(".option"), function (button, index) {
      const item = optionItems[index];
      button.disabled = true;
      button.classList.add("is-revealed");
      button.setAttribute("aria-label", LETTERS[index] + ". " + optionMeaning(item.data) +
        " → " + item.data.word + " " + item.data.pos);

      if (item.correct) {
        button.classList.add("is-correct");
        button.querySelector(".option-status").innerHTML =
          '<svg aria-hidden="true"><use href="#icon-check"></use></svg>';
      } else if (!skipped && index === selectedIndex) {
        button.classList.add("is-wrong");
        button.querySelector(".option-status").innerHTML =
          '<svg aria-hidden="true"><use href="#icon-close"></use></svg>';
      } else {
        button.classList.add("is-muted");
      }
    });

    refs.exampleZh.hidden = !currentWord.exampleZh;
    refs.skipBtn.hidden = true;
    refs.nextBtn.hidden = false;

    refs.answerPanel.hidden = false;
    refs.answerPanel.className = "answer-panel " + (isCorrect ? "is-correct" : "is-wrong");
    refs.answerIcon.innerHTML = isCorrect
      ? '<svg aria-hidden="true"><use href="#icon-check"></use></svg>'
      : '<svg aria-hidden="true"><use href="#icon-close"></use></svg>';

    let autoMarked = false;
    if (!isCorrect) {
      autoMarked = addMark(currentWord, true);
    }

    if (isCorrect) {
      refs.answerTitle.textContent = quizMode === "marked" ? "复习通过" : "答对了";
      refs.answerText.textContent = currentWord.word + " · " + currentWord.pos + " " + currentWord.meaning;
      refs.answerMark.textContent = "+1";
    } else if (skipped) {
      refs.answerTitle.textContent = "先把它记下来";
      refs.answerText.textContent = "正确答案是「" + optionMeaning(correctItem.data) + "」。这个词已加入陌生词库，稍后回来复习。";
      refs.answerMark.textContent = autoMarked ? "已自动标记" : "已在词库";
    } else {
      refs.answerTitle.textContent = "差一点，再记一次";
      refs.answerText.textContent = "正确答案是「" + optionMeaning(correctItem.data) + "」。你选的是「" +
        optionMeaning(selectedItem.data) + "」→ " + selectedItem.data.word + "（" + selectedItem.data.pos + "）。";
      refs.answerMark.textContent = autoMarked ? "已自动标记" : "已在词库";
    }

    refs.answerDetails.innerHTML =
      detailItem("单词", currentWord.word, "word-detail") +
      detailItem("词性", currentWord.pos) +
      detailItem("考频", currentWord.freq + " · " + formatStars(currentWord.stars));

    state.stats.answered += 1;
    if (isCorrect) {
      state.stats.correct += 1;
      state.stats.streak += 1;
      state.stats.best = Math.max(state.stats.best, state.stats.streak);
    } else {
      state.stats.streak = 0;
    }
    saveState();
    updateStats();
    updateMarkButton(autoMarked);

    if (autoMarked) {
      showToast("已自动加入陌生单词库");
    }
  }

  function updateStats() {
    refs.statAnswered.textContent = String(state.stats.answered);
    refs.statAccuracy.textContent = state.stats.answered
      ? Math.round((state.stats.correct / state.stats.answered) * 100) + "%"
      : "—";
    refs.statStreak.textContent = String(state.stats.streak);
  }

  function toggleMark() {
    if (!currentWord) return;
    if (isMarked(currentWord.word)) {
      removeMark(currentWord.word, false);
    } else {
      addMark(currentWord, false);
      updateMarkButton(true);
    }
  }

  function skipQuestion() {
    if (!currentWord || answered) return;
    evaluateAnswer(-1, true);
  }

  function speakWord() {
    if (!currentWord) return;
    if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
      showToast("当前浏览器不支持单词朗读", "error");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(currentWord.word);
    utterance.lang = "en-US";
    utterance.rate = 0.82;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find(function (voice) { return /^en-US/i.test(voice.lang); }) ||
      voices.find(function (voice) { return /^en/i.test(voice.lang); });
    if (englishVoice) utterance.voice = englishVoice;
    window.speechSynthesis.speak(utterance);
  }

  /* ================= library ================= */

  function updateCounts() {
    const count = state.marked.length;
    refs.navCount.textContent = String(count);
    refs.libraryCount.textContent = String(count);
    const hasWords = count > 0;

    refs.exportBtn.disabled = !hasWords;
    refs.reviewBtn.disabled = !hasWords;
    refs.clearBtn.disabled = !hasWords;

    refs.exportBtn.title = hasWords ? "导出 Word 生词本" : "标记单词后即可导出";
    refs.reviewBtn.title = hasWords ? "只复习陌生单词" : "标记单词后即可复习";
    refs.clearBtn.title = hasWords ? "清空陌生单词库" : "陌生单词库为空";
  }

  function showEmpty(title, text, cta, action) {
    refs.emptyState.hidden = false;
    refs.emptyTitle.textContent = title;
    refs.emptyText.textContent = text;
    refs.emptyCta.innerHTML = cta +
      (action === "quiz" ? ' <svg aria-hidden="true"><use href="#icon-arrow-right"></use></svg>' : "");
    emptyAction = action;
  }

  function renderLibrary() {
    const entries = getMarkedEntries();
    updateCounts();

    if (!entries.length) {
      refs.libraryToolbar.hidden = true;
      refs.libraryGrid.innerHTML = "";
      showEmpty(
        "还没有陌生单词",
        "答错，或点击「不认识？直接看答案」，单词就会被收进这里。",
        "去认识第一个词",
        "quiz"
      );
      return;
    }

    refs.libraryToolbar.hidden = false;

    const query = refs.searchInput.value.trim().toLowerCase();
    const frequency = refs.filterFreq.value;
    const sortMode = refs.sortSelect.value;

    let filtered = entries.filter(function (word) {
      if (frequency !== "all" && word.freq !== frequency) return false;
      if (!query) return true;
      return [word.word, word.meaning, word.example, word.exampleZh, word.phonetic]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    filtered.sort(function (first, second) {
      if (sortMode === "alphabetical") {
        return first.word.localeCompare(second.word, "en");
      }
      if (sortMode === "frequency") {
        return second.stars - first.stars || first.word.localeCompare(second.word, "en");
      }
      return second.markedAt - first.markedAt;
    });

    if (!filtered.length) {
      refs.libraryGrid.innerHTML = "";
      showEmpty(
        "没有找到匹配的单词",
        "换个关键词，或调整考频筛选条件试试。",
        "清除筛选",
        "reset"
      );
      return;
    }

    refs.emptyState.hidden = true;
    refs.libraryGrid.innerHTML = filtered.map(function (word, index) {
      const delay = Math.min(index * 35, 315);
      return '<article class="word-card" data-word="' + escapeHtml(word.word) + '" style="animation-delay:' + delay + 'ms">' +
        '<div class="word-card-top">' +
        '<div class="card-word-line">' +
        '<h3 class="card-word">' + highlightText(word.word, query) + "</h3>" +
        '<span class="card-phonetic">' + escapeHtml(word.phonetic) + "</span>" +
        '<span class="pos-tag">' + escapeHtml(word.pos) + "</span>" +
        "</div>" +
        '<button class="remove-button" type="button" data-remove="' + escapeHtml(word.word) + '" ' +
        'aria-label="从陌生单词库移除 ' + escapeHtml(word.word) + '" title="移出陌生单词库">' +
        '<svg aria-hidden="true"><use href="#icon-close"></use></svg>' +
        "</button>" +
        "</div>" +
        '<p class="card-meaning">' + highlightText(word.meaning, query) + "</p>" +
        '<div class="card-meta">' +
        '<span class="freq-badge compact" title="考频按通用英语语料词频估算，仅作参考" aria-label="考频：' + escapeHtml(word.freq) + '">' +
        freqBadgeHtml(word, true) + "</span>" +
        '<span class="marked-date">标记于 ' + escapeHtml(formatDate(word.markedAt)) + "</span>" +
        "</div>" +
        (word.example ? '<p class="card-example">' + highlightText(word.example, query) + "</p>" : "") +
        (word.exampleZh ? '<p class="card-example-zh">' + highlightText(word.exampleZh, query) + "</p>" : "") +
        "</article>";
    }).join("");
  }

  function clearFilters() {
    refs.searchInput.value = "";
    refs.filterFreq.value = "all";
    refs.sortSelect.value = "recent";
    renderLibrary();
  }

  function exportWordDocument() {
    const entries = getMarkedEntries().sort(function (first, second) {
      return second.markedAt - first.markedAt;
    });

    if (!entries.length) {
      showToast("陌生单词库还是空的，先标记几个词吧", "error");
      return;
    }

    if (!window.CET6WordExport || typeof window.CET6WordExport.downloadDocx !== "function") {
      showToast("导出组件未加载，请刷新页面后重试", "error");
      return;
    }

    const button = refs.exportBtn;
    const originalMarkup = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> 正在生成…';

    window.setTimeout(function () {
      try {
        window.CET6WordExport.downloadDocx(entries);
        showToast("Word 文档已生成，共 " + entries.length + " 个单词");
      } catch (error) {
        console.error(error);
        showToast("导出失败，请重试", "error");
      } finally {
        button.disabled = false;
        button.innerHTML = originalMarkup;
      }
    }, 80);
  }

  /* ================= view + modal + toast ================= */

  function switchView(name, options) {
    const settings = options || {};
    const isLibrary = name === "library";

    refs.viewQuiz.hidden = isLibrary;
    refs.viewQuiz.classList.toggle("is-active", !isLibrary);
    refs.viewLibrary.hidden = !isLibrary;
    refs.viewLibrary.classList.toggle("is-active", isLibrary);

    refs.navLinks.forEach(function (link) {
      const isActive = link.getAttribute("data-view-link") === name;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    if (isLibrary) renderLibrary();

    if (settings.push !== false) {
      const targetHash = "#" + name;
      if (window.location.hash !== targetHash) {
        window.history.pushState(null, "", targetHash);
      }
    }

    if (settings.scroll !== false) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function openModal(options) {
    lastFocusedElement = document.activeElement;
    modalCallback = options.onConfirm || null;
    refs.modalTitle.textContent = options.title;
    refs.modalText.textContent = options.text;
    refs.modalConfirm.textContent = options.confirmText || "确认";
    refs.modal.hidden = false;
    document.body.classList.add("modal-open");
    window.setTimeout(function () { refs.modalCancel.focus(); }, 30);
  }

  function closeModal() {
    refs.modal.hidden = true;
    document.body.classList.remove("modal-open");
    modalCallback = null;
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    }
  }

  function showToast(message, type) {
    window.clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.toggle("is-error", type === "error");
    refs.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(function () {
      refs.toast.classList.remove("is-visible");
    }, 2800);
  }

  /* ================= events ================= */

  function bindEvents() {
    refs.navLinks.forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        switchView(link.getAttribute("data-view-link"));
      });
    });

    refs.speakBtn.addEventListener("click", speakWord);
    refs.markBtn.addEventListener("click", toggleMark);
    refs.skipBtn.addEventListener("click", skipQuestion);
    refs.nextBtn.addEventListener("click", nextQuestion);

    refs.quizMode.addEventListener("click", function () {
      if (quizMode === "core") {
        quizMode = "all";
        updateModeLabel();
        nextQuestion();
        showToast("已切换到全部 " + WORDS.length.toLocaleString("zh-CN") + " 词");
        return;
      }
      if (quizMode === "all") {
        if (!state.marked.length) {
          quizMode = "core";
          updateModeLabel();
          nextQuestion();
          showToast("已回到六级核心词，答错或标记后会开启复习模式");
          return;
        }
        quizMode = "marked";
        updateModeLabel();
        nextQuestion();
        showToast("开始复习 " + state.marked.length + " 个陌生单词");
        return;
      }
      quizMode = "core";
      updateModeLabel();
      nextQuestion();
      showToast("已回到六级核心词库");
    });

    refs.searchInput.addEventListener("input", renderLibrary);
    refs.filterFreq.addEventListener("change", renderLibrary);
    refs.sortSelect.addEventListener("change", renderLibrary);

    refs.libraryGrid.addEventListener("click", function (event) {
      const button = event.target.closest("[data-remove]");
      if (!button) return;
      const wordKey = button.getAttribute("data-remove");
      removeMark(wordKey, false);
    });

    refs.clearBtn.addEventListener("click", function () {
      if (!state.marked.length) return;
      openModal({
        title: "清空陌生单词库？",
        text: "当前 " + state.marked.length + " 个已标记单词都会被移除，此操作无法撤销。",
        confirmText: "确认清空",
        onConfirm: function () {
          state.marked = [];
          if (quizMode === "marked") quizMode = "core";
          saveState();
          updateCounts();
          updateModeLabel();
          updateMarkButton();
          renderLibrary();
          showToast("陌生单词库已清空");
        }
      });
    });

    refs.exportBtn.addEventListener("click", exportWordDocument);

    refs.reviewBtn.addEventListener("click", function () {
      if (!state.marked.length) {
        showToast("还没有可复习的陌生单词");
        return;
      }
      quizMode = "marked";
      updateModeLabel();
      switchView("quiz");
      nextQuestion();
      showToast("开始复习 " + state.marked.length + " 个陌生单词");
    });

    refs.emptyCta.addEventListener("click", function () {
      if (emptyAction === "reset") {
        clearFilters();
        return;
      }
      switchView("quiz");
    });

    refs.modalCancel.addEventListener("click", closeModal);
    refs.modalClose.addEventListener("click", closeModal);
    refs.modal.addEventListener("click", function (event) {
      if (event.target === refs.modal) closeModal();
    });
    refs.modalConfirm.addEventListener("click", function () {
      const callback = modalCallback;
      closeModal();
      if (callback) callback();
    });

    document.addEventListener("keydown", function (event) {
      if (!refs.modal.hidden) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeModal();
        }
        return;
      }

      const tagName = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
      if (tagName === "input" || tagName === "select" || tagName === "textarea" || event.target.isContentEditable) {
        return;
      }

      if (refs.viewQuiz.hidden) return;

      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        toggleMark();
        return;
      }

      if (!answered && /^[1-4]$/.test(event.key)) {
        event.preventDefault();
        chooseOption(Number(event.key) - 1);
        return;
      }

      if (answered && event.key === "Enter") {
        event.preventDefault();
        nextQuestion();
      }
    });

    window.addEventListener("hashchange", function () {
      switchView(window.location.hash === "#library" ? "library" : "quiz", { push: false, scroll: false });
    });
  }

  function init() {
    if (META.total && refs.heroWordCount) {
      refs.heroWordCount.textContent = Number(META.total).toLocaleString("zh-CN");
    }
    loadState();
    bindEvents();
    updateStats();
    updateCounts();
    updateModeLabel();

    const initialView = window.location.hash === "#library" ? "library" : "quiz";
    switchView(initialView, { push: false, scroll: false });
    nextQuestion();
    renderLibrary();
  }

  init();
})();
