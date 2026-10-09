const Repositorio = require('./Repositorio');
const Organizacao = require('../modelos/Organizacao');
const { ValidadorOrganizacao } = require('../validacao/validadores');

// A tabela organizacoes é do sistema inteiro: não pertence a uma organização.
class OrganizacaoRepositorio extends Repositorio {
  tabela() {
    return 'organizacoes';
  }

  modelo() {
    return Organizacao;
  }

  validador() {
    return new ValidadorOrganizacao();
  }

  ordenacao() {
    return 'nome';
  }

  porOrganizacao() {
    return false;
  }

  // Nomes que só mudam em maiúsculas ou espaços contam como o mesmo nome.
  async nomeEmUso(nome) {
    const chave = String(nome || '').trim().replace(/\s+/g, ' ').toLowerCase();
    return (await this.listar()).some((o) => o.nome.toLowerCase() === chave);
  }
}

module.exports = OrganizacaoRepositorio;
