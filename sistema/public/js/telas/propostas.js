// Tela CRUD 6 – Propostas (tabela "propostas") – feature opcional "propostas"
import { brl, etiqueta } from '../util.js';

export default {
  titulo: 'Propostas',
  recurso: 'propostas',
  feature: 'propostas',
  descricao: 'Ofertas dos clientes. A comissão estimada usa a regra da modalidade do imóvel (padrão Strategy).',
  fontes: {
    imoveis: (i) => `${i.codigo} – ${i.titulo} (${brl(i.preco)})`,
    clientes: (c) => c.nome,
  },
  campos: [
    { nome: 'imovelId', rotulo: 'Imóvel', tipo: 'select', fonte: 'imoveis' },
    { nome: 'clienteId', rotulo: 'Cliente', tipo: 'select', fonte: 'clientes', largura: 'metade' },
    { nome: 'valor', rotulo: 'Valor ofertado (R$)', tipo: 'number', largura: 'metade' },
    { nome: 'status', rotulo: 'Status', tipo: 'select', largura: 'metade', opcoes: ['Em análise', 'Aprovada', 'Recusada', 'Contraproposta'], padrao: 'Em análise' },
    { nome: 'valorContraproposta', rotulo: 'Valor da contraproposta (R$)', tipo: 'number', largura: 'metade', dica: 'Só com status "Contraproposta".' },
    { nome: 'condicoes', rotulo: 'Condições de pagamento', tipo: 'textarea' },
  ],
  colunas: [
    { rotulo: 'Imóvel', valor: (p, tela) => tela.rotuloDe('imoveis', p.imovelId) },
    { rotulo: 'Cliente', valor: (p, tela) => tela.rotuloDe('clientes', p.clienteId) },
    { rotulo: 'Valor', valor: (p) => brl(p.valorNegociado) + (p.percentualDoPreco ? ` (${p.percentualDoPreco}%)` : '') },
    { rotulo: 'Comissão estimada', valor: (p) => `${brl(p.comissaoEstimada)} · ${p.regraComissao}` },
    { rotulo: 'Status', valor: (p) => etiqueta(p.status, p.status === 'Aprovada' ? 'on' : p.status === 'Recusada' ? 'off' : '') },
  ],
};
