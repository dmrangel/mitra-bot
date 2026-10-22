const { normalizarJid, ehPn, ehLid, numeroDoJid } = require('./jids');
const envio = require('./envio');

// ---------------------------------------------------------------------------
// Adaptador: mensagem do Baileys -> o mesmo formato que o resto do bot já
// usava com o whatsapp-web.js ({ from, author, fromMe, body, hasMedia, ... }).
// Assim o fluxo da conversa e os testes não dependem da biblioteca.
// ---------------------------------------------------------------------------

// Embrulhos que só carregam outra mensagem dentro.
const EMBRULHOS = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage'
];

// Campos que acompanham a mensagem mas não são conteúdo.
const METADADOS = new Set(['messageContextInfo', 'senderKeyDistributionMessage']);

// Eventos que chegam como "mensagem" mas não foram escritos por ninguém:
// apagar, editar, reagir, votar, fixar... O whatsapp-web.js não os entregava
// no evento 'message'; aqui, sem este filtro, cada reação recebia o menu.
const IGNORAR = new Set([
    'protocolMessage',
    'reactionMessage',
    'pollUpdateMessage',
    'encReactionMessage',
    'keepInChatMessage',
    'pinInChatMessage',
    'editedMessage',
    'callLogMesssage',
    'callLogMessage'
]);

function desembrulhar(conteudo) {
    let atual = conteudo;
    for (let i = 0; i < 5 && atual; i++) {
        const chave = EMBRULHOS.find(k => atual[k] && atual[k].message);
        if (!chave) break;
        atual = atual[chave].message;
    }
    return atual || null;
}

function textoDe(c) {
    return c.conversation ||
        (c.extendedTextMessage && c.extendedTextMessage.text) ||
        (c.imageMessage && c.imageMessage.caption) ||
        (c.videoMessage && c.videoMessage.caption) ||
        (c.documentMessage && c.documentMessage.caption) ||
        '';
}

// O protobuf às vezes entrega o horário como Long em vez de number.
function segundos(t) {
    if (t && typeof t.toNumber === 'function') return t.toNumber();
    return Number(t || 0);
}

/** Escolhe um id estável para a conversa: o número (PN) quando conhecido. */
function escolherId(principal, alternativo, pnResolvido) {
    const ids = [principal, alternativo, pnResolvido].map(normalizarJid).filter(Boolean);
    return ids.find(ehPn) || ids[0] || '';
}

/**
 * @param {object} wa  mensagem crua do evento 'messages.upsert'
 * @param {object} [opcoes]
 * @param {(lid: string) => Promise<string|null>} [opcoes.pnDoLid]
 * @returns {Promise<object|null>} null quando não é algo a tratar
 */
async function adaptarMensagem(wa, opcoes = {}) {
    if (!wa || !wa.key || !wa.message) return null;

    const conteudo = desembrulhar(wa.message);
    if (!conteudo) return null;

    const chaves = Object.keys(conteudo).filter(k => conteudo[k] != null && !METADADOS.has(k));
    if (chaves.length === 0 || chaves.some(k => IGNORAR.has(k))) return null;

    const body = textoDe(conteudo);
    const ehTexto = chaves.includes('conversation') || chaves.includes('extendedTextMessage');
    // Qualquer outra coisa (foto, áudio, figurinha, localização, contato...)
    // recebe o aviso de "envie apenas texto", como antes.
    const hasMedia = !ehTexto;

    const { key } = wa;
    const pnDoLid = opcoes.pnDoLid || (async () => null);
    const resolver = async (jid, alt) => (ehLid(jid) && !ehPn(alt) ? pnDoLid(jid).catch(() => null) : null);

    const from = escolherId(key.remoteJid, key.remoteJidAlt, await resolver(key.remoteJid, key.remoteJidAlt));
    const author = key.participant
        ? escolherId(key.participant, key.participantAlt, await resolver(key.participant, key.participantAlt))
        : undefined;
    const pessoa = author || from;

    return {
        id: key.id,
        from,
        to: from, // com fromMe, a conversa é o destinatário
        author,
        // Todos os ids conhecidos de quem escreveu, para comparar com o .env
        // independente de o WhatsApp ter mandado o número ou o @lid.
        aliases: [key.remoteJid, key.remoteJidAlt, from].map(normalizarJid).filter(Boolean),
        authorAliases: [key.participant, key.participantAlt, author].map(normalizarJid).filter(Boolean),
        fromMe: Boolean(key.fromMe),
        body,
        hasMedia,
        timestamp: segundos(wa.messageTimestamp),
        reply: texto => envio.enviar(from, texto),
        getContact: async () => ({ pushname: wa.pushName || '', number: numeroDoJid(pessoa) })
    };
}

module.exports = { adaptarMensagem, desembrulhar };
