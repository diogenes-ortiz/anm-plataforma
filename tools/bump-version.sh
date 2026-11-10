#!/bin/sh
# Marca una versión nueva: fuerza a los navegadores a bajar los archivos actualizados.
# Uso: sh tools/bump-version.sh   (antes de cada commit que cambie css/js)
V=$(date -u +%Y%m%d%H%M)
cd "$(dirname "$0")/.."
for f in index.html finanzas.html finanzas-completa.html; do
  sed -i -E "s#((src|href)=\"(js|css)/[^\"?]+\.(js|css))(\?v=[0-9]+)?\"#\1?v=$V\"#g" "$f"
  sed -i -E "s#window\.ANM_VERSION='[0-9]*'#window.ANM_VERSION='$V'#" "$f"
done
printf '{"v":"%s"}\n' "$V" > version.json
echo "Versión $V"
