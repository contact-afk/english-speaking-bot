// netlify/functions/chat.js
module.exports.handler = async (event) => {
  // GET: 환경 확인
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, node: process.version }),
    };
  }
  // POST: 그냥 200
  if (event.httpMethod === 'POST') {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
  return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
};
