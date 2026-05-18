export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || !mimeType) return res.status(400).json({ error: "Missing image data" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
              {
                type: "text",
                text: `Analiza este ticket/recibo de compra y extrae la información. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin backticks:
{
  "tienda": "nombre del establecimiento",
  "fecha": "DD/MM/YYYY",
  "total": 123.45,
  "moneda": "MXN",
  "items": [{"descripcion": "...", "cantidad": 1, "precio": 0.0}],
  "categoria_sugerida": "despensa|restaurantes|farmacia|compras|formacion|entretenimiento|servicios|vivienda",
  "notas": "observaciones breves"
}
Si no puedes leer algún dato, usa null. La categoría debe ser una de las opciones listadas.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
console.log("CLAUDE RESPONSE:", cleaned);
const parsed = JSON.parse(cleaned);
console.log("PARSED:", JSON.stringify(parsed));
res.status(200).json(parsed);
  } catch (e) {
    console.error("Analyze error:", e);
    res.status(500).json({ error: e.message });
  }
}
