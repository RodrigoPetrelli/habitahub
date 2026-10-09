const Repositorio = require('./Repositorio');
const Corretor = require('../modelos/Corretor');
const { ValidadorCorretor } = require('../validacao/validadores');

class CorretorRepositorio extends Repositorio {
  tabela() {
    return 'corretores';
  }

  modelo() {
    return Corretor;
  }

  validador() {
    return new ValidadorCorretor();
  }

  ordenacao() {
    return 'nome';
  }

  antesDeExcluir(corretor) {
    this.impedirSeUsado('imoveis', 'corretor_id', corretor.id, 'O corretor é responsável por imóveis. Desative-o em vez de excluir.');
    this.impedirSeUsado('visitas', 'corretor_id', corretor.id, 'O corretor tem visitas registradas. Desative-o em vez de excluir.');
  }
}

module.exports = CorretorRepositorio;
