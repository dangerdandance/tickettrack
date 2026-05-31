const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const CATEGORY_MAP = {
  Despensa: "despensa", Restaurantes: "restaurantes", Farmacia: "farmacia",
  Compras: "compras", Formación: "formacion", Entretenimiento: "entretenimiento",
  Servicios: "servicios", Vivienda: "vivienda",
};

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const token = process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: "GOOGLE_ACCESS_TOKEN not configured" });

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/'Hoja 1'!A2:I`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!data.values || data.values.length === 0) return res.status(200).json([]);
    const tickets = data.values.map((row, i) => ({
      _id: row[8] || `sheet_${i}`,
      fecha: row[1] || "",
      tienda: row[2] || "",
      categoria_sugerida: CATEGORY_MAP[row[3]] || row[3] || "",
      categoria_label: row[3] || "",
      total: parseFloat(row[4]) || 0,
      moneda: row[5] || "MXN",
      items: row[6] ? row[6].split(", ").map((d) => ({ descripcion: d, precio: 0 })) : [],
      notas: row[7] || "",
      sheetSaved: true,
      confirmedAt: row[0] || "",
    }));
    res.status(200).json(tickets);
  } catch (e) {
    console.error("Load error:", e);
    res.status(500).json({ error: e.message });
  }
}
