require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

const { normalizarJid } = require('./lib/jids');

function lista(valor) {
    return String(valor || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

function inteiro(valor, padrao) {
    const n = parseInt(valor, 10);
    return Number.isFinite(n) && n > 0 ? n : padrao;
}

function inteiroOuZero(valor, padrao) {
    const n = parseInt(valor, 10);
    return Number.isFinite(n) && n >= 0 ? n : padrao;
}

function texto(valor, padrao = '') {
    const v = String(valor || '').trim();
    return v || padrao;
}

const config = {
    // Número do próprio bot, só dígitos com DDI e DDD (ex.: 5521999999999).
    // Usado uma única vez, para gerar o código de pareamento.
    numeroBot: String(process.env.NUMERO_BOT || '').replace(/\D/g, ''),

    // Nível de log interno do Baileys (fatal, error, warn, info, debug).
    // Acima de "warn" ele imprime detalhes das mensagens: não use em produção.
    nivelLogBaileys: texto(process.env.LOG_BAILEYS, 'warn'),

    // Destinos (privados - nunca versionar)
    gruposOracao: lista(process.env.GRUPOS_ORACAO),
    // Grupo(s) de oração usados SÓ no modo teste: com MODO_TESTE=true os pedidos
    // aprovados vão para cá e nunca para GRUPOS_ORACAO (o grupo real). Virar a
    // flag para false troca o destino sozinho (ver gruposDeOracao()).
    gruposOracaoTeste: lista(process.env.GRUPOS_ORACAO_TESTE),
    gruposNotificacaoHumano: lista(process.env.GRUPOS_NOTIFICACAO_HUMANO),
    numerosVerificacao: lista(process.env.NUMEROS_VERIFICACAO),
    blacklist: lista(process.env.BLACKLIST),

    // Modo teste: o bot só responde ao NUMERO_TESTE (opcional) e a quem enviar
    // "/teste" no privado (lib/testadores.js).
    modoTeste: process.env.MODO_TESTE === 'true',
    numeroTeste: texto(process.env.NUMERO_TESTE),
    // Quanto tempo vale a inscrição de quem enviou "/teste".
    testeValidadeMs: inteiro(process.env.TESTE_VALIDADE_HORAS, 24) * 60 * 60 * 1000,

    // Tempos
    tempoAviso: inteiro(process.env.TEMPO_AVISO_MIN, 5) * 60 * 1000,
    tempoEncerramento: inteiro(process.env.TEMPO_ENCERRAMENTO_MIN, 5) * 60 * 1000,
    cooldownMs: inteiro(process.env.COOLDOWN_SEGUNDOS, 5) * 1000,
    // Tempo máximo que alguém fica "preso" num estado especial sem falar nada.
    expiraOracaoMs: inteiro(process.env.EXPIRA_ORACAO_MIN, 30) * 60 * 1000,
    expiraHumanoMs: inteiro(process.env.EXPIRA_HUMANO_HORAS, 6) * 60 * 60 * 1000,
    intervaloPedidoMs: inteiro(process.env.INTERVALO_PEDIDO_SEGUNDOS, 30) * 1000,
    validadePedidoMs: inteiro(process.env.VALIDADE_PEDIDO_DIAS, 7) * 24 * 60 * 60 * 1000,

    // Anti-banimento: "digitando..." antes de cada resposta e teto de envios.
    atrasoRespostaMs: inteiroOuZero(process.env.ATRASO_RESPOSTA_MS, 1200),
    limiteEnviosMinuto: inteiro(process.env.LIMITE_ENVIOS_MINUTO, 30),

    // Telefones públicos da secretaria (os mesmos que já aparecem no menu)
    telefones: lista(process.env.TELEFONES_SECRETARIA).length
        ? lista(process.env.TELEFONES_SECRETARIA)
        : ['(21) 2253-7564', '(21) 97908-2767'],

    arquivoPedidos: path.join(__dirname, 'pedidos.json'),
    arquivoTestadores: path.join(__dirname, 'testadores.json'),
    // A sessão do WhatsApp. Esta pasta É a conta: fora do Git, chmod 700.
    pastaAuth: path.join(__dirname, 'auth')
};

// Pessoa: número puro, @s.whatsapp.net, @c.us (formato antigo, aceito) ou @lid.
// Grupo: @g.us.
const ID_VALIDO = /^(\+?\d{8,15}|[^@\s]+@(s\.whatsapp\.net|c\.us|lid|g\.us))$/;

// O creds.json é criado já na primeira tentativa; "registered" só vira true
// depois que o código de pareamento foi digitado no celular.
function jaPareado() {
    try {
        const creds = JSON.parse(fs.readFileSync(path.join(config.pastaAuth, 'creds.json'), 'utf8'));
        return creds.registered === true;
    } catch (e) {
        return false;
    }
}

function validar() {
    const erros = [];
    const avisos = [];

    if (config.numerosVerificacao.length === 0) {
        erros.push('NUMEROS_VERIFICACAO está vazio: os pedidos de oração não teriam para onde ir.');
    }
    if (config.gruposOracao.length === 0) {
        erros.push('GRUPOS_ORACAO está vazio: pedidos aprovados não seriam publicados em lugar nenhum.');
    }
    if (config.gruposNotificacaoHumano.length === 0) {
        avisos.push('GRUPOS_NOTIFICACAO_HUMANO está vazio: os avisos de atendimento humano vão para NUMEROS_VERIFICACAO.');
    }
    if (config.modoTeste && !config.numeroTeste) {
        avisos.push('MODO_TESTE=true sem NUMERO_TESTE: o bot só vai atender quem enviar /teste.');
    }
    if (config.modoTeste && config.gruposOracaoTeste.length === 0) {
        erros.push('MODO_TESTE=true exige GRUPOS_ORACAO_TESTE: no modo teste os pedidos aprovados nunca vão para GRUPOS_ORACAO (o grupo real).');
    }
    if (config.modoTeste && config.gruposOracaoTeste.some(t => config.gruposOracao.some(r => normalizarJid(r) === normalizarJid(t)))) {
        avisos.push('GRUPOS_ORACAO_TESTE e GRUPOS_ORACAO apontam para o mesmo grupo: o modo teste não está separado da produção.');
    }
    if (config.numeroBot && !/^\d{10,15}$/.test(config.numeroBot)) {
        erros.push(`NUMERO_BOT inválido ("${config.numeroBot}"): use só dígitos com DDI e DDD, ex.: 5521999999999.`);
    }
    if (!config.numeroBot && !jaPareado()) {
        erros.push('NUMERO_BOT está vazio e ainda não há sessão salva: sem ele não dá para gerar o código de pareamento.');
    }

    const campos = {
        GRUPOS_ORACAO: config.gruposOracao,
        GRUPOS_ORACAO_TESTE: config.gruposOracaoTeste,
        GRUPOS_NOTIFICACAO_HUMANO: config.gruposNotificacaoHumano,
        NUMEROS_VERIFICACAO: config.numerosVerificacao,
        BLACKLIST: config.blacklist
    };
    for (const [nome, valores] of Object.entries(campos)) {
        for (const v of valores) {
            if (!ID_VALIDO.test(v)) {
                avisos.push(`${nome}: "${v}" não é um número nem termina em @s.whatsapp.net, @c.us, @lid ou @g.us — provavelmente não vai funcionar.`);
            }
        }
    }
    if (config.numeroTeste && !ID_VALIDO.test(config.numeroTeste)) {
        avisos.push(`NUMERO_TESTE: "${config.numeroTeste}" não parece um número nem um id de pessoa.`);
    }

    return { erros, avisos };
}

/**
 * Grupos que recebem os pedidos de oração aprovados: os de teste no modo teste,
 * os reais fora dele. Se estiver em modo teste e não houver grupo de teste, a
 * lista é vazia: o pedido fica pendente em vez de ir parar no grupo real.
 */
function gruposDeOracao() {
    return config.modoTeste ? config.gruposOracaoTeste : config.gruposOracao;
}

module.exports = { config, validar, jaPareado, gruposDeOracao };
