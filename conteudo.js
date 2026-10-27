// ===========================================================================
// Tudo o que o bot escreve, num lugar só.
//
// - DADOS: telefones, horário da secretaria, PIX... Cada informação aparece
//   uma única vez aqui e é reaproveitada nos textos. Mudou um telefone? Mude
//   só em DADOS.
// - OPCOES: o menu. O texto do menu principal é montado a partir desta lista,
//   então criar, renomear ou reordenar uma opção é mexer só aqui.
// - MSG: as outras mensagens (fluxo da conversa, avisos para a equipe).
//
// Este repositório é público: aqui só entra informação que já é pública.
// Formatação do WhatsApp: *negrito*, _itálico_.
// ===========================================================================

const relogio = require('./lib/relogio');

const DADOS = {
    nome: 'Santuário de Santa Rita',
    telefones: ['(21) 2253-7564', '(21) 97908-2767'],
    endereco: 'Largo de Santa Rita, s/nº, Centro, Rio de Janeiro (RJ)',
    pix: '21974797064',

    // Horário de funcionamento da secretaria (fuso de Brasília). Usado no texto
    // de "Secretaria e endereço" e para saber se há alguém para atender em
    // "Falar com um atendente".
    // dias: 0 = domingo, 1 = segunda ... 6 = sábado. Horas no formato HH:MM.
    horarioSecretaria: [
        { rotulo: 'Segunda a sexta', dias: [1, 2, 3, 4, 5], abre: '06:30', fecha: '18:30' },
        { rotulo: 'Sábado', dias: [6], abre: '08:00', fecha: '12:00' },
        { rotulo: 'Domingo', dias: [0], abre: '07:30', fecha: '12:00' }
    ]
};

// --- Pedacinhos reaproveitados ----------------------------------------------

