// Khushi, Jainam, Krish, Palak – SpeakNotes AI Backend

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null; // we'll set this in .env

app.use(cors());
app.use(express.json());

// Simple home route so you don't see "Cannot GET /"
app.get("/", (req, res) => {
  res.send("✅ SpeakNotes AI – Lecture Notes API is running");
});

// MAIN WORKFLOW ENDPOINT
app.post("/api/process", (req, res) => {
  try {
    // 1. Check API key (optional but recommended)
    if (API_KEY) {
      const clientKey = req.header("x-api-key");
      if (!clientKey || clientKey !== API_KEY) {
        return res
          .status(401)
          .json({ status: "error", message: "Unauthorized: Invalid API key" });
      }
    }

    // 2. Get data from SpeakSpace
    const { prompt, note_id, timestamp } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Missing or invalid 'prompt' field in request body",
      });
    }

    // For now, we treat full 'prompt' as lecture text
    const lectureText = prompt;

    // 3. Process lecture into structured notes
    const notes = generateStructuredNotes(lectureText);

    // 4. Send response
    return res.json({
      status: "success",
      message: "Lecture notes generated",
      note_id: note_id || null,
      timestamp: timestamp || null,
      data: notes,
    });
  } catch (err) {
    console.error("Error in /api/process:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error while generating notes",
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SpeakNotes API running on http://localhost:${PORT}`);
});

/* =========================
   CORE LOGIC – SMART NOTES
   ========================= */

function generateStructuredNotes(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();

  const sentences = splitIntoSentences(cleaned);
  const topic = detectTopic(cleaned, sentences);
  const summary = buildSummary(sentences);
  const keyPoints = buildKeyPoints(sentences);
  const definitions = extractDefinitions(sentences);
  const keywords = extractKeywords(cleaned);
  const concepts = buildConcepts(sentences);
  const examNotes = buildExamNotes(sentences, topic);
  const questions = generateQuestions(definitions, topic, sentences);

  return {
    topic,
    summary,
    keyPoints,
    definitions,
    keywords,
    concepts,
    examNotes,
    questions,
    rawSentenceCount: sentences.length,
  };
}

/* ---------- Helpers ---------- */

function splitIntoSentences(text) {
  const rough = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.split(" ").length > 3); // ignore too tiny fragments

  return rough;
}

function detectTopic(text, sentences) {
  // Approach: choose 1) a frequent keyword, else 2) first sentence chunk
  const keywords = extractKeywords(text).map((k) => k.word);
  if (keywords.length > 0) {
    return keywords[0];
  }

  if (sentences.length > 0) {
    return sentences[0].split(" ").slice(0, 6).join(" ");
  }

  return "Lecture Topic";
}

function buildSummary(sentences, maxLines = 6) {
  if (sentences.length === 0) return "No summary could be generated.";

  // Simple heuristic: pick some early and mid sentences
  const selected = [];
  const step = Math.max(1, Math.floor(sentences.length / maxLines));

  for (let i = 0; i < sentences.length && selected.length < maxLines; i += step) {
    selected.push(sentences[i]);
  }

  return selected.join(" ");
}

function buildKeyPoints(sentences, maxPoints = 8) {
  if (sentences.length === 0) return [];

  const importantSentences = sentences.filter((s) =>
    /important|key point|main idea|in summary|therefore|so we can|definition|types of|steps/i.test(
      s
    )
  );

  const source = importantSentences.length > 0 ? importantSentences : sentences;

  return source.slice(0, maxPoints).map((s) => "• " + s);
}

function extractDefinitions(sentences, maxDefs = 8) {
  const defs = [];

  sentences.forEach((s) => {
    // Look for pattern: "X is", "X are", "X refers to"
    let match =
      s.match(/(.+?)\s+is\s+(.*)/i) ||
      s.match(/(.+?)\s+are\s+(.*)/i) ||
      s.match(/(.+?)\s+refers to\s+(.*)/i);

    if (match) {
      const termRaw = match[1].trim();
      const defRaw = match[2].trim();

      const term = trimForDefinition(termRaw);
      const definition = defRaw.replace(/^[.:,-\s]+/, "");

      if (
        term &&
        term.split(" ").length <= 6 &&
        definition.length > 5 &&
        defs.length < maxDefs
      ) {
        defs.push({
          term,
          definition,
        });
      }
    }
  });

  return defs;
}

function trimForDefinition(str) {
  // Remove common starters like "In operating systems", "In this chapter"
  return str.replace(/^(in|in this|in an|in the|here we|we)\s+/i, "").trim();
}

function extractKeywords(text, maxKeywords = 10) {
  const stopwords = new Set([
    "the",
    "is",
    "are",
    "a",
    "an",
    "of",
    "and",
    "or",
    "to",
    "in",
    "on",
    "for",
    "with",
    "that",
    "this",
    "by",
    "as",
    "from",
    "at",
    "be",
    "it",
    "we",
    "you",
    "they",
    "was",
    "were",
    "can",
    "could",
    "should",
    "would",
    "have",
    "has",
    "had",
    "not",
    "no",
    "yes",
    "if",
    "then",
    "else",
    "there",
    "their",
  ]);

  const wordCounts = {};
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));

  words.forEach((w) => {
    wordCounts[w] = (wordCounts[w] || 0) + 1;
  });

  const sorted = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word, count]) => ({ word, count }));

  return sorted;
}

function buildConcepts(sentences, maxConcepts = 6) {
  // Choose slightly longer sentences as "concept explanations"
  const longOnes = sentences.filter((s) => s.split(" ").length >= 10);
  return longOnes.slice(0, maxConcepts);
}

function buildExamNotes(sentences, topic, maxLines = 6) {
  const examRelated = sentences.filter((s) =>
    /exam|important|remember|must know|frequently asked|often asked|definition|difference between|advantages|disadvantages|types of/i.test(
      s
    )
  );

  const source = examRelated.length > 0 ? examRelated : sentences;

  const selected = source.slice(0, maxLines).map((s) => "• " + s);

  if (selected.length === 0 && topic) {
    selected.push(`• Understand the basic concept of ${topic}.`);
  }

  return selected;
}

function generateQuestions(definitions, topic, sentences, maxQ = 5) {
  const questions = [];

  // From definitions: "What is TERM?"
  definitions.forEach((d) => {
    if (questions.length < maxQ) {
      questions.push(`Q: What is ${d.term}?`);
    }
  });

  // If still less, add generic questions
  if (questions.length < maxQ && topic) {
    questions.push(`Q: Explain the concept of ${topic} in your own words.`);
  }
  if (questions.length < maxQ) {
    questions.push("Q: List any two key points discussed in this lecture.");
  }
  if (questions.length < maxQ) {
    questions.push("Q: Write short notes on any one topic from the lecture.");
  }

  return questions.slice(0, maxQ);
}
