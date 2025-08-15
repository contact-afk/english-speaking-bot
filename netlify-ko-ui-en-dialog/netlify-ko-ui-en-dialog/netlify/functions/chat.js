// netlify/functions/chat.js
export async function handler(event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const { history = [], user = "", sessionId = "session", endSession = false } = body;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }

    const systemPrompt = [
      "You are a supportive English speaking tutor for young learners.",
      "Language: English only. Keep sentences short enough to be spoken in under ~12 seconds.",
      "Each turn:", "1) Brief feedback on the previous answer.", "2) One short practice tip (e.g., verb tense, connectors).",
      "3) ONE open-ended follow-up question.", "Avoid multiple choice. Use gentle scaffolding if the learner struggles.",
      "If you receive [SYSTEM_REQUEST_OPENING_QUESTION], start with a friendly opener about the story.",
      "If you receive [SYSTEM_END_SESSION], produce a compact JSON summary with strengths[], needs[], and examples[]."
    ].join(" ");

    const messages = [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: user }];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.7, max_tokens: 280, messages })
    });
    if (!resp.ok) {
      const t = await resp.text(); return { statusCode: 500, body: JSON.stringify({ error: "OpenAI error", detail: t }) };
    }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "Okay.";
    const sentences = raw.split(/(?<=[\.!?])\s+/);
    const question = sentences.reverse().find(s => /\?$/.test(s)) || null;
    sentences.reverse();
    const withoutQ = question ? raw.replace(question, '').trim() : raw;

    let practiceTip = null;
    const tipMatch = withoutQ.match(/(?:Tip|Practice)\s*:\s*([^\.!?]+)[\.!?]?/i);
    if (tipMatch) practiceTip = "Practice: " + tipMatch[1].trim() + ".";

    // quick running summary
    const sumPrompt = [
      { role: "system", content: "Summarize briefly as JSON with keys: strengths[], needs[], examples[]. Under 80 words, English only." },
      ...history.slice(-10),
      { role: "user", content: "Summarize the learner's speaking so far in the required JSON format." }
    ];
    const sumResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.2, max_tokens: 160, messages: sumPrompt })
    });
    let session_summary = null;
    if (sumResp.ok) {
      const sumData = await sumResp.json();
      const sumText = sumData.choices?.[0]?.message?.content?.trim() || "{}";
      try { session_summary = JSON.parse(sumText); } catch { session_summary = { note: sumText }; }
    }

    return { statusCode: 200, body: JSON.stringify({ bot_text: withoutQ || raw, next_question: question, practice_tip: practiceTip, session_summary }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }
}
