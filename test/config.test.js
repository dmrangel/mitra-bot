const test = require('node:test');
const assert = require('node:assert/strict');

const { config, validar, gruposDeOracao, destinosDeAtendimento } = require('../config');

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

test('sem NUMEROS_VERIFICACAO e sem grupo de atendimento, validar() bloqueia', () => {
    comConfigTemporaria({ numerosVerificacao: [], gruposNotificacaoHumano: [], gruposOracao: ['grupo@g.us'] }, () => {
        const { erros } = validar();
        assert.ok(erros.some(e => e.includes('NUMEROS_VERIFICACAO')));
    });
});

test('sem NUMEROS_VERIFICACAO mas com grupo de atendimento, validar() não bloqueia nem avisa (a secretaria aprova no grupo)', () => {
    comConfigTemporaria({
        numerosVerificacao: [],
        gruposNotificacaoHumano: ['secretaria@g.us'],
        gruposOracao: ['grupo@g.us'],
        modoTeste: false
    }, () => {
        const { erros, avisos } = validar();
        assert.deepEqual(erros, []);
        assert.deepEqual(avisos, []);
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
        gruposOracaoTeste: ['grupo-teste@g.us'],
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
        gruposOracaoTeste: ['grupo-teste@g.us'],
        gruposNotificacaoHumano: ['grupo@g.us'],
        modoTeste: true,
        numeroTeste: '128277788291105@lid'
    }, () => {
        const { erros, avisos } = validar();
        assert.deepEqual(erros, []);
        assert.deepEqual(avisos, []);
    });
});

// --- grupo de oração por modo ------------------------------------------------

test('MODO_TESTE ligado sem GRUPOS_ORACAO_TESTE bloqueia: o teste nunca pode cair no grupo real', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo-real@g.us'],
        gruposOracaoTeste: [],
        modoTeste: true,
        numeroTeste: '128277788291105@lid'
    }, () => {
        const { erros } = validar();
        assert.ok(erros.some(e => e.includes('GRUPOS_ORACAO_TESTE')));
    });
});

test('com MODO_TESTE desligado, GRUPOS_ORACAO_TESTE não é exigido', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo-real@g.us'],
        gruposOracaoTeste: [],
        gruposNotificacaoHumano: ['grupo-real@g.us'],
        modoTeste: false
    }, () => {
        const { erros, avisos } = validar();
        assert.deepEqual(erros, []);
        assert.deepEqual(avisos, []);
    });
});

test('GRUPOS_ORACAO_TESTE igual a GRUPOS_ORACAO só avisa (o modo teste não estaria separado da produção)', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['mesmo@g.us'],
        gruposOracaoTeste: ['mesmo@g.us'],
        gruposNotificacaoHumano: ['mesmo@g.us'],
        modoTeste: true,
        numeroTeste: '128277788291105@lid'
    }, () => {
        const { erros, avisos } = validar();
        assert.deepEqual(erros, []);
        assert.ok(avisos.some(a => a.includes('GRUPOS_ORACAO_TESTE') && a.includes('mesmo grupo')));
    });
});

test('id fora do formato em GRUPOS_ORACAO_TESTE gera aviso', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposOracao: ['grupo-real@g.us'],
        gruposOracaoTeste: ['grupo-sem-sufixo'],
        modoTeste: true,
        numeroTeste: '128277788291105@lid'
    }, () => {
        const { avisos } = validar();
        assert.ok(avisos.some(a => a.includes('GRUPOS_ORACAO_TESTE') && a.includes('grupo-sem-sufixo')));
    });
});

test('gruposDeOracao: grupo de teste no modo teste, grupo real fora dele, nenhum se faltar o de teste', () => {
    comConfigTemporaria({
        gruposOracao: ['grupo-real@g.us'],
        gruposOracaoTeste: ['grupo-teste@g.us'],
        modoTeste: false
    }, () => {
        assert.deepEqual(gruposDeOracao(), ['grupo-real@g.us']);

        config.modoTeste = true;
        assert.deepEqual(gruposDeOracao(), ['grupo-teste@g.us']);

        // Falha para o lado seguro: sem grupo de teste, não cai no real.
        config.gruposOracaoTeste = [];
        assert.deepEqual(gruposDeOracao(), []);
    });
});

test('destinosDeAtendimento: grupo de teste no modo teste; fora dele, secretaria ou verificadores; nada se faltar o de teste', () => {
    comConfigTemporaria({
        numerosVerificacao: ['5521999999999@c.us'],
        gruposNotificacaoHumano: ['secretaria@g.us'],
        gruposOracaoTeste: ['grupo-teste@g.us'],
        modoTeste: false
    }, () => {
        assert.deepEqual(destinosDeAtendimento(), ['secretaria@g.us']);

        config.gruposNotificacaoHumano = [];
        assert.deepEqual(destinosDeAtendimento(), ['5521999999999@c.us']);

        config.gruposNotificacaoHumano = ['secretaria@g.us'];
        config.modoTeste = true;
        assert.deepEqual(destinosDeAtendimento(), ['grupo-teste@g.us']);

        // Falha para o lado seguro: sem grupo de teste, não cai na secretaria.
        config.gruposOracaoTeste = [];
        assert.deepEqual(destinosDeAtendimento(), []);
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
