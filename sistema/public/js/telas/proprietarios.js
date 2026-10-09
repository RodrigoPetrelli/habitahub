// Tela CRUD 2 – Proprietários (tabela "proprietarios")
export default {
  titulo: 'Proprietários',
  recurso: 'proprietarios',
  descricao: 'Donos dos imóveis, que acompanham visitas e propostas.',
  campos: [
    { nome: 'nome', rotulo: 'Nome completo' },
    { nome: 'cpf', rotulo: 'CPF', largura: 'metade', exemplo: '000.000.000-00' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'metade' },
    { nome: 'telefone', rotulo: 'Telefone', largura: 'metade', exemplo: '(41) 99999-0000' },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (p) => p.nome },
    { rotulo: 'CPF', valor: (p) => p.cpfMascarado },
    { rotulo: 'E-mail', valor: (p) => p.email },
    { rotulo: 'Telefone', valor: (p) => p.telefone },
  ],
};
