const { config } = require('../config');
const { MSG } = require('../conteudo');
const { enviar } = require('./envio');
const estado = require('./estado');
const { erro } = require('./log');

// ---------------------------------------------------------------------------
// Sessão de atendimento: depois de cada resposta do menu, se a pessoa ficar
// TEMPO_AVISO_MIN em silêncio o bot pergunta se pode ajudar com algo mais; se
// continuar em silêncio por TEMPO_ENCERRAMENTO_MIN, encerra com a despedida.
// ---------------------------------------------------------------------------

/** @type {Map<string, {avisoTimeout: any, encerramentoTimeout: any}>} */
const sessoes = new Map();

function limparTimers(chatId) {
    const sessao = sessoes.get(chatId);
    if (sessao) {
        clearTimeout(sessao.avisoTimeout);
        clearTimeout(sessao.encerramentoTimeout);
        sessoes.delete(chatId);
    }
}

/** Há uma conversa em andamento (o bot respondeu há pouco)? */
const sessaoAtiva = chatId => sessoes.has(chatId);

async function encerrarAtendimento(chatId) {
    limparTimers(chatId);
    estado.definirModo(chatId, estado.MODO.MENU);
    await enviar(chatId, MSG.encerramento);
}

function iniciarTimers(chatId) {
    limparTimers(chatId);

    const sessao = { avisoTimeout: null, encerramentoTimeout: null };
    sessoes.set(chatId, sessao);

    sessao.avisoTimeout = setTimeout(async () => {
        await enviar(chatId, MSG.algoMais);

        // Entre o disparo do timer e o fim do envio a conversa pode ter
        // recomeçado. Sem esta checagem, o encerramento antigo fechava uma
        // conversa nova 5 minutos depois.
        if (sessoes.get(chatId) !== sessao) return;

        sessao.encerramentoTimeout = setTimeout(() => {
            encerrarAtendimento(chatId).catch(e => erro('encerrarAtendimento', e));
        }, config.tempoEncerramento);
    }, config.tempoAviso);
}

module.exports = { sessoes, sessaoAtiva, limparTimers, iniciarTimers, encerrarAtendimento };
