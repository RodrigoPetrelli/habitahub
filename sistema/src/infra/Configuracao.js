const fs = require('node:fs');
const path = require('node:path');
const ModeloDeFeatures = require('../variabilidade/ModeloDeFeatures');

// PADRÃO SINGLETON (exemplo 2 de 2)
// Guarda a configuração do produto da linha (LPS) escolhido na inicialização.
// Todas as partes do sistema consultam a mesma instância, então o produto ativo
// é decidido em um único lugar. O ponto de vinculação da variabilidade é a
// carga do sistema (load time): --produto=<id> ou HABITAHUB_PRODUTO=<id>.
class Configuracao {
  static #instancia = null;

  #produto;

  constructor(chave) {
    if (chave !== Configuracao.#chave) {
      throw new Error('Use Configuracao.instancia() em vez de new Configuracao().');
    }
  }

  static #chave = Symbol('Configuracao');

  static instancia() {
    if (!Configuracao.#instancia) Configuracao.#instancia = new Configuracao(Configuracao.#chave);
    return Configuracao.#instancia;
  }

  carregar(idProduto) {
    const arquivo = path.join(__dirname, '..', '..', 'produtos', `${idProduto}.json`);
    if (!fs.existsSync(arquivo)) {
      const existentes = fs.readdirSync(path.dirname(arquivo)).map((f) => f.replace('.json', ''));
      throw new Error(`Produto "${idProduto}" não existe. Produtos disponíveis: ${existentes.join(', ')}.`);
    }
    const produto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const erros = new ModeloDeFeatures().validar(produto.features);
    if (!produto.organizacaoPadrao) erros.push('Informe "organizacaoPadrao": a organização dos dados de demonstração.');
    if (erros.length) {
      throw new Error(`Configuração inválida do produto "${idProduto}":\n- ${erros.join('\n- ')}`);
    }
    this.#produto = Object.freeze(produto);
    return this;
  }

  get produto() {
    if (!this.#produto) throw new Error('Nenhum produto carregado. Chame carregar() na inicialização.');
    return this.#produto;
  }

  temFeature(nome) {
    return this.produto.features[nome] === true;
  }

  opcoes(grupo) {
    const valor = this.produto.features[grupo];
    return Array.isArray(valor) ? valor : [valor];
  }

  parametro(nome) {
    return this.produto.parametros[nome];
  }

  // Resumo enviado ao front-end para montar o menu e os formulários.
  paraCliente() {
    const { id, nome, descricao, features, parametros } = this.produto;
    return { id, nome, descricao, features, parametros };
  }
}

module.exports = Configuracao;
