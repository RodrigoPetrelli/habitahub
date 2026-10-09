// Tela CRUD 1 – Corretores (tabela "corretores")
import { etiqueta } from '../util.js';

export default {
  titulo: 'Corretores',
  recurso: 'corretores',
  descricao: 'Equipe que cadastra imóveis e realiza visitas.',
  campos: [
    { nome: 'nome', rotulo: 'Nome completo' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'metade' },
    { nome: 'telefone', rotulo: 'Telefone', largura: 'metade', exemplo: '(41) 99999-0000' },
    { nome: 'creci', rotulo: 'CRECI', largura: 'metade', exemplo: '12345-F/PR' },
    { nome: 'ativo', rotulo: 'Corretor ativo', tipo: 'checkbox', padrao: true },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (c) => c.nome },
    { rotulo: 'E-mail', valor: (c) => c.email },
    { rotulo: 'Telefone', valor: (c) => c.telefone },
    { rotulo: 'CRECI', valor: (c) => c.creci },
    { rotulo: 'Situação', valor: (c) => (c.ativo ? etiqueta('Ativo', 'on') : etiqueta('Inativo', 'off')) },
  ],
};
