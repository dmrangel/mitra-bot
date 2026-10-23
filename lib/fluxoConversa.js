const { config } = require('../config');
const { MSG } = require('../conteudo');
const { erro } = require('./log');
const { startupTime } = require('./startup');
const testadores = require('./testadores');
const { enviar, enviarParaTodos } = require('./envio');
const estado = require('./estado');
const { MODO } = estado;
const { sessaoAtiva, limparTimers, iniciarTimers, encerrarAtendimento } = require('./timers');
const { normalizar, encontrarOpcao, ehDespedida, ehConfirmacao } = require('./menuMatcher');
const { secretariaAberta } = require('./horario');
const { ehAdmin, CMD_APROVAR, idsDoRemetente } = require('./permissoes');
const { contem } = require('./jids');
const { dadosDoContato } = require('./contato');
const { pedidosPendentes, listarPedidos, aprovarPedido, gerarIdPedido, salvarPedidos } = require('./pedidos');

const PEDE_MENU = new Set(['voltar', 'menu', 'inicio', 'voltar ao menu', 'voltar para o menu']);

// ---------------------------------------------------------------------------
// Comandos da equipe
// ---------------------------------------------------------------------------

/**
 * !pedidos, !aprovar e !idgrupo. Valem do celular do Santuário e de quem está
 * em NUMEROS_VERIFICACAO (no privado ou num grupo).
 * @returns {Promise<boolean>} true se era um comando
 */
async function comandoDaEquipe(comando, chat) {
    if (comando === '!pedidos') {
        await enviar(chat, listarPedidos());
        return true;
    }
    if (comando === '!idgrupo') {
        await enviar(chat, chat);
        return true;
    }
    if (CMD_APROVAR.test(comando)) {
        await aprovarPedido(comando.split(/\s+/)[1], chat);
        return true;
    }
    return false;
}

// Mensagens escritas no próprio celular do Santuário (fromMe). Aqui `chat` é a
// conversa onde o comando foi digitado.
async function tratarComandoDoAparelho(msg) {
    // Sem isto, um !aprovar antigo é reexecutado a cada reinício.
    if (msg.timestamp < startupTime) return;

    const comando = String(msg.body || '').trim();
    const chat = msg.to;

    if (comando === '!manual') {
        estado.definirModo(chat, MODO.PAUSADO);
        limparTimers(chat);
        return;
    }
    if (comando === '!auto') {
        estado.definirModo(chat, MODO.MENU);
        iniciarTimers(chat);
        return;
    }
    await comandoDaEquipe(comando, chat);
}

// ---------------------------------------------------------------------------
// Mensagens recebidas
// ---------------------------------------------------------------------------

function deveIgnorar(msg) {
    if (contem(config.blacklist, idsDoRemetente(msg))) return true;
    const de = msg.from;
    return de.endsWith('@g.us') || de.endsWith('@newsletter') || de.endsWith('@broadcast');
}

/**
 * Modo teste: o bot só atende quem mandou "/teste" (ou o NUMERO_TESTE).
 * @returns {Promise<boolean>} true se a mensagem deve seguir para o atendimento
 */
async function passaPeloModoTeste(msg, corpo) {
    const ids = idsDoRemetente(msg);
    const comandoTeste = testadores.comandoDeTeste(corpo);

    if (comandoTeste === 'entrar') {
        testadores.adicionar(ids);
        const horas = Math.max(1, Math.round(config.testeValidadeMs / (60 * 60 * 1000)));
        await enviar(msg.from, MSG.testeAtivado(horas));
        await enviar(msg.from, MSG.menu);
        iniciarTimers(msg.from);
        return false;
    }
    if (comandoTeste === 'sair') {
        // Quem não estava inscrito não recebe resposta nenhuma.
        if (testadores.remover(ids)) {
            estado.definirModo(msg.from, MODO.MENU);
            limparTimers(msg.from);
            await enviar(msg.from, MSG.testeDesativado);
        }
        return false;
    }
    return testadores.podeResponder(ids);
}

