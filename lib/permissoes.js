const { config } = require('../config');
const { contem } = require('./jids');

const CMD_APROVAR = /^!aprovar(\s|$)/i;

// Todos os ids conhecidos de quem escreveu. Com o Baileys a mesma pessoa pode
// chegar como número (@s.whatsapp.net) ou como @lid; o adaptador
// (lib/mensagem.js) junta os dois em msg.aliases / msg.authorAliases.
const idsDoRemetente = msg => [msg.from, ...(msg.aliases || [])];
const idsDoAutor = msg => (msg.author ? [msg.author, ...(msg.authorAliases || [])] : []);

function ehAdmin(msg) {
    if (msg.fromMe) return true;
    // Em grupo, msg.from é o id do grupo e msg.author é quem escreveu.
    return contem(config.numerosVerificacao, idsDoRemetente(msg)) ||
        contem(config.numerosVerificacao, idsDoAutor(msg));
}

module.exports = { CMD_APROVAR, ehAdmin, idsDoRemetente };
