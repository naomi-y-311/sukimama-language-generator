import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-nano";

loadDotEnv();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/generate") {
      const body = await readJson(req);
      const draft = await generateDraft(body, req.headers);
      return sendJson(res, draft);
    }

    if (req.method === "GET") {
      const filePath = url.pathname === "/" ? "/public/index.html" : `/public${url.pathname}`;
      const fullPath = path.normalize(path.join(__dirname, filePath));

      if (!fullPath.startsWith(path.join(__dirname, "public"))) {
        return sendText(res, 403, "Forbidden");
      }

      const ext = path.extname(fullPath);
      const content = await readFile(fullPath);
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      return res.end(content);
    }

    sendText(res, 404, "Not found");
  } catch (error) {
    console.error(error);
    sendJson(res, { error: error.message || "Unexpected error" }, error.status || 500);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`Local app: http://${HOST}:${PORT}`);
  });
}

export async function generateDraft(body, headers = {}) {
  assertAuthorized(body, headers);
  const translationResult = await translateLyrics(body);
  const title = buildPostTitle(body.meta);
  const html = buildWordPressHtml(body.meta, translationResult.lines, body.options || {});
  return { title, html, translated: translationResult.lines, stats: translationResult.stats };
}

function assertAuthorized(body, headers) {
  const password = process.env.APP_PASSWORD;
  if (!password) return;

  const provided = headers["x-app-password"] || headers["X-App-Password"] || body.appPassword;
  if (provided !== password) {
    const error = new Error("共有パスワードを入力してください。");
    error.status = 401;
    throw error;
  }
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;

  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function translateLyrics(body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(".envにOPENAI_API_KEYを設定してください。");
  }

  const rawLines = splitLyrics(body.lyrics || "");
  const uniqueLyrics = collectUniqueLyrics(rawLines);

  if (uniqueLyrics.length === 0) {
    throw new Error("翻訳する歌詞を入力してください。");
  }

  const numberedLyrics = uniqueLyrics.map((line, index) => `${index + 1}. ${line.text}`).join("\n");
  const notesInstruction = body.options?.includeNotes
    ? "必要な行だけ、短い日本語の補足文をnoteに入れてください。noteは「※」「注釈：」などの見出しや箇条書きにせず、そのまま本文として読める一文にしてください。不要な場合は空文字にしてください。"
    : "noteは常に空文字にしてください。";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたはK-POP歌詞の日本語訳者です。韓国語と英語が混在する歌詞を、自然な日本語に訳します。原文1行につき訳文1行を必ず保ち、行の統合・分割・省略をしません。"
        },
        {
          role: "user",
          content: [
            `原曲言語: ${body.meta?.language || "混在"}`,
            `曲名: ${body.meta?.songTitle || ""}`,
            `アーティスト: ${body.meta?.artist || ""}`,
            "",
            "次の歌詞を日本語に翻訳してください。",
            "重複行は省いてあります。JSONのみで返してください。形式: {\"lines\":[{\"index\":1,\"original\":\"...\",\"translation\":\"...\",\"note\":\"\"}]}",
            notesInstruction,
            "",
            numberedLyrics
          ].join("\n")
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "OpenAI APIで翻訳できませんでした。");
  }

  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  const translatedByKey = new Map();
  for (const item of parsed.lines || []) {
    const uniqueLine = uniqueLyrics[Number(item.index) - 1];
    if (!uniqueLine) continue;
    translatedByKey.set(uniqueLine.key, {
      original: String(item.original || ""),
      translation: String(item.translation || ""),
      note: String(item.note || "")
    });
  }

  const lines = rawLines.map((line) => {
    if (line.type !== "lyric") return line;
    const translated = translatedByKey.get(line.key);
    return {
      type: "lyric",
      original: line.text,
      translation: translated?.translation || "",
      note: translated?.note || ""
    };
  });

  return {
    lines,
    stats: {
      totalLyricLines: rawLines.filter((line) => line.type === "lyric").length,
      uniqueLyricLines: uniqueLyrics.length,
      skippedLines: rawLines.filter((line) => line.type === "blank" || line.type === "section" || line.type === "ad").length
    }
  };
}

function splitLyrics(text) {
  return text
    .split(/\r?\n/)
    .map((rawLine) => {
      const line = rawLine.trim();
      if (!line) return { type: "blank" };
      if (/^\[?AD\]?$/i.test(line) || line === "ここに広告") return { type: "ad" };
      if (isSectionHeading(line)) return { type: "section", text: line };
      return { type: "lyric", text: line, key: normalizeLyricLine(line) };
    });
}

