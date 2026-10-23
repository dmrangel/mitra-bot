# Instalação na VM Oracle

Roteiro para subir o mitra-bot na VM onde já rodam o **sweetbot** e o
**chrollo**, com deploy automático pelo GitHub Actions no mesmo esquema do
chrollo.

**Regras que valem o tempo todo**
- Não reiniciar, parar nem alterar o sweetbot ou o chrollo, os arquivos deles,
  as linhas deles no `authorized_keys`, nem as versões de Node e pm2.
- Nunca imprimir, commitar nem colar em logs a pasta `auth/`, o `.env` ou
  chaves privadas.
- Se algo estiver diferente do que este documento supõe, parar e conferir.

---

## 0. Antes de começar: o bot antigo

O bot novo entra no **mesmo número** do Santuário. Se o antigo continuar no ar,
**os dois respondem a cada mensagem**.

1. Pare o bot antigo onde ele roda hoje (`pm2 stop mitra_bot && pm2 delete mitra_bot && pm2 save`).
2. Copie o `pedidos.json` dele, se existir: são os pedidos de oração aguardando
   aprovação. Ele vai para `/home/ubuntu/mitra-bot/pedidos.json` na VM.
3. Copie o `.env` antigo como referência. Os ids `...@c.us` continuam valendo,
   mas as variáveis `SESSION_ID`, `CHROME_PATH`, `WEB_VERSION` e `LIMPAR_CHROME`
   não existem mais, e passa a existir `NUMERO_BOT`.
4. No celular do Santuário: *Aparelhos conectados*, remova o aparelho do bot
   antigo (aparece como Chrome/Windows ou similar).

## 1. Diagnóstico (só leitura)

```bash
free -h; df -h /; nproc
node -v; npm -v; pm2 -v
pm2 ls
```

Parar se a memória "available" estiver abaixo de ~250 MiB ou se o Node não for
20.x. O bot usa ~120 MB e o pm2 o reinicia se passar de 220 MB.

## 2. Acesso de leitura ao repositório

Na VM:

```bash
ssh-keygen -t ed25519 -N '' -C 'vm-oracle mitra-bot (leitura)' -f ~/.ssh/deploy_mitra-bot

# Acrescenta (não substitui) uma entrada no ~/.ssh/config.
cat >> ~/.ssh/config <<'CFG'

Host github-mitra-bot
    HostName github.com
    User git
    IdentityFile ~/.ssh/deploy_mitra-bot
    IdentitiesOnly yes
CFG

cat ~/.ssh/deploy_mitra-bot.pub
```

