// Tela CRUD 1 – Corretores (tabela "corretores")
import { etiqueta } from '../util.js';

export default {
  titulo: 'Corretores',
  recurso: 'corretores',
  descricao: 'Equipe que cadastra imóveis e realiza visitas. Para aprovar uma conta criada pela tela "Criar conta", edite o corretor e marque "Corretor ativo".',
  campos: [
    { nome: 'nome', rotulo: 'Nome completo' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'metade' },
    { nome: 'telefone', rotulo: 'Telefone', largura: 'metade', exemplo: '(41) 99999-0000' },
    { nome: 'creci', rotulo: 'CRECI', largura: 'metade', exemplo: '12345-F/PR' },
    { nome: 'senha', rotulo: 'Senha de acesso', tipo: 'password', largura: 'metade', autocompletar: 'new-password',
      dica: 'Em branco mantém a senha atual. Sem senha, o corretor não entra no sistema.' },
    { nome: 'ativo', rotulo: 'Corretor ativo (pode entrar no sistema)', tipo: 'checkbox', padrao: true },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (c) => c.nome },
    { rotulo: 'E-mail', valor: (c) => c.email },
    { rotulo: 'Telefone', valor: (c) => c.telefone },
    { rotulo: 'CRECI', valor: (c) => c.creci },
    { rotulo: 'Situação', valor: (c) => {
      if (c.ativo) return etiqueta('Ativo', 'ok');
      return c.aguardandoAprovacao ? etiqueta('Aguardando aprovação', 'warn') : etiqueta('Inativo', 'danger');
    } },
  ],
};
