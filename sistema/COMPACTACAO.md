# Compactação de código focada em reuso

O HabitaHub aplica duas técnicas complementares:

1. **Compactação por reuso:** a lógica repetida foi extraída para componentes genéricos. Cada tela ou cadastro novo escreve só o que é específico dele.
2. **Minificação e empacotamento:** o front-end é reduzido e agrupado com o esbuild. O componente reutilizável também sai como uma biblioteca compactada, para ser usada por outros produtos da linha.

Os números abaixo foram gerados pelos próprios scripts do projeto e podem ser reproduzidos.

---

## Técnica 1 – Compactação por reuso (extração de componentes genéricos)

### Passo a passo

1. **Identificar o que se repete.** As 6 telas de CRUD fazem a mesma coisa: listar em tabela, abrir um formulário, validar, salvar, excluir e mostrar erros. Os 6 cadastros também repetem a mesma sequência: o SQL de INSERT, UPDATE, DELETE e SELECT, a validação e as rotas REST.
2. **Separar o que muda do que é fixo.** O que muda em cada tela é o título, os campos e as colunas. O que muda em cada cadastro é a tabela, as regras e os ganchos.
3. **Extrair o que é fixo para um componente genérico:**
   - `public/js/TelaCrud.js`: tela de CRUD configurável.
   - `src/http/CrudControlador.js`: as 5 rotas REST de qualquer cadastro.
   - `src/repositorios/Repositorio.js` (Template Method): fluxo de gravação e SQL genérico.
   - `src/validacao/Validador.js` (Template Method): roteiro de validação.
   - `src/relatorios/Relatorio.js` (Template Method): roteiro dos relatórios.
4. **Reescrever cada caso como configuração ou subclasse pequena.** A tela de Proprietários, por exemplo, ficou só com a descrição:

   ```js
   export default {
     titulo: 'Proprietários',
     recurso: 'proprietarios',
     campos: [
       { nome: 'nome', rotulo: 'Nome completo' },
       { nome: 'cpf', rotulo: 'CPF', largura: 'metade' },
       ...
     ],
     colunas: [ { rotulo: 'Nome', valor: (p) => p.nome }, ... ],
   };
   ```

   No back-end, cada cadastro ganha as suas rotas com uma linha (`src/app.js`):

   ```js
   new CrudControlador(new Repo()).registrar(roteador, recurso);
   ```

5. **Medir.** Rode `npm run medir-reuso`.

### Resultado (`npm run medir-reuso`)

| Componente genérico | Linhas do genérico | Usos | Linhas específicas | Sem reuso (estimado) | Com reuso | Economia |
|---|---|---|---|---|---|---|
| TelaCrud (6 telas de CRUD) | 168 | 6 | 176 | 1184 | 344 | 840 linhas (71%) |
| CrudControlador (rotas REST dos 6 cadastros) | 44 | 6 | 6 | 270 | 50 | 220 linhas (81%) |
| Repositorio – Template Method (8 repositórios) | 98 | 8 | 346 | 1130 | 444 | 686 linhas (61%) |
| Validador – Template Method (7 validadores) | 35 | 7 | 121 | 366 | 156 | 210 linhas (57%) |
| Relatorio – Template Method (3 relatórios) | 37 | 3 | 108 | 219 | 145 | 74 linhas (34%) |
| **Total** | | | | **3169** | **1139** | **2030 linhas (64%)** |

Como ler a tabela:
- **Linhas contadas:** só linhas de código, sem linhas vazias e sem comentários.
- **"Com reuso":** é o código real do projeto, com o componente escrito uma vez mais as partes específicas.
- **"Sem reuso":** é uma estimativa em que cada uso teria a sua própria cópia da lógica genérica. O valor é um limite superior, porque na prática cada cópia seria um pouco mais curta e adaptada.
- **Telas novas:** para uma tela de CRUD nova, a economia continua valendo, porque só se escreve a configuração (18 a 60 linhas).

---

## Técnica 2 – Minificação e empacotamento (esbuild)

### Passo a passo

1. **Instalar o compactador** como dependência só de desenvolvimento, com a versão fixada:

   ```bash
   npm install --save-dev --save-exact esbuild@0.28.2
   ```

2. **Escrever o script de build** (`scripts/build.js`). Ele chama o esbuild com `bundle: true` (junta os módulos) e `minify: true`, que:
   - remove espaços e comentários;
   - encurta nomes de variáveis locais;
   - simplifica expressões.
3. **Gerar três pacotes:**
   - `dist/js/app.min.js`: os 10 módulos JavaScript da aplicação viram 1 arquivo.
   - `dist/css/app.min.css` e `dist/index.html`: estilos e página compactados.
   - `dist/lib/tela-crud.min.js`: o **componente reutilizável** `TelaCrud` e os utilitários dele, em um arquivo só, com ponto de entrada em `public/js/biblioteca.js`. Qualquer produto da linha monta uma tela de CRUD com ele:

     ```js
     import { TelaCrud } from '/lib/tela-crud.min.js';
     new TelaCrud({ titulo, recurso, campos, colunas }, produto).montar(container);
     ```

4. **Rodar:** `npm run build`. O script imprime a tabela de antes e depois.
5. **Servir a versão compactada:**
   - **Local:** `HABITAHUB_FRONT=dist npm start`, ou `npm run start:dist`.
   - **Docker:** o `Dockerfile` roda o build em uma etapa separada e a imagem final serve só o `dist/`, sem o esbuild e sem os arquivos-fonte do front-end.

### Resultado (`npm run build`)

| Parte | Arquivos antes → depois | Antes | Depois | Redução | gzip antes | gzip depois |
|---|---|---|---|---|---|---|
| JavaScript da aplicação | 10 → 1 | 49.5 KB | 30.7 KB | 38% | 18.2 KB | 10.4 KB |
| CSS | 1 → 1 | 13.9 KB | 11.3 KB | 18% | 3.6 KB | 3.1 KB |
| HTML | 1 → 1 | 1.3 KB | 1.0 KB | 23% | 0.7 KB | 0.5 KB |
| Biblioteca TelaCrud | 2 → 1 | 15.0 KB | 7.7 KB | 48% | 5.7 KB | 3.3 KB |

- **Requisições:** o navegador baixa 1 arquivo JavaScript em vez de 10.
- **gzip:** as colunas mostram o tamanho comprimido. Com ele, o JavaScript transferido cai de 18.2 KB para 10.4 KB.
- **Por que a redução não é maior:** os textos da interface, em português, não podem ser encurtados, e isso limita o ganho da minificação.

---

## Como as duas técnicas se ligam ao reuso

| Técnica | O que compacta | Ganho para o reuso |
|---|---|---|
| Extração de componentes genéricos | O código-fonte (64% menos linhas) | Telas e cadastros novos custam poucas linhas: basta configurar ou estender |
| Minificação e empacotamento | O código distribuído (38% a 48% menos bytes) | O componente reutilizável vira uma biblioteca de um arquivo só, fácil de levar para outro produto da linha (LPS) |
