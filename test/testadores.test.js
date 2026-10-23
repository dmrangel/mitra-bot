const test = require('node:test');
const assert = require('node:assert/strict');

const fs = require('fs');
const os = require('os');
const path = require('path');

const { config } = require('../config');

// Nada aqui pode tocar o testadores.json de verdade: rodar os testes na VM
// tiraria do teste quem acabou de enviar /teste.
config.arquivoTestadores = path.join(os.tmpdir(), `mitra-bot-teste-testadores-${process.pid}.json`);
test.after(() => fs.rmSync(config.arquivoTestadores, { force: true }));

const T = require('../lib/testadores');

test.beforeEach(() => {
    T.testadores.clear();
    fs.rmSync(config.arquivoTestadores, { force: true });
    config.modoTeste = true;
    config.numeroTeste = '';
    config.testeValidadeMs = 24 * 60 * 60 * 1000;
});

test.afterEach(() => {
    config.modoTeste = false;
    config.numeroTeste = '';
});

test('comandoDeTeste reconhece "/teste" e "/teste sair" (sem diferenciar maiúsculas nem espaços)', () => {
    assert.equal(T.comandoDeTeste('/teste'), 'entrar');
    assert.equal(T.comandoDeTeste('  /TESTE  '), 'entrar');
    assert.equal(T.comandoDeTeste('/teste sair'), 'sair');
    assert.equal(T.comandoDeTeste('/Teste   SAIR'), 'sair');
});

test('comandoDeTeste ignora qualquer outra coisa', () => {
    for (const texto of ['', 'teste', '/testes', 'oi /teste', '/teste agora', '/teste sair já', '!teste', undefined, null]) {
        assert.equal(T.comandoDeTeste(texto), null, `não deveria reconhecer ${JSON.stringify(texto)}`);
    }
});

test('adicionar/ativo/remover funcionam e comparam ids normalizados (@c.us = @s.whatsapp.net)', () => {
    assert.equal(T.ativo('5521912345678@s.whatsapp.net'), false);
    T.adicionar(['5521912345678@s.whatsapp.net']);
    assert.equal(T.ativo('5521912345678@c.us'), true);
    assert.equal(T.ativo('5521900000000@s.whatsapp.net'), false);
    assert.equal(T.remover(['5521912345678@c.us']), true);
    assert.equal(T.ativo('5521912345678@s.whatsapp.net'), false);
    assert.equal(T.remover(['5521912345678@c.us']), false, 'remover de novo não encontra nada');
});

test('quem se inscreve como número também é reconhecido quando chega como @lid (e vice-versa)', () => {
    T.adicionar(['128277788291105@lid', '5521912345678@s.whatsapp.net']);
    assert.equal(T.ativo('128277788291105@lid'), true);
    assert.equal(T.ativo('5521912345678@s.whatsapp.net'), true);
    // ids conhecidos vêm como lista (msg.from + msg.aliases): basta um bater.
    assert.equal(T.ativo(['999@lid', '5521912345678@s.whatsapp.net']), true);
});

test('a inscrição expira depois de TESTE_VALIDADE_HORAS', () => {
    config.testeValidadeMs = -1;
    T.adicionar(['5521912345678@s.whatsapp.net']);
    assert.equal(T.ativo('5521912345678@s.whatsapp.net'), false);
});

test('podeResponder: fora do modo teste todo mundo; no modo teste só NUMERO_TESTE e inscritos', () => {
    config.modoTeste = false;
    assert.equal(T.podeResponder('5521911111111@s.whatsapp.net'), true);

    config.modoTeste = true;
    assert.equal(T.podeResponder('5521911111111@s.whatsapp.net'), false, 'sem NUMERO_TESTE e sem inscrição');

    config.numeroTeste = '5521922222222@c.us';
    assert.equal(T.podeResponder('5521922222222@s.whatsapp.net'), true, 'NUMERO_TESTE no formato antigo');
    assert.equal(T.podeResponder('5521911111111@s.whatsapp.net'), false);

    T.adicionar(['5521911111111@s.whatsapp.net']);
    assert.equal(T.podeResponder('5521911111111@s.whatsapp.net'), true, 'inscrito com /teste');
});

test('podeResponder aceita ids ausentes (ligação sem callerPn)', () => {
    assert.equal(T.podeResponder('5521911111111@s.whatsapp.net', undefined), false);
    T.adicionar(['5521911111111@s.whatsapp.net']);
    assert.equal(T.podeResponder('outro@lid', undefined, '5521911111111@s.whatsapp.net'), true);
});

test('salvar/carregar fazem round-trip no disco e descartam inscrições expiradas e entradas corrompidas', () => {
    T.adicionar(['5521911111111@s.whatsapp.net']);
    assert.ok(fs.existsSync(config.arquivoTestadores), 'deveria ter gravado o arquivo');

    const gravado = JSON.parse(fs.readFileSync(config.arquivoTestadores, 'utf8'));
    gravado['5521933333333@s.whatsapp.net'] = Date.now() - 1000; // expirada
    gravado['lixo'] = 'não é número';
    fs.writeFileSync(config.arquivoTestadores, JSON.stringify(gravado), 'utf8');

    T.testadores.clear();
    T.carregar();
    assert.equal(T.ativo('5521911111111@s.whatsapp.net'), true);
    assert.equal(T.ativo('5521933333333@s.whatsapp.net'), false);
    assert.equal(T.testadores.has('lixo'), false);
});

test('carregar não quebra com arquivo inexistente nem com JSON inválido', () => {
    assert.doesNotThrow(() => T.carregar());
    fs.writeFileSync(config.arquivoTestadores, '{ isto não é json', 'utf8');
    assert.doesNotThrow(() => T.carregar());
    assert.equal(T.testadores.size, 0);
});

test('limparExpirados remove só o que passou da validade', () => {
    T.testadores.set('velho@s.whatsapp.net', Date.now() - 1000);
    T.testadores.set('novo@s.whatsapp.net', Date.now() + 60_000);
    T.limparExpirados();
    assert.equal(T.testadores.has('velho@s.whatsapp.net'), false);
    assert.equal(T.testadores.has('novo@s.whatsapp.net'), true);
});