function collectUniqueLyrics(lines) {
  const seen = new Set();
  const unique = [];
  for (const line of lines) {
    if (line.type !== "lyric" || seen.has(line.key)) continue;
    seen.add(line.key);
    unique.push({ key: line.key, text: line.text });
  }
  return unique;
}

function normalizeLyricLine(line) {
  return String(line).replaceAll("　", " ").trim().replace(/\s+/g, " ");
}

function isSectionHeading(line) {
  const inner = line.match(/^[\[(（【]\s*(.+?)\s*[\])）】]$/)?.[1] || line;
  return /^(intro|verse|pre[-\s]?chorus|chorus|post[-\s]?chorus|hook|refrain|bridge|outro|interlude|instrumental|break|rap|spoken|part|verse\s*\d+|サビ|イントロ|アウトロ|ブリッジ|間奏)(\s*\d+|\s*[A-Za-z])?$/i.test(
    inner.trim()
  );
}

function buildPostTitle(meta = {}) {
  const song = compactJoin([meta.songTitle, meta.altTitle], " / ");
  const artist = compactJoin([meta.artist, meta.artistJa], " / ");
  return `【歌詞和訳】${compactJoin([song, artist], " - ")}`;
}

function buildWordPressHtml(meta = {}, translatedLines = [], options = {}) {
  const lyricHtml = buildLyricsHtml(translatedLines, options.includeNotes);
  const mvBlock = meta.youtubeUrl ? buildYoutubeBlock(meta.youtubeUrl) : "";

  return [
    "<!-- wp:heading -->",
    `<h2 class="wp-block-heading">曲名：${escapeHtml(meta.songTitle || "")}</h2>`,
    "<!-- /wp:heading -->",
    "",
    "<!-- wp:cocoon-blocks/column-2 {\"extraBottomMargin\":\"2\"} -->",
    "<div class=\"wp-block-cocoon-blocks-column-2 column-wrap column-2 column-2-2-1-1 layout-box is-style-bottom-margin-2em has-bottom-margin\"><!-- wp:cocoon-blocks/column-left -->",
    "<div class=\"wp-block-cocoon-blocks-column-left column-left\"><!-- wp:image -->",
    "<figure class=\"wp-block-image\"><img alt=\"\"/></figure>",
    "<!-- /wp:image --></div>",
    "<!-- /wp:cocoon-blocks/column-left -->",
    "",
    "<!-- wp:cocoon-blocks/column-right {\"extraBottomMargin\":\"0\"} -->",
    "<div class=\"wp-block-cocoon-blocks-column-right column-right is-style-bottom-margin-0em has-bottom-margin\"><!-- wp:heading {\"level\":3} -->",
    `<h3 class="wp-block-heading h3-content">アーティスト：${escapeHtml(compactJoin([meta.artist, meta.artistJa], " / "))}</h3>`,
    "<!-- /wp:heading -->",
    "",
    "<!-- wp:heading {\"level\":3} -->",
    `<h3 class="wp-block-heading h3-content">アルバム：${escapeHtml(meta.album || "")}</h3>`,
    "<!-- /wp:heading -->",
    "",
    "<!-- wp:paragraph -->",
    "<p></p>",
    "<!-- /wp:paragraph --></div>",
    "<!-- /wp:cocoon-blocks/column-right --></div>",
    "<!-- /wp:cocoon-blocks/column-2 -->",
    "",
    mvBlock,
    "<!-- wp:block {\"ref\":13760} /-->",
    "",
    "<!-- wp:spacer {\"height\":\"60px\"} -->",
    "<div style=\"height:60px\" aria-hidden=\"true\" class=\"wp-block-spacer\"></div>",
    "<!-- /wp:spacer -->",
    "",
    buildWideAdBlock(),
    "",
    "<!-- wp:heading -->",
    "<h2 class=\"wp-block-heading\">歌詞</h2>",
    "<!-- /wp:heading -->",
    "",
    "<!-- wp:block {\"ref\":13876} /-->",
    "",
    lyricHtml,
    "",
    "<!-- wp:block {\"ref\":13762} /-->",
    "",
    "<!-- wp:separator -->",
    "<hr class=\"wp-block-separator has-alpha-channel-opacity\"/>",
    "<!-- /wp:separator -->",
    "",
    "<!-- wp:cocoon-blocks/column-2 -->",
    "<div class=\"wp-block-cocoon-blocks-column-2 column-wrap column-2 column-2-2-1-1 layout-box\"><!-- wp:cocoon-blocks/column-left -->",
    "<div class=\"wp-block-cocoon-blocks-column-left column-left\"><!-- wp:image -->",
    "<figure class=\"wp-block-image\"><img alt=\"\"/></figure>",
    "<!-- /wp:image --></div>",
    "<!-- /wp:cocoon-blocks/column-left -->",
    "",
    "<!-- wp:cocoon-blocks/column-right -->",
    "<div class=\"wp-block-cocoon-blocks-column-right column-right\"><!-- wp:paragraph -->",
    `<p>アーティスト：${escapeHtml(compactJoin([meta.artist, meta.artistJa], " / "))}</p>`,
    "<!-- /wp:paragraph -->",
    "",
    "<!-- wp:paragraph -->",
    `<p>アルバム：${escapeHtml(meta.album || "")}</p>`,
    "<!-- /wp:paragraph -->",
    "",
    "<!-- wp:paragraph -->",
    `<p>作詞者：${escapeHtml(meta.lyricist || "")}</p>`,
    "<!-- /wp:paragraph --></div>",
    "<!-- /wp:cocoon-blocks/column-right --></div>",
    "<!-- /wp:cocoon-blocks/column-2 -->",
    "",
    "<!-- wp:block {\"ref\":13761} /-->"
  ]
    .filter((part) => part !== "")
    .join("\n");
}

