#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Instalando dependencias de Node..."
npm install

if [ ! -d "BDS-Addon/ChatRelay" ]; then
    echo "Error: no se encontro BDS-Addon/ChatRelay en $SCRIPT_DIR"
    exit 1
fi

read -p "Ruta de la carpeta del servidor Bedrock (ej /opt/minecraft-bedrock-server): " BDS_PATH
BDS_PATH="${BDS_PATH%/}"

if [ ! -d "$BDS_PATH" ]; then
    echo "Error: la ruta $BDS_PATH no existe"
    exit 1
fi

BP_PATH="$BDS_PATH/behavior_packs/ChatRelay"
mkdir -p "$BDS_PATH/behavior_packs"
rm -rf "$BP_PATH"
cp -r "BDS-Addon/ChatRelay" "$BP_PATH"
echo "Addon copiado a $BP_PATH"

PERMISSIONS_CONTENT='{
  "allowed_modules": [
    "@minecraft/common",
    "@minecraft/server-gametest",
    "@minecraft/server",
    "@minecraft/server-ui",
    "@minecraft/server-admin",
    "@minecraft/server-editor",
    "@minecraft/server-net",
    "@minecraft/debug-utilities"
  ]
}'

DEFAULT_PERM_DIR="$BDS_PATH/config/default"
mkdir -p "$DEFAULT_PERM_DIR"
echo "$PERMISSIONS_CONTENT" > "$DEFAULT_PERM_DIR/permissions.json"
echo "permissions.json escrito en $DEFAULT_PERM_DIR"

WORLD_PERM_DIR="$BDS_PATH/config/17f8a35a-a30b-4fd4-bdd3-608d277e8535"
mkdir -p "$WORLD_PERM_DIR"
echo "$PERMISSIONS_CONTENT" > "$WORLD_PERM_DIR/permissions.json"
echo "permissions.json escrito en $WORLD_PERM_DIR"

VARIABLES_PATH="$WORLD_PERM_DIR/variables.json"
if [ ! -f "$VARIABLES_PATH" ]; then
    cat > "$VARIABLES_PATH" << 'EOF'
{
  "tg_token": "",
  "tg_chat_id": "",
  "dc_webhooks": "",
  "voice_bot_url": ""
}
EOF
    echo "variables.json creado en $WORLD_PERM_DIR, completa los valores a mano"
else
    echo "variables.json ya existe en $WORLD_PERM_DIR, no se modifico"
fi

echo "Instalacion completa."
echo "Abriendo Discord Developer Portal..."

if command -v xdg-open > /dev/null; then
    xdg-open "https://discord.com/developers/applications" > /dev/null 2>&1 &
elif command -v open > /dev/null; then
    open "https://discord.com/developers/applications" > /dev/null 2>&1 &
else
    echo "Abri manualmente: https://discord.com/developers/applications"
fi

if [ ! -f ".env" ]; then
    echo "No existe .env, copia env.example a .env y completa los datos antes de continuar."
    exit 0
fi

echo "Iniciando bot..."
node index.js