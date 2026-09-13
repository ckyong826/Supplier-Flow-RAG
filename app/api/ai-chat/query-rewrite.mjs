export async function hypotheticalQuery(question, { apiKey = process.env.DEEPSEEK_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");
  const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Write a short hypothetical SupplierFlow knowledge-base answer for retrieval only. Include likely product names, SKUs, technical terms, units, and policy terms. Do not add a greeting, caveat, source list, or unsupported precision. Return only the hypothetical answer text."
        },
        { role: "user", content: question }
      ]
    })
  });
  if (!response.ok) throw new Error(`HyDE request failed: ${response.status}`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("HyDE response had no text");
  return text.slice(0, 1600);
}
