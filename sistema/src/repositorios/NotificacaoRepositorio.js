const Repositorio = require('./Repositorio');
const Notificacao = require('../modelos/Notificacao');

class NotificacaoRepositorio extends Repositorio {
  tabela() {
    return 'notificacoes';
  }

  modelo() {
    return Notificacao;
  }

  // Gravada só pelo sistema, sem formulário: não há o que validar.
  validador() {
    return null;
  }
}

module.exports = NotificacaoRepositorio;
