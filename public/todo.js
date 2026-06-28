const todoForm = document.querySelector("#todoForm");
const todoList = document.querySelector("#todoList");
const todoSaveButton = document.querySelector("#todoSaveButton");
const todoCancelButton = document.querySelector("#todoCancelButton");
const toast = document.querySelector("#toast");
const TODO_STORAGE_KEY = "sukimamaSongTodos";
const PENDING_DRAFT_KEY = "sukimamaPendingDraft";
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
    localStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(item));
    window.location.href = "/";
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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
