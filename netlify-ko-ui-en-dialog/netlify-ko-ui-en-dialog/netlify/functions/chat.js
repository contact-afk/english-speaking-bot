// netlify/functions/chat.js
module.exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: JSON.stringify({
      ok: true, node: process.version, hasKey: !!process.env.OPENAI_API_KEY,
    })};
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function openaiChatWithRetry(payload, apiKey, tries = 3) {
    let delay = 600;
    for (let i = 1; i <= tries; i++) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      if (resp.ok) return resp;
      if (resp.status === 429 && i < tries) { await sleep(delay); delay *= 2; continue; }
      return resp;
    }
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      history = [], user = "", sessionId = "",
      book = {},                      // {title, summary, ...} (선택)
      remainingQuestions = [],        // 클라에서 남은 질문만 넘김(없어도 OK)
    } = body;

    const nextPlanned = Array.isArray(remainingQuestions) && remainingQuestions.length
      ? String(remainingQuestions[0])
      : "";

    const bookText = [
      book?.title ? `Book title: ${book.title}` : "",
      book?.summary ? `Book summary: ${book.summary}` : "",
    ].filter(Boolean).join("\n");

    // 시스템 프롬프트: JSON만, 질문은 매 턴 1개
    const systemPrompt = [
      "You are a supportive English speaking tutor for young learners.",
      "Speak only English. Keep each reply short (≈1–2 sentences).",
      "Every turn:",
      "1) Briefly react to the student's message (one short sentence).",
      "2) Ask exactly ONE clear follow-up question.",
      "3) Optionally add ONE short practice tip (grammar/connector/phrase).",
      "",
      bookText,
      nextPlanned
        ? `Use THIS exact question now: "${nextPlanned}". If it contains a page hint like [page 4-5], remind the learner to check those pages.`
        : "No fixed question list now. Continue a free discussion based on the book and the student's ideas.",
      "",
      "Return ONLY a valid JSON object with keys:",
      "- bot_text: string (your short reaction + the question),",
      "- next_question: string (repeat the single question you asked),",
      "- practice_tip: string (optional).",
    ].join("\n");

    const msgs = [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
      { role: "user", content: user || "(no input)" }
    ];

    const payload = { model: "gpt-4o-mini", temperature: 0.6, max_tokens: 220, messages: msgs };
    const resp = await openaiChatWithRetry(payload, process.env.OPENAI_API_KEY);
    const text = await resp.text();
    if (!resp.ok) return { statusCode: resp.status, body: text };

    // 모델이 content에 JSON 문자열을 넣으므로 파싱
    let out;
    try {
      const j = JSON.parse(text);
      const content = j?.choices?.[0]?.message?.content ?? "";
      out = typeof content === "string" ? JSON.parse(content) : {};
    } catch {
      out = {};
    }
    if (!out || typeof out !== "object") out = {};
    if (!out.bot_text) out.bot_text = "Let's continue.";
    if (typeof out.next_question !== "string") out.next_question = "";

    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
