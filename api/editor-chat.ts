// api/editor-chat.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "https://YOUR-FRAMER-DOMAIN"); // set your domain
  res.flushHeaders?.();

  const { message } = req.body as { message: string };

  const system = [
    "You are a senior magazine editor.",
    "Always start with: This sounds like one for our [section] section.",
    "Then: gut take, 3–6 questions, hed+dek, decision.",
    "Use short, plain sentences. Use metric units."
  ].join(" ");

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",           // pick your model
      stream: true,
      input: [
        { role: "system", content: system },
        { role: "user", content: message }
      ]
    })
  });

  if (!resp.ok || !resp.body) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Upstream error" })}\n\n`);
    return res.end();
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });

    // Pipe OpenAI stream chunks as SSE data lines
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;
      res.write(`data: ${line}\n\n`);
    }
  }

  res.write("data: [DONE]\n\n");
  res.end();
}
