import { generateDraft } from "../server.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const draft = await generateDraft(req.body || {}, req.headers || {});
    res.status(200).json(draft);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ error: error.message || "Unexpected error" });
  }
}
