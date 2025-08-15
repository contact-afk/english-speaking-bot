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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function openaiChatWithRetry(payload, apiKey, tries = 3) {
    let delay = 600;
    for (let i = 1; i <= tries; i++) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) return resp;
      if (resp.status === 429 && i < tries) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      return resp;
    }
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      history = [],                // [{role:'user'|'assistant', content:'...'}]
      user = "",
      sessionId = "",
      book = {},                   // {title, summary, chapter, characters, vocab}
      current_question = "",
      remainingQuestions = [],     // ["Q1","Q2",...], 서버는 0번을 우선 사용
    } = body;

    // --- 현재/다음 질문 파생 ---
    const fixedQ   = (remainingQuestions && remainingQuestions[0]) || current_question || "";
    const nextOfList = (remainingQuestions && remainingQuestions[1]) || "";

    // --- 책 정보 텍스트 ---
    const bookText = [
      book?.title ? `Title: ${book.title}` : "",
      book?.summary ? `Summary: ${book.summary}` : "",
      book?.chapter ? `Chapter: ${book.chapter}` : "",
      book?.characters ? `Characters: ${book.characters}` : "",
      book?.vocab ? `Key vocabulary: ${book.vocab}` : "",
    ].filter(Boolean).join("\n");

    // --- 시스템 프롬프트: 대화형 피드백 + 다음 질문 + 진도 판단 ---
    const systemPrompt = [
      "You are a supportive English speaking tutor for young learners.",
      "Speak only English. Keep each response under ~12 seconds when spoken.",
      "Return ONLY one JSON object with keys:",
      "  - bot_text: one or two sentences that (a) briefly react to the student and (b) give micro feedback (clarify, paraphrase, or affirm) using their ideas.",
      "  - next_question: exactly ONE clear follow-up question. If a fixed list is provided, use the NEXT item; otherwise create a sensible discussion question about the book.",
      "  - practice_tip (optional): one short tip (connector/grammar/phrase).",
      "  - advance: true/false – set true ONLY if the student basically answered the current question; otherwise false to keep the same question.",
      "",
      "Context about the book and goals:",
      bookText || "(no extra book context)",
      "",
      fixedQ ? `Current question: ${fixedQ}` : "Current question: (none)",
      nextOfList ? `Upcoming question: ${nextOfList}` : "No upcoming fixed question.",
      "",
      "Constraints:",
      "- bot_text must not be a bare question; it should include a short reaction/feedback to what the student said.",
      "- next_question should be a single clear question.",
      "- Return strictly one JSON object; no extra text."
    ].join("\n");

    // --- 메시지 구성 ---
    const msgs = [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role === "assistant" ? "assistant" : "user", content: h.content })),
      { role: "user", content: user || "(no input)" }
    ];

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 220,
      response_format: { type: "json_object" }, // ✅ JSON 강제
      messages: msgs,
    };

    const resp = await openaiChatWithRetry(payload, process.env.OPENAI_API_KEY);
    const text = await resp.text();

    if (!resp.ok) {
      return { statusCode: resp.status, body: text };
    }

    // 모델이 준 JSON 파싱
    let out;
    try {
      const data = JSON.parse(text);
      // 일부 모델은 content에 JSON 문자열을 넣기도 함
      out = data?.choices?.[0]?.message?.content
        ? JSON.parse(data.choices[0].message.content)
        : data;
    } catch {
      out = {};
    }

    // 안전 보정
    if (!out || typeof out !== "object") out = {};
    if (!out.bot_text) out.bot_text = "Let's continue.";
    if (typeof out.next_question !== "string") out.next_question = "";
    if (typeof out.advance !== "boolean") out.advance = false;

    return { statusCode: 200, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
};
