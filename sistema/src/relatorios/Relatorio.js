// PADRÃO TEMPLATE METHOD (exemplo 3 de 3)
// gerar() define o roteiro fixo de qualquer relatório:
//   1. buscarDados()        passo abstrato: de onde vêm os registros
//   2. filtrar()            gancho: por padrão mantém todos
//   3. colunas()            passo abstrato: cabeçalho
//   4. formatarLinha()      passo abstrato: um registro vira uma linha
//   5. resumo()             gancho: totais no rodapé
//   6. exportador.exportar  formato final, escolhido pelo padrão Strategy
// Um relatório novo só implementa os passos; o roteiro e os formatos são reaproveitados.
class Relatorio {
  gerar(exportador, filtros = {}) {
    const registros = this.filtrar(this.buscarDados(), filtros);
    const documento = {
      titulo: this.titulo(),
      colunas: this.colunas(),
      linhas: registros.map((r) => this.formatarLinha(r)),
      resumo: this.resumo(registros),
    };
    return exportador.exportar(documento);
  }

  titulo() {
    throw new Error(`${this.constructor.name} precisa implementar titulo().`);
  }

  buscarDados() {
    throw new Error(`${this.constructor.name} precisa implementar buscarDados().`);
  }

  colunas() {
    throw new Error(`${this.constructor.name} precisa implementar colunas().`);
  }

  formatarLinha(registro) {
    throw new Error(`${this.constructor.name} precisa implementar formatarLinha().`);
  }

  filtrar(registros, filtros) {
    return registros;
  }

  resumo(registros) {
    return { 'Total de registros': registros.length };
  }

  // Utilitários para as subclasses.
  static moeda(v) {
    return v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  static dataHora(iso) {
    return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  }
}

module.exports = Relatorio;
