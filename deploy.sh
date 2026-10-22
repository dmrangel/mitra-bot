#!/usr/bin/env bash
# Deploy do mitra-bot na VM. Chamado pelo GitHub Actions via SSH, com a chave
# presa a este script no ~/.ssh/authorized_keys:
#
#   command="/home/ubuntu/mitra-bot/deploy.sh",restrict ssh-ed25519 AAAA... mitra-bot-deploy
#
# O que ele faz: atualiza a main (só fast-forward), instala dependências,
# confere a sintaxe e reinicia SÓ o mitra-bot no pm2. Se algo falhar antes do
# restart, o bot antigo continua rodando; se o bot novo não ficar "online",
# volta para o commit anterior e reinicia de novo.
#
# Todo o corpo está dentro de main(): o "git pull" pode reescrever este
# arquivo durante a execução, e o bash lê scripts aos poucos. Dentro de uma
# função, ele já leu tudo antes de começar.

main() {
    set -euo pipefail

    local DIR=/home/ubuntu/mitra-bot
    local APP=mitra-bot
    local BRANCH=main

    cd "$DIR"

    # Um deploy por vez.
    exec 9>"$DIR/.deploy.lock"
    if ! flock -n 9; then
        echo "Outro deploy está em andamento. Abortando."
        exit 1
    fi

    if [ ! -f .env ] || [ ! -d auth ]; then
        echo "ERRO: .env ou auth/ não existe em $DIR. Faça a instalação e o pareamento manual primeiro."
        exit 1
    fi
    if ! pm2 describe "$APP" >/dev/null 2>&1; then
        echo "ERRO: o processo $APP não existe no pm2. Suba e pareie à mão na primeira vez (pm2 start ecosystem.config.cjs)."
        exit 1
    fi

    local atual
    atual=$(git rev-parse --abbrev-ref HEAD)
    if [ "$atual" != "$BRANCH" ]; then
        echo "ERRO: o clone está na branch '$atual', não em '$BRANCH'."
        exit 1
    fi

    local anterior
    anterior=$(git rev-parse HEAD)

    git fetch --quiet origin "$BRANCH"
    git merge --ff-only --quiet "origin/$BRANCH"
    local novo
    novo=$(git rev-parse HEAD)
    echo "Commit: ${anterior:0:7} -> ${novo:0:7}"

    voltar() {
        echo "Voltando para ${anterior:0:7}..."
        git reset --hard --quiet "$anterior"
        npm ci --omit=dev --no-audit --no-fund --loglevel=error
    }

    if ! npm ci --omit=dev --no-audit --no-fund --loglevel=error; then
        echo "ERRO no npm ci. O bot em execução não foi tocado."
        voltar
        exit 1
    fi
    if ! npm run --silent check; then
        echo "ERRO de sintaxe. O bot em execução não foi tocado."
        voltar
        exit 1
    fi

    local restarts_antes
    restarts_antes=$(restarts "$APP")

    pm2 restart "$APP" --update-env >/dev/null
    echo "Reiniciado. Conferindo se ficou de pé..."

    # min_uptime do pm2 é 30s: só depois disso dá para saber se estabilizou.
    sleep 35
    local status restarts_depois
    status=$(status_do "$APP")
    restarts_depois=$(restarts "$APP")

    # +1 é o próprio restart do deploy. Mais que isso = caiu e voltou sozinho.
    if [ "$status" != "online" ] || [ "$restarts_depois" -gt $((restarts_antes + 1)) ]; then
        echo "ERRO: $APP está '$status' com $restarts_depois restarts (antes: $restarts_antes)."
        pm2 logs "$APP" --lines 30 --nostream --err 2>/dev/null | tail -n 30 || true
        voltar
        pm2 restart "$APP" --update-env >/dev/null
        exit 1
    fi

    pm2 save >/dev/null
    echo "OK: $APP online em ${novo:0:7}."
}

# Lê um campo do processo no "pm2 jlist" sem depender de jq.
pm2_campo() {
    pm2 jlist 2>/dev/null | node -e '
        let d = "";
        process.stdin.on("data", c => d += c).on("end", () => {
            const [nome, campo] = process.argv.slice(1);
            const p = JSON.parse(d).find(x => x.name === nome);
            if (!p) return console.log("");
            console.log(campo === "status" ? p.pm2_env.status : p.pm2_env.restart_time);
        });
    ' "$1" "$2"
}
status_do() { pm2_campo "$1" status; }
restarts() { pm2_campo "$1" restarts; }

main "$@"
exit $?
