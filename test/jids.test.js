const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizarJid, ehGrupo, numeroDoJid, contem } = require('../lib/jids');

test('normalizarJid converte o formato antigo (@c.us) e o número puro para @s.whatsapp.net', () => {
    assert.equal(normalizarJid('5521999999999@c.us'), '5521999999999@s.whatsapp.net');
    assert.equal(normalizarJid('5521999999999'), '5521999999999@s.whatsapp.net');
    assert.equal(normalizarJid('+5521999999999'), '5521999999999@s.whatsapp.net');
    assert.equal(normalizarJid(' 5521999999999@s.whatsapp.net '), '5521999999999@s.whatsapp.net');
});

test('normalizarJid tira o sufixo de aparelho e preserva @lid e @g.us', () => {
    assert.equal(normalizarJid('5521999999999:12@s.whatsapp.net'), '5521999999999@s.whatsapp.net');
    assert.equal(normalizarJid('128277788291105@lid'), '128277788291105@lid');
    assert.equal(normalizarJid('120363000000000000@g.us'), '120363000000000000@g.us');
    assert.equal(normalizarJid(''), '');
    assert.equal(normalizarJid(undefined), '');
});

test('numeroDoJid só devolve número para ids de telefone', () => {
    assert.equal(numeroDoJid('5521999999999@s.whatsapp.net'), '5521999999999');
    assert.equal(numeroDoJid('128277788291105@lid'), '');
    assert.equal(ehGrupo('120363000000000000@g.us'), true);
});

test('contem compara em forma normalizada e aceita vários ids da mesma pessoa', () => {
    const lista = ['5521999999999@c.us'];
    assert.equal(contem(lista, '5521999999999@s.whatsapp.net'), true);
    assert.equal(contem(lista, ['128277788291105@lid', '5521999999999@s.whatsapp.net']), true);
    assert.equal(contem(lista, '128277788291105@lid'), false);
    assert.equal(contem([], '5521999999999@s.whatsapp.net'), false);
});
