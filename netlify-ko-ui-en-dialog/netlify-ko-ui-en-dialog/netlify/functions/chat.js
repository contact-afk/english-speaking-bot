// netlify/functions/chat.js
module.exports.handler = async (event) => {
  if (event.httpMethod === "GET") {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        node: process.version,
        hasKey: !!process.env.OPENAI_API_KEY,
      }),
    };
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
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
      history = [],         // [{role:'user'|'assistant', content:'...'}]
      user = "",            // 현재 턴의 학생 발화
      sessionId = "",
      endSession = false,
      book = {},            // { title, summary, chapter, characters, vocab, ... }
      questionList = [],    // ["Q1", "Q2", ...]
    } = body;

    // --- 시스템 프롬프트(책/질문리스트 반영) ---
    const bookText = [
      book?.title ? `Title: ${book.title}` : "",
      book?.summary ? `Summary: ${book.summary}` : "",
      book?.chapter ? `Chapter: ${book.chapter}` : "",
      book?.characters ? `Characters: ${book.characters}` : "",
      book?.vocab ? `Key vocabulary: ${book.vocab}` : "",
    ].filter(Boolean).join("\n");

    const listText = questionList?.length
      ? `Preferred question list (use in order when relevant, but adapt to student's replies):\n- ${questionList.join("\n- ")}`
      : "If no list is given, generate suitable comprehension/speaking questions based on the book info.";

    const systemPrompt = [
      "You are a supportive English speaking tutor for young learners.",
      "Speak only English. Keep replies short (under ~12 seconds when spoken).",
      "Each turn:",
      "1) Acknowledge or briefly react to the student's message (1 short sentence).",
      "2) Ask exactly ONE clear follow-up question related to the book or the student's idea.",
      "3) Optionally give 1 short practice tip (grammar/connector/phrase).",
      "If the student goes off the script, adapt and bring them back gently.",
      "Return ONLY valid JSON with keys: bot_text, next_question, practice_tip (optional). No prose outside JSON.",
      "",
      bookText,
      listText
    ].join("\n");

    // --- 메시지 구성: system + history + user ---
    const msgs = [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
      { role: "user", content: user || "(no input)" }
    ];

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 220,
      messages: msgs,
    };

    const resp = await openaiChatWithRetry(payload, process.env.OPENAI_API_KEY);
    const text = await resp.text();

    if (!resp.ok) {
      // 401/404/429 등은 그대로 돌려보냄
      return { statusCode: resp.status, body: text };
    }

    // 모델이 JSON만 내도록 했지만, 방어적으로 파싱
    let out;
    try {
      const data = JSON.parse(text);
      out = data?.choices?.[0]?.message?.content
        ? JSON.parse(data.choices[0].message.content)
        : data; // 혹시 바로 JSON을 냈다면
    } catch {
      // 마지막 방어: 텍스트를 그대로 bot_text에 넣기
      out = { bot_text: text, next_question: "" };
    }

    // 최종 보정
    if (!out || typeof out !== "object") out = { bot_text: "Let's continue.", next_question: "What do you think?" };
    if (!out.bot_text) out.bot_text = "Let's continue.";
    if (typeof out.next_question !== "string") out.next_question = "";

    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
