const fs = require('fs');

const { config } = require('../config');
const { log, erro } = require('./log');

// ---------------------------------------------------------------------------
// Conexão com o WhatsApp via Baileys (WebSocket direto, sem navegador).
//
// A pasta config.pastaAuth É a conta do WhatsApp: quem tiver esses arquivos
// controla o número. Nunca vai para o Git nem para o log.
//
// O Baileys é ESM; este projeto é CommonJS. Por isso ele é carregado com
// import() dinâmico dentro de conectar(), nunca no require deste arquivo:
// assim os testes (test/) importam o resto do código sem tocar na rede.
// ---------------------------------------------------------------------------

// Código de saída usado quando o WhatsApp desconectou o aparelho. O pm2 está
// configurado (stop_exit_codes) para NÃO reiniciar com ele: sem pareamento
// válido, reiniciar em loop só geraria códigos que ninguém vai digitar.
const SAIDA_DESLOGADO = 78;

let baileys = null;
let sock = null;
let conectado = false;
let encerrado = false;
let tentativas = 0;

// Últimas mensagens enviadas, para o Baileys reenviar quando o celular de
// quem recebeu pede de novo ("Aguardando mensagem..."). Não guarda o que
// os fiéis escrevem, só o que o bot mandou.
const enviadas = new Map();
const LIMITE_ENVIADAS = 200;

function guardarEnviada(m) {
    if (!m || !m.key || !m.key.id || !m.message) return;
    enviadas.set(m.key.id, m.message);
    if (enviadas.size > LIMITE_ENVIADAS) enviadas.delete(enviadas.keys().next().value);
}

async function carregarBaileys() {
    if (!baileys) baileys = await import('@whiskeysockets/baileys');
    return baileys;
}

function prepararPastaAuth() {
    fs.mkdirSync(config.pastaAuth, { recursive: true, mode: 0o700 });
    try {
        fs.chmodSync(config.pastaAuth, 0o700);
    } catch (e) {
        erro('chmod da pasta de sessão', e);
    }
}

/**
 * Abre (ou reabre) a conexão. Reconecta sozinho, com espera crescente,
 * exceto quando o WhatsApp desconecta o aparelho de vez.
 *
 * @param {object} h
 * @param {(mensagens: object[], tipo: string) => void} h.aoReceber
 * @param {(chamadas: object[]) => void} h.aoLigar
 * @param {() => void} h.aoDeslogar
 */
async function conectar(h) {
    const B = await carregarBaileys();
    const makeWASocket = B.makeWASocket || B.default;

    prepararPastaAuth();
    const { state, saveCreds } = await B.useMultiFileAuthState(config.pastaAuth);

    // Versão do protocolo do WhatsApp Web. Se a consulta falhar, o Baileys usa
    // a que veio embutida no pacote.
    let version;
    try {
        ({ version } = await B.fetchLatestBaileysVersion());
    } catch (e) {
        erro('consultar versão do WhatsApp Web', e);
    }

    const s = makeWASocket({
        version,
        auth: state,
        logger: require('pino')({ level: config.nivelLogBaileys }),
        browser: B.Browsers.ubuntu('Chrome'),
        // Com true, o celular do Santuário para de receber notificações.
        markOnlineOnConnect: false,
        syncFullHistory: false,
        // Não entrega ao próprio bot as mensagens que ele mesmo enviou.
        emitOwnEvents: false,
        generateHighQualityLinkPreview: false,
        // Status dos contatos (muitos fiéis estão salvos na agenda) nem chegam
        // ao bot: o Baileys descarta antes de decifrar.
        shouldIgnoreJid: jid => jid === 'status@broadcast',
        getMessage: async key => enviadas.get(key.id)
    });
    sock = s;
    conectado = false;

    s.ev.on('creds.update', saveCreds);

    let codigoPedido = false;
    s.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (s !== sock) return; // evento atrasado de uma conexão antiga

        // O "qr" chega quando o WhatsApp está pronto para parear. Em vez de
        // QR (ruim de ler pelo log do pm2), pedimos um código de 8 letras.
        if (qr && !s.authState.creds.registered && !codigoPedido) {
            codigoPedido = true;
            try {
                const codigo = await s.requestPairingCode(config.numeroBot);
                const legivel = (codigo.match(/.{1,4}/g) || [codigo]).join('-');
                log(`CÓDIGO DE PAREAMENTO: ${legivel}`);
                log('No celular do bot: Aparelhos conectados > Conectar aparelho > Conectar com número de telefone. Vale por poucos minutos; se expirar, um novo código aparece aqui.');
            } catch (e) {
                erro('pedir código de pareamento', e);
            }
        }

        if (connection === 'open') {
            conectado = true;
            tentativas = 0;
            log('Conectado ao WhatsApp.');
        }

        if (connection === 'close') {
            conectado = false;
            if (encerrado) return;

            const status = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
                ? lastDisconnect.error.output.statusCode
                : undefined;

            // 401: o aparelho foi removido no celular (ou a sessão ficou inválida).
            // 403: o WhatsApp recusou a conta. Insistir só piora a situação.
            if (status === B.DisconnectReason.loggedOut || status === B.DisconnectReason.forbidden) {
                log(`O WhatsApp encerrou a sessão (código ${status}). O bot vai parar SEM reiniciar.`);
                log(`Para parear de novo: apague a pasta ${config.pastaAuth}, confira NUMERO_BOT no .env e rode "pm2 restart mitra-bot".`);
                h.aoDeslogar();
                return;
            }

            // 515 é normal logo depois de parear: reconecta na hora.
            const espera = status === B.DisconnectReason.restartRequired
                ? 0
                : Math.min(60000, 2000 * 2 ** tentativas);
            tentativas++;
            log(`Conexão fechada (código ${status || 'desconhecido'}). Reconectando em ${espera / 1000}s.`);
            setTimeout(() => {
                conectar(h).catch(e => {
                    erro('reconectar', e);
                    process.exit(1); // o pm2 reinicia
                });
            }, espera);
        }
    });

    s.ev.on('messages.upsert', ({ messages, type }) => h.aoReceber(messages, type));
    s.ev.on('call', chamadas => h.aoLigar(chamadas));

    return s;
}

function socketPronto() {
    if (!sock || !conectado) throw new Error('sem conexão com o WhatsApp no momento');
    return sock;
}

async function enviarTexto(jid, texto) {
    const enviada = await socketPronto().sendMessage(jid, { text: texto });
    guardarEnviada(enviada);
    return enviada;
}

async function digitando(jid, ligado) {
    await socketPronto().sendPresenceUpdate(ligado ? 'composing' : 'paused', jid);
}

async function rejeitarLigacao(id, de) {
    await socketPronto().rejectCall(id, de);
}

/** Número (PN) de um contato @lid, quando o WhatsApp já informou o vínculo. */
async function pnDoLid(lid) {
    const repo = sock && sock.signalRepository;
    if (!repo || !repo.lidMapping) return null;
    return repo.lidMapping.getPNForLID(lid);
}

function encerrar() {
    encerrado = true;
    conectado = false;
    if (sock) {
        try {
            sock.end(undefined);
        } catch (e) {
            erro('fechar conexão', e);
        }
    }
}

module.exports = {
    SAIDA_DESLOGADO,
    conectar,
    enviarTexto,
    digitando,
    rejeitarLigacao,
    pnDoLid,
    encerrar
};
