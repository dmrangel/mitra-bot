const { config } = require('../config');
const cliente = require('./cliente');
const { normalizarJid, ehGrupo, ehConversaComum } = require('./jids');
const { erro } = require('./log');

// ---------------------------------------------------------------------------
// Cuidados contra banimento: o WhatsApp desconfia de contas que respondem
// instantaneamente e em rajada. Antes de cada envio o bot mostra "digitando"
// por um instante, e nunca passa de config.limiteEnviosMinuto no total.
// ---------------------------------------------------------------------------

const espera = ms => new Promise(r => setTimeout(r, ms));

const enviosRecentes = [];

async function aguardarVaga() {
    for (;;) {
        const agora = Date.now();
        while (enviosRecentes.length && agora - enviosRecentes[0] >= 60000) enviosRecentes.shift();
        if (enviosRecentes.length < config.limiteEnviosMinuto) {
            enviosRecentes.push(agora);
            return;
        }
        await espera(60000 - (agora - enviosRecentes[0]) + 50);
    }
}

async function enviar(destino, texto) {
    const jid = normalizarJid(destino);
    // Última barreira: o bot só escreve para pessoas e grupos, nunca para
    // status, listas de transmissão ou canais.
    if (!ehConversaComum(jid)) {
        erro('enviar mensagem', new Error('destino não é pessoa nem grupo; envio recusado'));
        return false;
    }
    try {
        await aguardarVaga();
        if (!ehGrupo(jid) && config.atrasoRespostaMs > 0) {
            await cliente.digitando(jid, true).catch(() => {});
            // Um pouco de variação para não parecer cronometrado.
            await espera(config.atrasoRespostaMs + Math.floor(Math.random() * 500));
            await cliente.digitando(jid, false).catch(() => {});
        }
        await cliente.enviarTexto(jid, texto);
        return true;
    } catch (e) {
        erro(`enviar mensagem para ${jid}`, e);
        return false;
    }
}

async function enviarParaTodos(destinos, texto) {
    let enviados = 0;
    for (const destino of destinos) {
        if (await enviar(destino, texto)) enviados++;
    }
    return enviados;
}

module.exports = { enviar, enviarParaTodos };
