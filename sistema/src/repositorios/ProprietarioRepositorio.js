const Repositorio = require('./Repositorio');
const Proprietario = require('../modelos/Proprietario');
const { ValidadorProprietario } = require('../validacao/validadores');
const { Notificador } = require('../estrategias/notificacao');

class ProprietarioRepositorio extends Repositorio {
  tabela() {
    return 'proprietarios';
  }

  modelo() {
    return Proprietario;
  }

  validador() {
    return new ValidadorProprietario();
  }

  ordenacao() {
    return 'nome';
  }

  async depoisDeSalvar(proprietario, anterior) {
    if (!anterior) {
      await Notificador.doProduto().enviar(proprietario, `Olá, ${proprietario.primeiroNome()}! Seu cadastro de proprietário foi criado. Você vai receber aqui as novidades dos seus imóveis.`);
    }
  }

  async antesDeExcluir(proprietario) {
    await this.impedirSeUsado('imoveis', 'proprietario_id', proprietario.id, 'O proprietário tem imóveis cadastrados. Exclua ou transfira os imóveis antes.');
  }

  async paraResposta(proprietario) {
    return { ...proprietario, cpfMascarado: proprietario.cpfMascarado() };
  }
}

module.exports = ProprietarioRepositorio;
