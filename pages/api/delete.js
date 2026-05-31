export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).end();
  const { ticketId } = req.body;
  if (!ticketId) return res.status(400).json({ error: "Missing ticketId" });

  const token = process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) return res.status(500).json({ error: "GOOGLE_ACCESS_TOKEN not configured" });

  try {
    // First get all rows to find which row has this ticketId (column I = index 8)
    const getRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/'Hoja 1'!A:I`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await getRes.json();
    if (!data.values) return res.status(404).json({ error: "Sheet empty" });

    // Find the row index (0-based), row 0 is headers
    const rowIndex = data.values.findIndex((row) => row[8] === String(ticketId));
    if (rowIndex === -1) return res.status(404).json({ error: "Ticket not found in sheet" });

    // Get spreadsheet metadata to find the sheet ID
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const meta = await metaRes.json();
    const sheet = meta.sheets?.find(s => s.properties.title === "Hoja 1");
    const sheetId = sheet?.properties?.sheetId ?? 0;

    // Delete the row using batchUpdate
    const deleteRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              }
            }
          }]
        }),
      }
    );

    if (!deleteRes.ok) {
      const err = await deleteRes.text();
      throw new Error(`Delete error: ${deleteRes.status} ${err}`);
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error("Delete error:", e);
    res.status(500).json({ error: e.message });
  }
}
