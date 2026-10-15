// Tela CRUD 1 – Corretores (tabela "corretores")
import { etiqueta } from '../util.js';

export default {
  titulo: 'Corretores',
  recurso: 'corretores',
  descricao: 'Equipe que cadastra imóveis e realiza visitas. Administradores aprovam contas novas (editar → "Corretor ativo") e gerenciam a equipe; os demais corretores editam só o próprio cadastro.',
  // Espelha as regras do servidor (src/seguranca/AutorizacaoCorretores.js).
  permissoes: {
    criar: (usuario) => usuario.administrador,
    editar: (corretor, usuario) => usuario.administrador || corretor.id === usuario.id,
    excluir: (corretor, usuario) => usuario.administrador && corretor.id !== usuario.id,
  },
  campos: [
    { nome: 'nome', rotulo: 'Nome completo' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'metade' },
    { nome: 'telefone', rotulo: 'Telefone', largura: 'metade', exemplo: '(41) 99999-0000' },
    { nome: 'creci', rotulo: 'CRECI', largura: 'metade', exemplo: '12345-F/PR' },
    { nome: 'senha', rotulo: 'Senha de acesso', tipo: 'password', largura: 'metade', autocompletar: 'new-password',
      dica: 'Em branco mantém a senha atual. Sem senha, o corretor não entra no sistema.' },
    { nome: 'ativo', rotulo: 'Corretor ativo (pode entrar no sistema)', tipo: 'checkbox', padrao: true, soAdministrador: true },
    { nome: 'administrador', rotulo: 'Administrador (aprova contas novas e gerencia corretores)', tipo: 'checkbox', soAdministrador: true },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (c) => c.nome },
    { rotulo: 'E-mail', valor: (c) => c.email },
    { rotulo: 'Telefone', valor: (c) => c.telefone },
    { rotulo: 'CRECI', valor: (c) => c.creci },
    { rotulo: 'Perfil', valor: (c) => (c.administrador ? etiqueta('Administrador', 'primary') : 'Corretor') },
    { rotulo: 'Avaliação', feature: 'avaliacoes', classe: 'nowrap',
      valor: (c) => (c.totalAvaliacoes ? `★ ${String(c.mediaAvaliacoes).replace('.', ',')} (${c.totalAvaliacoes})` : '—') },
    { rotulo: 'Situação', valor: (c) => {
      if (c.ativo) return etiqueta('Ativo', 'ok');
      return c.aguardandoAprovacao ? etiqueta('Aguardando aprovação', 'warn') : etiqueta('Inativo', 'danger');
    } },
  ],
};