async function tratarMensagem(msg) {
    // Ignora tudo que é anterior ao boot. Isto precisa vir antes dos comandos:
    // do jeito antigo, um !aprovar velho era reexecutado a cada reinício.
    if (msg.timestamp < startupTime) return;

    const corpo = String(msg.body || '').trim();

    if (ehAdmin(msg) && await comandoDaEquipe(corpo, msg.from)) return;
    if (deveIgnorar(msg)) return;
    if (config.modoTeste && !await passaPeloModoTeste(msg, corpo)) return;

    const texto = normalizar(corpo);

    switch (estado.modoDe(msg.from)) {
        case MODO.PAUSADO:
            return;
        case MODO.ATENDENTE:
            // Calado: quem responde agora é a secretaria. Só "voltar" religa.
            if (PEDE_MENU.has(texto)) await voltarAoMenu(msg.from);
            return;
        case MODO.ORACAO:
            await receberPedidoOracao(msg, corpo, texto);
            return;
        default:
            await atenderMenu(msg, corpo, texto);
    }
}

async function voltarAoMenu(chat) {
    estado.definirModo(chat, MODO.MENU);
    await enviar(chat, MSG.voltouAoMenu);
    iniciarTimers(chat);
}

async function atenderMenu(msg, corpo, texto) {
    const chat = msg.from;

    // "ok", "👍" no meio de uma conversa: não reenvia o menu inteiro.
    if (!msg.hasMedia && sessaoAtiva(chat) && ehConfirmacao(corpo)) return;

    if (estado.cooldown.has(chat)) return;
    estado.cooldown.add(chat);
    setTimeout(() => estado.cooldown.delete(chat), config.cooldownMs);

    if (!msg.hasMedia && ehDespedida(texto)) {
        await encerrarAtendimento(chat);
        return;
    }

    limparTimers(chat);

    if (msg.hasMedia) {
        await enviar(chat, MSG.soTexto);
        iniciarTimers(chat);
        return;
    }

    const opcao = encontrarOpcao(texto);
    if (!opcao) {
        await enviar(chat, MSG.menu);
        iniciarTimers(chat);
        return;
    }

    const aberta = secretariaAberta();
    const resposta = typeof opcao.resposta === 'function'
        ? opcao.resposta({ secretariaAberta: aberta })
        : opcao.resposta;
    await enviar(chat, resposta);

    if (opcao.acao === 'oracao') {
        estado.definirModo(chat, MODO.ORACAO);
        return;
    }
    if (opcao.acao === 'atendente') {
        estado.definirModo(chat, MODO.ATENDENTE);
        await avisarEquipeAtendimento(msg, aberta);
        return;
    }
    iniciarTimers(chat);
}

// Este caminho não passa pelo cooldown de propósito: o cooldown era aplicado
// ao escolher a opção 2 e engolia silenciosamente o pedido escrito logo em
// seguida, dentro dos 5 segundos.
async function receberPedidoOracao(msg, corpo, texto) {
    const chat = msg.from;

    if (PEDE_MENU.has(texto)) {
        await voltarAoMenu(chat);
        return;
    }
    if (msg.hasMedia || !corpo) {
        await enviar(chat, MSG.pedidoSoTexto);
        return;
    }

    // Anti-flood: evita que uma pessoa dispare dezenas de avisos à equipe.
    const ultimo = estado.ultimoPedido.get(chat) || 0;
    if (Date.now() - ultimo < config.intervaloPedidoMs) {
        await enviar(chat, MSG.pedidoRepetido);
        return;
    }
    estado.ultimoPedido.set(chat, Date.now());

    const { nome, link } = await dadosDoContato(msg);
    const id = gerarIdPedido();

    pedidosPendentes.set(id, { nome, texto: corpo, de: chat, criadoEm: Date.now() });
    salvarPedidos();

    const enviados = await enviarParaTodos(
        config.numerosVerificacao,
        MSG.equipe.novoPedido({ nome, link, texto: corpo, id })
    );
    if (enviados === 0) {
        erro('pedido de oração', `nenhum número de verificação recebeu o aviso do pedido ${id}`);
    }

    estado.definirModo(chat, MODO.MENU);
    await enviar(chat, MSG.pedidoRecebido);
    iniciarTimers(chat);
}

async function avisarEquipeAtendimento(msg, aberta) {
    const { nome, link } = await dadosDoContato(msg);
    const destinos = config.gruposNotificacaoHumano.length
        ? config.gruposNotificacaoHumano
        : config.numerosVerificacao;

    const enviados = await enviarParaTodos(destinos, MSG.equipe.atendimento({ nome, link, secretariaAberta: aberta }));
    if (enviados === 0) {
        erro('atendimento humano', `ninguém foi avisado sobre a solicitação de ${nome}`);
    }
}

module.exports = { tratarMensagem, tratarComandoDoAparelho };
