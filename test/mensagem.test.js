const test = require('node:test');
const assert = require('node:assert/strict');

const envio = require('../lib/envio');
const enviados = [];
envio.enviar = async (destino, texto) => { enviados.push({ destino, texto }); return true; };

const { adaptarMensagem } = require('../lib/mensagem');

function bruta(overrides = {}, message = { conversation: 'oi' }) {
    return {
        key: { remoteJid: '5521999999999@s.whatsapp.net', fromMe: false, id: 'ABC', ...overrides },
        message,
        messageTimestamp: 1700000000,
        pushName: 'Maria'
    };
}

test('texto simples vira { from, body, hasMedia: false }', async () => {
    const msg = await adaptarMensagem(bruta());
    assert.equal(msg.from, '5521999999999@s.whatsapp.net');
    assert.equal(msg.body, 'oi');
    assert.equal(msg.hasMedia, false);
    assert.equal(msg.fromMe, false);
    assert.equal(msg.timestamp, 1700000000);
    assert.equal(msg.author, undefined);
});

test('texto estendido (com link ou resposta) também é lido', async () => {
    const msg = await adaptarMensagem(bruta({}, { extendedTextMessage: { text: 'quero o pix' } }));
    assert.equal(msg.body, 'quero o pix');
});

test('mensagem temporária é desembrulhada', async () => {
    const msg = await adaptarMensagem(bruta({}, { ephemeralMessage: { message: { conversation: '1' } } }));
    assert.equal(msg.body, '1');
});

test('foto, áudio, figurinha e localização contam como mídia', async () => {
    for (const conteudo of [
        { imageMessage: { caption: 'olha' } },
        { audioMessage: {} },
        { locationMessage: {} }
    ]) {
        const msg = await adaptarMensagem(bruta({}, conteudo));
        assert.equal(msg.hasMedia, true, JSON.stringify(conteudo));
    }
});

test('reação, apagar/editar e mensagens sem conteúdo são ignoradas (não recebem o menu)', async () => {
    assert.equal(await adaptarMensagem(bruta({}, { reactionMessage: { text: '🙏' } })), null);
    assert.equal(await adaptarMensagem(bruta({}, { protocolMessage: { type: 0 } })), null);
    assert.equal(await adaptarMensagem(bruta({}, { senderKeyDistributionMessage: {} })), null);
    assert.equal(await adaptarMensagem(bruta({}, null)), null);
    assert.equal(await adaptarMensagem(null), null);
});

test('figurinha e resposta a status são descartadas; texto comum com contexto de resposta segue valendo', async () => {
    assert.equal(await adaptarMensagem(bruta({}, { stickerMessage: {} })), null);
    assert.equal(await adaptarMensagem(bruta({}, { lottieStickerMessage: {} })), null);

    // Responder a um status: texto + contexto apontando para status@broadcast.
    assert.equal(await adaptarMensagem(bruta({}, {
        extendedTextMessage: { text: 'amém!', contextInfo: { remoteJid: 'status@broadcast', quotedMessage: { conversation: 'x' } } }
    })), null);
    assert.equal(await adaptarMensagem(bruta({}, {
        imageMessage: { caption: 'lindo', contextInfo: { remoteJid: 'status@broadcast' } }
    })), null);

    // Responder a uma mensagem normal (não é status) continua sendo conversa.
    const msg = await adaptarMensagem(bruta({}, {
        extendedTextMessage: { text: 'qual o horário?', contextInfo: { quotedMessage: { conversation: 'x' } } }
    }));
    assert.equal(msg.body, 'qual o horário?');
});

test('tipos desconhecidos (eventos de canal, reações novas, enquetes...) são descartados, não viram resposta', async () => {
    for (const conteudo of [
        { newsletterAdminInviteMessage: {} },
        { reacaoQueOWhatsAppInventarAmanha: { text: '🙏' } },
        { pollCreationMessage: { name: 'x' } },
        { buttonsResponseMessage: { selectedButtonId: '1' } },
        { messageContextInfo: {}, algumEventoNovo: {} },
        { ephemeralMessage: { message: { reactionMessage: { text: '❤️' } } } }
    ]) {
        assert.equal(await adaptarMensagem(bruta({}, conteudo)), null, JSON.stringify(conteudo));
    }
});

