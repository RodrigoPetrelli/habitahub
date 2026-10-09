// PADRÃO STRATEGY (exemplo 3 de 3): formato de exportação dos relatórios.
// O relatório monta { titulo, colunas, linhas, resumo } e entrega para o
// exportador, que só cuida do formato. O produto define os formatos ativos.
const Configuracao = require('../../infra/Configuracao');

class Exportador {
  get tipoConteudo() {
    throw new Error(`${this.constructor.name} precisa definir tipoConteudo.`);
  }

  exportar(documento) {
    throw new Error(`${this.constructor.name} precisa implementar exportar().`);
  }
}

class ExportadorCsv extends Exportador {
  get tipoConteudo() {
    return 'text/csv; charset=utf-8';
  }

  exportar({ colunas, linhas }) {
    const celula = (v) => {
      const s = v == null ? '' : String(v);
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Separador ";" e BOM para abrir direto no Excel em português.
    const corpo = [colunas, ...linhas].map((l) => l.map(celula).join(';')).join('\n');
    return `﻿${corpo}\n`;
  }
}

class ExportadorJson extends Exportador {
  get tipoConteudo() {
    return 'application/json; charset=utf-8';
  }

  exportar({ titulo, colunas, linhas, resumo }) {
    const registros = linhas.map((l) => Object.fromEntries(colunas.map((c, i) => [c, l[i]])));
    return JSON.stringify({ titulo, geradoEm: new Date().toISOString(), registros, resumo }, null, 2);
  }
}

class ExportadorHtml extends Exportador {
  get tipoConteudo() {
    return 'text/html; charset=utf-8';
  }

  exportar({ titulo, colunas, linhas, resumo }) {
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const th = colunas.map((c) => `<th>${esc(c)}</th>`).join('');
    const tr = linhas.map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('\n');
    const rs = Object.entries(resumo || {}).map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#1c2622}table{border-collapse:collapse;width:100%}th,td{border:1px solid #dde4e0;padding:6px 8px;text-align:left;font-size:13px}th{background:#eef2f0}</style>
</head><body><h1>${esc(titulo)}</h1><p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
<table><thead><tr>${th}</tr></thead><tbody>
${tr}
</tbody></table><ul>${rs}</ul></body></html>`;
  }
}

const EXPORTADORES = { csv: ExportadorCsv, json: ExportadorJson, html: ExportadorHtml };

// Ponto de variação: só entrega formatos habilitados no produto ativo.
function exportadorPara(formato) {
  if (!Configuracao.instancia().opcoes('exportacao').includes(formato)) return null;
  return new EXPORTADORES[formato]();
}

module.exports = { Exportador, ExportadorCsv, ExportadorJson, ExportadorHtml, exportadorPara };
