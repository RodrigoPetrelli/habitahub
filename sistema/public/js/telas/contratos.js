// Tela CRUD 7 – Contratos (tabela "contratos") – feature opcional "contratos"
import { brl, etiqueta } from '../util.js';

const dataBr = (d) => (d ? d.split('-').reverse().join('/') : '');

export default {
  titulo: 'Contratos',
  recurso: 'contratos',
  feature: 'contratos',
  descricao: 'Gerados a partir de propostas aprovadas. Quando cliente, proprietário e imobiliária assinam, o imóvel passa a Vendido ou Alugado.',
  fontes: {
    propostas: (p) => p.resumo,
  },
  campos: [
    // Só propostas aprovadas que ainda não têm contrato (além da do próprio contrato, na edição).
    { nome: 'propostaId', rotulo: 'Proposta aprovada', tipo: 'select', fonte: 'propostas',
      filtro: (p, contrato, tela) => p.id === contrato?.propostaId || (p.status === 'Aprovada' && !tela.registros.some((c) => c.propostaId === p.id)),
      dica: 'Tipo, imóvel e valor vêm da proposta.' },
    { nome: 'inicio', rotulo: 'Início', tipo: 'date', largura: 'metade', dica: 'Em branco: hoje.' },
    { nome: 'termino', rotulo: 'Término (locação)', tipo: 'date', largura: 'metade', dica: 'Em branco: 30 meses depois do início.' },
    { nome: 'assinadoCliente', rotulo: 'Assinado pelo cliente', tipo: 'checkbox' },
    { nome: 'assinadoProprietario', rotulo: 'Assinado pelo proprietário', tipo: 'checkbox' },
    { nome: 'assinadoImobiliaria', rotulo: 'Assinado pela imobiliária', tipo: 'checkbox' },
  ],
  colunas: [
    { rotulo: 'Número', valor: (c) => c.numero, classe: 'nowrap' },
    { rotulo: 'Proposta', valor: (c, tela) => tela.rotuloDe('propostas', c.propostaId) },
    { rotulo: 'Tipo', valor: (c) => c.tipo },
    { rotulo: 'Valor', valor: (c) => brl(c.valor) + (c.tipo === 'Locação' ? '/mês' : '') },
    { rotulo: 'Vigência', valor: (c) => (c.termino ? `${dataBr(c.inicio)} a ${dataBr(c.termino)} (${c.duracaoEmMeses} meses)` : `desde ${dataBr(c.inicio)}`) },
    { rotulo: 'Assinaturas', valor: (c) => `${c.assinaturas.length} de 3` },
    { rotulo: 'Status', valor: (c) => etiqueta(c.status) },
  ],
};
