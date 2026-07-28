#!/usr/bin/env bash
set -Eeuo pipefail

umask 027

REPO_URL="${REPO_URL:-https://github.com/jefersoncoop/voting-systemv2.git}"
BRANCH="${BRANCH:-main}"
APP_USER="${APP_USER:-voting-system}"
APP_ROOT="${APP_ROOT:-/opt/voting-system}"
DATA_DIR="${DATA_DIR:-/var/lib/voting-system}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/voting-system}"
ENV_FILE="${ENV_FILE:-/etc/voting-system.env}"
SERVICE_NAME="${SERVICE_NAME:-voting-system}"
APP_PORT="${APP_PORT:-3000}"
DOMAIN="${DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
ENABLE_HTTPS="${ENABLE_HTTPS:-true}"
CONFIGURE_UFW="${CONFIGURE_UFW:-false}"
NODE_MAJOR="${NODE_MAJOR:-22}"
HTTPS_CONFIGURED=false

RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$$"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
NGINX_SITE="/etc/nginx/sites-available/$SERVICE_NAME"

log() {
    printf '[deploy] %s\n' "$*"
}

warn() {
    printf '[deploy] AVISO: %s\n' "$*" >&2
}

die() {
    printf '[deploy] ERRO: %s\n' "$*" >&2
    exit 1
}

on_error() {
    local exit_code=$?
    printf '[deploy] Falha na linha %s (código %s).\n' "${BASH_LINENO[0]}" "$exit_code" >&2
    printf '[deploy] A release anterior não foi removida. Consulte: journalctl -u %s -n 100\n' "$SERVICE_NAME" >&2
    exit "$exit_code"
}
trap on_error ERR

require_root() {
    [[ "$EUID" -eq 0 ]] || die "Execute com sudo: sudo bash scripts/deploy-vps.sh"
}

prompt_configuration() {
    if [[ -t 0 && -z "$DOMAIN" ]]; then
        read -r -p 'Domínio público (deixe vazio para usar somente o IP): ' DOMAIN
    fi
    if [[ -n "$DOMAIN" && "$ENABLE_HTTPS" == "true" && -t 0 && -z "$LETSENCRYPT_EMAIL" ]]; then
        read -r -p 'E-mail para o certificado Let\x27s Encrypt: ' LETSENCRYPT_EMAIL
    fi
    if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
        die "Domínio inválido: $DOMAIN"
    fi
    [[ "$APP_PORT" =~ ^[0-9]+$ ]] || die "APP_PORT inválida"
}

install_system_dependencies() {
    log "Instalando dependências do sistema"
    export DEBIAN_FRONTEND=noninteractive

    local nodesource_keyring="/usr/share/keyrings/nodesource.gpg"
    local nodesource_list="/etc/apt/sources.list.d/nodesource.list"
    local nodesource_sources="/etc/apt/sources.list.d/nodesource.sources"

    # Remove somente a configuração gerenciada por este instalador. Isso também
    # recupera uma execução interrompida por um keyring ilegível ou inválido.
    rm -f "$nodesource_list" "$nodesource_sources"

    apt-get update
    apt-get install -y ca-certificates curl git gnupg nginx openssl sqlite3 snapd ufw

    local installed_major=0
    local installed_minor=0
    if command -v node >/dev/null 2>&1; then
        local installed_version
        installed_version="$(node --version)"
        installed_version="${installed_version#v}"
        IFS=. read -r installed_major installed_minor _ <<< "$installed_version"
    fi

    if (( installed_major < 20 || (installed_major == 20 && installed_minor < 9) )); then
        local distro_candidate
        local distro_version
        local distro_major=0
        distro_candidate="$(apt-cache policy nodejs | awk '/Candidate:/ { print $2; exit }')"
        distro_version="${distro_candidate#*:}"
        if [[ "$distro_version" =~ ^([0-9]+)\. ]]; then
            distro_major="${BASH_REMATCH[1]}"
        fi

        if (( distro_major >= 20 )); then
            log "Instalando Node.js pelo repositório oficial do Ubuntu"
            apt-get install -y nodejs npm
        else
            log "Instalando Node.js ${NODE_MAJOR}.x pelo NodeSource"
            local key_tmp
            key_tmp="$(mktemp)"
            curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$key_tmp"
            gpg --batch --yes --dearmor -o "$nodesource_keyring" "$key_tmp"
            rm -f "$key_tmp"

            # O APT valida a assinatura como o usuário `_apt`, portanto o
            # keyring e a definição do repositório precisam ser públicos.
            chmod 0644 "$nodesource_keyring"

            local expected_fingerprint="6F71F525282841EEDAF851B42F59B5F99B1BE0B4"
            local key_fingerprints
            key_fingerprints="$(gpg --batch --show-keys --with-colons "$nodesource_keyring" \
                | awk -F: '$1 == "fpr" { print $10 }')"
            [[ "$key_fingerprints" == *"$expected_fingerprint"* ]] || \
                die "A chave baixada do NodeSource não possui a impressão digital esperada"

            local architecture
            architecture="$(dpkg --print-architecture)"
            [[ "$architecture" == "amd64" || "$architecture" == "arm64" ]] || \
                die "Arquitetura sem suporte pelo NodeSource: $architecture"

            cat > "$nodesource_sources" <<EOF
Types: deb
URIs: https://deb.nodesource.com/node_${NODE_MAJOR}.x
Suites: nodistro
Components: main
Architectures: $architecture
Signed-By: $nodesource_keyring
EOF
            chmod 0644 "$nodesource_sources"
            apt-get update
            apt-get install -y nodejs
        fi
    fi

    local node_version
    node_version="$(node --version)"
    local node_major node_minor
    IFS=. read -r node_major node_minor _ <<< "${node_version#v}"
    (( node_major > 20 || (node_major == 20 && node_minor >= 9) )) || \
        die "Node.js 20.9 ou superior é obrigatório"
    log "Node.js $node_version e npm $(npm --version) disponíveis"
}

