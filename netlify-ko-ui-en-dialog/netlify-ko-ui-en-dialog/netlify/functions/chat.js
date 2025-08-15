// netlify/functions/chat.js
module.exports.handler = async (event) => {
  // 헬스체크(브라우저로 GET 테스트용)
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        node: process.version,
        hasKey: !!process.env.OPENAI_API_KEY,
      }),
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!process.env.OPENAI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };
  }

  // ----- 429 완화: 지수 백오프 재시도 -----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function openaiChatWithRetry(payload, apiKey, maxTries = 3) {
    let delay = 600;
    for (let i = 1; i <= maxTries; i++) {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) return resp;
      if (resp.status === 429 && i < maxTries) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      return resp;
    }
  }

  try {
    const { messages } = JSON.parse(event.body || '{}');
    const payload = {
      model: "gpt-4o-mini",
      messages: messages || [{ role: "user", content: "Hello" }],
      max_tokens: 300,
    };

    const resp = await openaiChatWithRetry(payload, process.env.OPENAI_API_KEY);
    const text = await resp.text();
    // 성공/실패 코드 그대로 반환 (디버깅 쉬움)
    return { statusCode: resp.status, body: text };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
