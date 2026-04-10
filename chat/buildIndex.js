const fs = require("fs");
const path = require("path");

const KNOWLEDGE_DIR = path.join(__dirname, "../knowledge_base");
const INDEX_DIR = path.join(__dirname, "faiss_index");
const CHUNK_SIZE = 300; // words per chunk
const CHUNK_OVERLAP = 50; // overlapping words between chunks

// ── Ensure index directory exists ──
if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR, { recursive: true });

// ── Split text into overlapping chunks ──
function chunkText(text, source) {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];
    let start = 0;

    while (start < words.length) {
        const end = Math.min(start + CHUNK_SIZE, words.length);
        const chunkWords = words.slice(start, end);
        chunks.push({
            text: chunkWords.join(" "),
            source,
        });
        if (end === words.length) break;
        start += CHUNK_SIZE - CHUNK_OVERLAP;
    }
    return chunks;
}

// ── Load all knowledge base files ──
function loadKnowledgeBase() {
    const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) => f.endsWith(".txt"));
    const allChunks = [];

    for (const file of files) {
        const content = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf-8");
        const chunks = chunkText(content, file.replace(".txt", ""));
        allChunks.push(...chunks);
        console.log(`📄 ${file}: ${chunks.length} chunks`);
    }

    console.log(`\n✅ Total chunks: ${allChunks.length}`);
    return allChunks;
}

// ── Main build function ──
async function buildIndex() {
    console.log("🔨 Building FAISS index...\n");

    // Dynamically import ESM modules
    const { pipeline } = await import("@xenova/transformers");
    const faiss = require("faiss-node");
    console.log(faiss); // 👈 debug (you can remove later)

    // Load embedding model (downloads ~90MB on first run, cached after)
    console.log("📥 Loading embedding model (Xenova/all-MiniLM-L6-v2)...");
    console.log("   First run downloads ~90MB. Subsequent runs use cache.\n");

    const embedder = await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2"
    );

    const chunks = loadKnowledgeBase();
    const embeddings = [];

    console.log("\n🧮 Generating embeddings...");
    for (let i = 0; i < chunks.length; i++) {
        const output = await embedder(chunks[i].text, {
            pooling: "mean",
            normalize: true,
        });
        // Convert to plain array
        embeddings.push(Array.from(output.data));

        if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
            process.stdout.write(`\r   Progress: ${i + 1}/${chunks.length} chunks`);
        }
    }

    console.log("\n\n📦 Building FAISS index (IndexFlatIP - cosine similarity)...");
    const dimension = embeddings[0].length; // 384 for MiniLM-L6
    const index = new faiss.IndexFlatIP(dimension);;

    // Add all embeddings
    const flatArray = embeddings.flat();
    index.add(flatArray);

    // Save FAISS index
    const indexPath = path.join(INDEX_DIR, "index.faiss");
    index.write(indexPath);
    console.log(`✅ FAISS index saved: ${indexPath}`);

    // Save chunk metadata (text + source)
    const metaPath = path.join(INDEX_DIR, "chunks.json");
    fs.writeFileSync(metaPath, JSON.stringify(chunks, null, 2), "utf-8");
    console.log(`✅ Chunk metadata saved: ${metaPath}`);

    console.log(`\n🎉 Index built successfully!`);
    console.log(`   Dimension: ${dimension}`);
    console.log(`   Total vectors: ${chunks.length}`);
    console.log(`\n💡 Run this script again whenever you update knowledge_base/ files.`);
}

buildIndex().catch((err) => {
    console.error("❌ Build failed:", err);
    process.exit(1);
});