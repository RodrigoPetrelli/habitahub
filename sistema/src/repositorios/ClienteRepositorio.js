const Repositorio = require('./Repositorio');
const Cliente = require('../modelos/Cliente');
const { ValidadorCliente } = require('../validacao/validadores');

class ClienteRepositorio extends Repositorio {
  tabela() {
    return 'clientes';
  }

  modelo() {
    return Cliente;
  }

  validador() {
    return new ValidadorCliente();
  }

  ordenacao() {
    return 'nome';
  }

  async antesDeExcluir(cliente) {
    await this.impedirSeUsado('visitas', 'cliente_id', cliente.id, 'O cliente tem visitas registradas e não pode ser excluído.');
    await this.impedirSeUsado('propostas', 'cliente_id', cliente.id, 'O cliente tem propostas registradas e não pode ser excluído.');
  }
}

module.exports = ClienteRepositorio;
