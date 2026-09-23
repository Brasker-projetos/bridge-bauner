// Roda as regras contra os relatórios reais de 01 a 15/09 e imprime o resultado.
// Uso: node testes/rodar.mjs
import ExcelJS from 'exceljs';
import { processarEtapa1, processarEtapa2, sugerePeriodo, paraData, iso } from '../regras.js';

const FONTES = 'I:/Meu Drive/Work/bridge-bauner/00-fontes/';
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

// === Proteção contra duplicidade ===
import { diagnosticarBauner } from '../regras.js';
console.log('\n=== PROTEÇÃO CONTRA DUPLICIDADE ===');
const base = processarEtapa1({ ...dados, ...periodo });
console.log('Caso real — avisos:', base.diagnostico.avisos.map((a) => `[${a.nivel}] ${a.texto.slice(0, 70)}...`));
console.log('Caso real — títulos reconhecidos pelo id_do_pedido:', base.diagnostico.porId, '| pela coluna pedido:', base.diagnostico.porPedido);
console.log('Caso real — títulos gerados:', base.resumo.contasGeradas, base.resumo.porMotivo[Object.keys(base.resumo.porMotivo).find((k) => k.startsWith('Possível'))] || '(nenhum possível duplicado)');

// 1) Bauner inteiro lançado com o número da outra coluna
const pedidoDoId = new Map(dados.vendas.map((v) => [String(v.id_do_pedido), String(v.pedido)]));
const outraColuna = dados.contasBauner.map((t) => ({ ...t, Documento: pedidoDoId.get(String(t.Documento)) || t.Documento }));
const s1 = processarEtapa1({ ...dados, contasBauner: outraColuna, ...periodo });
const reimportados1 = s1.contasReceber.filter((c) => dados.contasBauner.some((t) => String(t.Documento) === c.Documento)).length;
console.log('\n1) Bauner com números da coluna "pedido":',
  s1.diagnostico.bloqueado ? 'BLOQUEADO' : 'não bloqueou',
  `| títulos que já existiam e seriam gerados de novo: ${reimportados1}`);

// 2) Poucos títulos com número estranho (digitados à mão), mesmo cliente/valor/data
const alvo = base.contasReceber.slice(0, 5);
const estranhos = [...dados.contasBauner, ...alvo.map((c, i) => ({
  Documento: `MANUAL-${i}`, Cliente: c.Cliente, Valor: c.Valor, 'Dt Emissão': c.Data, 'Dt Vencimento': c.Vencimento, Status: 'Pendente',
}))];
const s2 = processarEtapa1({ ...dados, contasBauner: estranhos, ...periodo });
const segurados = s2.naoEntraram.filter((l) => l.Motivo.startsWith('Possível duplicado')).length;
console.log('2) 5 títulos lançados à mão com outro número:', `${segurados} vendas seguradas como possível duplicado`,
  `| títulos gerados ${base.resumo.contasGeradas} -> ${s2.resumo.contasGeradas}`);

// 3) Relatório do Bauner começando depois do início do período
const d3 = diagnosticarBauner({ vendas: dados.vendas, contasBauner: dados.contasBauner, inicio: paraData('2026-08-11') });
console.log('3) Período desde 11/08 com Bauner começando em setembro:', d3.avisos.some((a) => a.texto.includes('começa em')) ? 'AVISOU' : 'não avisou');

// 4) Relatório com Liquidados não dispara o aviso de "só pendentes"
const comLiquidado = dados.contasBauner.map((t, i) => (i === 0 ? { ...t, Status: 'Liquidado' } : t));
const d4 = diagnosticarBauner({ vendas: dados.vendas, contasBauner: comLiquidado });
console.log('4) Relatório com Liquidado:', d4.avisos.some((a) => a.texto.includes('nenhum título Liquidado')) ? 'avisou (errado)' : 'sem aviso, correto');
