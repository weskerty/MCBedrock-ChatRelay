import { world, system } from "@minecraft/server";
import { variables } from "@minecraft/server-admin";
import { http, HttpRequest, HttpRequestMethod, HttpHeader } from "@minecraft/server-net";

const P = "[ChatRelay]";

const TT = variables.get("tg_token")   ?? "";
const TC = variables.get("tg_chat_id") ?? "";
const DW = variables.get("dc_webhooks") ?? "";
const VB = variables.get("voice_bot_url") ?? "";

const TE = TT !== "" && TC !== "";
const DWS = DW.split(",").map(s => s.trim()).filter(Boolean);
const DE = DWS.length > 0;
const VE = VB !== "";

const POS_INTERVAL = 120;

function sF(s) { return (s ?? "").replace(/§[0-9a-fk-or]/gi, ""); }

function eH(s) {
    return (s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function fT(t, pl, m) {
    const mg = sF(m), p = eH(pl ?? ""), ms = eH(mg);
    switch(t) {
        case "chat":      return `💬 <b>${p}</b>: ${ms}`;
        case "join":      return `🟢 ${ms || `${p} se unió`}`;
        case "death":     return `💀 ${ms}`;
        case "broadcast": return `📢 ${ms}`;
        default:          return ms;
    }
}

function fD(t, pl, m) {
    const mg = sF(m), p = pl ?? "";
    switch(t) {
        case "chat":      return `💬 **${p}**: ${mg}`;
        case "join":      return `🟢 ${mg || `${p} se unió`}`;
        case "death":     return `💀 ${mg}`;
        case "broadcast": return `📢 ${mg}`;
        default:          return mg;
    }
}

function sTg(tx) {
    if (!TE || !tx) return;
    const pl = { chat_id: TC, text: tx, parse_mode: "HTML" };
    if (String(TC).includes("/")) {
        const pts = String(TC).split("/");
        pl.chat_id = pts[0];
        pl.message_thread_id = parseInt(pts[1]);
    }
    const rq = new HttpRequest(`https://api.telegram.org/bot${TT}/sendMessage`);
    rq.method = HttpRequestMethod.Post;
    rq.body = JSON.stringify(pl);
    rq.headers = [new HttpHeader("Content-Type","application/json")];
    rq.timeout = 10;
    http.request(rq).catch(e => console.error(`${P} Telegram send error: ${e}`));
}

function sDc(tx) {
    if (!DE || !tx) return;
    for (const w of DWS) {
        const rq = new HttpRequest(w);
        rq.method = HttpRequestMethod.Post;
        rq.body = JSON.stringify({ content: tx });
        rq.headers = [new HttpHeader("Content-Type","application/json")];
        rq.timeout = 10;
        http.request(rq).catch(e => console.error(`${P} Discord send error: ${e}`));
    }
}

function rly(t, pl, m) {
    const tg = fT(t, pl, m), dc = fD(t, pl, m);
    if (tg) sTg(tg);
    if (dc) sDc(dc);
}

function tTg() {
    http.get(`https://api.telegram.org/bot${TT}/getMe`).then(r => {
        if (r.status === 200) {
            try {
                const d = JSON.parse(r.body);
                console.info(`${P} Telegram: ✓ @${d?.result?.username ?? "?"}`);
            } catch { console.info(`${P} Telegram: ✓ OK`); }
        } else {
            console.error(`${P} Telegram: ✗ status ${r.status}`);
        }
    }).catch(e => console.error(`${P} Telegram: ✗ ${e}`));
}

function tDc() {
    for (const w of DWS) {
        const rq = new HttpRequest(w);
        rq.method = HttpRequestMethod.Get;
        http.request(rq).then(r => {
            if (r.status === 200) console.info(`${P} Discord: ✓ webhook OK (${w.slice(-6)})`);
            else console.error(`${P} Discord: ✗ status ${r.status} (${w.slice(-6)})`);
        }).catch(e => console.error(`${P} Discord: ✗ ${e} (${w.slice(-6)})`));
    }
}

function sPos() {
    const pls = world.getAllPlayers();
    if (pls.length === 0) return;
    const data = pls.map(p => ({
        name: p.name,
        x: p.location.x,
        y: p.location.y,
        z: p.location.z,
        dimension: p.dimension.id.replace("minecraft:", "")
    }));
    const rq = new HttpRequest(VB);
    rq.method = HttpRequestMethod.Post;
    rq.body = JSON.stringify({ players: data });
    rq.headers = [new HttpHeader("Content-Type","application/json")];
    rq.timeout = 5;
    http.request(rq).catch(e => console.error(`${P} VoiceBot send error: ${e}`));
}

function regEv() {
    world.beforeEvents.chatSend.subscribe(e => {
        const pl = e.sender.name, m = e.message;
        system.run(() => rly("chat", pl, m));
    });

    world.afterEvents.playerSpawn.subscribe(e => {
        if (!e.initialSpawn) return;
        rly("join", e.player.name, `${e.player.name} se unió al servidor`);
    });

    world.afterEvents.entityDie.subscribe(e => {
        if (e.deadEntity.typeId !== "minecraft:player") return;
        const n = e.deadEntity.nameTag || e.deadEntity.name || "Jugador";
        const c = e.damageSource?.cause ?? "causa 67";
        rly("death", n, `${n} c murió (${c})`);
    });
}

system.run(() => {
    console.info(`${P} Iniciando...`);
    if (TE) { console.info(`${P} Telegram: configurado`); tTg(); }
    else console.warn(`${P} Telegram: sin configurar`);
    if (DE) { console.info(`${P} Discord: configurado (${DWS.length} webhook(s))`); tDc(); }
    else console.warn(`${P} Discord: sin configurar`);
    if (VE) console.info(`${P} VoiceBot: configurado`);
    else console.warn(`${P} VoiceBot: sin configurar`);
    if (!TE && !DE && !VE) {
        console.warn(`${P} Faltan los Archivos variables.json y permissions.json en minecraft-bedrock-server/config/17f8a35a-a30b-4fd4-bdd3-608d277e8535/ permissions debe tener server-net tambien igual que el default central.`);
        return;
    }
    regEv();
    if (VE) system.runInterval(sPos, POS_INTERVAL);
    console.info(`${P} Listo.`);
});