// api/editor-chat.ts
// Streams replies from your "Editor" GPT to the browser via SSE.

import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED_ORIGIN = "https://YOUR-SITE.framer.website"; // <-- change this to your published Framer origin

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS (includes preflight)
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Read user message (Vercel parses JSON when header is application/json)
  const { message } = (req.body as { message?: string }) ?? {};
  const userMessage = (message ?? "").toString().trim();

  if (!process.env.OPENAI_API_KEY) {
    res.write(`data: ${JSON.stringify({ error: "Missing OPENAI_API_KEY" })}\n\n`);
    res.end();
    return;
  }
  if (!userMessage) {
    res.write(`data: ${JSON.stringify({ error: "Empty message" })}\n\n`);
    res.end();
    return;
  }

  // System prompt for your editor persona
  const systemPrompt = [
    "You are a senior magazine editor.",
    "Always start with: This sounds like one for our [section] section.",
    "Then give a gut take, 3–6 questions, a headline and dek, and a decision (greenlight/revise/pass).",
    "Use short sentences and plain language. Use metric units."
  ].join(" ");

  try {
    // Call OpenAI Responses API with streaming
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini", // change if you prefer another model
        stream: true,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      res.write(`data: ${JSON.stringify({ error: "Upstream error" })}\n\n`);
      res.end();
      return;
    }

    // Relay the OpenAI stream as SSE
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      // OpenAI sends "data: {...}\n\n" lines already; forward them
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        res.write(`data: ${line.replace(/^data:\s*/, "")}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err?.message || "Server error" })}\n\n`);
    res.end();
  }
}
