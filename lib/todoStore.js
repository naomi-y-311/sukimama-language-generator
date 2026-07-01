import { randomUUID } from "node:crypto";

const DEFAULT_COLLECTION = "songTodos";
const TODO_FIELDS = ["artist", "songTitle", "artistJa", "altTitle", "album", "lyricist", "memo"];

let firestorePromise;

export async function listTodos() {
  const db = await getFirestoreDb();
  const snapshot = await db.collection(getCollectionName()).get();
  return snapshot.docs
    .map((doc) => normalizeTodo({ id: doc.id, ...doc.data() }))
    .sort((a, b) => String(b.createdAt || b.updatedAt).localeCompare(String(a.createdAt || a.updatedAt)));
}

export async function upsertTodo(rawTodo = {}) {
  const db = await getFirestoreDb();
  const collection = db.collection(getCollectionName());
  const id = normalizeTodoId(rawTodo.id);
  const now = new Date().toISOString();
  const docRef = collection.doc(id);
  const existing = await docRef.get();
  const existingData = existing.exists ? existing.data() : {};
  const todo = normalizeTodo({
    ...existingData,
    ...rawTodo,
    id,
    createdAt: existingData?.createdAt || rawTodo.createdAt || now,
    updatedAt: now
  });

  if (!todo.artist || !todo.songTitle) {
    const error = new Error("アーティスト名と曲名を入力してください。");
    error.status = 400;
    throw error;
  }

  await docRef.set(todo);
  return todo;
}

function normalizeTodo(rawTodo = {}) {
  const todo = {
    id: normalizeTodoId(rawTodo.id),
    completed: Boolean(rawTodo.completed),
    createdAt: String(rawTodo.createdAt || rawTodo.updatedAt || new Date().toISOString()),
    updatedAt: String(rawTodo.updatedAt || rawTodo.createdAt || new Date().toISOString())
  };

  for (const field of TODO_FIELDS) {
    todo[field] = String(rawTodo[field] || "").trim();
  }

  return todo;
}

function normalizeTodoId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{8,120}$/.test(id) ? id : randomUUID();
}

function getCollectionName() {
  return process.env.FIREBASE_TODOS_COLLECTION || DEFAULT_COLLECTION;
}

async function getFirestoreDb() {
  if (!firestorePromise) {
    firestorePromise = createFirestoreDb();
  }
  return firestorePromise;
}

async function createFirestoreDb() {
  const serviceAccount = getFirebaseServiceAccount();
  const [{ cert, getApps, initializeApp }, { getFirestore }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore")
  ]);

  const appName = "sukimama-language-generator";
  const app =
    getApps().find((candidate) => candidate.name === appName) ||
    initializeApp({ credential: cert(serviceAccount) }, appName);

  return getFirestore(app);
}

function getFirebaseServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const raw = json || (base64 ? Buffer.from(base64, "base64").toString("utf8") : "");

  if (!raw) {
    const error = new Error("Firebaseの環境変数を設定してください。");
    error.status = 500;
    throw error;
  }

  try {
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    return serviceAccount;
  } catch {
    const error = new Error("Firebaseの環境変数を読み込めませんでした。");
    error.status = 500;
    throw error;
  }
}
