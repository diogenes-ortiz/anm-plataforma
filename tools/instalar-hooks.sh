#!/bin/sh
# Activa los hooks del repositorio (una vez por computadora): la versión se actualiza sola en cada commit.
cd "$(dirname "$0")/.." && git config core.hooksPath tools/hooks && echo "Hooks activados"
