// netlify/functions/summarize.js
module.exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
  }

  try {
    const { transcript, maxWords = 250, lang = "ko" } = JSON.parse(event.body || '{}');
    if (!transcript || !transcript.trim()) {
      return { statusCode: 400, body: JSON.stringify({ error: 'transcript required' }) };
    }

    const sys = lang === "ko"
      ? "You are an expert summarizer. Output clean Korean summary bullets and a concise action list. No preamble."
      : "You are an expert summarizer. Output clean English summary bullets and a concise action list. No preamble.";

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `다음 대화 내용을 ${maxWords}단어 이내 핵심 요약과 할 일 목록으로 정리:\n\n${transcript}` }
      ],
      max_tokens: 600
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    return { statusCode: resp.status, body: text }; // 401/429 등 그대로 전달
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
