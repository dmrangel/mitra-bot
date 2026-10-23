const fs = require('fs');

const { config, gruposDeOracao } = require('../config');
const { MSG } = require('../conteudo');
const { log, erro } = require('./log');
const { enviar, enviarParaTodos } = require('./envio');

/** @type {Map<string, {nome: string, texto: string, de: string, criadoEm: number}>} */
const pedidosPendentes = new Map();

// ---------------------------------------------------------------------------
// Persistência dos pedidos de oração
//
// Antes ficavam só em memória: qualquer reinício (inclusive o process.exit(1)
// automático em caso de desconexão) apagava tudo que estava esperando aprovação.
// ---------------------------------------------------------------------------

function carregarPedidos() {
    try {
        if (!fs.existsSync(config.arquivoPedidos)) return;
        const dados = JSON.parse(fs.readFileSync(config.arquivoPedidos, 'utf8'));
        const agora = Date.now();
        let expirados = 0;
        for (const [id, p] of Object.entries(dados)) {
            if (!p || typeof p.texto !== 'string') continue;
            if (agora - (p.criadoEm || 0) > config.validadePedidoMs) {
                expirados++;
                continue;
            }
            pedidosPendentes.set(id, p);
        }
        log(`Pedidos pendentes recuperados: ${pedidosPendentes.size}${expirados ? ` (${expirados} expirados descartados)` : ''}.`);
    } catch (e) {
        erro('carregar pedidos.json', e);
    }
}

function salvarPedidos() {
    try {
        const obj = Object.fromEntries(pedidosPendentes);
        fs.writeFileSync(config.arquivoPedidos, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
        erro('salvar pedidos.json', e);
    }
}

function limparPedidosExpirados() {
    const agora = Date.now();
    let removidos = 0;
    for (const [id, p] of pedidosPendentes) {
        if (agora - (p.criadoEm || 0) > config.validadePedidoMs) {
            pedidosPendentes.delete(id);
            removidos++;
        }
    }
    if (removidos > 0) {
        log(`${removidos} pedido(s) expirado(s) removido(s).`);
        salvarPedidos();
    }
}

function listarPedidos() {
    if (pedidosPendentes.size === 0) return MSG.equipe.semPedidos;
    return MSG.equipe.listaPedidos([...pedidosPendentes].map(([id, p]) => ({
        id,
        nome: p.nome,
        resumo: p.texto.length > 60 ? `${p.texto.substring(0, 60)}...` : p.texto
    })));
}

async function aprovarPedido(idPedido, chatOrigem) {
    const id = String(idPedido || '').trim().toUpperCase();
    if (!id) {
        await enviar(chatOrigem, MSG.equipe.usoAprovar);
        return;
    }
    if (!pedidosPendentes.has(id)) {
        await enviar(chatOrigem, MSG.equipe.pedidoNaoEncontrado);
        return;
    }

    const p = pedidosPendentes.get(id);
    // No modo teste o destino é o grupo de teste, nunca o real (ver config.js).
    const enviados = await enviarParaTodos(gruposDeOracao(), MSG.equipe.pedidoPublicado(p));

    if (enviados === 0) {
        // Mantém o pedido na fila para poder tentar de novo.
        await enviar(chatOrigem, MSG.equipe.falhaPublicar);
        return;
    }

    pedidosPendentes.delete(id);
    salvarPedidos();
    await enviar(chatOrigem, MSG.equipe.aprovado(config.modoTeste));
    log(`Pedido ${id} aprovado e publicado em ${enviados} grupo(s)${config.modoTeste ? ' (modo teste: grupo de teste)' : ''}.`);
}

function gerarIdPedido() {
    let id;
    do {
        id = (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')).toUpperCase();
    } while (pedidosPendentes.has(id));
    return id;
}

module.exports = {
    pedidosPendentes,
    carregarPedidos,
    salvarPedidos,
    limparPedidosExpirados,
    listarPedidos,
    aprovarPedido,
    gerarIdPedido
};