create_runtime_user_and_directories() {
    if ! id "$APP_USER" >/dev/null 2>&1; then
        log "Criando usuário de serviço $APP_USER"
        useradd --system --user-group --home-dir "$APP_ROOT" --create-home --shell /usr/sbin/nologin "$APP_USER"
    fi
    install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$APP_ROOT" "$RELEASES_DIR" "$DATA_DIR" "$BACKUP_DIR"
}

create_environment_file() {
    if [[ -f "$ENV_FILE" ]]; then
        log "Preservando variáveis existentes em $ENV_FILE"
    else
        log "Criando $ENV_FILE"
        local jwt_secret
        jwt_secret="$(openssl rand -hex 48)"
        cat > "$ENV_FILE" <<EOF
DATABASE_URL="file:$DATA_DIR/prod.db"
JWT_SECRET="$jwt_secret"
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_WHATSAPP_FROM=""
EOF
    fi
    chown root:"$APP_USER" "$ENV_FILE"
    chmod 0640 "$ENV_FILE"

    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    [[ "${DATABASE_URL:-}" == file:* ]] || die "Este instalador espera DATABASE_URL SQLite iniciada por file:"
    [[ -n "${JWT_SECRET:-}" && "${#JWT_SECRET}" -ge 32 ]] || die "JWT_SECRET deve possuir pelo menos 32 caracteres"
}

run_in_release() {
    runuser -u "$APP_USER" -- env HOME="$APP_ROOT" bash -c '
        set -a
        source "$1"
        set +a
        cd "$2"
        shift 2
        exec "$@"
    ' bash "$ENV_FILE" "$RELEASE_DIR" "$@"
}

download_and_build_release() {
    log "Baixando $REPO_URL, branch $BRANCH"
    runuser -u "$APP_USER" -- env HOME="$APP_ROOT" \
        git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$RELEASE_DIR"

    log "Instalando dependências"
    run_in_release npm ci --no-audit --no-fund
    run_in_release npx prisma generate

    log "Executando lint, tipos e build de produção"
    run_in_release npm run check
}

