const COURSE_DATA_PATH = "./src/py/中国农业大学2025-2026学年春季学期通知单课表.json";
const courseSearchInput = document.getElementById("CourseSearchInput");
const teacherSearchInput = document.getElementById("TeacherSearchInput");
const timeSearchInput = document.getElementById("TimeSearchInput");
const courseSuggestionBox = document.getElementById("CourseSuggestionBox");
const teacherSuggestionBox = document.getElementById("TeacherSuggestionBox");
const timeSuggestionBox = document.getElementById("TimeSuggestionBox");
const topbarSearch = document.getElementById("CourseSearchBar");
const selectedPreview = document.getElementById("CourseSelectedPreview");

let courseList = [];
let selectedCourseRecord = null;
const selectedDisplayLabel = {
	course: "",
	teacher: "",
	time: ""
};

// 供后续逻辑直接读取：完整课程对象与其键值对数组
window.selectedCourseRecord = null;
window.selectedCourseKeyValuePairs = [];

function syncSelectedPreview(label) {
	if (!topbarSearch || !selectedPreview) {
		return;
	}

	selectedPreview.textContent = label;
	if (label) {
		topbarSearch.classList.add("has-selection");
	} else {
		topbarSearch.classList.remove("has-selection");
	}
}

function clearSelectedCourseState() {
	selectedCourseRecord = null;
	selectedDisplayLabel.course = "";
	selectedDisplayLabel.teacher = "";
	selectedDisplayLabel.time = "";
	window.selectedCourseRecord = null;
	window.selectedCourseKeyValuePairs = [];
	syncSelectedPreview("");
}

function normalize(value) {
	return String(value ?? "").trim().toLowerCase();
}

function stringifyCourse(course) {
	return Object.entries(course)
		.map(([key, value]) => `${key}:${value ?? ""}`)
		.join("|")
		.toLowerCase();
}

function hasNumber(text) {
	return /\d/.test(text);
}

function buildCourseLabel(course, queryHasNumber) {
	const courseCode = String(course["课程编号"] ?? "").trim();
	const courseName = String(course["课程名称"] ?? "").trim();

	if (queryHasNumber) {
		return `${courseCode}-${courseName}`;
	}

	return courseName || courseCode;
}

function splitTeachers(raw) {
	return String(raw ?? "")
		.split(/[，,、]/)
		.map((name) => name.trim())
		.filter(Boolean);
}

function showEmpty(box, text) {
	box.innerHTML = `<p class="suggestion-empty">${text}</p>`;
	box.classList.remove("hidden");
}

function hideSuggestions(box) {
	box.classList.add("hidden");
	box.innerHTML = "";
}

function hideAllSuggestions() {
	[courseSuggestionBox, teacherSuggestionBox, timeSuggestionBox].forEach((box) => {
		if (box) {
			hideSuggestions(box);
		}
	});
}

function renderSuggestions(box, list, onPick, emptyText = "未找到匹配课程") {
	if (!list.length) {
		showEmpty(box, emptyText);
		return;
	}

	box.innerHTML = "";

	list.forEach((candidate) => {
		const item = document.createElement("button");
		item.type = "button";
		item.className = "suggestion-item";
		item.textContent = candidate.label;
		item.addEventListener("click", () => {
			onPick(candidate);
			hideSuggestions(box);
		});
		box.appendChild(item);
	});

	box.classList.remove("hidden");
}

function bindSelectedCourse(candidate, previewLabel) {
	selectedCourseRecord = { ...candidate.record };
	window.selectedCourseRecord = selectedCourseRecord;
	window.selectedCourseKeyValuePairs = Object.entries(selectedCourseRecord);
	syncSelectedPreview(previewLabel);
}

function findCourseCandidates(rawQuery) {
	const query = normalize(rawQuery);
	const queryHasNumber = hasNumber(query);
	const matched = courseList.filter((course) => stringifyCourse(course).includes(query));
	const seenCourseNames = new Set();

	const deduped = [];
	matched.forEach((course) => {
		const courseName = normalize(course["课程名称"]);
		if (!courseName || seenCourseNames.has(courseName)) {
			return;
		}
		seenCourseNames.add(courseName);
		deduped.push({
			record: course,
			label: buildCourseLabel(course, queryHasNumber)
		});
	});

	return deduped;
}

function findTeacherCandidates(rawQuery) {
	const query = normalize(rawQuery);
	const seenPairs = new Set();
	const result = [];

	courseList.forEach((course) => {
		const teachers = splitTeachers(course["教师姓名"]);
		const courseName = String(course["课程名称"] ?? "").trim();
		teachers.forEach((teacher) => {
			const teacherText = normalize(teacher);
			const courseText = normalize(courseName);
			if (!teacherText.includes(query) && !courseText.includes(query)) {
				return;
			}

			const uniqueKey = `${teacherText}|${courseText}`;
			if (seenPairs.has(uniqueKey)) {
				return;
			}
			seenPairs.add(uniqueKey);

			result.push({
				record: course,
				label: `${teacher}-${courseName}`
			});
		});
	});

	return result;
}

