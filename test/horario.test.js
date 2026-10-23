const test = require('node:test');
const assert = require('node:assert/strict');

const { secretariaAberta, agoraEmBrasilia } = require('../lib/horario');

// Datas em UTC; Brasília = UTC-3 (sem horário de verão desde 2019).
const em = iso => new Date(iso);

test('converte para o fuso de Brasília (a VM roda em UTC)', () => {
    // Sexta 23/10/2026 00:30 UTC = quinta 22/10 21:30 em Brasília.
    assert.deepEqual(agoraEmBrasilia(em('2026-10-23T00:30:00Z')), { dia: 4, minuto: 21 * 60 + 30 });
});

test('dia útil: aberta das 6h30 às 18h30, fechada fora disso', () => {
    assert.equal(secretariaAberta(em('2026-10-23T09:29:00Z')), false, 'sexta 6h29');
    assert.equal(secretariaAberta(em('2026-10-23T09:30:00Z')), true, 'sexta 6h30');
    assert.equal(secretariaAberta(em('2026-10-23T21:29:00Z')), true, 'sexta 18h29');
    assert.equal(secretariaAberta(em('2026-10-23T21:30:00Z')), false, 'sexta 18h30');
});

test('sábado só de manhã; domingo das 7h30 ao meio-dia', () => {
    assert.equal(secretariaAberta(em('2026-10-24T11:00:00Z')), true, 'sábado 8h');
    assert.equal(secretariaAberta(em('2026-10-24T15:00:00Z')), false, 'sábado 12h');
    assert.equal(secretariaAberta(em('2026-10-25T10:29:00Z')), false, 'domingo 7h29');
    assert.equal(secretariaAberta(em('2026-10-25T10:30:00Z')), true, 'domingo 7h30');
    assert.equal(secretariaAberta(em('2026-10-25T18:00:00Z')), false, 'domingo 15h');
});