resolve_database_path() {
    local raw_path="${DATABASE_URL#file:}"
    [[ "$raw_path" == /* ]] || die "Use um caminho SQLite absoluto em produção, por exemplo file:$DATA_DIR/prod.db"
    printf '%s' "$raw_path"
}

backup_and_migrate_database() {
    local db_path
    db_path="$(resolve_database_path)"
    install -d -o "$APP_USER" -g "$APP_USER" -m 0750 "$(dirname "$db_path")"

    if [[ -s "$db_path" ]]; then
        local backup_path="$BACKUP_DIR/prod-before-$RELEASE_ID.db"
        log "Criando backup em $backup_path"
        sqlite3 "$db_path" ".backup '$backup_path'"
        chown "$APP_USER:$APP_USER" "$backup_path"
        chmod 0640 "$backup_path"
    else
        log "Banco novo: nenhuma base local será transferida"
    fi

    run_in_release npx prisma migrate deploy
    run_in_release npx prisma migrate status
    chown "$APP_USER:$APP_USER" "$db_path"
    chmod 0640 "$db_path"
}

bootstrap_admin() {
    log "Verificando administrador inicial"
    run_in_release npm run create-admin
}

write_systemd_service() {
    local npm_path
    npm_path="$(command -v npm)"
    cat > "/etc/systemd/system/$SERVICE_NAME.service" <<EOF
[Unit]
Description=Sistema de Votação
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$CURRENT_LINK
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
EnvironmentFile=$ENV_FILE
ExecStart=$npm_path start -- -H 127.0.0.1 -p $APP_PORT
Restart=always
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGINT
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
ReadWritePaths=$APP_ROOT $DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME.service" >/dev/null
}

write_nginx_site() {
    local server_name="${DOMAIN:-_}"
    cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $server_name;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    ln -sfn "$NGINX_SITE" "/etc/nginx/sites-enabled/$SERVICE_NAME"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl enable --now nginx >/dev/null
    systemctl reload nginx
}

activate_release() {
    local previous_release=""
    if [[ -L "$CURRENT_LINK" ]]; then
        previous_release="$(readlink -f "$CURRENT_LINK")"
    fi

    local temporary_link="$APP_ROOT/.current-$RELEASE_ID"
    ln -s "$RELEASE_DIR" "$temporary_link"
    mv -Tf "$temporary_link" "$CURRENT_LINK"
    chown -h "$APP_USER:$APP_USER" "$CURRENT_LINK"

    if ! systemctl restart "$SERVICE_NAME.service"; then
        if [[ -n "$previous_release" ]]; then
            warn "Falha ao iniciar a nova release; restaurando $previous_release"
            ln -sfn "$previous_release" "$CURRENT_LINK"
            systemctl restart "$SERVICE_NAME.service" || true
        fi
        die "Serviço não iniciou"
    fi

    local healthy=false
    for _ in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:$APP_PORT/login" >/dev/null; then
            healthy=true
            break
        fi
        sleep 1
    done

    if [[ "$healthy" != "true" ]]; then
        if [[ -n "$previous_release" ]]; then
            warn "Health check falhou; restaurando a release anterior"
            ln -sfn "$previous_release" "$CURRENT_LINK"
            systemctl restart "$SERVICE_NAME.service" || true
        fi
        die "Aplicação não respondeu em /login"
    fi
    log "Release $RELEASE_ID ativada"
}

configure_firewall() {
    if [[ "$CONFIGURE_UFW" != "true" ]]; then
        warn "UFW não foi alterado. Use CONFIGURE_UFW=true somente após confirmar a porta SSH."
        return
    fi
    ufw allow OpenSSH
    ufw allow 'Nginx Full'
    ufw --force enable
}

configure_https() {
    if [[ "$ENABLE_HTTPS" != "true" || -z "$DOMAIN" ]]; then
        warn "HTTPS não configurado automaticamente. Informe DOMAIN e LETSENCRYPT_EMAIL para ativá-lo."
        return
    fi
    if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
        warn "LETSENCRYPT_EMAIL ausente; mantendo o site em HTTP."
        return
    fi

    if ! command -v certbot >/dev/null 2>&1; then
        snap install --classic certbot
        ln -sfn /snap/bin/certbot /usr/local/bin/certbot
    fi
    if ! certbot --nginx --non-interactive --agree-tos --redirect \
        --email "$LETSENCRYPT_EMAIL" -d "$DOMAIN"; then
        warn "Certbot falhou. Confirme o DNS e execute: certbot --nginx -d $DOMAIN"
    else
        HTTPS_CONFIGURED=true
        if ! certbot renew --dry-run; then
            warn "O HTTPS foi ativado, mas o teste de renovação falhou. Verifique os logs do Certbot."
        fi
    fi
}

print_summary() {
    local url="http://${DOMAIN:-IP_DA_VPS}"
    [[ "$HTTPS_CONFIGURED" == "true" ]] && url="https://$DOMAIN"
    cat <<EOF

Deploy concluído.
URL: $url
Release: $RELEASE_DIR
Banco novo/produção: $(resolve_database_path)
Ambiente: $ENV_FILE
Serviço: systemctl status $SERVICE_NAME
Logs: journalctl -u $SERVICE_NAME -f
Backups: $BACKUP_DIR

Para atualizar, execute novamente este mesmo script como root.
Edite $ENV_FILE para configurar Twilio e reinicie com:
  systemctl restart $SERVICE_NAME
EOF
}

main() {
    require_root
    prompt_configuration
    install_system_dependencies
    create_runtime_user_and_directories
    create_environment_file
    download_and_build_release
    backup_and_migrate_database
    bootstrap_admin
    write_systemd_service
    write_nginx_site
    activate_release
    configure_firewall
    configure_https
    print_summary
}

main "$@"
