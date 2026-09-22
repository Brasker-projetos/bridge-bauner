// Tela do importador: lê os arquivos com a biblioteca XLSX (no navegador),
// chama as regras e monta as planilhas de saída.
import { processarEtapa1, processarEtapa2, processarCargaUnica, sugerePeriodo, paraData, iso } from './regras.js';

const CAMPOS = {
  vendas: { obrigatorio: true, colunas: ['id_do_pedido', 'pago_em', 'valor_da_unidade'] },
  clientesPeriodo: { obrigatorio: true, colunas: ['nome', 'cpf', 'email'] },
  clientesBauner: { obrigatorio: true, colunas: ['Razão Social', 'CPF'] },
  contasBauner: { obrigatorio: true, colunas: ['Documento', 'Status'] },
  clientesBase: { obrigatorio: false, colunas: ['nome', 'cpf', 'email'] },
  contasBaunerNovo: { obrigatorio: false, colunas: ['Documento', 'Status'] },
};

const dados = {};
const $ = (s) => document.querySelector(s);
// Marca a etapa atual e deixa as anteriores como concluídas.
const passo = (n) => document.querySelectorAll('.etapas li').forEach((li, i) => {
  li.classList.toggle('ativo', i === n - 1);
  li.classList.toggle('feito', i < n - 1);
});

const dinheiro = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function lerPlanilha(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('não consegui abrir o arquivo'));
    leitor.onload = () => {
      try {
        const wb = XLSX.read(leitor.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }));
      } catch (e) {
        reject(new Error('arquivo não parece uma planilha'));
      }
    };
    leitor.readAsArrayBuffer(arquivo);
  });
}

function conferirColunas(campo, linhas) {
  const faltando = CAMPOS[campo].colunas.filter(
    (c) => !linhas.length || !Object.keys(linhas[0]).some((k) => k.trim() === c)
  );
  if (faltando.length) throw new Error(`faltam as colunas: ${faltando.join(', ')}`);
}

async function receber(caixa, arquivo) {
  const campo = caixa.dataset.campo;
  const estado = caixa.querySelector('.estado');
  caixa.classList.remove('pronto', 'erro');
  estado.textContent = 'lendo...';
  try {
    const linhas = await lerPlanilha(arquivo);
    conferirColunas(campo, linhas);
    dados[campo] = linhas;
    caixa.classList.add('pronto');
    estado.textContent = `${arquivo.name} — ${linhas.length} linhas`;
  } catch (e) {
    delete dados[campo];
    caixa.classList.add('erro');
    estado.textContent = e.message;
  }
  if (campo === 'contasBauner' && dados.contasBauner) sugerir();
  atualizarBotao();
  $('#gerar2').disabled = !dados.contasBaunerNovo || !dados.vendas;
  $('#gerarCarga').disabled = !dados.clientesBase || !dados.clientesBauner;
}

function sugerir() {
  const { inicio, fim } = sugerePeriodo(dados.contasBauner, new Date());
  if (!$('#inicio').value) $('#inicio').value = iso(inicio);
  if (!$('#fim').value) $('#fim').value = iso(fim);
  $('#dicaPeriodo').textContent = 'sugerido pelo relatório do Bauner — pode mudar';
}

function atualizarBotao() {
  const prontos = Object.entries(CAMPOS)
    .filter(([, c]) => c.obrigatorio)
    .every(([campo]) => dados[campo]);
  $('#gerar').disabled = !prontos;
}

function cartao(rotulo, valor, extra = '') {
  return `<div class="cartao"><div class="rotulo">${rotulo}</div>
    <div class="valor">${valor}</div>${extra ? `<div class="extra">${extra}</div>` : ''}</div>`;
}

let saidas = {};

