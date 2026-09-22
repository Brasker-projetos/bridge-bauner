// Roda as regras contra os relatórios reais de 01 a 15/09 e imprime o resultado.
// Uso: node testes/rodar.mjs
import ExcelJS from 'exceljs';
import { processarEtapa1, processarEtapa2, sugerePeriodo, paraData, iso } from '../regras.js';

const FONTES = 'I:/Meu Drive/Work/sistema-bpo/00-fontes/';
const A = {
  vendas: 'vendas-pedidos_export_20260915104553.xlsx',
  clientesPeriodo: 'usuarios-todos_export_20260915104106.xlsx',
  clientesBase: 'usuarios-todos_export_20260915113249.xlsx',
  clientesBauner: 'Clientes (1).xlsx',
  contasBauner: 'Contas a Receber (2).xlsx',
};

async function ler(arquivo) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FONTES + arquivo);
  const ws = wb.worksheets[0];
  const cab = [];
  ws.getRow(1).eachCell((c, n) => { cab[n] = String(c.value ?? '').trim(); });
  const linhas = [];
  ws.eachRow((r, i) => {
    if (i === 1) return;
    const o = {};
    cab.forEach((k, n) => {
      if (!k) return;
      let v = r.getCell(n).value;
      if (v && v.richText) v = v.richText.map((t) => t.text).join('');
      if (v && v.result !== undefined) v = v.result;
      if (v && v.text) v = v.text;
      o[k] = v;
    });
    if (Object.values(o).some((v) => v !== null && v !== undefined && v !== '')) linhas.push(o);
  });
  return linhas;
}

const dinheiro = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dados = {};
for (const [k, arq] of Object.entries(A)) {
  dados[k] = await ler(arq);
  console.log(`lido ${k}: ${dados[k].length} linhas`);
}

const periodo = { inicio: paraData('2026-09-01'), fim: paraData('2026-09-15') };
console.log(`\nJanela: ${iso(periodo.inicio)} a ${iso(periodo.fim)}`);
console.log('Sugestão automática a partir do Bauner:', (() => {
  const s = sugerePeriodo(dados.contasBauner, new Date('2026-09-16T12:00:00Z'));
  return `${iso(s.inicio)} a ${iso(s.fim)}`;
})());

const r = processarEtapa1({ ...dados, ...periodo });

console.log('\n=== RESULTADO ===');
console.log('Vendas lidas..............', r.resumo.vendasLidas);
console.log('Contas a receber geradas..', r.resumo.contasGeradas, dinheiro(r.resumo.valorContas));
console.log('Clientes a cadastrar......', r.resumo.clientesGerados);
console.log('Não entraram..............', r.resumo.naoEntraram);
console.log('\nPor motivo:');
for (const [m, v] of Object.entries(r.resumo.porMotivo).sort((a, b) => b[1].qtd - a[1].qtd)) {
  console.log(`  ${String(v.qtd).padStart(4)}  ${dinheiro(v.valor).padStart(14)}  ${m}`);
}
console.log('\nAvisos de cadastro:', r.resumo.avisos);

// Conferência: toda venda tem exatamente um destino.
const total = r.resumo.contasGeradas + r.resumo.naoEntraram;
console.log('\nFechamento:', total === r.resumo.vendasLidas
  ? `OK — ${total} destinos para ${r.resumo.vendasLidas} vendas`
  : `FALHOU — ${total} destinos para ${r.resumo.vendasLidas} vendas`);

// Idempotência: se os títulos gerados já estivessem no Bauner, a 2ª rodada é vazia.
const contasDepois = [
  ...dados.contasBauner,
  ...r.contasReceber.map((c) => ({ Documento: c.Documento, Status: 'Pendente', 'Dt Emissão': c.Data })),
];
const r2 = processarEtapa1({ ...dados, contasBauner: contasDepois, ...periodo });
console.log('Rodar de novo:', r2.resumo.contasGeradas === 0 && r2.resumo.clientesGerados === 0
  ? 'OK — não gera nada'
  : `FALHOU — gerou ${r2.resumo.contasGeradas} títulos e ${r2.resumo.clientesGerados} clientes`);

