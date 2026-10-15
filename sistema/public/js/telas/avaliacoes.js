// Tela CRUD 8 – Avaliações (tabela "avaliacoes") – feature opcional "avaliacoes"
import { etiqueta } from '../util.js';

const estrelas = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export default {
  titulo: 'Avaliações',
  recurso: 'avaliacoes',
  feature: 'avaliacoes',
  descricao: 'Nota do cliente para o atendimento de uma visita realizada. O corretor da visita recebe a avaliação, e a média aparece na tela Corretores.',
  fontes: {
    visitas: (v) => v.resumo,
    corretores: (c) => c.nome,
  },
  campos: [
    // Só visitas realizadas e ainda sem avaliação (além da própria, na edição).
    { nome: 'visitaId', rotulo: 'Visita realizada', tipo: 'select', fonte: 'visitas',
      filtro: (v, avaliacao, tela) => v.id === avaliacao?.visitaId || (v.status === 'Realizada' && !tela.registros.some((a) => a.visitaId === v.id)) },
    { nome: 'nota', rotulo: 'Nota', tipo: 'select', largura: 'metade', opcoes: ['5', '4', '3', '2', '1'], dica: '5 é a melhor.' },
    { nome: 'anonimo', rotulo: 'O cliente prefere não se identificar', tipo: 'checkbox' },
    { nome: 'comentario', rotulo: 'Comentário', tipo: 'textarea' },
  ],
  colunas: [
    { rotulo: 'Visita', valor: (a, tela) => tela.rotuloDe('visitas', a.visitaId) },
    { rotulo: 'Corretor', valor: (a, tela) => tela.rotuloDe('corretores', a.corretorId) },
    { rotulo: 'Nota', valor: (a) => etiqueta(`${estrelas(a.nota)} ${a.nota}`, a.positiva ? 'ok' : 'warn'), classe: 'nowrap' },
    { rotulo: 'Cliente', valor: (a) => a.autor },
    { rotulo: 'Comentário', valor: (a) => a.comentario, classe: 'pre' },
  ],
};