/** '06:30' -> '6h30', '08:00' -> '8h' */
function hora(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

const TELEFONES = `📞 ${DADOS.telefones.join(' · ')}`;
const HORARIO_SECRETARIA = DADOS.horarioSecretaria
    .map(f => `• ${f.rotulo}: ${hora(f.abre)} às ${hora(f.fecha)}`)
    .join('\n');
const VOLTAR = 'Para voltar ao menu, envie *voltar*.';
// Repetidos em "Batismo e certidões" e no pedido de certidão.
const CERTIDAO_TAXA = `• Taxa: R$ 15, pelo PIX ${DADOS.pix}
• Prazo: 7 dias. Ligue antes para confirmar.`;
const CERTIDAO_CURIA = `Batizados antes de 1901: procure o arquivo da Cúria
📞 2240-2869 · ✉️ arquivodacuriarj@arqrio.org.br`;

// --- Menu -----------------------------------------------------------------
//
// A ORDEM da lista é a numeração do menu: a primeira opção visível é o 1, e
// assim por diante. Uma opção temporária que sai do ar renumera as outras
// sozinha.
//
// chave:     nome interno e fixo da opção (não aparece para ninguém)
// titulo:    como a opção aparece no menu principal
// palavras:  palavras ou expressões que levam a esta opção (sem acento, minúsculas
//            ou não, tanto faz). Evite palavras comuns em conversa ("hora",
//            "valor", "pessoa", "ajuda"): elas fazem o bot responder o que
//            ninguém perguntou.
// resposta:  o texto enviado. Pode ser uma função que recebe
//            { secretariaAberta } quando o texto depende do horário.
// acao:      'oracao' (o próximo texto vira pedido de oração),
//            'almas' (os textos seguintes vão para a equipe como nomes),
//            'certidao' (o próximo texto vai para a equipe de atendimento) ou
//            'atendente' (pausa o bot e avisa a equipe). Sem acao = só responde.
// noMenu:    true = não aparece no menu numerado; só por palavra-chave.
// ate:       'AAAA-MM-DD' = opção temporária: some do menu (e as palavras-chave
//            param de valer) a partir desse dia, no fuso de Brasília.

const OPCOES = [
    {
        // Campanha de novembro. Sai do menu sozinha em 1º de dezembro.
        chave: 'almas',
        ate: '2026-12-01',
        titulo: 'Campanha Mês das Almas',
        palavras: [
            'almas', 'mes das almas', 'finados', 'dia de finados', 'campanha',
            'ente querido', 'entes queridos', 'nomes dos falecidos'
        ],
        resposta: `🕯️ *Novembro, mês das almas*

Homenageie seu ente querido com uma oração! Durante todo o mês de novembro, rezamos diariamente pelos familiares e amigos falecidos.

*Envie aqui os nomes* dos seus falecidos, numa mensagem de texto, e eles serão lembrados em nossas orações.

*Santa Missa pelas Almas*
• Segunda a sexta: 7h
• Sábado: 8h
• Domingo: 9h

Se quiser fazer um donativo, a chave PIX é ${DADOS.pix}.

${VOLTAR}`,
        acao: 'almas'
    },
    {
        chave: 'missas',
        titulo: 'Missas e confissões',
        palavras: [
            'missa', 'missas', 'confissao', 'confissoes', 'confessar', 'horario de missa',
            'horarios de missa', 'horario da missa', 'intencao', 'intencoes', 'marcar missa',
            'marcacao', 'marcacoes', 'falecido', 'falecidos', 'setimo dia', 'acao de gracas',
            'missa de cura', 'eucaristia', 'comunhao', 'celebracao'
        ],
        resposta: `🕰️ *Missas e confissões*

*Missas*
• Segunda: 7h, 8h, 9h, 10h, 12h15, 15h30 e 18h
• Terça a sexta: 7h, 8h, 9h, 10h, 12h15 e 18h
• Sábado: 8h, 9h e 10h
• Domingo: 7h30, 9h e 10h30

*Confissões*
• Segunda: 16h às 18h
• Quarta e sexta: 10h30 às 12h

*Intenções de missa*
• Missa individual: R$ 150 (vários dias e horários)
• Comunitária pelos falecidos: segunda, às 15h30 e às 18h (R$ 5 por intenção)
• Comunitária em ação de graças: quinta, às 18h (R$ 5 por intenção)

As intenções são marcadas só por telefone, com a secretaria, ou pessoalmente.
${TELEFONES}`
    },
    {
        chave: 'oracao',
        titulo: 'Pedido de oração',
        palavras: [
            'oracao', 'oracoes', 'pedido de oracao', 'rezar', 'rezem', 'reze', 'orar',
            'orem', 'prece', 'preces', 'intercessao', 'interceder'
        ],
        resposta: `🙏 *Pedido de oração*

Escreva seu pedido numa mensagem de texto e envie. Nossa equipe vai rezar pela sua intenção.

${VOLTAR}`,
        acao: 'oracao'
    },
    {
        chave: 'batismo',
        titulo: 'Batismo e certidões',
        palavras: [
            'batismo', 'batismos', 'batizado', 'batizar', 'batizados', 'padrinho', 'padrinhos',
            'madrinha', 'madrinhas', 'bebe', 'nenem'
        ],
        resposta: `💧 *Batismo e certidões*

*Batismo de crianças* (até 6 anos)
• Batizado: último sábado do mês, às 11h
• Reunião de pais e padrinhos: 1º sábado do mês, das 11h às 12h
• Padrinhos: batizados e, se morarem juntos, casados
• Documentos: cópia da certidão de nascimento, comprovante de residência dos pais, identidade dos padrinhos e autorização da paróquia de origem
• Agendamento: pessoalmente, na secretaria
• Valor: R$ 50 (vela e certificado)

*Certidão de batismo* (batizados a partir de 1901)
${CERTIDAO_TAXA}
Para pedir por aqui, envie *certidão*.

${CERTIDAO_CURIA}

Dúvidas: ${TELEFONES}`
    },
    {
        // Fora do menu numerado: chega-se aqui por Batismo e certidões ("envie certidão")
        // ou escrevendo direto "preciso da certidão de batismo". O texto
        // seguinte da pessoa vai para a equipe de atendimento.
        chave: 'certidao',
        noMenu: true,
        titulo: 'Pedido de certidão de batismo',
        palavras: [
            'certidao', 'certidoes', 'certidao de batismo', 'segunda via', 'curia'
        ],
        resposta: `📄 *Pedido de certidão de batismo*

Envie numa única mensagem:
• nome completo
• data de nascimento
• data ou ano do batismo
• nome dos pais

Vale para batizados a partir de 1901.
${CERTIDAO_TAXA}

${CERTIDAO_CURIA}

${VOLTAR}`,
        acao: 'certidao'
    },
    {
        chave: 'casamentos',
        titulo: 'Casamentos',
        palavras: [
            'casamento', 'casamentos', 'casar', 'matrimonio', 'noiva', 'noivo', 'noivos',
            'cerimonia', 'tapete', 'iluminacao', 'celebrante'
        ],
        resposta: `💍 *Casamentos*

• Valor da cerimônia: R$ 3.500,00, já incluídos tapete, iluminação e celebrante
• Capacidade: 150 pessoas sentadas
• Horário: somente aos sábados, às 17h

Informações e agendamento com a secretaria:
${TELEFONES}`
    },
    {
        chave: 'doacoes',
        titulo: 'Doações e PIX',
        palavras: [
            'doacao', 'doacoes', 'doar', 'pix', 'chave pix', 'dizimo', 'dizimos', 'oferta',
            'ofertas', 'ofertorio', 'contribuir', 'contribuicao', 'dados bancarios',
            'conta bancaria', 'deposito', 'cnpj', 'bradesco'
        ],
        resposta: `🙏 *Doações e dízimo*

*PIX:* ${DADOS.pix}

*Transferência*
Bradesco · Agência 0436 · Conta poupança 6682220-6
Mitra Arquiepiscopal
CNPJ 33.593.575/0222-74`
    },
    {
        chave: 'secretaria',
        titulo: 'Secretaria e endereço',
        palavras: [
            'secretaria', 'endereco', 'localizacao', 'onde fica', 'como chegar', 'mapa', 'cep',
            'telefone', 'telefones', 'contato', 'contatos', 'ligar', 'funcionamento',
            'expediente', 'horario da secretaria', 'que horas abre', 'que horas fecha'
        ],
        resposta: `📍 *Secretaria e endereço*

*Funcionamento*
${HORARIO_SECRETARIA}

${TELEFONES}
📍 ${DADOS.endereco}`
    },
    {
        chave: 'redes',
        titulo: 'Comunidade e redes sociais',
        palavras: [
            'redes sociais', 'rede social', 'instagram', 'insta', 'facebook', 'youtube',
            'comunidade', 'grupo do whatsapp', 'comunidade do whatsapp'
        ],
        resposta: `📱 *Comunidade e redes sociais*

Participe da nossa comunidade no WhatsApp:
https://chat.whatsapp.com/I4pJywPvsR1A0Zue6i03tf

• Instagram: https://www.instagram.com/santuariodesantaritarj
• Facebook: https://www.facebook.com/santuarioarquidiocesanodesantarita
• YouTube: https://www.youtube.com/channel/UCplLFwYdOcN7AbCLVh_SGcg`
    },
    {
        chave: 'atendente',
        titulo: 'Falar com um atendente',
        palavras: [
            'atendente', 'atendimento', 'atendimento humano', 'humano', 'secretario',
            'falar com a secretaria', 'falar com alguem', 'falar com uma pessoa',
            'falar com o padre'
        ],
        resposta: ({ secretariaAberta }) => (secretariaAberta
            ? `👤 *Falar com um atendente*

Já avisamos nossa equipe. Um secretário vai responder por aqui assim que possível.

Enquanto isso, as respostas automáticas ficam pausadas nesta conversa. ${VOLTAR}`
            : `👤 *Falar com um atendente*

Nossa secretaria está fechada agora. O horário de funcionamento é:
${HORARIO_SECRETARIA}

Sua conversa ficou registrada e um secretário vai responder por aqui quando reabrirmos. Se quiser, já pode escrever o que precisa.

${VOLTAR}`),
        acao: 'atendente'
    }
];

// --- Menu numerado (depende da data por causa das opções temporárias) -------

const formatoData = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/** A opção está no ar nesta data? (opções sem "ate" estão sempre) */
function opcaoAtiva(opcao, data = relogio.agora()) {
    return !opcao.ate || formatoData.format(data) < opcao.ate;
}

/** As opções do menu, na ordem, com o número que a pessoa digita. */
function menuNumerado(data = relogio.agora()) {
    return OPCOES
        .filter(o => !o.noMenu && opcaoAtiva(o, data))
        .map((opcao, i) => ({ numero: String(i + 1), opcao }));
}

function montarMenu(data = relogio.agora()) {
    return `Olá! Seja bem-vindo(a) ao atendimento do *${DADOS.nome}*. 🌹

Responda com o *número* do assunto:

${menuNumerado(data).map(({ numero, opcao }) => `*${numero}* · ${opcao.titulo}`).join('\n')}

_Este número não recebe ligações._`;
}

// --- Mensagens do fluxo ---------------------------------------------------

const MSG = {
    // Getters: o menu é montado na hora, para refletir as opções temporárias.
    get menu() {
        return montarMenu();
    },
    get voltouAoMenu() {
        return `Certo, as respostas automáticas estão de volta.\n\n${montarMenu()}`;
    },

    soTexto: 'Este atendimento automático só consegue ler mensagens de texto. Por favor, escreva sua dúvida ou responda com o número de uma opção do menu.',

    // Depois de TEMPO_AVISO_MIN sem resposta.
    algoMais: 'Posso ajudar com mais alguma coisa? Responda com o número de uma opção, ou envie *não* para encerrar.',
    encerramento: 'Agradecemos o contato! Que, pela intercessão de Santa Rita, Deus abençoe você e sua família. 🌹',

    // Pedido de oração
    pedidoSoTexto: `Para encaminhar seu pedido, ele precisa ser escrito em texto. 🙏\n\n${VOLTAR}`,
    pedidoRepetido: `Acabamos de receber um pedido seu e ele já está com a nossa equipe. 🙏 Aguarde alguns segundos antes de enviar outro.\n\n${VOLTAR}`,
    pedidoRecebido: 'Recebemos seu pedido de oração. 🙏 Nossa equipe vai rezar pela sua intenção.\n\nSe precisar de mais alguma coisa, envie *menu*.',

    // Campanha Mês das Almas
    almasSoTexto: `Para encaminhar, envie os nomes em texto. 🕯️\n\n${VOLTAR}`,
    almasRecebidos: `🕯️ Recebemos os nomes. Eles serão lembrados em nossas orações.\n\nSe quiser incluir mais nomes, é só enviar. ${VOLTAR}`,

    // Pedido de certidão
    certidaoSoTexto: `Para encaminhar o pedido, envie os dados em texto.\n\n${VOLTAR}`,
    certidaoRecebida: secretariaAberta => (secretariaAberta
        ? `📄 Recebemos seu pedido de certidão e já encaminhamos à secretaria. Um secretário vai responder por aqui para confirmar o pagamento e o prazo.\n\n${VOLTAR}`
        : `📄 Recebemos seu pedido de certidão. A secretaria está fechada agora; um secretário vai responder por aqui quando reabrirmos, para confirmar o pagamento e o prazo.\n\n${VOLTAR}`),

    avisoLigacao: `📵 *Este número não recebe ligações.*

Para falar com a secretaria por telefone:
${TELEFONES}

Por mensagem, é só escrever aqui.`,

    // --- Para a equipe (NUMEROS_VERIFICACAO e grupos) ---------------------
    equipe: {
        novoPedido: ({ nome, link, texto, id }) => `📥 *Novo pedido de oração para aprovar*

*De:* ${nome}
*WhatsApp:* ${link}

*Pedido:*
${texto}

Para publicar no grupo de oração, responda:
!aprovar ${id}`,

        pedidoPublicado: ({ nome, texto }) => `🙏 *Pedido de oração*

*De:* ${nome}

${texto}`,

        atendimento: ({ nome, link, secretariaAberta }) => `⚠️ *Pedido de atendimento*

*Nome:* ${nome}
*WhatsApp:* ${link}
${secretariaAberta ? '' : '\n_Chegou fora do horário da secretaria._\n'}
A pessoa está aguardando um secretário. As respostas automáticas ficam pausadas na conversa dela por algumas horas; para religar antes, envie *!auto* na conversa.`,

        certidao: ({ nome, link, texto, secretariaAberta }) => `📄 *Pedido de certidão de batismo*

*Nome:* ${nome}
*WhatsApp:* ${link}
${secretariaAberta ? '' : '\n_Chegou fora do horário da secretaria._\n'}
*Dados enviados:*
${texto}

A pessoa aguarda um secretário para confirmar pagamento (R$ 15) e prazo. As respostas automáticas ficam pausadas na conversa dela por algumas horas; para religar antes, envie *!auto* na conversa.`,

        nomesAlmas: ({ nome, link, texto }) => `🕯️ *Mês das Almas: nomes recebidos*

*De:* ${nome}
*WhatsApp:* ${link}

*Nomes:*
${texto}`,

        semPedidos: 'Nenhum pedido aguardando aprovação.',
        listaPedidos: pedidos => `📋 *Pedidos aguardando aprovação*\n\n${pedidos
            .map(p => `*${p.id}* · ${p.nome}\n${p.resumo}`)
            .join('\n\n')}\n\nPara aprovar: !aprovar <ID>`,
        usoAprovar: 'Use: !aprovar <ID>. Envie !pedidos para ver os IDs pendentes.',
        pedidoNaoEncontrado: '❌ Pedido não encontrado (ou já aprovado).',
        falhaPublicar: '⚠️ Não consegui publicar no grupo de oração. O pedido continua pendente; tente de novo em instantes.',
        aprovado: modoTeste => (modoTeste
            ? '✅ Pedido aprovado e publicado no grupo de *TESTE* (modo teste).'
            : '✅ Pedido aprovado e publicado no grupo de oração.')
    },

    // --- Modo teste --------------------------------------------------------
    testeAtivado: horas => `✅ *Modo de teste ativado para você.*\n\nA partir de agora respondo às suas mensagens como respondo ao público (vale por ${horas} h). Para sair, envie */teste sair*.`,
    testeDesativado: 'Modo de teste desativado para você. Para voltar, envie */teste*.'
};

module.exports = { DADOS, OPCOES, MSG, menuNumerado, opcaoAtiva, montarMenu };
