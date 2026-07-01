const todoForm = document.querySelector("#todoForm");
const todoList = document.querySelector("#todoList");
const todoSaveButton = document.querySelector("#todoSaveButton");
const todoCancelButton = document.querySelector("#todoCancelButton");
const todoOptionalFields = document.querySelector("#todoOptionalFields");
const todoSearchInput = document.querySelector("#todoSearchInput");
const hideCompletedInput = document.querySelector("#hideCompletedInput");
const toast = document.querySelector("#toast");
const TODO_STORAGE_KEY = "sukimamaSongTodos";
const PENDING_DRAFT_KEY = "sukimamaPendingDraft";
const MOBILE_QUERY = "(max-width: 640px)";
const mobileMedia = window.matchMedia(MOBILE_QUERY);
let toastTimer;
let songTodos = [];

syncOptionalFields();
initSongTodos();

todoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFormBusy(true);
  const formData = new FormData(todoForm);
  const existingTodo = songTodos.find((todo) => todo.id === formData.get("todoId"));
  const item = {
    id: formData.get("todoId") || crypto.randomUUID(),
    artist: String(formData.get("todoArtist") || "").trim(),
    songTitle: String(formData.get("todoSongTitle") || "").trim(),
    artistJa: String(formData.get("todoArtistJa") || "").trim(),
    altTitle: String(formData.get("todoAltTitle") || "").trim(),
    album: String(formData.get("todoAlbum") || "").trim(),
    lyricist: String(formData.get("todoLyricist") || "").trim(),
    memo: String(formData.get("todoMemo") || "").trim(),
    completed: existingTodo?.completed || false,
    createdAt: existingTodo?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!item.artist || !item.songTitle) {
    setFormBusy(false);
    return;
  }

  try {
    const savedItem = await saveSongTodo(item);
    const existingIndex = songTodos.findIndex((todo) => todo.id === savedItem.id);
    if (existingIndex >= 0) {
      songTodos[existingIndex] = savedItem;
      showToast("更新しました");
    } else {
      songTodos.unshift(savedItem);
      showToast("追加しました");
    }

    sortSongTodos();
    renderSongTodos();
    resetTodoForm();
  } catch (error) {
    showToast(error.message);
  } finally {
    setFormBusy(false);
  }
});

todoCancelButton.addEventListener("click", resetTodoForm);

todoSearchInput.addEventListener("input", renderSongTodos);
hideCompletedInput.addEventListener("change", renderSongTodos);

mobileMedia.addEventListener("change", syncOptionalFields);

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

todoList.addEventListener("change", async (event) => {
  if (!event.target.matches("[data-action='toggle']")) return;
  const item = songTodos.find((todo) => todo.id === event.target.dataset.id);
  if (!item) return;

  event.target.disabled = true;
  try {
    const savedItem = await saveSongTodo({
      ...item,
      completed: event.target.checked,
      updatedAt: new Date().toISOString()
    });
    songTodos = songTodos.map((todo) => (todo.id === savedItem.id ? savedItem : todo));
    renderSongTodos();
  } catch (error) {
    showToast(error.message);
    renderSongTodos();
  }
});

async function initSongTodos() {
  renderListMessage("読み込んでいます...");

  try {
    songTodos = await fetchSongTodos();
    await migrateLocalSongTodosIfNeeded();
    sortSongTodos();
    renderSongTodos();
  } catch (error) {
    renderListMessage(error.message, true);
  }
}

async function fetchSongTodos() {
  const response = await fetch("/api/todos");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "リストを読み込めませんでした。");
  return Array.isArray(data.items) ? data.items : [];
}

async function saveSongTodo(item) {
  const response = await fetch("/api/todos", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "保存できませんでした。");
  return data.item;
}

async function migrateLocalSongTodosIfNeeded() {
  const localTodos = loadLocalSongTodos();
  if (songTodos.length > 0 || localTodos.length === 0) return;

  const migrated = [];
  for (const item of localTodos) {
    migrated.push(await saveSongTodo(item));
  }

  songTodos = migrated;
  localStorage.removeItem(TODO_STORAGE_KEY);
  showToast("ブラウザ内のリストを移行しました");
}

function loadLocalSongTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function sortSongTodos() {
  songTodos.sort((a, b) => String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt)));
}

function renderSongTodos() {
  if (songTodos.length === 0) {
    todoList.innerHTML = '<p class="empty-list">まだ曲がありません。</p>';
    return;
  }

  const visibleTodos = getVisibleSongTodos();
  if (visibleTodos.length === 0) {
    todoList.innerHTML = '<p class="empty-list">条件に合う曲がありません。</p>';
    return;
  }

  todoList.innerHTML = visibleTodos
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

function renderListMessage(message, isError = false) {
  todoList.innerHTML = `<p class="empty-list ${isError ? "is-error" : ""}">${escapeHtml(message)}</p>`;
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
  todoOptionalFields.open = true;
  todoSaveButton.textContent = "更新";
  todoCancelButton.hidden = false;
  todoForm.todoArtist.focus();
}

function resetTodoForm() {
  todoForm.reset();
  todoForm.todoId.value = "";
  todoSaveButton.textContent = "リストに追加";
  todoCancelButton.hidden = true;
  syncOptionalFields();
}

function setFormBusy(isBusy) {
  todoSaveButton.disabled = isBusy;
  todoCancelButton.disabled = isBusy;
  todoSaveButton.textContent = isBusy ? "保存中" : todoForm.todoId.value ? "更新" : "リストに追加";
}

function getVisibleSongTodos() {
  const query = normalizeSearchText(todoSearchInput.value);
  const shouldHideCompleted = hideCompletedInput.checked;

  return songTodos.filter((item) => {
    if (shouldHideCompleted && item.completed) return false;
    if (!query) return true;

    return [item.songTitle, item.altTitle, item.artist, item.artistJa]
      .map(normalizeSearchText)
      .some((value) => value.includes(query));
  });
}

function normalizeSearchText(value) {
  return String(value || "").replaceAll("　", " ").trim().toLowerCase();
}

function syncOptionalFields() {
  if (!mobileMedia.matches) {
    todoOptionalFields.open = true;
    return;
  }

  if (!todoForm.todoId.value) {
    todoOptionalFields.open = false;
  }
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
