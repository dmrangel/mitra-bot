const test = require('node:test');
const assert = require('node:assert/strict');

const { config } = require('../config');
const cliente = require('../lib/cliente');

// Troca a conexão real por um registro do que seria feito.
const chamadas = [];
cliente.enviarTexto = async (jid, texto) => { chamadas.push(['texto', jid, texto]); };
cliente.digitando = async (jid, ligado) => { chamadas.push(['digitando', jid, ligado]); };

const { enviar, enviarParaTodos } = require('../lib/envio');

test.beforeEach(() => {
    chamadas.length = 0;
    config.atrasoRespostaMs = 1;
    config.limiteEnviosMinuto = 1000;
});

test('para pessoa: mostra "digitando", para e só então envia, com id normalizado', async () => {
    assert.equal(await enviar('5521999999999@c.us', 'oi'), true);
    assert.deepEqual(chamadas, [
        ['digitando', '5521999999999@s.whatsapp.net', true],
        ['digitando', '5521999999999@s.whatsapp.net', false],
        ['texto', '5521999999999@s.whatsapp.net', 'oi']
    ]);
});

test('para grupo: envia direto, sem "digitando"', async () => {
    await enviar('120363000000000000@g.us', 'aviso');
    assert.deepEqual(chamadas, [['texto', '120363000000000000@g.us', 'aviso']]);
});

test('falha no envio devolve false em vez de derrubar o bot', async () => {
    const original = cliente.enviarTexto;
    cliente.enviarTexto = async () => { throw new Error('sem conexão'); };
    try {
        assert.equal(await enviar('120363000000000000@g.us', 'x'), false);
        assert.equal(await enviarParaTodos(['a@g.us', 'b@g.us'], 'x'), 0);
    } finally {
        cliente.enviarTexto = original;
    }
});

test('limite por minuto segura o envio excedente até abrir vaga', async (t) => {
    // Relógio falso começando "agora" e pulando um minuto, para os envios
    // dos testes anteriores saírem da janela.
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    t.mock.timers.tick(61000);
    config.atrasoRespostaMs = 0;
    config.limiteEnviosMinuto = 2;

    await enviar('a@g.us', '1');
    await enviar('a@g.us', '2');
    let terceiroEnviado = false;
    const terceiro = enviar('a@g.us', '3').then(() => { terceiroEnviado = true; });

    await new Promise(r => setImmediate(r));
    assert.equal(terceiroEnviado, false);

    t.mock.timers.tick(61000);
    await terceiro;
    assert.equal(terceiroEnviado, true);
});

test('nunca envia para status, lista de transmissão ou canal', async () => {
    for (const destino of ['status@broadcast', '123@broadcast', '120363000000000000@newsletter', '']) {
        assert.equal(await enviar(destino, 'oi'), false);
    }
    assert.deepEqual(chamadas, []);
});
