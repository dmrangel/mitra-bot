const test = require('node:test');
const assert = require('node:assert/strict');

const { config } = require('../config');
const estado = require('../lib/estado');
const { MODO } = estado;

test.afterEach(() => {
    estado.conversas.clear();
    estado.ultimoPedido.clear();
    config.expiraOracaoMs = 30 * 60 * 1000;
    config.expiraHumanoMs = 6 * 60 * 60 * 1000;
});

test('quem nunca escreveu está no menu', () => {
    assert.equal(estado.modoDe('ninguem'), MODO.MENU);
});

test('definirModo troca o modo, e voltar ao menu tira a conversa do mapa', () => {
    estado.definirModo('chatA', MODO.ORACAO);
    assert.equal(estado.modoDe('chatA'), MODO.ORACAO);
    estado.definirModo('chatA', MODO.ATENDENTE);
    assert.equal(estado.modoDe('chatA'), MODO.ATENDENTE);
    estado.definirModo('chatA', MODO.MENU);
    assert.equal(estado.modoDe('chatA'), MODO.MENU);
    assert.equal(estado.conversas.has('chatA'), false);
});

test('oração e atendente expiram cada um no seu prazo e voltam ao menu', () => {
    config.expiraOracaoMs = -1;
    estado.definirModo('chatO', MODO.ORACAO);
    assert.equal(estado.modoDe('chatO'), MODO.MENU);

    config.expiraHumanoMs = -1;
    estado.definirModo('chatH', MODO.ATENDENTE);
    assert.equal(estado.modoDe('chatH'), MODO.MENU);
});

test('pausado (!manual) não expira sozinho', () => {
    config.expiraOracaoMs = -1;
    config.expiraHumanoMs = -1;
    estado.definirModo('chatP', MODO.PAUSADO);
    estado.conversas.get('chatP').desde = 0; // "há 56 anos"
    assert.equal(estado.modoDe('chatP'), MODO.PAUSADO);
});

test('limparMapasAuxiliares remove ultimoPedido velho e mantém o recente', () => {
    const original = config.intervaloPedidoMs;
    config.intervaloPedidoMs = 100; // limiar de remoção = 1000ms

    estado.ultimoPedido.set('chatRecente', Date.now());
    estado.ultimoPedido.set('chatVelho', Date.now() - 999999);

    estado.limparMapasAuxiliares();

    assert.equal(estado.ultimoPedido.has('chatRecente'), true);
    assert.equal(estado.ultimoPedido.has('chatVelho'), false);

    config.intervaloPedidoMs = original;
});

test('limparMapasAuxiliares apaga conversas vencidas e mantém as válidas e as pausadas', () => {
    estado.definirModo('valida', MODO.ORACAO);
    estado.definirModo('pausada', MODO.PAUSADO);
    estado.definirModo('vencida', MODO.ATENDENTE);
    estado.conversas.get('vencida').desde = 0;

    estado.limparMapasAuxiliares();

    assert.equal(estado.conversas.has('valida'), true);
    assert.equal(estado.conversas.has('pausada'), true);
    assert.equal(estado.conversas.has('vencida'), false);
});
