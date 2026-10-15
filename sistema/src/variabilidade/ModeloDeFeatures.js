// Modelo de features da Linha de Produto HabitaHub.
//
//   HabitaHub
//   ├── Cadastros ................ obrigatória  (Corretores, Proprietários, Clientes, Imóveis)
//   ├── Visitas .................. opcional
//   │   └── Avaliações ........... opcional     (requer Visitas)
//   ├── Propostas ................ opcional     (requer Visitas)
//   │   └── Contratos ............ opcional     (requer Propostas)
//   ├── Modalidades .............. grupo OR     (Venda | Locação, pelo menos uma)
//   ├── Notificação .............. alternativa  (email | whatsapp | sms, exatamente uma)
//   └── Exportação de relatórios . grupo OR     (csv | html | json, pelo menos uma)
//
// Cada produto (arquivo em /produtos) é uma configuração deste modelo. A classe
// abaixo verifica se a configuração respeita o modelo antes de o sistema subir.
class ModeloDeFeatures {
  constructor() {
    this.opcionais = ['visitas', 'propostas', 'contratos', 'avaliacoes'];
    this.gruposOr = {
      modalidades: ['Venda', 'Locação'],
      exportacao: ['csv', 'html', 'json'],
    };
    this.alternativas = {
      notificacao: ['email', 'whatsapp', 'sms'],
    };
    // Restrições entre features: [feature, requer].
    this.requer = [['propostas', 'visitas'], ['contratos', 'propostas'], ['avaliacoes', 'visitas']];
  }

  validar(features) {
    const erros = [];
    for (const nome of this.opcionais) {
      if (typeof features[nome] !== 'boolean') erros.push(`"${nome}" deve ser true ou false.`);
    }
    for (const [grupo, opcoes] of Object.entries(this.gruposOr)) {
      const escolhidas = features[grupo];
      if (!Array.isArray(escolhidas) || escolhidas.length === 0) {
        erros.push(`"${grupo}" precisa de pelo menos uma opção entre ${opcoes.join(', ')}.`);
      } else {
        escolhidas.filter((o) => !opcoes.includes(o))
          .forEach((o) => erros.push(`"${o}" não é uma opção válida de "${grupo}".`));
      }
    }
    for (const [grupo, opcoes] of Object.entries(this.alternativas)) {
      if (!opcoes.includes(features[grupo])) {
        erros.push(`"${grupo}" deve ser exatamente uma entre ${opcoes.join(', ')}.`);
      }
    }
    for (const [feature, requisito] of this.requer) {
      if (features[feature] && !features[requisito]) {
        erros.push(`A feature "${feature}" requer "${requisito}".`);
      }
    }
    return erros;
  }
}

module.exports = ModeloDeFeatures;
