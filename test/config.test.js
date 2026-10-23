const test = require('node:test');
const assert = require('node:assert/strict');

const { config, validar } = require('../config');

// Sem sessão salva, NUMERO_BOT é obrigatório. Os testes partem de um número
// válido e só o tiram de propósito.
config.numeroBot = '5521999999999';

// Cada teste mexe em campos do config (que é um singleton compartilhado) e
// devolve tudo como estava, pra não vazar estado entre os testes.
function comConfigTemporaria(alteracoes, fn) {
    const original = {};
    for (const chave of Object.keys(alteracoes)) original[chave] = config[chave];
    Object.assign(config, alteracoes);
    try {
        return fn();
    } finally {
        Object.assign(config, original);
    }
}

test('config válida não produz erros bloqueantes', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo@g.us'],
        gruposNotificacaoHumano: ['grupo@g.us'],
        modoTeste: false
    }, () => {
        const { erros } = validar();
        assert.deepEqual(erros, []);
    });
});

test('sem NUMEROS_VERIFICACAO, validar() bloqueia', () => {
    comConfigTemporaria({ numerosVerificacao: [], gruposOracao: ['grupo@g.us'] }, () => {
        const { erros } = validar();
        assert.ok(erros.some(e => e.includes('NUMEROS_VERIFICACAO')));
    });
});

test('sem GRUPOS_ORACAO, validar() bloqueia', () => {
    comConfigTemporaria({ numerosVerificacao: ['5521999999999@c.us'], gruposOracao: [] }, () => {
        const { erros } = validar();
        assert.ok(erros.some(e => e.includes('GRUPOS_ORACAO')));
    });
});

test('sem GRUPOS_NOTIFICACAO_HUMANO, validar() só avisa (não bloqueia)', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo@g.us'],
        gruposNotificacaoHumano: []
    }, () => {
        const { erros, avisos } = validar();
        assert.equal(erros.length, 0);
        assert.ok(avisos.some(a => a.includes('GRUPOS_NOTIFICACAO_HUMANO')));
    });
});

test('MODO_TESTE ligado sem NUMERO_TESTE só avisa: quem enviar /teste continua podendo testar', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo@g.us'],
        gruposNotificacaoHumano: ['grupo@g.us'],
        modoTeste: true,
        numeroTeste: ''
    }, () => {
        const { erros, avisos } = validar();
        assert.deepEqual(erros, []);
        assert.ok(avisos.some(a => a.includes('MODO_TESTE') && a.includes('/teste')));
    });
});

test('MODO_TESTE ligado com NUMERO_TESTE não gera aviso nem erro', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo@g.us'],
        gruposNotificacaoHumano: ['grupo@g.us'],
        modoTeste: true,
        numeroTeste: '128277788291105@lid'
    }, () => {
        const { erros, avisos } = validar();
        assert.deepEqual(erros, []);
        assert.deepEqual(avisos, []);
    });
});

test('NUMERO_BOT vazio sem sessão salva bloqueia (não daria para parear)', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo@g.us'],
        numeroBot: '',
        pastaAuth: '/caminho/que/nao/existe'
    }, () => {
        const { erros } = validar();
        assert.ok(erros.some(e => e.includes('NUMERO_BOT')));
    });
});

test('NUMERO_BOT curto demais bloqueia', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo@g.us'],
        numeroBot: '12345'
    }, () => {
        const { erros } = validar();
        assert.ok(erros.some(e => e.includes('NUMERO_BOT')));
    });
});

test('ids no formato do Baileys, antigo (@c.us), @lid e número puro são aceitos sem aviso', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@s.whatsapp.net', '5521888888888@c.us', '128277788291105@lid', '5521777777777'],
        gruposOracao: ['120363000000000000@g.us'],
        gruposNotificacaoHumano: ['120363000000000000@g.us'],
        blacklist: []
    }, () => {
        const { erros, avisos } = validar();
        assert.deepEqual(erros, []);
        assert.deepEqual(avisos, []);
    });
});

test('ids fora do formato geram aviso, não erro', () => {
    comConfigTemporaria({
        numerosVerificacao: ['numero-sem-sufixo'],
        gruposOracao: ['grupo@g.us']
    }, () => {
        const { erros, avisos } = validar();
        assert.equal(erros.length, 0);
        assert.ok(avisos.some(a => a.includes('numero-sem-sufixo')));
    });
});
