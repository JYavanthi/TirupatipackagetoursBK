/**
 * searchEngine.js
 * Loaded once at server startup.
 * Exposes: searchKnowledge(query) → { answer, confidence, chunks }
 */

const fs = require("fs");
const path = require("path");
const faissNode = require("faiss-node");

const INDEX_DIR = path.join(__dirname, "faiss_index");
const INDEX_PATH = path.join(INDEX_DIR, "index.faiss");
const CHUNKS_PATH = path.join(INDEX_DIR, "chunks.json");

const TOP_K = 4;
const CONFIDENCE_THRESHOLD = 0.30;

let faissIndex = null;
let chunks = [];
let embedder = null;
let isReady = false;

async function init() {
  if (isReady) return;

  if (!fs.existsSync(INDEX_PATH) || !fs.existsSync(CHUNKS_PATH)) {
    throw new Error("FAISS index not found. Run: node chat/buildIndex.js first.");
  }

  console.log("🔍 Loading FAISS index...");
  faissIndex = faissNode.IndexFlatIP.read(INDEX_PATH);

  console.log("📚 Loading chunk metadata...");
  chunks = JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf-8"));

  console.log("🤖 Loading embedding model...");
  const { pipeline } = await import("@xenova/transformers");
  embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  isReady = true;
  console.log(`✅ Search engine ready. ${chunks.length} chunks indexed.`);
}

async function embedQuery(text) {
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

async function searchKnowledge(query) {
  if (!isReady) await init();

  const queryVec = await embedQuery(query);
  const result = faissIndex.search(queryVec, TOP_K);

  const { distances, labels } = result;

  const topChunks = labels
    .map((label, i) => ({
      text: chunks[label]?.text || "",
      source: chunks[label]?.source || "",
      score: distances[i],
    }))
    .filter((c) => c.text && c.score > 0);

  const bestScore = topChunks[0]?.score ?? 0;
  const isAnswered = bestScore >= CONFIDENCE_THRESHOLD;

  const context = topChunks
    .slice(0, 3)
    .map((c) => c.text)
    .join("\n\n");

  return {
    answer: context,
    confidence: bestScore,
    chunks: topChunks,
    isAnswered,
  };
}

module.exports = { init, searchKnowledge };