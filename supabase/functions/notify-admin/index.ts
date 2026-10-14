// notify-admin: manda un'email all'admin di Azimut.Arch.
// Il destinatario è fisso (non lo decide chi chiama la funzione).
// La chiave di Resend va messa nei secret del progetto Supabase con il nome RESEND_API_KEY.

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "marcobolge@gmail.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);

  try {
    const body = await req.json();
    // Controllo di salute: non manda nessuna email
    if (body?.ping) return json({ ok: true, chiave: RESEND_API_KEY !== "" });

    const details = String(body?.details ?? "").slice(0, 20000);
    const subject = String(body?.subject ?? "Notifica Azimut.Arch").replace(/[\r\n]+/g, " ").slice(0, 120);
    if (!details.trim()) return json({ error: "Messaggio vuoto" }, 400);
    if (!RESEND_API_KEY) return json({ error: "Manca il secret RESEND_API_KEY" }, 500);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Azimut.Arch <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${details}</div>`,
      }),
    });
    return json(await res.json(), res.ok ? 200 : 502);
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
});
