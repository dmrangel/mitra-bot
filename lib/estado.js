const { config } = require('../config');

// ---------------------------------------------------------------------------
// Estado de cada conversa: em que "modo" ela está.
//
//   menu     padrão: o bot responde ao menu (quem não está no mapa está aqui)
//   oracao   escolheu a opção 2: o próximo texto vira pedido de oração
//   certidao pediu certidão: o próximo texto vai para a equipe de atendimento
//   atendente escolheu a opção 8: o bot fica calado esperando um secretário
//   pausado  a secretaria mandou !manual pelo celular: calado até !auto
//
// oracao, certidao e atendente expiram sozinhos (EXPIRA_ORACAO_MIN, EXPIRA_HUMANO_HORAS):
// sem isso, quem escolhia a opção 2 e sumia tinha o "bom dia" de dias depois
// tratado como pedido de oração. pausado só sai com !auto.
// ---------------------------------------------------------------------------

const MODO = Object.freeze({
    MENU: 'menu',
    ORACAO: 'oracao',
    CERTIDAO: 'certidao',
    ATENDENTE: 'atendente',
    PAUSADO: 'pausado'
});

/** @type {Map<string, {modo: string, desde: number}>} */
const conversas = new Map();

// Controles de ritmo, independentes do modo.
const cooldown = new Set();
const ultimoPedido = new Map();

function validade(modo) {
    if (modo === MODO.ORACAO || modo === MODO.CERTIDAO) return config.expiraOracaoMs;
    if (modo === MODO.ATENDENTE) return config.expiraHumanoMs;
    return Infinity;
}

function expirou(c, agora = Date.now()) {
    return agora - c.desde > validade(c.modo);
}

function modoDe(chatId) {
    const c = conversas.get(chatId);
    if (!c) return MODO.MENU;
    if (expirou(c)) {
        conversas.delete(chatId);
        return MODO.MENU;
    }
    return c.modo;
}

function definirModo(chatId, modo) {
    if (modo === MODO.MENU) conversas.delete(chatId);
    else conversas.set(chatId, { modo, desde: Date.now() });
}

// Evita que os mapas cresçam indefinidamente num bot que fica meses no ar.
function limparMapasAuxiliares() {
    const agora = Date.now();
    for (const [chatId, quando] of ultimoPedido) {
        if (agora - quando > config.intervaloPedidoMs * 10) ultimoPedido.delete(chatId);
    }
    for (const [chatId, c] of conversas) {
        if (expirou(c, agora)) conversas.delete(chatId);
    }
}

module.exports = {
    MODO,
    conversas,
    cooldown,
    ultimoPedido,
    modoDe,
    definirModo,
    limparMapasAuxiliares
};
