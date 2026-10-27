const { config, destinosDeAtendimento } = require('../config');
const { contem } = require('./jids');

const CMD_APROVAR = /^!aprovar(\s|$)/i;

// Todos os ids conhecidos de quem escreveu. Com o Baileys a mesma pessoa pode
// chegar como número (@s.whatsapp.net) ou como @lid; o adaptador
// (lib/mensagem.js) junta os dois em msg.aliases / msg.authorAliases.
const idsDoRemetente = msg => [msg.from, ...(msg.aliases || [])];
const idsDoAutor = msg => (msg.author ? [msg.author, ...(msg.authorAliases || [])] : []);

/**
 * Qualquer pessoa do grupo que recebe os avisos à equipe (a secretaria; no modo
 * teste, o grupo de teste) pode aprovar pedidos ali mesmo. O que vale é o grupo
 * onde a mensagem foi escrita, então só vale em grupo, nunca no privado.
 */
function veioDoGrupoDeAprovacao(msg) {
    return String(msg.from || '').endsWith('@g.us') && contem(destinosDeAtendimento(), [msg.from]);
}

function ehAdmin(msg) {
    if (msg.fromMe) return true;
    if (veioDoGrupoDeAprovacao(msg)) return true;
    // Em grupo, msg.from é o id do grupo e msg.author é quem escreveu.
    return contem(config.numerosVerificacao, idsDoRemetente(msg)) ||
        contem(config.numerosVerificacao, idsDoAutor(msg));
}

module.exports = { CMD_APROVAR, ehAdmin, idsDoRemetente };
