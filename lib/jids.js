// ---------------------------------------------------------------------------
// Identificadores do WhatsApp (JIDs)
//
// O whatsapp-web.js usava "5521999999999@c.us" para pessoas; o Baileys usa
// "5521999999999@s.whatsapp.net". Contatos migrados para o formato novo do
// WhatsApp aparecem como "<número opaco>@lid". Para não obrigar ninguém a
// reescrever o .env, aceitamos os três formatos (e o número puro) e
// comparamos sempre na forma normalizada.
// ---------------------------------------------------------------------------

const SUFIXO_PN = '@s.whatsapp.net';

function normalizarJid(id) {
    let v = String(id || '').trim();
    if (!v) return '';
    if (/^\+?\d{8,15}$/.test(v)) return v.replace('+', '') + SUFIXO_PN;
    v = v.replace(/@c\.us$/, SUFIXO_PN);
    // "5521...:12@s.whatsapp.net" -> o ":12" é o aparelho, não a pessoa.
    return v.replace(/^([^@:]+):\d+@/, '$1@');
}

const ehGrupo = jid => String(jid || '').endsWith('@g.us');
const ehPn = jid => String(jid || '').endsWith(SUFIXO_PN);
const ehLid = jid => String(jid || '').endsWith('@lid');

/** Número de telefone (só dígitos) de um JID de pessoa, ou '' se não houver. */
function numeroDoJid(jid) {
    return ehPn(jid) ? jid.split('@')[0] : '';
}

/** true se algum dos ids aparece na lista (comparando já normalizados). */
function contem(lista, ...ids) {
    const alvos = ids.flat().map(normalizarJid).filter(Boolean);
    return lista.some(item => alvos.includes(normalizarJid(item)));
}

module.exports = { normalizarJid, ehGrupo, ehPn, ehLid, numeroDoJid, contem };
