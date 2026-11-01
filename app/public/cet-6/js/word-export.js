/*
 * 词隙 · 纯前端 Word 导出
 * 不依赖任何第三方库：手写 OOXML，并使用 ZIP(Store) 打包为 .docx。
 */
(function (global) {
  "use strict";

  const encoder = new TextEncoder();
  const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const COLORS = {
    ink: "1D241C",
    softInk: "465044",
    muted: "7D8377",
    faint: "A9A293",
    accent: "D5532E",
    accentDark: "B63F1E",
    line: "E4DED2",
    white: "FFFFFF"
  };

  const FONT_SANS = "Microsoft YaHei";
  const FONT_EN = "Georgia";
  const FONT_MONO = "Consolas";

  let crcTable = null;

  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
      }
      crcTable[index] = value >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = (crc >>> 8) ^ table[(crc ^ bytes[index]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function concatBytes(chunks) {
    let total = 0;
    chunks.forEach(function (chunk) { total += chunk.length; });
    const result = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(function (chunk) {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  }

  function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time: dosTime, date: dosDate };
  }

  function zipStore(files) {
    const localParts = [];
    const centralParts = [];
    const stamp = dosDateTime(new Date());
    let offset = 0;

    files.forEach(function (file) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data instanceof Uint8Array ? file.data : encoder.encode(String(file.data));
      const crc = crc32(data);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034B50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, stamp.time, true);
      localView.setUint16(12, stamp.date, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014B50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, stamp.time, true);
      centralView.setUint16(14, stamp.date, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      centralParts.push(centralHeader);
      offset += localHeader.length + data.length;
    });

    const centralDirectory = concatBytes(centralParts);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054B50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true);

    return concatBytes(localParts.concat([centralDirectory, endRecord]));
  }

  /* ================= OOXML helpers ================= */

  function escapeXml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;"
      }[character];
    }).replace(/\r?\n/g, " ");
  }

  function run(text, options) {
    const settings = options || {};
    const properties = [];
    const font = settings.font || FONT_SANS;
    const eastAsia = settings.eastAsia || FONT_SANS;

    properties.push('<w:rFonts w:ascii="' + font + '" w:hAnsi="' + font +
      '" w:eastAsia="' + eastAsia + '" w:cs="' + font + '"/>');

    if (settings.bold) properties.push("<w:b/><w:bCs/>");
    if (settings.italic) properties.push("<w:i/><w:iCs/>");
    if (settings.color) properties.push('<w:color w:val="' + settings.color + '"/>');
    if (settings.size) {
      const halfPoints = Math.round(settings.size * 2);
      properties.push('<w:sz w:val="' + halfPoints + '"/><w:szCs w:val="' + halfPoints + '"/>');
    }
    if (settings.spacing) properties.push('<w:spacing w:val="' + settings.spacing + '"/>');
    if (settings.underline) properties.push('<w:u w:val="single"/>');

    return "<w:r><w:rPr>" + properties.join("") + "</w:rPr>" +
      '<w:t xml:space="preserve">' + escapeXml(text) + "</w:t></w:r>";
  }

  function paragraph(content, options) {
    const settings = options || {};
    const properties = [];

    if (settings.align) properties.push('<w:jc w:val="' + settings.align + '"/>');
    if (settings.keepNext) properties.push("<w:keepNext/>");
    if (settings.keepLines) properties.push("<w:keepLines/>");
    if (settings.indent) properties.push('<w:ind w:left="' + settings.indent + '"/>');
    if (settings.borderBottom) {
      properties.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="7" w:color="' +
        (settings.borderColor || COLORS.line) + '"/></w:pBdr>');
    }
    if (settings.spacingBefore || settings.spacingAfter || settings.line) {
      properties.push('<w:spacing' +
        (settings.spacingBefore ? ' w:before="' + settings.spacingBefore + '"' : "") +
        (settings.spacingAfter ? ' w:after="' + settings.spacingAfter + '"' : "") +
        (settings.line ? ' w:line="' + settings.line + '" w:lineRule="auto"' : "") +
        "/>");
    }

    const body = Array.isArray(content) ? content.join("") : String(content);
    return "<w:p><w:pPr>" + properties.join("") + "</w:pPr>" + body + "</w:p>";
  }

  function dateLabel(timestamp, withWeekday) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "未知日期";
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: withWeekday ? "short" : undefined
    });
  }

  function stampForFilename(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function w3cDate(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  /* ================= document parts ================= */

  function buildDocumentXml(words) {
    const now = new Date();
    const total = words.length;
    const body = [];

    body.push(paragraph([
      run("CET-6  WORD  LAB", { size: 8, bold: true, color: COLORS.accent, spacing: 46 })
    ], { spacingAfter: 110 }));

    body.push(paragraph([
      run("六级陌生单词库", { size: 27, bold: true, color: COLORS.ink, font: FONT_EN, eastAsia: FONT_SANS })
    ], { spacingAfter: 100, keepNext: true }));

    body.push(paragraph([
      run(total + " 个单词  ·  导出于 " + dateLabel(now.getTime(), false),
        { size: 9, color: COLORS.muted, font: FONT_SANS })
    ], { spacingAfter: 180, borderBottom: true, borderColor: COLORS.accent }));

    body.push(paragraph([
      run("先把中文释义遮住自测，再对照例句复习。考频按通用英语语料词频估算，作为复习优先级参考。",
        { size: 8.5, color: COLORS.faint, font: FONT_SANS })
    ], { spacingAfter: 210 }));

    if (!total) {
      body.push(paragraph([
        run("陌生单词库还是空的。", { size: 12, bold: true, color: COLORS.ink })
      ], { spacingBefore: 260, spacingAfter: 100 }));
      body.push(paragraph([
        run("在「词隙」里答错或点击「不认识」，单词就会出现在这里。",
          { size: 9.5, color: COLORS.muted })
      ], { spacingAfter: 160 }));
    }

    words.forEach(function (word, index) {
      const stars = "★".repeat(Math.max(0, Math.min(5, Number(word.stars) || 0))) +
        "☆".repeat(5 - Math.max(0, Math.min(5, Number(word.stars) || 0)));
      const first = index === 0;

      body.push(paragraph([
        run(String(index + 1).padStart(2, "0"), {
          size: 8.5,
          bold: true,
          color: COLORS.faint,
          font: FONT_MONO
        }),
        run("   ", { size: 8.5 }),
        run(word.word, {
          size: 19,
          bold: true,
          color: COLORS.ink,
          font: FONT_EN
        }),
        run("   " + (word.phonetic || ""), {
          size: 8.5,
          color: COLORS.muted,
          font: FONT_EN
        })
      ], {
        spacingBefore: first ? 90 : 250,
        spacingAfter: 60,
        keepNext: true,
        keepLines: true
      }));

      body.push(paragraph([
        run("词性  ", { size: 7.5, bold: true, color: COLORS.faint }),
        run(word.pos || "—", { size: 9.5, bold: true, color: COLORS.accent, font: FONT_EN }),
        run("      考频  ", { size: 7.5, bold: true, color: COLORS.faint }),
        run((word.freq || "—") + "  " + stars, { size: 8.5, color: COLORS.softInk })
      ], { spacingAfter: 55, keepNext: true, keepLines: true }));

      body.push(paragraph([
        run("释义  ", { size: 7.5, bold: true, color: COLORS.faint }),
        run(word.meaning || "—", { size: 11, bold: true, color: COLORS.ink })
      ], { spacingAfter: 55, keepNext: true, keepLines: true }));

      const exampleLabel = word.exampleType === "phrase"
        ? "短语  "
        : (word.exampleType === "sentence"
          ? "例句  "
          : (word.exampleType === "definition" ? "英释  " : "提示  "));
      body.push(paragraph([
        run(exampleLabel, { size: 7.5, bold: true, color: COLORS.faint }),
        run(word.example || "—", {
          size: 9.5,
          italic: true,
          color: COLORS.softInk,
          font: FONT_EN
        })
      ], { spacingAfter: 30, keepNext: true, keepLines: true }));

      if (word.exampleZh) {
        body.push(paragraph([
          run("译文  ", { size: 7.5, bold: true, color: COLORS.faint }),
          run(word.exampleZh, { size: 9, color: COLORS.muted })
        ], { spacingAfter: 35, keepLines: true }));
      }

      body.push(paragraph([
        run("标记于 " + dateLabel(word.markedAt, false), { size: 7.5, color: COLORS.faint })
      ], {
        spacingAfter: first ? 40 : 55,
        borderBottom: true,
        borderColor: COLORS.line
      }));
    });

    body.push(paragraph([
      run("词隙 · CET-6 Word Lab  ·  本地生成", { size: 7.5, color: COLORS.faint })
    ], { align: "center", spacingBefore: 260, spacingAfter: 0 }));

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      "<w:body>" + body.join("") +
      '<w:sectPr>' +
      '<w:footerReference w:type="default" r:id="rId2"/>' +
      '<w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247" ' +
      'w:header="708" w:footer="708" w:gutter="0"/>' +
      '<w:cols w:space="708"/>' +
      '<w:docGrid w:linePitch="312"/>' +
      "</w:sectPr></w:body></w:document>";
  }

  function buildStylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:docDefaults>" +
      "<w:rPrDefault><w:rPr>" +
      '<w:rFonts w:ascii="' + FONT_SANS + '" w:hAnsi="' + FONT_SANS +
      '" w:eastAsia="' + FONT_SANS + '" w:cs="' + FONT_SANS + '"/>' +
      '<w:sz w:val="21"/><w:szCs w:val="21"/>' +
      '<w:color w:val="' + COLORS.ink + '"/>' +
      '<w:lang w:val="en-US" w:eastAsia="zh-CN"/>' +
      "</w:rPr></w:rPrDefault>" +
      "<w:pPrDefault><w:pPr>" +
      '<w:spacing w:after="0" w:line="300" w:lineRule="auto"/>' +
      "</w:pPr></w:pPrDefault>" +
      "</w:docDefaults>" +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
      '<w:name w:val="Normal"/><w:qFormat/>' +
      "</w:style>" +
      "</w:styles>";
  }

  function buildFooterXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>' +
      run("词隙 · CET-6 陌生单词库  ·  第 ", { size: 7.5, color: COLORS.faint }) +
      '<w:fldSimple w:instr=" PAGE ">' +
      run("1", { size: 7.5, color: COLORS.faint }) +
      "</w:fldSimple>" +
      run(" 页", { size: 7.5, color: COLORS.faint }) +
      "</w:p></w:ftr>";
  }

  function buildContentTypesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      "</Types>";
  }

  function buildRootRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      "</Relationships>";
  }

  function buildDocumentRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
      "</Relationships>";
  }

  function buildCoreXml() {
    const now = w3cDate(new Date());
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:dcmitype="http://purl.org/dc/dcmitype/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      "<dc:title>六级陌生单词库</dc:title>" +
      "<dc:creator>词隙 CET-6 Word Lab</dc:creator>" +
      "<cp:lastModifiedBy>词隙 CET-6 Word Lab</cp:lastModifiedBy>" +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + "</dcterms:created>" +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + "</dcterms:modified>" +
      "</cp:coreProperties>";
  }

  function buildAppXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
      'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      "<Application>词隙 · CET-6 Word Lab</Application>" +
      "<AppVersion>1.0</AppVersion>" +
      "</Properties>";
  }

  function buildDocxBytes(words) {
    const safeWords = Array.isArray(words) ? words : [];
    const files = [
      { name: "[Content_Types].xml", data: buildContentTypesXml() },
      { name: "_rels/.rels", data: buildRootRelsXml() },
      { name: "docProps/core.xml", data: buildCoreXml() },
      { name: "docProps/app.xml", data: buildAppXml() },
      { name: "word/document.xml", data: buildDocumentXml(safeWords) },
      { name: "word/styles.xml", data: buildStylesXml() },
      { name: "word/footer1.xml", data: buildFooterXml() },
      { name: "word/_rels/document.xml.rels", data: buildDocumentRelsXml() }
    ];
    return zipStore(files);
  }

  function buildFilename() {
    return "六级陌生单词库_" + stampForFilename(new Date()) + ".docx";
  }

  function downloadDocx(words) {
    if (typeof document === "undefined" || typeof URL === "undefined") {
      throw new Error("downloadDocx requires a browser environment");
    }

    const bytes = buildDocxBytes(words);
    const blob = new Blob([bytes], { type: MIME_DOCX });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildFilename();
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    return anchor.download;
  }

  const api = {
    buildDocxBytes: buildDocxBytes,
    buildDocumentXml: buildDocumentXml,
    buildFilename: buildFilename,
    downloadDocx: downloadDocx
  };

  global.CET6WordExport = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