test('eventos de canal e reações vindos de qualquer tipo de conversa não geram mensagem', async () => {
    for (const remoteJid of ['120363000000000000@newsletter', '5521999999999@s.whatsapp.net', 'status@broadcast', '120363000000000000@g.us']) {
        assert.equal(await adaptarMensagem(bruta({ remoteJid }, { reactionMessage: { text: '🙏' } })), null, remoteJid);
        assert.equal(await adaptarMensagem(bruta({ remoteJid }, { encReactionMessage: {} })), null, remoteJid);
    }
});

test('mídia comum continua recebendo o aviso de "só texto" (foto, vídeo, documento, contato, vídeo-nota)', async () => {
    for (const conteudo of [
        { videoMessage: {} },
        { documentMessage: {} },
        { contactMessage: {} },
        { ptvMessage: {} }
    ]) {
        const msg = await adaptarMensagem(bruta({}, conteudo));
        assert.equal(msg.hasMedia, true, JSON.stringify(conteudo));
    }
});

test('contato @lid com número alternativo usa o número como id e guarda os dois', async () => {
    const msg = await adaptarMensagem(bruta({
        remoteJid: '128277788291105@lid',
        remoteJidAlt: '5521999999999@s.whatsapp.net'
    }));
    assert.equal(msg.from, '5521999999999@s.whatsapp.net');
    assert.ok(msg.aliases.includes('128277788291105@lid'));
    assert.deepEqual(await msg.getContact(), { pushname: 'Maria', number: '5521999999999' });
});

test('contato @lid sem número alternativo consulta o vínculo lid -> número', async () => {
    const msg = await adaptarMensagem(
        bruta({ remoteJid: '128277788291105@lid' }),
        { pnDoLid: async () => '5521888888888@s.whatsapp.net' }
    );
    assert.equal(msg.from, '5521888888888@s.whatsapp.net');
});

test('contato @lid sem vínculo conhecido continua como @lid e sem número', async () => {
    const msg = await adaptarMensagem(
        bruta({ remoteJid: '128277788291105@lid' }),
        { pnDoLid: async () => { throw new Error('sem vínculo'); } }
    );
    assert.equal(msg.from, '128277788291105@lid');
    assert.equal((await msg.getContact()).number, '');
});

test('em grupo, author é quem escreveu e o contato é o autor', async () => {
    const msg = await adaptarMensagem(bruta({
        remoteJid: '120363000000000000@g.us',
        participant: '128277788291105@lid',
        participantAlt: '5521777777777@s.whatsapp.net'
    }));
    assert.equal(msg.from, '120363000000000000@g.us');
    assert.equal(msg.author, '5521777777777@s.whatsapp.net');
    assert.ok(msg.authorAliases.includes('128277788291105@lid'));
    assert.equal((await msg.getContact()).number, '5521777777777');
});

test('horário em Long (protobuf) vira número de segundos', async () => {
    const w = bruta();
    w.messageTimestamp = { toNumber: () => 1700000123 };
    assert.equal((await adaptarMensagem(w)).timestamp, 1700000123);
});

test('reply() responde na mesma conversa', async () => {
    enviados.length = 0;
    const msg = await adaptarMensagem(bruta());
    await msg.reply('teste');
    assert.deepEqual(enviados, [{ destino: '5521999999999@s.whatsapp.net', texto: 'teste' }]);
});

test('status de um contato é ignorado, mesmo trazendo o número de quem postou', async () => {
    // Formato real que o WhatsApp entrega: remoteJid é o status e o autor vem em remoteJidAlt/participant.
    const status = bruta({
        remoteJid: 'status@broadcast',
        remoteJidAlt: '5521981858084@s.whatsapp.net',
        participant: '205600134848521@lid'
    }, { extendedTextMessage: { text: 'bom dia!' } });
    assert.equal(await adaptarMensagem(status), null);
    assert.equal(await adaptarMensagem(bruta({ remoteJid: 'status@broadcast' }, { imageMessage: {} })), null);
    assert.equal(await adaptarMensagem(bruta({ remoteJid: 'status@broadcast' }, { conversation: '1' })), null);
});

test('lista de transmissão e canal também são ignorados', async () => {
    assert.equal(await adaptarMensagem(bruta({ remoteJid: '1234567890@broadcast' })), null);
    assert.equal(await adaptarMensagem(bruta({ remoteJid: '120363000000000000@newsletter' })), null);
});

test('conversa privada e grupo continuam sendo tratadas', async () => {
    assert.ok(await adaptarMensagem(bruta()));
    assert.ok(await adaptarMensagem(bruta({ remoteJid: '120363000000000000@g.us', participant: '5521999999999@s.whatsapp.net' })));
    assert.ok(await adaptarMensagem(bruta({ remoteJid: '205600134848521@lid' })));
});
