// Tela CRUD 3 – Clientes (tabela "clientes")
export default {
  titulo: 'Clientes',
  recurso: 'clientes',
  descricao: 'Interessados em comprar ou alugar.',
  campos: [
    { nome: 'nome', rotulo: 'Nome completo' },
    { nome: 'cpf', rotulo: 'CPF', largura: 'metade', exemplo: '000.000.000-00' },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 'metade' },
    { nome: 'telefone', rotulo: 'Telefone', largura: 'metade', exemplo: '(41) 99999-0000' },
    // Ponto de variação VP3: as opções vêm das modalidades do produto ativo.
    { nome: 'interesse', rotulo: 'Interesse', tipo: 'select', largura: 'metade', opcoes: (produto) => produto.features.modalidades },
  ],
  colunas: [
    { rotulo: 'Nome', valor: (c) => c.nome },
    { rotulo: 'CPF', valor: (c) => c.cpf },
    { rotulo: 'E-mail', valor: (c) => c.email },
    { rotulo: 'Telefone', valor: (c) => c.telefone },
    { rotulo: 'Interesse', valor: (c) => c.interesse },
  ],
};
