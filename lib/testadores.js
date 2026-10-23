const fs = require('fs');

const { config } = require('../config');
const { log, erro } = require('./log');
const { normalizarJid, contem } = require('./jids');

// ---------------------------------------------------------------------------
// Testadores do modo teste
//
// Com MODO_TESTE=true o bot fica calado para todo mundo. Quem quiser testar
// manda "/teste" no privado e passa a ser atendido normalmente; "/teste sair"
// desfaz. A inscrição vale TESTE_VALIDADE_HORAS (padrão 24 h) e fica salva em
// testadores.json, então um reinício (ou um deploy) não tira ninguém do teste.
//
// A chave é o id já normalizado (lib/jids.js). Ao inscrever, guardamos todos os
// ids conhecidos de quem escreveu (número e @lid), porque o WhatsApp pode
// entregar a mesma pessoa de um jeito ou do outro.
// ---------------------------------------------------------------------------

/** @type {Map<string, number>} id normalizado -> momento (ms) em que a inscrição expira */
const testadores = new Map();

const CMD_TESTE = /^\/teste(?:\s+(sair))?$/i;

/** 'entrar' para "/teste", 'sair' para "/teste sair", null para qualquer outra coisa. */
function comandoDeTeste(corpo) {
    const m = CMD_TESTE.exec(String(corpo || '').trim());
    if (!m) return null;
    return m[1] ? 'sair' : 'entrar';
}

const normalizados = ids => ids.flat().map(normalizarJid).filter(Boolean);

function ativo(...ids) {
    const agora = Date.now();
    return normalizados(ids).some(id => (testadores.get(id) || 0) > agora);
}

/**
 * Quem pode ser atendido agora. Fora do modo teste, todo mundo. No modo teste,
 * só o NUMERO_TESTE (se houver) e quem se inscreveu com "/teste".
 */
function podeResponder(...ids) {
    if (!config.modoTeste) return true;
    if (config.numeroTeste && contem([config.numeroTeste], ...ids)) return true;
    return ativo(...ids);
}

function adicionar(...ids) {
    const ate = Date.now() + config.testeValidadeMs;
    for (const id of normalizados(ids)) testadores.set(id, ate);
    salvar();
}

/** @returns {boolean} true se havia inscrição para remover */
function remover(...ids) {
    let removeu = false;
    for (const id of normalizados(ids)) {
        if (testadores.delete(id)) removeu = true;
    }
    if (removeu) salvar();
    return removeu;
}

function carregar() {
    try {
        if (!fs.existsSync(config.arquivoTestadores)) return;
        const dados = JSON.parse(fs.readFileSync(config.arquivoTestadores, 'utf8'));
        const agora = Date.now();
        for (const [id, ate] of Object.entries(dados)) {
            if (typeof ate === 'number' && ate > agora) testadores.set(id, ate);
        }
        if (testadores.size > 0) log(`Testadores recuperados: ${testadores.size} id(s).`);
    } catch (e) {
        erro('carregar testadores.json', e);
    }
}

function salvar() {
    try {
        fs.writeFileSync(config.arquivoTestadores, JSON.stringify(Object.fromEntries(testadores), null, 2), 'utf8');
    } catch (e) {
        erro('salvar testadores.json', e);
    }
}

function limparExpirados() {
    const agora = Date.now();
    let removidos = 0;
    for (const [id, ate] of testadores) {
        if (ate <= agora) {
            testadores.delete(id);
            removidos++;
        }
    }
    if (removidos > 0) salvar();
}

module.exports = {
    testadores,
    comandoDeTeste,
    ativo,
    podeResponder,
    adicionar,
    remover,
    carregar,
    salvar,
    limparExpirados
};
