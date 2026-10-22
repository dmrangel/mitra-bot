# mitra-bot

Bot de atendimento automático do WhatsApp do Santuário de Santa Rita.

Feito com [Baileys](https://github.com/WhiskeySockets/Baileys), que conversa
direto com o WhatsApp por WebSocket, **sem navegador** (o antigo whatsapp-web.js
abria um Chromium inteiro; o Baileys sobe com ~120 MB de RAM). Não usa API paga nem API key. O bot entra
como um *aparelho conectado* do celular do Santuário, pareado por **código de
8 letras**, e a sessão fica salva na pasta `auth/`.

> **A pasta `auth/` é a conta do WhatsApp.** Quem tiver esses arquivos controla o
> número. Ela fica fora do Git, com `chmod 700`, e nunca deve ser copiada sem
> criptografia nem colada em lugar nenhum.

> **Biblioteca não oficial.** Assim como o whatsapp-web.js, o Baileys não é
> autorizado pelo WhatsApp: existe risco de o número ser banido. O bot só
> responde a quem escreveu, mostra "digitando" antes de responder e limita o
> envio por minuto, que é o perfil de menor risco. Nunca use para disparar
> mensagens em massa.

---

## 1. Instalação

Requisitos: **Node.js 20 ou superior** e **pm2**.

```bash
npm ci --omit=dev
```

A instalação na VM Oracle (chaves, pareamento, deploy automático) está passo a
passo em [`docs/VM.md`](docs/VM.md).

## 2. Configuração

Todos os números, grupos e tempos ficam no arquivo `.env`, que **nunca vai para
o Git**. Copie o modelo e preencha:

```bash
cp .env.example .env
```

Variáveis obrigatórias:

| Variável | O que é |
|---|---|
| `GRUPOS_ORACAO` | Grupo(s) onde os pedidos **aprovados** são publicados |
| `NUMEROS_VERIFICACAO` | Quem recebe os pedidos para aprovar e pode usar `!pedidos` / `!aprovar` |
| `NUMERO_BOT` | Número do aparelho do bot (só dígitos, com 55 e DDD). Só é usado para parear |

O bot **não sobe** se alguma delas estiver vazia — ele avisa exatamente o que
falta em vez de rodar quebrado.

### Como descobrir os IDs

Com o bot no ar, envie `!idgrupo` dentro do grupo desejado, a partir do próprio
celular do Santuário ou de um número que já esteja em `NUMEROS_VERIFICACAO`. O
bot responde com o ID.

Formatos aceitos:
- Pessoa: `5521999999999` (número puro), `5521999999999@s.whatsapp.net`, ou
  `5521999999999@c.us` (formato do bot antigo; o `.env` antigo continua valendo)
- Pessoa no formato novo do WhatsApp: `000000000000000@lid`
- Grupo: `120363000000000000@g.us`

## 3. Rodando

```bash
npm start                          # primeiro plano
pm2 start ecosystem.config.cjs     # segundo plano (servidor)
pm2 logs mitra-bot                 # ver o código de pareamento / os logs
pm2 stop mitra-bot
```

**Primeira execução (pareamento):** com `NUMERO_BOT` preenchido, o log mostra
`CÓDIGO DE PAREAMENTO: ABCD-EFGH`. No celular do bot: *Aparelhos conectados >
Conectar aparelho > Conectar com número de telefone* e digite o código. Ele
vale por poucos minutos; se expirar, um novo aparece no log. Depois disso a
sessão fica em `auth/` e o código não aparece mais.

**Nunca rode duas cópias do bot no mesmo número** (por exemplo, no PC e na
VM): as duas responderiam a cada mensagem.

Conferir sintaxe e rodar os testes:

```bash
npm run check
npm test
```

## 4. Comandos administrativos

Do próprio aparelho do Santuário, dentro da conversa:

| Comando | Efeito |
|---|---|
| `!manual` | Pausa o bot **nesta conversa** para atender à mão |
| `!auto` | Devolve a conversa para o bot |
| `!pedidos`, `!aprovar <ID>`, `!idgrupo` | Iguais aos de baixo |

De qualquer número listado em `NUMEROS_VERIFICACAO` (ou do próprio aparelho):

| Comando | Efeito |
|---|---|
| `!pedidos` | Lista os pedidos de oração aguardando aprovação |
| `!aprovar <ID>` | Publica o pedido no grupo de oração |
| `!idgrupo` | Responde com o ID do grupo/conversa atual |

## 5. Fluxo dos pedidos de oração

1. A pessoa escolhe a opção **2** e escreve o pedido.
2. O pedido vai para `NUMEROS_VERIFICACAO` com um ID.
3. Alguém revisa e envia `!aprovar <ID>`.
4. Só então ele é publicado em `GRUPOS_ORACAO`.

A fila fica salva em `pedidos.json`, então **um reinício não perde pedidos**.
Pedidos não aprovados são descartados após `VALIDADE_PEDIDO_DIAS` (padrão: 7).

## 6. Testando sem incomodar os fiéis

No `.env`:

```
MODO_TESTE=true
NUMERO_TESTE=5521999999999@c.us
```

Assim o bot só responde a esse número.

## 7. Onde mexer em cada coisa

| Arquivo | Conteúdo |
|---|---|
| `menu.js` | Textos das respostas e palavras-chave (informação pública) |
| `.env` | Números, grupos e tempos (**privado**) |
| `config.js` | Leitura e validação do `.env` |
| `lib/fluxoConversa.js` | Lógica do atendimento |
| `lib/cliente.js` | Conexão com o WhatsApp (Baileys), reconexão, pareamento |
| `lib/mensagem.js` | Converte a mensagem do Baileys para o formato usado pelo fluxo |
| `lib/envio.js` | Envio com "digitando" e limite por minuto |
| `deploy.sh`, `.github/workflows/deploy.yml` | Deploy automático na VM |

Para mudar um horário ou um valor, mexa **só no `menu.js`**.

## 8. Problemas comuns

**O código de pareamento não é aceito no celular**
Confira `NUMERO_BOT`: precisa ser exatamente o número registrado no WhatsApp,
com 55 e DDD. Números antigos às vezes estão registrados **sem o 9** inicial;
tente a outra forma. Depois de mudar, apague `auth/` e reinicie.

**O bot parou e o pm2 não reinicia (status `stopped`)**
O WhatsApp desconectou o aparelho (alguém removeu em *Aparelhos conectados*, ou
a sessão expirou). O log diz `O WhatsApp encerrou a sessão`. Para parear de
novo: `rm -rf auth && pm2 restart mitra-bot` e siga o código do log.

**Fica reconectando / caiu depois de uma atualização do WhatsApp**
O WhatsApp mudou algo no protocolo. Atualize a biblioteca:
`npm install @whiskeysockets/baileys@latest`, rode `npm test`, faça commit e
push na `main`: o deploy é automático.

**O bot não responde ninguém**
Confira se `MODO_TESTE` está `false`, e se o número não caiu na `BLACKLIST`.

**Pedi para o bot parar numa conversa e ele não volta**
Envie `!auto` naquela conversa.
