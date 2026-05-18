export const config = { api: { bodyParser: { sizeLimit: "20mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { imageBase64, mimeType } = req.body;

  if (!imageBase64 || !mimeType) {
    console.error("Missing image data", { hasBase64: !!imageBase64, mimeType });
    return res.status(400).json({ error: "Missing image data" });
  }

  console.log("Image received, size:", imageBase64.length, "mimeType:", mimeType);

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
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: imageBase64 },
              },
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
    console.log("Anthropic status:", response.status);
    console.log("Anthropic response:", JSON.stringify(data).slice(0, 500));

    if (!response.ok) {
      console.error("Anthropic error:", data);
      return res.status(500).json({ error: "Anthropic API error: " + JSON.stringify(data) });
    }

    const text = data.content?.[0]?.text || "{}";
    console.log("Raw text from Claude:", text.slice(0, 300));

    const cleaned = text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr.message, "text was:", cleaned);
      return res.status(500).json({ error: "Could not parse Claude response: " + cleaned });
    }

    console.log("Parsed result:", JSON.stringify(parsed));
    res.status(200).json(parsed);
  } catch (e) {
    console.error("Analyze error:", e.message);
    res.status(500).json({ error: e.message });
  }
}
