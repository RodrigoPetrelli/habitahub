// PADRÃO TEMPLATE METHOD (exemplo 1 de 3)
// validar() define o algoritmo fixo de validação de qualquer cadastro:
//   1. normalizar os dados de entrada (gancho, opcional)
//   2. checar os campos obrigatórios (comum a todos)
//   3. checar as opções permitidas de campos de lista (comum a todos)
//   4. aplicar as regras de negócio da entidade (passo abstrato)
// As subclasses só informam o que muda; a ordem dos passos não muda.
class Validador {
  validar(dadosBrutos) {
    const dados = this.normalizar({ ...dadosBrutos });
    const erros = {};

    for (const [campo, rotulo] of Object.entries(this.camposObrigatorios())) {
      const valor = dados[campo];
      if (valor === undefined || valor === null || String(valor).trim() === '') {
        erros[campo] = `${rotulo} é obrigatório.`;
      }
    }

    for (const [campo, permitidos] of Object.entries(this.opcoesPermitidas())) {
      if (!erros[campo] && dados[campo] != null && dados[campo] !== '' && !permitidos.includes(dados[campo])) {
        erros[campo] = `Valor inválido. Use: ${permitidos.join(', ')}.`;
      }
    }

    this.validarRegras(dados, erros);
    return { valido: Object.keys(erros).length === 0, erros, dados };
  }

  // Gancho: por padrão só tira espaços das pontas dos textos.
  normalizar(dados) {
    for (const [k, v] of Object.entries(dados)) {
      if (typeof v === 'string') dados[k] = v.trim();
    }
    return dados;
  }

  // Gancho: campos de lista e os valores aceitos.
  opcoesPermitidas() {
    return {};
  }

  // Passo abstrato: { campo: 'Rótulo' }
  camposObrigatorios() {
    throw new Error(`${this.constructor.name} precisa implementar camposObrigatorios().`);
  }

  // Passo abstrato: preenche "erros" com as regras específicas.
  validarRegras(dados, erros) {
    throw new Error(`${this.constructor.name} precisa implementar validarRegras().`);
  }
}

module.exports = Validador;
