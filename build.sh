#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Instalando dependencias..."
npm ci

echo "[2/3] Compilando..."
npm run compile

echo "[3/3] Empaquetando con vsce..."
npx @vscode/vsce package

echo "✅ Listo: extensión empaquetada."