// === Etapa 2 ===
// Simula o que a Carla faz: importa o que a etapa 1 gerou e exporta o Bauner de novo.
const bounerAtualizado = [
  ...dados.contasBauner,
  ...r.contasReceber.map((c) => ({
    Documento: c.Documento, Status: 'Pendente', Valor: c.Valor,
    Cliente: c.Cliente, 'Dt Emissão': c.Data, 'Dt Vencimento': c.Vencimento,
  })),
];
const e2 = processarEtapa2({ vendas: dados.vendas, contasBauner: bounerAtualizado, ...periodo });
console.log('\n=== ETAPA 2 ===');
console.log('Pendentes no Bauner.......', e2.resumo.pendentesNoBauner);
console.log('Recebimentos gerados......', e2.resumo.recebidasGeradas, dinheiro(e2.resumo.valorRecebidas));
console.log('Não entraram..............', e2.resumo.naoEntraram);
for (const [m, v] of Object.entries(e2.resumo.porMotivo)) console.log(`  ${v.qtd}  ${m}`);

const liquidados = bounerAtualizado.map((c) =>
  e2.recebidas.some((x) => x.Documento === c.Documento) ? { ...c, Status: 'Liquidado' } : c);
const e2b = processarEtapa2({ vendas: dados.vendas, contasBauner: liquidados, ...periodo });
console.log('Rodar a etapa 2 de novo:', e2b.resumo.recebidasGeradas === 0
  ? 'OK — não gera nada'
  : `FALHOU — gerou ${e2b.resumo.recebidasGeradas}`);
console.log('Exemplo de recebimento:',
  JSON.stringify({ ...e2.recebidas[0], Cliente: '(nome)', Cnpj: '(cpf)' }));

// Amostra de conferência, sem expor dado pessoal.
console.log('\nExemplo de linha de conta a receber:',
  JSON.stringify({ ...r.contasReceber[0], Cliente: '(nome)', 'CNPJ/CPF': '(cpf)' }, null, 1));
console.log('Exemplo de linha de cliente:',
  JSON.stringify({ ...r.clientes[0], '* Nome/Razão Social do Cliente': '(nome)', '* CNPJ/CPF': '(cpf)', '* E-mail': '(email)', Telefone: '(fone)' }, null, 1));

// === Carga única ===
import { processarCargaUnica } from '../regras.js';
const carga = processarCargaUnica({
  clientesBase: dados.clientesBase,
  clientesPeriodo: dados.clientesPeriodo,
  clientesBauner: dados.clientesBauner,
  tamanhoLote: 500,
});
console.log('\n=== CARGA ÚNICA ===');
console.log('CPFs diferentes na base...', carga.resumo.cpfsUnicos);
console.log('Já estão no Bauner........', carga.resumo.jaCadastrados);
console.log('A cadastrar...............', carga.resumo.aCadastrar, `em ${carga.resumo.lotes} lotes`);
console.log('Não entraram..............', carga.resumo.naoEntraram);
for (const [m, v] of Object.entries(carga.resumo.porMotivo).sort((a, b) => b[1].qtd - a[1].qtd)) {
  console.log(`  ${String(v.qtd).padStart(4)}  ${m}`);
}
console.log('Avisos:', carga.resumo.avisos);
console.log('Soma dos lotes:', carga.lotes.reduce((s, l) => s + l.length, 0) === carga.resumo.aCadastrar ? 'OK' : 'FALHOU');
const cpfsLote = new Set(carga.lotes.flat().map((l) => l['* CNPJ/CPF']));
console.log('Sem repetir entre lotes:', cpfsLote.size === carga.resumo.aCadastrar ? 'OK' : 'FALHOU');
const faltando = carga.lotes.flat().filter((l) =>
  ['* Nome/Razão Social do Cliente', '* CNPJ/CPF', '* Tipo', '* E-mail', '* Endereço', '* Número', '* Bairro', '* Estado', '* Cidade', '* CEP']
    .some((c) => !String(l[c] ?? '').trim()));
console.log('Obrigatórios preenchidos:', faltando.length === 0 ? 'OK' : `FALHOU — ${faltando.length} linhas incompletas`);
