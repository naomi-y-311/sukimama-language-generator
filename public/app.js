const form = document.querySelector("#draftForm");
const statusText = document.querySelector("#status");
const postTitle = document.querySelector("#postTitle");
const htmlOutput = document.querySelector("#htmlOutput");
const copyTitleButton = document.querySelector("#copyTitleButton");
const copyHtmlButton = document.querySelector("#copyHtmlButton");
const generateButton = document.querySelector("#generateButton");
const sampleButton = document.querySelector("#sampleButton");
const toast = document.querySelector("#toast");
const todoForm = document.querySelector("#todoForm");
const todoList = document.querySelector("#todoList");
const todoSaveButton = document.querySelector("#todoSaveButton");
const todoCancelButton = document.querySelector("#todoCancelButton");
const TODO_STORAGE_KEY = "sukimamaSongTodos";
let toastTimer;
let songTodos = loadSongTodos();

renderSongTodos();

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(todoForm);
  const item = {
    id: formData.get("todoId") || crypto.randomUUID(),
    artist: String(formData.get("todoArtist") || "").trim(),
    songTitle: String(formData.get("todoSongTitle") || "").trim(),
    artistJa: String(formData.get("todoArtistJa") || "").trim(),
    altTitle: String(formData.get("todoAltTitle") || "").trim(),
    album: String(formData.get("todoAlbum") || "").trim(),
    lyricist: String(formData.get("todoLyricist") || "").trim(),
    memo: String(formData.get("todoMemo") || "").trim(),
    completed: songTodos.find((todo) => todo.id === formData.get("todoId"))?.completed || false,
    updatedAt: new Date().toISOString()
  };

  if (!item.artist || !item.songTitle) return;

  const existingIndex = songTodos.findIndex((todo) => todo.id === item.id);
  if (existingIndex >= 0) {
    songTodos[existingIndex] = item;
    showToast("更新しました");
  } else {
    songTodos.unshift(item);
    showToast("追加しました");
  }

  saveSongTodos();
  renderSongTodos();
  resetTodoForm();
});

todoCancelButton.addEventListener("click", resetTodoForm);

todoList.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const item = songTodos.find((todo) => todo.id === actionButton.dataset.id);
  if (!item) return;

  if (actionButton.dataset.action === "load") {
    applyTodoToDraftForm(item);
    showToast("曲情報に反映しました");
  }

  if (actionButton.dataset.action === "edit") {
    editTodo(item);
  }
});

todoList.addEventListener("change", (event) => {
  if (!event.target.matches("[data-action='toggle']")) return;
  const item = songTodos.find((todo) => todo.id === event.target.dataset.id);
  if (!item) return;
  item.completed = event.target.checked;
  item.updatedAt = new Date().toISOString();
  saveSongTodos();
  renderSongTodos();
});

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
  form.memo.value = "サンプルメモ";
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

function loadSongTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveSongTodos() {
  localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(songTodos));
}

function renderSongTodos() {
  if (songTodos.length === 0) {
    todoList.innerHTML = '<p class="empty-list">まだ曲がありません。</p>';
    return;
  }

  todoList.innerHTML = songTodos
    .map((item) => {
      const id = escapeHtml(item.id);
      const title = escapeHtml(item.songTitle);
      const artist = escapeHtml(item.artist);
      const subInfo = [item.altTitle, item.artistJa, item.album].filter(Boolean).map(escapeHtml).join(" / ");
      const memo = item.memo ? `<p class="todo-memo">${escapeHtml(item.memo)}</p>` : "";
      return `
        <article class="todo-item ${item.completed ? "is-completed" : ""}">
          <label class="todo-check">
            <input type="checkbox" data-action="toggle" data-id="${id}" ${item.completed ? "checked" : ""}>
            <span></span>
          </label>
          <div class="todo-content">
            <p class="todo-title">${title}</p>
            <p class="todo-artist">${artist}</p>
            ${subInfo ? `<p class="todo-sub">${subInfo}</p>` : ""}
            ${memo}
          </div>
          <div class="todo-item-actions">
            <button class="ghost small" type="button" data-action="load" data-id="${id}">反映</button>
            <button class="ghost small" type="button" data-action="edit" data-id="${id}">編集</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function editTodo(item) {
  todoForm.todoId.value = item.id;
  todoForm.todoArtist.value = item.artist;
  todoForm.todoSongTitle.value = item.songTitle;
  todoForm.todoArtistJa.value = item.artistJa;
  todoForm.todoAltTitle.value = item.altTitle;
  todoForm.todoAlbum.value = item.album;
  todoForm.todoLyricist.value = item.lyricist;
  todoForm.todoMemo.value = item.memo;
  todoSaveButton.textContent = "更新";
  todoCancelButton.hidden = false;
  todoForm.todoArtist.focus();
}

function resetTodoForm() {
  todoForm.reset();
  todoForm.todoId.value = "";
  todoSaveButton.textContent = "リストに追加";
  todoCancelButton.hidden = true;
}

function applyTodoToDraftForm(item) {
  form.artist.value = item.artist;
  form.songTitle.value = item.songTitle;
  form.artistJa.value = item.artistJa;
  form.altTitle.value = item.altTitle;
  form.album.value = item.album;
  form.lyricist.value = item.lyricist;
  form.memo.value = item.memo;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
