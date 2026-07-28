# Deploy em VPS

Este procedimento instala a aplicação diretamente do repositório
`jefersoncoop/voting-systemv2` em uma VPS Ubuntu 24.04 ou mais recente. O instalador cria um
banco SQLite de produção vazio; ele não copia `prisma/dev.db`, `.env` nem
qualquer dado da máquina de desenvolvimento.

## Antes de começar

- Crie uma VPS Ubuntu 24.04 ou mais recente com pelo menos 2 GB de memória.
- Aponte um registro DNS `A` do domínio para o IP público da VPS.
- Confirme que consegue entrar por SSH e que as portas 80 e 443 estão liberadas
  no firewall do provedor.
- Execute o deploy como `root` ou por meio de `sudo`.

O script instala Node.js, Nginx, SQLite, Certbot e as demais dependências. Ele
também cria um usuário de serviço sem acesso interativo chamado
`voting-system`.

## Primeira instalação

Entre na VPS e baixe o instalador:

```bash
curl -fsSL https://raw.githubusercontent.com/jefersoncoop/voting-systemv2/main/scripts/deploy-vps.sh \
  -o /tmp/deploy-vps.sh
less /tmp/deploy-vps.sh
```

Depois, execute-o informando o domínio e o e-mail usado pelo Let's Encrypt:

```bash
sudo env \
  DOMAIN=votacao.seudominio.com.br \
  LETSENCRYPT_EMAIL=admin@seudominio.com.br \
  bash /tmp/deploy-vps.sh
```

Durante a primeira execução, o instalador solicitará nome, CPF e data de
nascimento do administrador inicial. O telefone é opcional quando o 2FA estiver
desativado. A data deve ser informada no formato `DD/MM/AAAA`.

Para instalar inicialmente somente pelo IP, deixe `DOMAIN` vazio:

```bash
sudo env ENABLE_HTTPS=false bash /tmp/deploy-vps.sh
```

Nesse caso, o acesso será por `http://IP_DA_VPS`. Quando o DNS estiver pronto,
execute novamente o script com `DOMAIN` e `LETSENCRYPT_EMAIL`.

## O que é criado

| Item | Caminho |
| --- | --- |
| Release ativa | `/opt/voting-system/current` |
| Releases versionadas | `/opt/voting-system/releases` |
| Banco exclusivo de produção | `/var/lib/voting-system/prod.db` |
| Backups antes das migrações | `/var/backups/voting-system` |
| Variáveis de ambiente | `/etc/voting-system.env` |
| Serviço systemd | `/etc/systemd/system/voting-system.service` |
| Configuração Nginx | `/etc/nginx/sites-available/voting-system` |

O arquivo de ambiente é criado apenas na primeira instalação e preservado nas
atualizações. O `JWT_SECRET` é gerado automaticamente.

## Atualizações

Baixe a versão atual do instalador e execute o mesmo comando novamente:

```bash
curl -fsSL https://raw.githubusercontent.com/jefersoncoop/voting-systemv2/main/scripts/deploy-vps.sh \
  -o /tmp/deploy-vps.sh
sudo env \
  DOMAIN=votacao.seudominio.com.br \
  LETSENCRYPT_EMAIL=admin@seudominio.com.br \
  bash /tmp/deploy-vps.sh
```

Antes de aplicar migrações, o script cria um backup consistente do banco. A
nova release só é ativada depois de passar por lint, verificação de tipos, build
e migrações. Se o serviço ou o health check falhar, o link da aplicação volta
automaticamente para a release anterior. Migrações de banco não são revertidas
automaticamente.

## Administração e diagnóstico

```bash
sudo systemctl status voting-system
sudo journalctl -u voting-system -f
sudo nginx -t
sudo systemctl reload nginx
```

Se uma versão antiga do instalador tiver parado com `NO_PUBKEY
2F59B5F99B1BE0B4`, baixe o script atualizado e execute-o novamente. Ele remove
a entrada incompleta, prefere o Node.js fornecido pelo próprio Ubuntu quando a
versão for compatível e recria corretamente o keyring quando precisar usar o
NodeSource.

Para editar as integrações:

```bash
sudo nano /etc/voting-system.env
sudo systemctl restart voting-system
```

As variáveis disponíveis para o WhatsApp são:

```dotenv
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_WHATSAPP_FROM=""
```

Mantenha o 2FA do administrador desativado até validar o remetente e o template
de autenticação na Twilio. O script não imprime segredos do ambiente.

## Firewall

Por segurança, o instalador não altera o UFW por padrão, pois a porta SSH pode
ser diferente de 22. Se a VPS usa a regra padrão `OpenSSH`, a configuração pode
ser habilitada explicitamente:

```bash
sudo env \
  DOMAIN=votacao.seudominio.com.br \
  LETSENCRYPT_EMAIL=admin@seudominio.com.br \
  CONFIGURE_UFW=true \
  bash /tmp/deploy-vps.sh
```

Confirme a configuração da porta SSH antes de usar essa opção.

## Banco e restauração

Nunca execute `npm run seed` em produção: o seed recria dados. Para listar os
backups:

```bash
sudo ls -lh /var/backups/voting-system
```

Uma restauração deve ser feita com o serviço parado e após guardar uma cópia do
banco atual. Como as migrações podem mudar o esquema, restaure também uma release
compatível com o backup. Exemplo:

```bash
sudo systemctl stop voting-system
sudo cp /var/lib/voting-system/prod.db /var/backups/voting-system/prod-before-restore.db
sudo cp /var/backups/voting-system/ARQUIVO_ESCOLHIDO.db /var/lib/voting-system/prod.db
sudo chown voting-system:voting-system /var/lib/voting-system/prod.db
sudo chmod 0640 /var/lib/voting-system/prod.db
sudo systemctl start voting-system
```

Substitua `ARQUIVO_ESCOLHIDO.db` por um nome obtido na listagem e valide os logs
imediatamente após iniciar o serviço.

## Opções do instalador

| Variável | Padrão | Uso |
| --- | --- | --- |
| `REPO_URL` | Repositório oficial | URL Git usada no clone. |
| `BRANCH` | `main` | Branch a publicar. |
| `DOMAIN` | vazio | Domínio público do sistema. |
| `LETSENCRYPT_EMAIL` | vazio | E-mail para emissão do certificado. |
| `ENABLE_HTTPS` | `true` | Define se o Certbot será executado. |
| `CONFIGURE_UFW` | `false` | Autoriza o script a configurar o UFW. |
| `APP_PORT` | `3000` | Porta local entre Nginx e Next.js. |
