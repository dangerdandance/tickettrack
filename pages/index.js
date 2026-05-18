import { useState, useRef, useCallback, useEffect } from "react";

const CATEGORIES = [
  { id: "despensa",        label: "Despensa",       icon: "🛒", color: "#4ade80", budget: 20000 },
  { id: "restaurantes",    label: "Restaurantes",    icon: "🍽️", color: "#fb923c", budget: 10000 },
  { id: "farmacia",        label: "Farmacia",        icon: "💊", color: "#f472b6", budget: 2000  },
  { id: "compras",         label: "Compras",         icon: "🛍️", color: "#a78bfa", budget: 8000  },
  { id: "formacion",       label: "Formación",       icon: "📚", color: "#60a5fa", budget: 6000  },
  { id: "entretenimiento", label: "Entretenimiento", icon: "🎬", color: "#fbbf24", budget: 4000  },
  { id: "servicios",       label: "Servicios",       icon: "⚡", color: "#34d399", budget: 5000  },
  { id: "vivienda",        label: "Vivienda",        icon: "🏠", color: "#94a3b8", budget: 15000 },
];

const MONTHLY_BUDGET = 60000;
const SAVINGS_GOAL   = 10000;
const fmt = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(n);

// Compress image to max 1200px and quality 0.8
function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", quality).split(",")[1];
        resolve({ base64: compressed, mimeType: "image/jpeg" });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function TicketTracker() {
  const [tab, setTab]                     = useState("capture");
  const [tickets, setTickets]             = useState([]);
  const [dragging, setDragging]           = useState(false);
  const [processing, setProcessing]       = useState(false);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [editingTicket, setEditingTicket] = useState(null);
  const [toast, setToast]                 = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const fileRef = useRef();

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    (async () => {
      setLoadingHistory(true);
      try {
        const res = await fetch("/api/tickets");
        const data = await res.json();
        if (Array.isArray(data)) setTickets(data);
      } catch (e) { console.error("Load error", e); }
      setLoadingHistory(false);
    })();
  }, []);

  const processFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      showToast("Por favor sube una imagen del ticket", "error");
      return;
    }
    setProcessing(true);
    setCurrentTicket(null);
    try {
      const { base64, mimeType } = await compressImage(file);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const result = await res.json();
      if (result && !result.error) {
        setCurrentTicket({ ...result, _b64: base64, _mime: mimeType, _id: Date.now() });
      } else {
        showToast("No pude leer el ticket. Intenta con mejor iluminación.", "error");
      }
    } catch (e) {
      showToast("Error al analizar el ticket", "error");
    }
    setProcessing(false);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files[0]);
  }, []);

  const confirmTicket = async () => {
    if (!currentTicket) return;
    setProcessing(true);
    const ticket = { ...(editingTicket || currentTicket) };
    const cat = CATEGORIES.find((c) => c.id === ticket.categoria_sugerida);
    ticket.categoria_label = cat?.label || ticket.categoria_sugerida;

    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket, imageBase64: ticket._b64, mimeType: ticket._mime }),
      });
      const data = await res.json();
      if (data.success) {
        const saved = { ...ticket, driveLink: data.driveLink, sheetSaved: true, confirmedAt: new Date().toISOString() };
        setTickets((prev) => [saved, ...prev.filter((t) => t._id !== saved._id)]);
        setCurrentTicket(null);
        setEditingTicket(null);
        showToast("✅ Guardado en Google Sheets y Drive", "success");
        setTab("history");
      } else {
        showToast(`⚠️ Error: ${data.error || "desconocido"}`, "error");
      }
    } catch (e) {
      showToast("⚠️ Error de conexión", "error");
    }
    setProcessing(false);
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear  = now.getFullYear();

  const getWeek = (d) => {
    const date = new Date(d);
    date.setHours(0,0,0,0);
    date.setDate(date.getDate() + 3 - ((date.getDay()+6)%7));
    const w1 = new Date(date.getFullYear(),0,4);
    return 1 + Math.round(((date-w1)/86400000 - 3 + ((w1.getDay()+6)%7))/7);
  };

  const monthTickets = tickets.filter((t) => {
    if (!t.fecha) return false;
    const [,m,y] = t.fecha.split("/");
    return parseInt(m)-1 === currentMonth && parseInt(y) === currentYear;
  });
  const weekTickets = tickets.filter((t) => {
    if (!t.fecha) return false;
    const [d,m,y] = t.fecha.split("/");
    const td = new Date(parseInt(y), parseInt(m)-1, parseInt(d));
    return getWeek(td) === getWeek(now) && td.getFullYear() === currentYear;
  });

  const sumByCat = (arr) =>
    CATEGORIES.map((cat) => ({
      ...cat,
      spent: arr.filter((t) => t.categoria_sugerida === cat.id).reduce((s,t) => s+(parseFloat(t.total)||0), 0),
    }));

  const monthStats = sumByCat(monthTickets);
  const totalMonth = monthStats.reduce((s,c) => s+c.spent, 0);
  const totalWeek  = sumByCat(weekTickets).reduce((s,c) => s+c.spent, 0);

  return (
    <div style={{ minHeight:"100vh", background:"#0a0f1a", color:"#e8eaf0", fontFamily:"'DM Sans',sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;} button:hover{opacity:.85;} input{font-family:inherit;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* HEADER */}
      <header style={{ padding:"20px 24px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #1e2a3a" }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#fff" }}>💳 TicketTrack</div>
          <div style={{ fontSize:12, color:"#5a7a9a", marginTop:2 }}>Control de gastos inteligente</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:11, color:"#5a7a9a" }}>Gasto del mes</div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, color: totalMonth > MONTHLY_BUDGET ? "#f87171" : "#4ade80" }}>
            {fmt(totalMonth)} <span style={{ fontSize:12, color:"#5a7a9a" }}>/ {fmt(MONTHLY_BUDGET)}</span>
          </div>
        </div>
      </header>

      {/* TABS */}
      <nav style={{ display:"flex", borderBottom:"1px solid #1e2a3a", background:"#0d1420" }}>
        {[{ id:"capture", label:"📷 Capturar" }, { id:"dashboard", label:"📊 Dashboard" }, { id:"history", label:"🗂 Historial" }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex:1, padding:"12px 8px", background:"none", border:"none",
            borderBottom: tab===t.id ? "2px solid #60a5fa" : "2px solid transparent",
            color: tab===t.id ? "#60a5fa" : "#5a7a9a",
            fontSize:13, fontWeight: tab===t.id ? 600 : 400, cursor:"pointer",
          }}>{t.label}</button>
        ))}
      </nav>

      {/* TOAST */}
      {toast && (
        <div style={{
          position:"fixed", top:80, left:"50%", transform:"translateX(-50%)",
          background: toast.type==="error" ? "#7f1d1d" : toast.type==="warn" ? "#78350f" : "#14532d",
          color:"#fff", padding:"10px 20px", borderRadius:10, zIndex:100,
          fontSize:14, fontWeight:500, boxShadow:"0 4px 20px rgba(0,0,0,0.4)",
          animation:"fadeIn 0.3s ease", whiteSpace:"nowrap",
        }}>{toast.msg}</div>
      )}

      <main style={{ flex:1, padding:20, maxWidth:600, width:"100%", margin:"0 auto" }}>

        {/* CAPTURE */}
        {tab === "capture" && (
          <div>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, marginBottom:16 }}>Sube tu ticket</h2>
            {!currentTicket && !processing && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  border:`2px dashed ${dragging ? "#60a5fa" : "#2a3a4f"}`, borderRadius:16,
                  padding:"48px 24px", textAlign:"center", cursor:"pointer",
                  background: dragging ? "rgba(96,165,250,0.05)" : "rgba(255,255,255,0.02)", transition:"all 0.2s",
                }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📄</div>
                <div style={{ fontSize:16, fontWeight:600, color:"#c0cfe0" }}>Arrastra tu ticket aquí</div>
                <div style={{ fontSize:13, color:"#5a7a9a", marginTop:6 }}>o toca para seleccionar una foto</div>
                <div style={{ fontSize:11, color:"#3a5068", marginTop:8 }}>JPG, PNG, HEIC — la IA lo analiza automáticamente</div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }}
                  onChange={(e) => processFile(e.target.files[0])} />
              </div>
            )}

            {processing && (
              <div style={{ textAlign:"center", padding:"60px 0" }}>
                <div style={{ fontSize:40, animation:"spin 1s linear infinite", display:"inline-block" }}>⚙️</div>
                <div style={{ marginTop:16, color:"#60a5fa", fontSize:15, fontWeight:500 }}>Analizando ticket con IA...</div>
                <div style={{ color:"#5a7a9a", fontSize:13, marginTop:6 }}>Extrayendo tienda, monto, artículos...</div>
              </div>
            )}

            {currentTicket && !processing && (
              <div style={{ background:"#111827", borderRadius:16, padding:20, border:"1px solid #1e2a3a" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:700, margin:0 }}>✨ Ticket analizado</h3>
                  <span style={{ fontSize:11, background:"#1e3a2f", color:"#4ade80", padding:"3px 10px", borderRadius:20 }}>Listo para guardar</span>
                </div>

                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                  {[{ label:"Tienda", key:"tienda" }, { label:"Fecha", key:"fecha" }, { label:"Total", key:"total" }, { label:"Moneda", key:"moneda" }].map(({ label, key }) => (
                    <div key={key} style={{ background:"#0d1420", borderRadius:10, padding:"10px 14px" }}>
                      <div style={{ fontSize:11, color:"#5a7a9a", marginBottom:4 }}>{label}</div>
                      <input
                        defaultValue={currentTicket[key] ?? ""}
                        onChange={(e) => setEditingTicket((prev) => ({
                          ...(prev || currentTicket),
                          [key]: key==="total" ? parseFloat(e.target.value) : e.target.value,
                        }))}
                        style={{ background:"none", border:"none", color:"#e8eaf0", fontSize:15, fontWeight:600, width:"100%", outline:"none" }}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:"#5a7a9a", marginBottom:8 }}>Categoría</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {CATEGORIES.map((cat) => {
                      const selected = (editingTicket || currentTicket).categoria_sugerida === cat.id;
                      return (
                        <button key={cat.id}
                          onClick={() => setEditingTicket((prev) => ({ ...(prev || currentTicket), categoria_sugerida: cat.id }))}
                          style={{
                            padding:"6px 12px", borderRadius:20,
                            border:`1px solid ${selected ? cat.color : "#2a3a4f"}`,
                            background: selected ? `${cat.color}22` : "transparent",
                            color: selected ? cat.color : "#5a7a9a",
                            fontSize:12, cursor:"pointer", fontWeight: selected ? 600 : 400,
                          }}>{cat.icon} {cat.label}</button>
                      );
                    })}
                  </div>
                </div>

                {(currentTicket.items||[]).length > 0 && (
                  <div style={{ background:"#0d1420", borderRadius:10, padding:12, marginBottom:16 }}>
                    <div style={{ fontSize:11, color:"#5a7a9a", marginBottom:8 }}>Artículos detectados</div>
                    {currentTicket.items.map((item, i) => (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"4px 0", borderBottom: i<currentTicket.items.length-1 ? "1px solid #1a2535":"none" }}>
                        <span>{item.descripcion}</span><span style={{ color:"#60a5fa" }}>{fmt(item.precio)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => { setCurrentTicket(null); setEditingTicket(null); }}
                    style={{ flex:1, padding:"12px", borderRadius:10, border:"1px solid #2a3a4f", background:"transparent", color:"#5a7a9a", fontSize:14, cursor:"pointer" }}>
                    Cancelar
                  </button>
                  <button onClick={confirmTicket}
                    style={{ flex:2, padding:"12px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#2563eb,#7c3aed)", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}>
                    💾 Guardar en Google Sheets
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, marginBottom:4 }}>Dashboard</h2>
            <p style={{ color:"#5a7a9a", fontSize:13, marginBottom:20 }}>
              {now.toLocaleDateString("es-MX", { month:"long", year:"numeric" })}
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
              {[
                { label:"Gasto este mes",  value:fmt(totalMonth), sub:`de ${fmt(MONTHLY_BUDGET)}`, color: totalMonth>MONTHLY_BUDGET?"#f87171":"#4ade80" },
                { label:"Meta de ahorro",  value:fmt(SAVINGS_GOAL), sub: totalMonth<=MONTHLY_BUDGET-SAVINGS_GOAL?"✅ En camino":"⚠️ Revisa gastos", color: totalMonth<=MONTHLY_BUDGET-SAVINGS_GOAL?"#4ade80":"#fbbf24" },
                { label:"Esta semana",     value:fmt(totalWeek), sub:`${weekTickets.length} tickets`, color:"#60a5fa" },
                { label:"Tickets totales", value:tickets.length, sub:"registrados", color:"#a78bfa" },
              ].map((card,i) => (
                <div key={i} style={{ background:"#111827", borderRadius:14, padding:16, border:"1px solid #1e2a3a" }}>
                  <div style={{ fontSize:11, color:"#5a7a9a", marginBottom:8 }}>{card.label}</div>
                  <div style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:card.color }}>{card.value}</div>
                  <div style={{ fontSize:11, color:"#3a5068", marginTop:4 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ background:"#111827", borderRadius:14, padding:16, marginBottom:16, border:"1px solid #1e2a3a" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10, fontSize:13 }}>
                <span style={{ fontWeight:600 }}>Presupuesto mensual</span>
                <span style={{ color:"#5a7a9a" }}>{Math.round((totalMonth/MONTHLY_BUDGET)*100)}%</span>
              </div>
              <div style={{ background:"#1e2a3a", borderRadius:6, height:8, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:6, width:`${Math.min((totalMonth/MONTHLY_BUDGET)*100,100)}%`,
                  background: totalMonth>MONTHLY_BUDGET?"#f87171":totalMonth>MONTHLY_BUDGET*0.8?"#fbbf24":"#4ade80", transition:"width 0.6s ease" }} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:6, fontSize:11, color:"#5a7a9a" }}>
                <span>Gastado: {fmt(totalMonth)}</span>
                <span>Disponible: {fmt(Math.max(MONTHLY_BUDGET-totalMonth-SAVINGS_GOAL,0))}</span>
              </div>
            </div>

            <h3 style={{ fontSize:14, fontWeight:600, color:"#8a9ab0", marginBottom:12 }}>Por categoría — este mes</h3>
            {monthStats.map((cat) => {
              const pct = cat.budget>0 ? Math.min((cat.spent/cat.budget)*100,100) : 0;
              return (
                <div key={cat.id} style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
                    <span>{cat.icon} {cat.label}</span>
                    <span style={{ color: cat.spent>cat.budget?"#f87171":"#8a9ab0" }}>
                      {fmt(cat.spent)} <span style={{ color:"#3a5068" }}>/ {fmt(cat.budget)}</span>
                    </span>
                  </div>
                  <div style={{ background:"#1e2a3a", borderRadius:4, height:5 }}>
                    <div style={{ height:"100%", borderRadius:4, width:`${pct}%`, background: cat.spent>cat.budget?"#f87171":cat.color, transition:"width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY */}
        {tab === "history" && (
          <div>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:700, marginBottom:16 }}>Historial de tickets</h2>
            {loadingHistory ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#5a7a9a" }}>
                <div style={{ fontSize:36, animation:"spin 1s linear infinite", display:"inline-block" }}>⚙️</div>
                <div style={{ marginTop:12, fontSize:14 }}>Cargando desde Google Sheets...</div>
              </div>
            ) : tickets.length === 0 ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#3a5068" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🧾</div>
                <div>No hay tickets registrados</div>
                <div style={{ fontSize:13, marginTop:6 }}>Captura tu primer ticket en 📷</div>
              </div>
            ) : tickets.map((t) => {
              const cat = CATEGORIES.find((c) => c.id === t.categoria_sugerida);
              return (
                <div key={t._id} style={{ background:"#111827", borderRadius:14, padding:14, marginBottom:10, border:"1px solid #1e2a3a", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background: cat?`${cat.color}22`:"#1e2a3a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>
                      {cat?.icon || "🧾"}
                    </div>
                    <div>
                      <div style={{ fontWeight:600, fontSize:14 }}>{t.tienda || "Sin nombre"}</div>
                      <div style={{ fontSize:12, color:"#5a7a9a" }}>{cat?.label || t.categoria_label} · {t.fecha}</div>
                      {t.driveLink && <a href={t.driveLink} target="_blank" rel="noreferrer" style={{ fontSize:11, color:"#60a5fa" }}>Ver en Drive ↗</a>}
                    </div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:16 }}>{fmt(t.total)}</div>
                    <div style={{ fontSize:10, color: t.sheetSaved?"#4ade80":"#fbbf24", marginTop:2 }}>
                      {t.sheetSaved ? "✅ En Sheets" : "💾 Local"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