function buildLyricsHtml(lines, includeNotes) {
  const parts = [];
  for (const line of lines) {
    if (line.type === "blank") {
      parts.push("<!-- wp:spacer {\"height\":\"20px\"} -->");
      parts.push("<div style=\"height:20px\" aria-hidden=\"true\" class=\"wp-block-spacer\"></div>");
      parts.push("<!-- /wp:spacer -->");
      parts.push("");
      continue;
    }

    if (line.type === "section") {
      parts.push("<!-- wp:paragraph -->");
      parts.push(`<p><strong>${escapeHtml(line.text)}</strong></p>`);
      parts.push("<!-- /wp:paragraph -->");
      parts.push("");
      continue;
    }

    if (line.type === "ad") {
      parts.push("<!-- wp:block {\"ref\":13876} /-->");
      parts.push("");
      parts.push(buildSquareAdBlock());
      parts.push("");
      parts.push("<!-- wp:block {\"ref\":13876} /-->");
      parts.push("");
      continue;
    }

    parts.push("<!-- wp:paragraph -->");
    parts.push(`<p>${escapeHtml(line.original)}<br>${escapeHtml(line.translation)}</p>`);
    parts.push("<!-- /wp:paragraph -->");
    parts.push("");

    if (includeNotes && line.note) {
      parts.push("<!-- wp:paragraph {\"extraStyle\":\"memo-box\"} -->");
      parts.push(`<p class="is-style-memo-box has-box-style">${escapeHtml(line.note)}</p>`);
      parts.push("<!-- /wp:paragraph -->");
      parts.push("");
    }
  }
  return parts.join("\n").trim();
}

function buildYoutubeBlock(url) {
  const safeUrl = escapeHtml(url);
  return [
    "<!-- wp:heading {\"level\":3} -->",
    "<h3 class=\"wp-block-heading\">【MV】</h3>",
    "<!-- /wp:heading -->",
    "",
    "<!-- wp:paragraph -->",
    `<p>${safeUrl}</p>`,
    "<!-- /wp:paragraph -->",
    ""
  ].join("\n");
}

function buildWideAdBlock() {
  return [
    "<!-- wp:html -->",
    "<script async src=\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1480903629296491\"",
    "     crossorigin=\"anonymous\"></script>",
    "<!-- language歌詞下 -->",
    "<ins class=\"adsbygoogle\"",
    "     style=\"display:block\"",
    "     data-ad-client=\"ca-pub-1480903629296491\"",
    "     data-ad-slot=\"5656725823\"",
    "     data-ad-format=\"auto\"",
    "     data-full-width-responsive=\"true\"></ins>",
    "<script>",
    "     (adsbygoogle = window.adsbygoogle || []).push({});",
    "</script>",
    "<!-- /wp:html -->"
  ].join("\n");
}

function buildSquareAdBlock() {
  return [
    "<!-- wp:html -->",
    "<script async src=\"https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js\"></script>",
    "<!-- language用200×200 -->",
    "<ins class=\"adsbygoogle\" style=\"display: inline-block; width: 200px; height: 200px;\" data-ad-client=\"ca-pub-1480903629296491\" data-ad-slot=\"5983498114\"></ins>",
    "<script>",
    "     (adsbygoogle = window.adsbygoogle || []).push({});",
    "</script>",
    "<!-- /wp:html -->"
  ].join("\n");
}

function compactJoin(values, separator) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(separator);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
