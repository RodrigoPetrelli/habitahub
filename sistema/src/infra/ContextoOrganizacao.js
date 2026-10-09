// Organização dona dos dados da operação em andamento.
//
// O servidor abre o contexto com a organização do corretor logado antes de cada
// rota protegida, e os repositórios só leem e gravam registros dessa organização.
// Sem contexto, o repositório falha em vez de enxergar o banco inteiro: esquecer
// de abrir o contexto vira erro, nunca vazamento de dados entre organizações.
const { AsyncLocalStorage } = require('node:async_hooks');

const contexto = new AsyncLocalStorage();

// Roda fn() com a organização ativa; as chamadas assíncronas dentro dela herdam o contexto.
function naOrganizacao(organizacaoId, fn) {
  return contexto.run(Number(organizacaoId), fn);
}

function organizacaoAtual() {
  const id = contexto.getStore();
  if (!id) throw new Error('Nenhuma organização ativa. Use naOrganizacao(id, fn).');
  return id;
}

module.exports = { naOrganizacao, organizacaoAtual };