function findTimeCandidates(rawQuery) {
	const query = normalize(rawQuery);
	const seenPairs = new Set();
	const result = [];

	courseList.forEach((course) => {
		const timeTextRaw = String(course["上课时间"] ?? "").trim();
		const courseName = String(course["课程名称"] ?? "").trim();
		const combinedText = normalize(`${timeTextRaw}|${courseName}`);
		if (!combinedText.includes(query)) {
			return;
		}

		const uniqueKey = `${normalize(timeTextRaw)}|${normalize(courseName)}`;
		if (seenPairs.has(uniqueKey)) {
			return;
		}
		seenPairs.add(uniqueKey);

		result.push({
			record: course,
			label: `${timeTextRaw}-${courseName}`
		});
	});

	return result;
}

function filterCourseInput(rawQuery) {
	const query = normalize(rawQuery);

	if (!query) {
		hideSuggestions(courseSuggestionBox);
		return;
	}

	if (!courseList.length) {
		showEmpty(courseSuggestionBox, "课程数据加载中，请稍候...");
		return;
	}

	const candidates = findCourseCandidates(query).slice(0, 30);
	renderSuggestions(courseSuggestionBox, candidates, (candidate) => {
		const queryHasNumber = hasNumber(query);
		const pickedLabel = buildCourseLabel(candidate.record, queryHasNumber);
		courseSearchInput.value = pickedLabel;
		selectedDisplayLabel.course = pickedLabel;
		bindSelectedCourse(candidate, pickedLabel);
	}, "未找到匹配课程");
}

function filterTeacherInput(rawQuery) {
	const query = normalize(rawQuery);

	if (!query) {
		hideSuggestions(teacherSuggestionBox);
		return;
	}

	if (!courseList.length) {
		showEmpty(teacherSuggestionBox, "课程数据加载中，请稍候...");
		return;
	}

	const candidates = findTeacherCandidates(query).slice(0, 30);
	renderSuggestions(teacherSuggestionBox, candidates, (candidate) => {
		teacherSearchInput.value = candidate.label;
		selectedDisplayLabel.teacher = candidate.label;
		bindSelectedCourse(candidate, candidate.label);
	}, "未找到匹配授课教师");
}

function filterTimeInput(rawQuery) {
	const query = normalize(rawQuery);

	if (!query) {
		hideSuggestions(timeSuggestionBox);
		return;
	}

	if (!courseList.length) {
		showEmpty(timeSuggestionBox, "课程数据加载中，请稍候...");
		return;
	}

	const candidates = findTimeCandidates(query).slice(0, 30);
	renderSuggestions(timeSuggestionBox, candidates, (candidate) => {
		timeSearchInput.value = candidate.label;
		selectedDisplayLabel.time = candidate.label;
		bindSelectedCourse(candidate, candidate.label);
	}, "未找到匹配上课时间");
}

async function loadCourseData() {
	try {
		const response = await fetch(COURSE_DATA_PATH);
		if (!response.ok) {
			throw new Error(`课程数据加载失败: ${response.status}`);
		}

		const data = await response.json();
		courseList = Array.isArray(data) ? data : [];
	} catch (error) {
		console.error(error);
		showEmpty(courseSuggestionBox, "课程数据加载失败，请检查文件路径或本地服务");
	}
}

if (
	courseSearchInput &&
	teacherSearchInput &&
	timeSearchInput &&
	courseSuggestionBox &&
	teacherSuggestionBox &&
	timeSuggestionBox
) {
	courseSearchInput.addEventListener("input", (event) => {
		if (selectedCourseRecord && event.target.value !== selectedDisplayLabel.course) {
			clearSelectedCourseState();
		}
		filterCourseInput(event.target.value);
	});

	teacherSearchInput.addEventListener("input", (event) => {
		if (selectedCourseRecord && event.target.value !== selectedDisplayLabel.teacher) {
			clearSelectedCourseState();
		}
		filterTeacherInput(event.target.value);
	});

	timeSearchInput.addEventListener("input", (event) => {
		if (selectedCourseRecord && event.target.value !== selectedDisplayLabel.time) {
			clearSelectedCourseState();
		}
		filterTimeInput(event.target.value);
	});

	document.addEventListener("click", (event) => {
		if (!event.target.closest(".search-bar")) {
			hideAllSuggestions();
		}
	});

	loadCourseData();
	syncSelectedPreview("");
}
