const form = document.querySelector("#draftForm");
const statusText = document.querySelector("#status");
const postTitle = document.querySelector("#postTitle");
const htmlOutput = document.querySelector("#htmlOutput");
const copyTitleButton = document.querySelector("#copyTitleButton");
const copyHtmlButton = document.querySelector("#copyHtmlButton");
const generateButton = document.querySelector("#generateButton");
const sampleButton = document.querySelector("#sampleButton");
const toast = document.querySelector("#toast");
const PENDING_DRAFT_KEY = "sukimamaPendingDraft";
let toastTimer;

applyPendingDraft();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true, "生成しています...");

  try {
    const formData = new FormData(form);
    const payload = {
      lyrics: formData.get("lyrics"),
      meta: {
        songTitle: formData.get("songTitle"),
        altTitle: formData.get("altTitle"),
        artist: formData.get("artist"),
        artistJa: formData.get("artistJa"),
        album: formData.get("album"),
        lyricist: formData.get("lyricist"),
        language: formData.get("language"),
        youtubeUrl: formData.get("youtubeUrl")
      },
      options: {
        includeNotes: formData.get("includeNotes") === "on"
      }
    };

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "生成できませんでした。");

    postTitle.value = data.title;
    htmlOutput.value = data.html;
    copyTitleButton.disabled = false;
    copyHtmlButton.disabled = false;
    const stats = data.stats;
    statusText.textContent = stats
      ? `生成しました。AI送信: ${stats.uniqueLyricLines}/${stats.totalLyricLines}行`
      : "生成しました。";
  } catch (error) {
    statusText.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

copyTitleButton.addEventListener("click", async () => {
  await copyText(postTitle.value);
});

copyHtmlButton.addEventListener("click", async () => {
  await copyText(htmlOutput.value);
});

sampleButton.addEventListener("click", () => {
  form.songTitle.value = "거짓말";
  form.altTitle.value = "LIE";
  form.artist.value = "육성재";
  form.artistJa.value = "ユク・ソンジェ(BTOB)";
  form.album.value = "All About Blue";
  form.lyricist.value = "作詞者名";
  form.language.value = "混在";
  form.youtubeUrl.value = "https://www.youtube.com/watch?v=example";
  form.lyrics.value = [
    "항상 그랬었어 언제나 불안했어",
    "결국 너를 잃어버릴까 봐",
    "",
    "[AD]",
    "",
    "내 가슴 깊숙이 새겨두었던 그 말",
    "변치 않겠다는 그 거짓말",
    "I don't wanna let you go"
  ].join("\n");
});

function setBusy(isBusy, message = "") {
  generateButton.disabled = isBusy;
  generateButton.textContent = isBusy ? "生成中" : "HTML生成";
  if (message) statusText.textContent = message;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  showToast("コピーしました");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function applyPendingDraft() {
  const item = readPendingDraft();
  if (!item) return;
  applySongToDraftForm(item);
  localStorage.removeItem(PENDING_DRAFT_KEY);
  showToast("曲情報に反映しました");
}

function readPendingDraft() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}

function applySongToDraftForm(item) {
  form.artist.value = item.artist;
  form.songTitle.value = item.songTitle;
  form.artistJa.value = item.artistJa;
  form.altTitle.value = item.altTitle;
  form.album.value = item.album;
  form.lyricist.value = item.lyricist;
}
