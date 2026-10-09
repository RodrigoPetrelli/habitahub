// Roteador mínimo sobre node:http: "GET /api/:recurso/:id" → handler(req, params).
class Roteador {
  #rotas = [];

  adicionar(metodo, padrao, handler) {
    const nomes = [];
    const regex = new RegExp(`^${padrao.replace(/:(\w+)/g, (_, nome) => { nomes.push(nome); return '([^/]+)'; })}/?$`);
    this.#rotas.push({ metodo, regex, nomes, handler });
    return this;
  }

  get(padrao, handler) { return this.adicionar('GET', padrao, handler); }
  post(padrao, handler) { return this.adicionar('POST', padrao, handler); }
  put(padrao, handler) { return this.adicionar('PUT', padrao, handler); }
  delete(padrao, handler) { return this.adicionar('DELETE', padrao, handler); }

  encontrar(metodo, caminho) {
    for (const rota of this.#rotas) {
      if (rota.metodo !== metodo) continue;
      const m = caminho.match(rota.regex);
      if (m) {
        const params = Object.fromEntries(rota.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        return { handler: rota.handler, params };
      }
    }
    return null;
  }
}

module.exports = Roteador;
