const Repositorio = require('./Repositorio');
const Imovel = require('../modelos/Imovel');
const { ValidadorImovel } = require('../validacao/validadores');
const { Notificador } = require('../estrategias/notificacao');
const { ErroRegraNegocio } = require('../infra/erros');
const CorretorRepositorio = require('./CorretorRepositorio');
const ProprietarioRepositorio = require('./ProprietarioRepositorio');

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

class ImovelRepositorio extends Repositorio {
  tabela() {
    return 'imoveis';
  }

  modelo() {
    return Imovel;
  }

  validador() {
    return new ValidadorImovel();
  }

  antesDeSalvar(imovel, anterior) {
    const corretor = new CorretorRepositorio().buscarPorId(imovel.corretorId);
    if (!corretor) throw new ErroRegraNegocio('Corretor não encontrado.');
    if (!corretor.podeAtenderImoveis() && (!anterior || anterior.corretorId !== imovel.corretorId)) {
      throw new ErroRegraNegocio(`O corretor ${corretor.nome} está inativo.`);
    }
    if (!new ProprietarioRepositorio().buscarPorId(imovel.proprietarioId)) {
      throw new ErroRegraNegocio('Proprietário não encontrado.');
    }
    imovel.codigo = anterior ? anterior.codigo : this.#proximoCodigo();
  }

  depoisDeSalvar(imovel, anterior) {
    const proprietario = new ProprietarioRepositorio().buscarPorId(imovel.proprietarioId);
    if (!anterior) {
      Notificador.doProduto().enviar(proprietario, `Seu imóvel "${imovel.titulo}" foi cadastrado com o código ${imovel.codigo}.`);
    } else if (anterior.preco !== imovel.preco) {
      Notificador.doProduto().enviar(proprietario, `O preço do imóvel ${imovel.codigo} mudou de ${brl(anterior.preco)} para ${brl(imovel.preco)}.`);
    }
  }

  antesDeExcluir(imovel) {
    this.impedirSeUsado('visitas', 'imovel_id', imovel.id, 'O imóvel tem visitas registradas. Mude o status para "Inativo" em vez de excluir.');
    this.impedirSeUsado('propostas', 'imovel_id', imovel.id, 'O imóvel tem propostas registradas. Mude o status para "Inativo" em vez de excluir.');
  }

  #proximoCodigo() {
    const linha = this.db.um("SELECT MAX(CAST(SUBSTR(codigo, 4) AS INTEGER)) AS n FROM imoveis WHERE codigo LIKE 'HH-%'");
    return `HH-${String((linha.n || 0) + 1).padStart(4, '0')}`;
  }
}

module.exports = ImovelRepositorio;
