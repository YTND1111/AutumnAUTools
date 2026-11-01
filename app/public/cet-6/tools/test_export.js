const fs = require("fs");
const path = require("path");
const { WORDS } = require("../js/data.js");
const exporter = require("../js/word-export.js");

const wanted = ["abandon", "qualitative", "soluble", "bipartisan", "immersive"];
const sample = wanted
  .map((word) => WORDS.find((item) => item.word === word))
  .filter(Boolean)
  .map((word, index) => Object.assign({}, word, { markedAt: Date.now() - index * 86400000 }));

const bytes = exporter.buildDocxBytes(sample);
const out = path.resolve(__dirname, "..", "..", "tmp", "test-export-mixed.docx");
fs.writeFileSync(out, Buffer.from(bytes));
console.log(JSON.stringify({
  out,
  bytes: bytes.length,
  entries: sample.map((word) => ({ word: word.word, pos: word.pos, meaning: word.meaning, exampleType: word.exampleType })),
}, null, 2));