Cadastre a chave pública como deploy key **somente leitura** do repositório
(GitHub > dmrangel/mitra-bot > Settings > Deploy keys, sem marcar "Allow write
access"), ou de uma máquina com o `gh`:

```bash
gh repo deploy-key add deploy_mitra-bot.pub -R dmrangel/mitra-bot -t 'vm-oracle (leitura)'
```

Depois, na VM:

```bash
cd /home/ubuntu
git clone git@github-mitra-bot:dmrangel/mitra-bot.git
cd mitra-bot
git checkout main
```

## 3. Configuração

```bash
cd /home/ubuntu/mitra-bot
npm ci --omit=dev
cp .env.example .env && chmod 600 .env
nano .env                      # NUMERO_BOT, NUMEROS_VERIFICACAO, GRUPOS_ORACAO...
mkdir -m 700 auth
# se trouxe o pedidos.json do bot antigo, coloque-o aqui agora
```

## 4. Pareamento

```bash
pm2 start ecosystem.config.cjs
pm2 logs mitra-bot --lines 30
```

O log mostra `CÓDIGO DE PAREAMENTO: ABCD-EFGH`. No celular do Santuário:
*Aparelhos conectados > Conectar aparelho > Conectar com número de telefone* e
digite o código. Em seguida o log deve mostrar `Conectado ao WhatsApp.`
(pode haver uma reconexão com código 515 no meio, é normal).

```bash
pm2 save
pm2 ls          # sweetbot, chrollo e mitra-bot "online"
free -h
```

Teste mandando "oi" de outro celular. Para testar sem incomodar os fiéis, use
`MODO_TESTE=true` antes do pareamento: o bot só atende quem enviar `/teste` (e o
`NUMERO_TESTE`, se houver). Veja o README, seção "Testando sem incomodar os fiéis".

## 5. Chave de deploy do Actions

Gere um par **novo**, de preferência no seu computador (não na VM):

```bash
ssh-keygen -t ed25519 -N '' -C 'mitra-bot actions deploy' -f ./mitra-bot-actions
```

Na VM, **acrescente uma linha** ao `authorized_keys`, presa ao `deploy.sh`:

```bash
cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$(date +%F)
echo "command=\"/home/ubuntu/mitra-bot/deploy.sh\",restrict $(cat mitra-bot-actions.pub)" >> ~/.ssh/authorized_keys
```

(cole o conteúdo do `.pub` no lugar de `$(cat ...)` se o arquivo não estiver
na VM). Teste do seu computador: qualquer comando enviado deve rodar o deploy,
não o comando pedido:

```bash
ssh -i mitra-bot-actions ubuntu@IP_DA_VM 'ls /'      # deve imprimir o log do deploy, não a listagem
```

## 6. Secrets e primeiro deploy

Secrets do repositório (GitHub > Settings > Secrets and variables > Actions),
ou pelo `gh`, sempre pela entrada padrão para a chave não ir para o histórico
do shell:

```bash
gh secret set DEPLOY_SSH_KEY -R dmrangel/mitra-bot < mitra-bot-actions
gh secret set DEPLOY_HOST -R dmrangel/mitra-bot        # digite o IP quando pedir
# known_hosts tirado da própria VM (evita confiar num ssh-keyscan pela rede):
#   na VM:  echo "IP_DA_VM $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
gh secret set DEPLOY_KNOWN_HOSTS -R dmrangel/mitra-bot # cole a linha acima
```

Merge na `main` **com commit de merge** (sem squash/rebase), para o
`git merge --ff-only` da VM continuar funcionando. O workflow roda os testes e,
se passarem, o `deploy.sh`. Confira:

```bash
pm2 ls     # mitra-bot online; sweetbot e chrollo com o MESMO número de restarts de antes
```

Por fim, apague a cópia local da chave privada: `rm mitra-bot-actions`.

## O que fica na VM

| Caminho | O que é |
|---|---|
| `/home/ubuntu/mitra-bot/` | Clone do repositório (branch `main`) |
| `/home/ubuntu/mitra-bot/.env` | Configuração privada, `chmod 600` |
| `/home/ubuntu/mitra-bot/auth/` | **Sessão do WhatsApp = a conta.** `chmod 700` |
| `/home/ubuntu/mitra-bot/pedidos.json` | Fila de pedidos de oração |
| `~/.ssh/deploy_mitra-bot` | Chave só de **leitura** do repositório |
| linha `mitra-bot` no `~/.ssh/authorized_keys` | Chave do Actions, só roda `deploy.sh` |

## Mudanças no ecosystem.config.cjs

O `pm2 restart` do deploy não relê limites de memória e `node_args`. Se mudar o
`ecosystem.config.cjs`, aplique à mão:

```bash
cd /home/ubuntu/mitra-bot && pm2 delete mitra-bot && pm2 start ecosystem.config.cjs && pm2 save
```

## Rollback

- Parar o bot: `pm2 stop mitra-bot && pm2 save` (ou `pm2 delete mitra-bot && pm2 save`).
- Desconectar o número: no celular, *Aparelhos conectados* > remover o aparelho
  do bot; e `rm -rf /home/ubuntu/mitra-bot/auth`.
- Desfazer o acesso do Actions: remover a linha do `mitra-bot` no
  `~/.ssh/authorized_keys` (ou restaurar o backup) e apagar os secrets.
- Voltar uma versão: `git revert` do commit na `main` e push; o deploy é automático.

## Riscos

- **Termos do WhatsApp:** Baileys não é oficial e o número pode ser banido. O
  bot só responde a quem escreveu, com "digitando" e limite por minuto. Se o
  atendimento crescer, o caminho sem esse risco é a API oficial do WhatsApp
  Business (Meta), que exige cadastro e é paga por conversa.
- **Mudanças no WhatsApp** podem quebrar o Baileys de um dia para o outro: é
  atualizar a biblioteca e dar push.
- **Memória:** com três bots, acompanhe `pm2 ls` / `free -h`.
- **Logs do pm2 crescem sem limite** se o `pm2-logrotate` não estiver instalado
  (`pm2 ls` mostra os módulos). Confira antes de instalar: ele vale para todos
  os bots.