function mostrar(r) {
  const av = r.resumo.avisos;
  $('#cartoes').innerHTML = [
    cartao('vendas lidas', r.resumo.vendasLidas),
    cartao('contas a receber', r.resumo.contasGeradas, dinheiro(r.resumo.valorContas)),
    cartao('clientes a cadastrar', r.resumo.clientesGerados,
      `${av.enderecoPadrao} com endereço da empresa`),
    cartao('não entraram', r.resumo.naoEntraram),
  ].join('');

  const linhas = Object.entries(r.resumo.porMotivo).sort((a, b) => b[1].qtd - a[1].qtd);
  $('#motivos').innerHTML = linhas.length
    ? `<tr><th>Motivo</th><th class="num">Vendas</th><th class="num">Valor</th></tr>` +
      linhas.map(([m, v]) => `<tr><td>${m}</td><td class="num">${v.qtd}</td><td class="num">${dinheiro(v.valor)}</td></tr>`).join('')
    : '';

  const total = r.resumo.contasGeradas + r.resumo.naoEntraram;
  const ok = total === r.resumo.vendasLidas;
  $('#fechamento').className = `fechamento ${ok ? 'ok' : 'falhou'}`;
  $('#fechamento').textContent = ok
    ? `Fechou: as ${total} vendas do arquivo estão todas explicadas.`
    : `Atenção: ${total} destinos para ${r.resumo.vendasLidas} vendas.`;

  const periodo = `${$('#inicio').value} a ${$('#fim').value}`;
  saidas = {
    'Importar Clientes': { linhas: r.clientes, aba: 'Clientes' },
    'Importar Contas a Receber': { linhas: r.contasReceber, aba: 'Importar Contas a Receber' },
    'Não entraram': { linhas: r.naoEntraram, aba: 'Não entraram' },
  };
  $('#baixar').innerHTML = Object.entries(saidas)
    .map(([nome, s], i) =>
      `<button data-nome="${nome}" ${i === 2 ? 'class="secundario"' : ''} ${s.linhas.length ? '' : 'disabled'}>
        Baixar ${nome} (${s.linhas.length})</button>`)
    .join('');
  $('#baixar').querySelectorAll('button').forEach((b) => {
    b.onclick = () => baixar(b.dataset.nome, periodo);
  });
  $('#resultado').hidden = false;
  $('#etapa2').hidden = false;
  passo(2);
  $('#resultado').scrollIntoView({ behavior: 'smooth' });
}

function mostrar2(r) {
  $('#cartoes2').innerHTML = [
    cartao('pendentes no Bauner', r.resumo.pendentesNoBauner),
    cartao('vão ser baixados', r.resumo.recebidasGeradas, dinheiro(r.resumo.valorRecebidas)),
    cartao('não entraram', r.resumo.naoEntraram),
  ].join('');

  const linhas = Object.entries(r.resumo.porMotivo).sort((a, b) => b[1].qtd - a[1].qtd);
  $('#motivos2').innerHTML = linhas.length
    ? `<tr><th>Motivo</th><th class="num">Vendas</th><th class="num">Valor</th></tr>` +
      linhas.map(([m, v]) => `<tr><td>${m}</td><td class="num">${v.qtd}</td><td class="num">${dinheiro(v.valor)}</td></tr>`).join('')
    : '';

  const periodo = `${$('#inicio').value} a ${$('#fim').value}`;
  saidas['Importar Contas Recebidas'] = { linhas: r.recebidas, aba: 'Folha 1' };
  if (r.naoEntraram.length) saidas['Não entraram na baixa'] = { linhas: r.naoEntraram, aba: 'Não entraram' };

  const botoes = ['Importar Contas Recebidas', ...(r.naoEntraram.length ? ['Não entraram na baixa'] : [])];
  $('#baixar2').innerHTML = botoes
    .map((nome, i) => `<button data-nome="${nome}" ${i ? 'class="secundario"' : ''} disabled>
      Baixar ${nome} (${saidas[nome].linhas.length})</button>`)
    .join('');

  const liberar = () => {
    const ok = $('#confirmo').checked;
    $('#baixar2').querySelectorAll('button').forEach((b, i) => {
      b.disabled = i === 0 ? !ok || !r.recebidas.length : false;
    });
  };
  $('#confirmo').checked = false;
  $('#confirmo').onchange = liberar;
  liberar();
  $('#baixar2').querySelectorAll('button').forEach((b) => {
    b.onclick = () => baixar(b.dataset.nome, periodo);
  });
  $('#resultado2').hidden = false;
  passo(3);
}

function baixar(nome, periodo) {
  const { linhas, aba } = saidas[nome];
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, aba);
  XLSX.writeFile(wb, `${nome} ${periodo}.xlsx`);
}

