// Objeto de valor: o endereço não tem identidade própria, pertence ao imóvel.
class Endereco {
  constructor({ cep = '', logradouro = '', numero = '', bairro = '', cidade = '', uf = '' } = {}) {
    this.cep = cep || '';
    this.logradouro = logradouro || '';
    this.numero = numero || '';
    this.bairro = bairro || '';
    this.cidade = cidade || '';
    this.uf = uf || '';
  }

  cepFormatado() {
    const d = String(this.cep).replace(/\D/g, '');
    return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : this.cep;
  }

  formatado() {
    const rua = [this.logradouro, this.numero].filter(Boolean).join(', ');
    const local = [this.bairro, `${this.cidade}/${this.uf}`].filter(Boolean).join(' – ');
    return [rua, local].filter(Boolean).join(' – ');
  }

  mesmaCidade(outro) {
    return this.cidade.toLowerCase() === outro.cidade.toLowerCase() && this.uf === outro.uf;
  }
}

module.exports = Endereco;
