const COURSE_DATA_PATH = "./src/py/中国农业大学2025-2026学年春季学期通知单课表.json";
const searchInput = document.getElementById("CourseSearchInput");
const suggestionBox = document.getElementById("CourseSuggestionBox");
const topbarSearch = document.querySelector(".topbar-search");
const selectedPreview = document.getElementById("CourseSelectedPreview");

let courseList = [];
let selectedCourseRecord = null;
let selectedDisplayLabel = "";

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
	selectedDisplayLabel = "";
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

function buildLabel(course, queryHasNumber) {
	const courseCode = String(course["课程编号"] ?? "").trim();
	const courseName = String(course["课程名称"] ?? "").trim();

	if (queryHasNumber) {
		return `${courseCode}-${courseName}`;
	}

	return courseName || courseCode;
}

function showEmpty(text) {
	suggestionBox.innerHTML = `<p class="suggestion-empty">${text}</p>`;
	suggestionBox.classList.remove("hidden");
}

function hideSuggestions() {
	suggestionBox.classList.add("hidden");
	suggestionBox.innerHTML = "";
}

function renderSuggestions(list, queryHasNumber) {
	if (!list.length) {
		showEmpty("未找到匹配课程");
		return;
	}

	suggestionBox.innerHTML = "";

	list.forEach((course) => {
		const item = document.createElement("button");
		item.type = "button";
		item.className = "suggestion-item";
		item.textContent = buildLabel(course, queryHasNumber);
		item.addEventListener("click", () => {
			const pickedLabel = buildLabel(course, queryHasNumber);
			searchInput.value = pickedLabel;

			selectedCourseRecord = { ...course };
			selectedDisplayLabel = pickedLabel;
			window.selectedCourseRecord = selectedCourseRecord;
			window.selectedCourseKeyValuePairs = Object.entries(selectedCourseRecord);
			syncSelectedPreview(pickedLabel);

			hideSuggestions();
		});
		suggestionBox.appendChild(item);
	});

	suggestionBox.classList.remove("hidden");
}

function filterCourses(rawQuery) {
	const query = normalize(rawQuery);

	if (!query) {
		hideSuggestions();
		return;
	}

	if (!courseList.length) {
		showEmpty("课程数据加载中，请稍候...");
		return;
	}

	const queryHasNumber = hasNumber(query);
	const filtered = courseList.filter((course) => stringifyCourse(course).includes(query));

	renderSuggestions(filtered.slice(0, 30), queryHasNumber);
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
		showEmpty("课程数据加载失败，请检查文件路径或本地服务");
	}
}

if (searchInput && suggestionBox) {
	searchInput.addEventListener("input", (event) => {
		if (selectedCourseRecord && event.target.value !== selectedDisplayLabel) {
			clearSelectedCourseState();
		}

		filterCourses(event.target.value);
	});

	document.addEventListener("click", (event) => {
		if (!event.target.closest(".topbar-search")) {
			hideSuggestions();
		}
	});

	loadCourseData();
	syncSelectedPreview("");
}
