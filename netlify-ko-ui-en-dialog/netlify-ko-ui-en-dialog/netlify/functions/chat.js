module.exports.handler = async (event) => {
  // GET: 환경 확인
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

  try {
    const { messages } = JSON.parse(event.body || '{}');

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages || [{ role: 'user', content: 'Hello' }],
      }),
    });

    const text = await resp.text();
    // 성공이든 실패든 상태코드 그대로 반환
    return { statusCode: resp.status, body: text };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
