import { getGoogleToken } from "../../lib/googleAuth";

export const config = { api: { bodyParser: { sizeLimit: "20mb" } } };

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

async function ensureHeaders(token) {
  const checkRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await checkRes.json();
  if (data.values) return;
  const headers = [["Fecha Registro", "Fecha Ticket", "Tienda", "Categoría", "Total (MXN)", "Moneda", "Artículos", "Notas", "Link en Drive", "Archivo", "ID"]];
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/HOJA 1!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: headers }),
    }
  );
}

async function uploadToDrive(token, base64Data, mimeType, fileName) {
  const binaryStr = Buffer.from(base64Data, "base64");
  const boundary = "tickettrack_boundary";
  const metadata = JSON.stringify({ name: fileName, parents: [FOLDER_ID] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    binaryStr,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": body.length,
      },
      body,
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${err}`);
  }
  return await res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { ticket, imageBase64, mimeType } = req.body;
  if (!ticket) return res.status(400).json({ error: "Missing ticket data" });

  try {
    const token = await getGoogleToken();
    await ensureHeaders(token);

    // Upload image to Drive
    let driveLink = null;
    let fileName = null;
    if (imageBase64 && mimeType) {
      fileName = `ticket_${(ticket.tienda || "sin-nombre").replace(/\s+/g, "_")}_${(ticket.fecha || "").replace(/\//g, "-")}_${ticket._id}.jpg`;
      const driveResult = await uploadToDrive(token, imageBase64, mimeType, fileName);
      driveLink = driveResult?.webViewLink || null;
    }

    // Append to Sheet
    const row = [
      new Date().toLocaleDateString("es-MX"),
      ticket.fecha || "",
      ticket.tienda || "",
      ticket.categoria_label || ticket.categoria_sugerida || "",
      ticket.total || 0,
      ticket.moneda || "MXN",
      (ticket.items || []).map((i) => i.descripcion).join(", "),
      ticket.notas || "",
      driveLink || "",
      fileName || "",
      ticket._id || "",
    ];

    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A:K:append?valueInputOption=USER_ENTERED`,
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

    res.status(200).json({ success: true, driveLink, fileName });
  } catch (e) {
    console.error("Save error:", e);
    res.status(500).json({ error: e.message });
  }
}
