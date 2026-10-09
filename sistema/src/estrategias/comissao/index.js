// PADRÃO STRATEGY (exemplo 1 de 3): cálculo da comissão da imobiliária.
// Cada modalidade de negócio tem uma regra própria. Quem calcula (Proposta,
// RelatorioPropostas) só conhece a interface calcular(valor), e a estratégia
// é escolhida pela finalidade do imóvel e pelos parâmetros do produto (LPS).
const Configuracao = require('../../infra/Configuracao');

class EstrategiaComissao {
  calcular(valor) {
    throw new Error(`${this.constructor.name} precisa implementar calcular().`);
  }

  descricao() {
    throw new Error(`${this.constructor.name} precisa implementar descricao().`);
  }
}

// Venda: percentual sobre o valor negociado.
class ComissaoVenda extends EstrategiaComissao {
  constructor(percentual) {
    super();
    this.percentual = percentual;
  }

  calcular(valor) {
    return Math.round(valor * this.percentual) / 100;
  }

  descricao() {
    return `${this.percentual}% do valor de venda`;
  }
}

// Locação: um número de aluguéis (o valor da proposta é o aluguel mensal).
class ComissaoLocacao extends EstrategiaComissao {
  constructor(alugueis) {
    super();
    this.alugueis = alugueis;
  }

  calcular(valor) {
    return Math.round(valor * this.alugueis * 100) / 100;
  }

  descricao() {
    return this.alugueis === 1 ? '1 aluguel' : `${this.alugueis} aluguéis`;
  }
}

function estrategiaComissaoPara(finalidade) {
  const config = Configuracao.instancia();
  return finalidade === 'Locação'
    ? new ComissaoLocacao(config.parametro('comissaoLocacaoAlugueis'))
    : new ComissaoVenda(config.parametro('comissaoVendaPercentual'));
}

module.exports = { EstrategiaComissao, ComissaoVenda, ComissaoLocacao, estrategiaComissaoPara };
