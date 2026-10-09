// Classe base das pessoas do sistema (corretor, proprietário e cliente).
class Usuario {
  constructor({ id = null, nome = '', email = '', telefone = '', criadoEm = null } = {}) {
    this.id = id;
    this.nome = nome;
    this.email = email;
    this.telefone = telefone;
    this.criadoEm = criadoEm;
  }

  primeiroNome() {
    return this.nome.trim().split(/\s+/)[0] || '';
  }

  contatoPreferencial() {
    return this.telefone || this.email;
  }

  static emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  }

  static somenteDigitos(texto) {
    return String(texto || '').replace(/\D/g, '');
  }

  // Validação dos dígitos verificadores do CPF.
  static cpfValido(cpf) {
    const d = Usuario.somenteDigitos(cpf);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const digito = (n) => {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
  }

  static formatarCpf(cpf) {
    const d = Usuario.somenteDigitos(cpf);
    return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : cpf;
  }
}

module.exports = Usuario;