document.querySelectorAll('.arquivo').forEach((caixa) => {
  const input = caixa.querySelector('input');
  input.onchange = () => input.files[0] && receber(caixa, input.files[0]);
  caixa.ondragover = (e) => { e.preventDefault(); caixa.classList.add('sobre'); };
  caixa.ondragleave = () => caixa.classList.remove('sobre');
  caixa.ondrop = (e) => {
    e.preventDefault();
    caixa.classList.remove('sobre');
    if (e.dataTransfer.files[0]) receber(caixa, e.dataTransfer.files[0]);
  };
});

$('#gerar').onclick = () => {
  const inicio = paraData($('#inicio').value);
  const fim = paraData($('#fim').value);
  const aviso = $('#aviso');
  aviso.textContent = '';
  if (!inicio || !fim || inicio > fim) {
    aviso.textContent = 'Confira o período: o início precisa ser anterior ao fim.';
    return;
  }
  const hoje = iso(new Date());
  if (iso(fim) >= hoje) {
    aviso.textContent = 'O fim precisa ser no máximo ontem: venda de hoje ainda pode mudar.';
    return;
  }
  try {
    mostrar(processarEtapa1({ ...dados, inicio, fim }));
  } catch (e) {
    aviso.textContent = `Não consegui processar: ${e.message}`;
  }
};

$('#gerarCarga').onclick = () => {
  const aviso = $('#avisoCarga');
  aviso.textContent = '';
  let r;
  try {
    r = processarCargaUnica({
      clientesBase: dados.clientesBase,
      clientesPeriodo: dados.clientesPeriodo,
      clientesBauner: dados.clientesBauner,
      tamanhoLote: Number($('#lote').value),
    });
  } catch (e) {
    aviso.textContent = `Não consegui processar: ${e.message}`;
    return;
  }

  const av = r.resumo.avisos;
  $('#cartoesCarga').innerHTML = [
    cartao('cadastros na base', r.resumo.cpfsUnicos, 'CPFs diferentes'),
    cartao('já estão no Bauner', r.resumo.jaCadastrados),
    cartao('a cadastrar', r.resumo.aCadastrar, `${av.enderecoPadrao} com endereço da empresa`),
    cartao('lotes', r.resumo.lotes, `de ${r.resumo.tamanhoLote} cada`),
  ].join('');

  const linhas = Object.entries(r.resumo.porMotivo).sort((a, b) => b[1].qtd - a[1].qtd);
  $('#motivosCarga').innerHTML = linhas.length
    ? `<tr><th>Motivo</th><th class="num">Cadastros</th></tr>` +
      linhas.map(([m, v]) => `<tr><td>${m}</td><td class="num">${v.qtd}</td></tr>`).join('')
    : '';

  saidas['Clientes atrasados — não entraram'] = { linhas: r.naoEntraram, aba: 'Não entraram' };
  r.lotes.forEach((lote, i) => {
    saidas[`Carga clientes lote ${i + 1} de ${r.lotes.length}`] = { linhas: lote, aba: 'Clientes' };
  });

  $('#baixarCarga').className = 'baixar lotes';
  $('#baixarCarga').innerHTML =
    r.lotes.map((lote, i) =>
      `<button data-nome="Carga clientes lote ${i + 1} de ${r.lotes.length}">Lote ${i + 1} (${lote.length})</button>`).join('') +
    (r.naoEntraram.length
      ? `<button data-nome="Clientes atrasados — não entraram">Não entraram (${r.naoEntraram.length})</button>`
      : '');
  $('#baixarCarga').querySelectorAll('button').forEach((b) => {
    b.onclick = () => { baixar(b.dataset.nome, 'carga'); b.classList.add('usado'); };
  });
  $('#resultadoCarga').hidden = false;
  passo(4);
};

$('#gerar2').onclick = () => {
  const inicio = paraData($('#inicio').value);
  const fim = paraData($('#fim').value);
  const aviso = $('#aviso2');
  aviso.textContent = '';
  try {
    const r = processarEtapa2({
      vendas: dados.vendas,
      contasBauner: dados.contasBaunerNovo,
      inicio, fim,
    });
    if (!r.recebidas.length) {
      aviso.textContent = 'Nada para baixar: nenhum título do período está Pendente neste relatório. Confira se exportou o relatório depois de importar as contas a receber.';
    }
    mostrar2(r);
  } catch (e) {
    aviso.textContent = `Não consegui processar: ${e.message}`;
  }
};
