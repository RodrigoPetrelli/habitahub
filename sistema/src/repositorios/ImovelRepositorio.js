const Repositorio = require('./Repositorio');
const Imovel = require('../modelos/Imovel');
const { ValidadorImovel } = require('../validacao/validadores');
const { Notificador } = require('../estrategias/notificacao');
const { ErroRegraNegocio, ErroValidacao } = require('../infra/erros');
const CorretorRepositorio = require('./CorretorRepositorio');
const ProprietarioRepositorio = require('./ProprietarioRepositorio');
const { organizacaoAtual } = require('../infra/ContextoOrganizacao');

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

  async antesDeSalvar(imovel, anterior) {
    // Um imóvel novo ainda não tem negócio: "Reservado" vem de uma proposta
    // aprovada, e "Vendido"/"Alugado", do fechamento do negócio.
    if (!anterior && !Imovel.STATUS_INICIAIS.includes(imovel.status)) {
      throw new ErroValidacao({ status: `Um imóvel novo começa como ${Imovel.STATUS_INICIAIS.map((s) => `"${s}"`).join(' ou ')}.` });
    }
    const corretor = await new CorretorRepositorio().buscarPorId(imovel.corretorId);
    if (!corretor) throw new ErroRegraNegocio('Corretor não encontrado.');
    if (!corretor.podeAtenderImoveis() && (!anterior || anterior.corretorId !== imovel.corretorId)) {
      throw new ErroRegraNegocio(`O corretor ${corretor.nome} está inativo.`);
    }
    if (!await new ProprietarioRepositorio().buscarPorId(imovel.proprietarioId)) {
      throw new ErroRegraNegocio('Proprietário não encontrado.');
    }
    imovel.codigo = anterior ? anterior.codigo : await this.#proximoCodigo();
  }

  async depoisDeSalvar(imovel, anterior) {
    const proprietario = await new ProprietarioRepositorio().buscarPorId(imovel.proprietarioId);
    if (!anterior) {
      await Notificador.doProduto().enviar(proprietario, `Seu imóvel "${imovel.titulo}" foi cadastrado com o código ${imovel.codigo}.`);
    } else if (anterior.preco !== imovel.preco) {
      await Notificador.doProduto().enviar(proprietario, `O preço do imóvel ${imovel.codigo} mudou de ${brl(anterior.preco)} para ${brl(imovel.preco)}.`);
    }
  }

  async antesDeExcluir(imovel) {
    await this.impedirSeUsado('visitas', 'imovel_id', imovel.id, 'O imóvel tem visitas registradas. Mude o status para "Inativo" em vez de excluir.');
    await this.impedirSeUsado('propostas', 'imovel_id', imovel.id, 'O imóvel tem propostas registradas. Mude o status para "Inativo" em vez de excluir.');
  }

  async #proximoCodigo() {
    // Cada organização tem a sua sequência de códigos (HH-0001, HH-0002, ...).
    const linha = await this.db.um("SELECT MAX(CAST(SUBSTR(codigo, 4) AS INTEGER)) AS n FROM imoveis WHERE codigo LIKE 'HH-%' AND organizacao_id = ?", [organizacaoAtual()]);
    return `HH-${String((linha.n || 0) + 1).padStart(4, '0')}`;
  }
}

module.exports = ImovelRepositorio;
