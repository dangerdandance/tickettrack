export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

async function ensureHeaders(token) {
  const checkRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Hoja 1!A1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await checkRes.json();
  if (data.values) return;
  const headers = [["Fecha Registro", "Fecha Ticket", "Tienda", "Categoría", "Total (MXN)", "Moneda", "Artículos", "Notas", "ID"]];
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Hoja 1!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: headers }),
    }
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { ticket } = req.body;
  if (!ticket) return res.status(400).json({ error: "Missing ticket data" });

  const token = process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: "GOOGLE_ACCESS_TOKEN not configured" });

  try {
    await ensureHeaders(token);

    const row = [
      new Date().toLocaleDateString("es-MX"),
      ticket.fecha || "",
      ticket.tienda || "",
      ticket.categoria_label || ticket.categoria_sugerida || "",
      ticket.total || 0,
      ticket.moneda || "MXN",
      (ticket.items || []).map((i) => i.descripcion).join(", "),
      ticket.notas || "",
      ticket._id || "",
    ];

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Hoja 1!A:I:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }),
      }
    );

    if (!sheetRes.ok) {
      const err = await sheetRes.text();
      throw new Error(`Sheets error: ${sheetRes.status} ${err}`);
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error("Save error:", e);
    res.status(500).json({ error: e.message });
  }
}
