// Tela CRUD 5 – Visitas (tabela "visitas") – feature opcional "visitas"
import { dataHora, etiqueta } from '../util.js';

export default {
  titulo: 'Visitas',
  recurso: 'visitas',
  feature: 'visitas',
  descricao: 'Agendamento e feedback das visitas. O proprietário recebe o feedback quando a visita é marcada como realizada.',
  fontes: {
    imoveis: (i) => `${i.codigo} – ${i.titulo}`,
    clientes: (c) => c.nome,
    corretores: (c) => c.nome,
  },
  campos: [
    { nome: 'imovelId', rotulo: 'Imóvel', tipo: 'select', fonte: 'imoveis' },
    { nome: 'clienteId', rotulo: 'Cliente', tipo: 'select', fonte: 'clientes', largura: 'metade' },
    { nome: 'corretorId', rotulo: 'Corretor', tipo: 'select', fonte: 'corretores', largura: 'metade' },
    { nome: 'dataHora', rotulo: 'Data e hora', tipo: 'datetime-local', largura: 'metade' },
    { nome: 'status', rotulo: 'Status', tipo: 'select', largura: 'metade', opcoes: ['Agendada', 'Realizada', 'Cancelada'], padrao: 'Agendada' },
    { nome: 'feedback', rotulo: 'Feedback da visita', tipo: 'textarea', dica: 'Obrigatório quando a visita é realizada.' },
  ],
  colunas: [
    { rotulo: 'Data', valor: (v) => dataHora(v.dataHora) },
    { rotulo: 'Imóvel', valor: (v, tela) => tela.rotuloDe('imoveis', v.imovelId) },
    { rotulo: 'Cliente', valor: (v, tela) => tela.rotuloDe('clientes', v.clienteId) },
    { rotulo: 'Corretor', valor: (v, tela) => tela.rotuloDe('corretores', v.corretorId) },
    { rotulo: 'Status', valor: (v) => etiqueta(v.status) },
    { rotulo: 'Feedback', valor: (v) => v.feedback, classe: 'pre' },
  ],
};
