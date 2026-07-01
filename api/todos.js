import { listTodos, upsertTodo } from "../lib/todoStore.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const items = await listTodos();
      res.status(200).json({ items });
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = parseBody(req.body);
      const item = await upsertTodo((body || {}).item || body || {});
      res.status(200).json({ item });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || "Unexpected error" });
  }
}

function parseBody(body) {
  if (typeof body !== "string") return body || {};
  try {
    return JSON.parse(body || "{}");
  } catch {
    return {};
  }
}
