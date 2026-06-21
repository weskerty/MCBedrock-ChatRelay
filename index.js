import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "fs";
import express from "express";
import {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionFlagsBits,
    Events,
    REST,
    Routes,
    SlashCommandBuilder
} from "discord.js";

const GUILD_ID = process.env.GUILD_ID;
const LOBBY_ID = process.env.LOBBY_CHANNEL_ID;
const CATEGORY_ID = process.env.DYNAMIC_CATEGORY_ID || null;
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? "8585");
const RADIUS = parseFloat(process.env.PROXIMITY_RADIUS ?? "20");

const LINKS_FILE = new URL("./links.json", import.meta.url);
let linksCache = existsSync(LINKS_FILE) ? JSON.parse(readFileSync(LINKS_FILE, "utf8")) : {};

function persistLinks() {
    writeFileSync(LINKS_FILE, JSON.stringify(linksCache, null, 2));
}

function setLink(discordId, mcName) {
    linksCache[discordId] = mcName;
    persistLinks();
}

function removeLink(discordId) {
    delete linksCache[discordId];
    persistLinks();
}

function getDiscordId(mcName) {
    const lower = mcName.toLowerCase();
    for (const [id, name] of Object.entries(linksCache)) {
        if (name.toLowerCase() === lower) return id;
    }
    return null;
}

function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function buildClusters(players) {
    const byDim = {};
    for (const p of players) {
        (byDim[p.dimension] ??= []).push(p);
    }
    const clusters = [];
    for (const dim in byDim) {
        const list = byDim[dim];
        const visited = new Set();
        for (const p of list) {
            if (visited.has(p.name)) continue;
            const group = [p];
            visited.add(p.name);
            let changed = true;
            while (changed) {
                changed = false;
                for (const q of list) {
                    if (visited.has(q.name)) continue;
                    if (group.some(g => dist(g, q) <= RADIUS)) {
                        group.push(q);
                        visited.add(q.name);
                        changed = true;
                    }
                }
            }
            clusters.push(group.map(g => g.name).sort());
        }
    }
    return clusters;
}

const dynamicRoomIds = new Set();
let nextRoomNum = 1;
let processing = false;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

async function getGuild() {
    return client.guilds.fetch(GUILD_ID);
}

async function fetchMember(guild, discordId) {
    const cached = guild.members.cache.get(discordId);
    if (cached) return cached;
    return guild.members.fetch(discordId).catch(() => null);
}

async function createRoom(guild) {
    const ch = await guild.channels.create({
        name: `Voz ${nextRoomNum++}`,
        type: ChannelType.GuildVoice,
        parent: CATEGORY_ID,
        permissionOverwrites: CATEGORY_ID ? undefined : [
            {
                id: guild.roles.everyone,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
            }
        ]
    });
    dynamicRoomIds.add(ch.id);
    console.log(`Sala creada: ${ch.name} (${ch.id})`);
    return ch;
}

async function resolveRoomForCluster(guild, gms, occupiedRooms) {
    for (const gm of gms) {
        const channelId = gm.voice.channelId;
        if (channelId && channelId !== LOBBY_ID && !occupiedRooms.has(channelId)) {
            const ch = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId).catch(() => null);
            if (ch) {
                occupiedRooms.add(ch.id);
                return ch;
            }
        }
    }
    const ch = await createRoom(guild);
    occupiedRooms.add(ch.id);
    return ch;
}

async function cleanupEmptyRooms(guild, occupiedRooms) {
    for (const id of dynamicRoomIds) {
        if (occupiedRooms.has(id)) continue;
        const ch = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
        if (!ch) {
            dynamicRoomIds.delete(id);
            continue;
        }
        if (ch.members.size === 0) {
            await ch.delete().catch(() => {});
            dynamicRoomIds.delete(id);
            console.log(`Sala eliminada: ${ch.name} (${ch.id})`);
        }
    }
}

async function applyClusters(clusters) {
    if (processing) {
        console.warn("Ciclo anterior aun en proceso, se omite este lote");
        return;
    }
    processing = true;
    try {
        const guild = await getGuild();
        const occupiedRooms = new Set();

        for (const members of clusters) {
            const gms = [];
            for (const mcName of members) {
                const discordId = getDiscordId(mcName);
                if (!discordId) continue;
                const gm = await fetchMember(guild, discordId);
                if (!gm || !gm.voice.channelId) continue;
                gms.push(gm);
            }

            if (gms.length === 0) continue;

            const room = await resolveRoomForCluster(guild, gms, occupiedRooms);

            for (const gm of gms) {
                if (gm.voice.channelId === room.id) continue;
                await gm.voice.setChannel(room)
                    .then(() => console.log(`Movido: ${gm.user.username} -> ${room.name}`))
                    .catch(e => console.error(`Error moviendo a ${gm.user.username}: ${e}`));
            }
        }

        await cleanupEmptyRooms(guild, occupiedRooms);
    } finally {
        processing = false;
    }
}

const app = express();
app.use(express.json());

app.post("/positions", async (req, res) => {
    try {
        const players = req.body?.players ?? [];
        console.log(`Dato recibido: ${players.length} jugador(es)`);
        const linked = players.filter(p => getDiscordId(p.name) !== null);
        const clusters = buildClusters(linked);
        await applyClusters(clusters);
        res.sendStatus(200);
    } catch (e) {
        console.error("Error procesando posiciones:", e);
        res.sendStatus(500);
    }
});

app.listen(HTTP_PORT, () => {
    console.log(`Servidor HTTP escuchando en puerto ${HTTP_PORT}`);
});

const commands = [
    new SlashCommandBuilder()
        .setName("link")
        .setDescription("Vincula tu cuenta de Discord con tu nombre de Minecraft")
        .addStringOption(o =>
            o.setName("nombre")
                .setDescription("Tu nombre exacto en el servidor de Minecraft")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("unlink")
        .setDescription("Elimina tu vinculo con Minecraft"),
    new SlashCommandBuilder()
        .setName("links")
        .setDescription("Muestra todos los vinculos activos")
].map(c => c.toJSON());

async function registerCommands() {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, GUILD_ID),
        { body: commands }
    );
}

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "link") {
        const nombre = interaction.options.getString("nombre");
        setLink(interaction.user.id, nombre);
        await interaction.reply({ content: `Vinculado correctamente a ${nombre}`, ephemeral: true });
    }

    if (interaction.commandName === "unlink") {
        removeLink(interaction.user.id);
        await interaction.reply({ content: "Vinculo eliminado", ephemeral: true });
    }

    if (interaction.commandName === "links") {
        const lines = Object.entries(linksCache).map(([id, name]) => `<@${id}> -> ${name}`);
        await interaction.reply({
            content: lines.length ? lines.join("\n") : "No hay vinculos activos",
            ephemeral: true
        });
    }
});

client.once(Events.ClientReady, async c => {
    console.log(`Bot conectado como ${c.user.tag}`);
    console.log(`Para invitarlo a un servidor abre este enlace:`);
    console.log(`https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&permissions=16777232&scope=bot%20applications.commands`);
    await registerCommands();
    console.log("Slash commands registrados");
});

client.login(process.env.DISCORD_TOKEN);