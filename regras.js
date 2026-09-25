// Regras do importador Velo Vix (Angular -> Bauner).
// Funções puras: recebem linhas já lidas das planilhas (array de objetos) e
// devolvem as linhas das planilhas de importação. Sem dependência de navegador
// nem de Node, para o mesmo código rodar na tela e nos testes.

export const ENDERECO_PADRAO = {
  endereco: 'Rua Joao da Cruz',
  numero: '42',
  complemento: 'Ed Shopping dos Arcos - Lj 04',
  bairro: 'Praia do Canto',
  estado: 'ES',
  cidade: 'Vitoria',
  cep: '29055-620',
};

export const FIXOS = {
  // Categoria que o dashboard do Bauner lê (pedido da Carla em 24/09). A planilha
  // do Edival ainda usava 'Receitas de Serviços', sem o sufixo.
  categoria: 'Receitas de Serviços - Angular',
  centro: 'Único',
  gerarCobranca: 'Não',
  emitirNota: 'Sim',
  conta: 'Caixa',
  tipoPessoaFisica: 'Pessoa Física',
  tipoPessoaJuridica: 'Pessoa Jurídica',
};

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const NOMES_UF = {
  acre:'AC', alagoas:'AL', amapa:'AP', amazonas:'AM', bahia:'BA', ceara:'CE',
  'distrito federal':'DF', 'espirito santo':'ES', goias:'GO', maranhao:'MA',
  'mato grosso':'MT', 'mato grosso do sul':'MS', 'minas gerais':'MG', para:'PA',
  paraiba:'PB', parana:'PR', pernambuco:'PE', piaui:'PI', 'rio de janeiro':'RJ',
  'rio grande do norte':'RN', 'rio grande do sul':'RS', rondonia:'RO',
  roraima:'RR', 'santa catarina':'SC', 'sao paulo':'SP', sergipe:'SE', tocantins:'TO',
};

export const texto = (v) =>
  v === null || v === undefined ? '' : String(v).replace(/[\u0000-\u001f]/g, ' ').trim();

export const digitos = (v) => texto(v).replace(/\D/g, '');

const semAcento = (v) =>
  texto(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function cpfValido(cpf) {
  const d = digitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const [fim, pos] of [[9, 10], [10, 11]]) {
    let soma = 0;
    for (let i = 0; i < fim; i++) soma += Number(d[i]) * (pos - i);
    const dv = (soma * 10) % 11 % 10;
    if (dv !== Number(d[fim])) return false;
  }
  return true;
}

export const formataCpf = (cpf) =>
  digitos(cpf).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

export const formataCep = (cep) => {
  const d = digitos(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : '';
};

export function formataUf(uf) {
  const t = texto(uf).toUpperCase();
  if (UFS.includes(t)) return t;
  return NOMES_UF[semAcento(uf)] || '';
}

// O Bauner só aceita DDD + número, no formato "27 99960-7183" (celular) ou
// "27 3322-4455" (fixo). Tira o DDI (+55 ou 55) e o zero de discagem na frente.
// Um número de 11 dígitos começando com 55 não perde nada: 55 também é DDD (RS).
// O que não virar telefone válido fica vazio, porque o campo não é obrigatório.
export function formataTelefone(tel) {
  let d = digitos(tel);
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length >= 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 11) return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  return '';
}

// Se o telefone foi mexido (DDI tirado ou número descartado), conta como aviso.
const telefoneMudou = (tel) => digitos(tel) !== digitos(formataTelefone(tel));

export const numeroEndereco = (n) => {
  const d = digitos(n);
  return d || 'S/N';
};

export function paraData(v) {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const t = texto(v);
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

export const iso = (d) => (d ? d.toISOString().slice(0, 10) : '');

export const numero = (v) => {
  if (typeof v === 'number') return v;
  const t = texto(v).replace(/\s|R\$/g, '');
  if (!t) return 0;
  // 1.234,56 -> 1234.56
  const n = Number(t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

// Entre dois cadastros do mesmo CPF, vale o mais completo.
const CAMPOS_CADASTRO = ['email', 'telefone', 'rua', 'numero', 'bairro', 'cep', 'cidade', 'uf'];
function completude(c) {
  return CAMPOS_CADASTRO.reduce((n, k) => n + (texto(c[k]) ? 1 : 0), 0);
}

export function melhorCadastro(a, b) {
  if (!a) return b;
  if (!b) return a;
  const da = completude(a), db = completude(b);
  if (da !== db) return da > db ? a : b;
  const ta = paraData(a.cliente_desde), tb = paraData(b.cliente_desde);
  if (ta && tb && +ta !== +tb) return ta > tb ? a : b;
  return a;
}

// Índice de cadastros do Angular por CPF, já escolhendo o mais completo.
export function indexaClientes(...listas) {
  const idx = new Map();
  for (const lista of listas) {
    for (const c of lista || []) {
      const cpf = digitos(c.cpf);
      if (!cpf) continue;
      idx.set(cpf, melhorCadastro(idx.get(cpf), c));
    }
  }
  return idx;
}

export function indexaClientesBauner(clientes) {
  const s = new Set();
  for (const c of clientes || []) {
    for (const k of ['CPF', 'CNPJ']) {
      const d = digitos(c[k]);
      if (d) s.add(d);
    }
  }
  return s;
}

// Títulos que já existem no Bauner, por número do documento.
export function indexaTitulos(contas) {
  const m = new Map();
  for (const c of contas || []) {
    const doc = texto(c.Documento);
    if (doc) m.set(doc, c);
  }
  return m;
}

// Monta a linha de cliente no layout do modelo do Bauner.
export function montaCliente(cadastro) {
  const documento = digitos(cadastro.cpf);
  const temEndereco =
    texto(cadastro.rua) && formataCep(cadastro.cep) &&
    texto(cadastro.bairro) && texto(cadastro.cidade) && formataUf(cadastro.uf);

  const end = temEndereco
    ? {
        endereco: texto(cadastro.rua),
        numero: numeroEndereco(cadastro.numero),
        complemento: texto(cadastro.complemento),
        bairro: texto(cadastro.bairro),
        estado: formataUf(cadastro.uf),
        cidade: texto(cadastro.cidade),
        cep: formataCep(cadastro.cep),
      }
    : { ...ENDERECO_PADRAO };

  return {
    linha: {
      '* Nome/Razão Social do Cliente': texto(cadastro.nome),
      'Nome Fantasia': '',
      '* CNPJ/CPF': formataCpf(documento),
      '* Tipo': documento.length === 11 ? FIXOS.tipoPessoaFisica : FIXOS.tipoPessoaJuridica,
      '* E-mail': texto(cadastro.email),
      'Telefone': formataTelefone(cadastro.telefone),
      'Inscrição Estadual': '',
      'Inscrição Municipal': '',
      '* Endereço': end.endereco,
      '* Número': end.numero,
      'Complemento': end.complemento,
      '* Bairro': end.bairro,
      '* Estado': end.estado,
      '* Cidade': end.cidade,
      '* CEP': end.cep,
    },
    usouEnderecoPadrao: !temEndereco,
    semNumero: temEndereco && !digitos(cadastro.numero),
  };
}

export function montaContaReceber(venda, cadastro) {
  return {
    'Data': iso(paraData(venda.pago_em)),
    'DataCompetencia': iso(paraData(venda.data)),
    'Documento': texto(venda.id_do_pedido),
    'Cliente': texto(cadastro ? cadastro.nome : venda.nome),
    'CNPJ/CPF': formataCpf(venda.cpf),
    'Valor': numero(venda.valor_da_unidade),
    'Desconto_Condicional': '',
    'Desconto_Incondicional': '',
    'Deducao_BC_Impostos': '',
    'Vencimento': iso(paraData(venda.data)),
    'Categoria': FIXOS.categoria,
    'CentroCustos': FIXOS.centro,
    'GerarCobranca': FIXOS.gerarCobranca,
    'EmitirNotaFiscalServico': FIXOS.emitirNota,
  };
}

const MOTIVOS = {
  foraPeriodo: 'Fora do período escolhido',
  naoPago: 'Venda não está como Paga no Angular',
  cancelada: 'Venda cancelada no Angular',
  estornada: 'Venda estornada no Angular',
  jaExiste: 'Já existe no Bauner',
  canceladoBauner: 'Título está Cancelado no Bauner — conferir antes',
  valorZero: 'Valor zero — não gera nota',
  valorInvalido: 'Valor inválido ou negativo',
  semCpf: 'Sem CPF — enviar para a Débora',
  cpfInvalido: 'CPF inválido — enviar para a Débora',
  cnpj: 'Documento é CNPJ (pessoa jurídica) — conferir',
  semCadastro: 'Cliente não está nos arquivos de clientes do Angular',
  semEmail: 'Cadastro sem e-mail — o Bauner não aceita',
  semNome: 'Cadastro sem nome — o Bauner não aceita',
  jaExisteOutraColuna: 'Já existe no Bauner com o número da coluna "pedido" — não importar de novo',
  possivelDuplicado: 'Possível duplicado — o Bauner já tem título deste cliente, com o mesmo valor e data, mas com outro número',
  semTitulo: 'Título não está no Bauner — importe as contas a receber antes',
  naoPendente: 'Título não está Pendente no Bauner',
  valorDiferente: 'Valor do Bauner diferente do valor da venda — conferir',
};

// Comprador que não aparece em nenhum arquivo de clientes: monta o cadastro
// com o que vem na própria venda, e o endereço fica sendo o da empresa.
export function cadastroDaVenda(venda) {
  return {
    nome: texto(venda.nome),
    cpf: digitos(venda.cpf),
    email: texto(venda.email),
    telefone: texto(venda.mobile),
    rua: '', numero: '', complemento: '', bairro: '', cep: '', cidade: '', uf: '',
    origem: 'venda',
  };
}

const chaveTitulo = (nome, valor, data) =>
  `${semAcento(nome).replace(/\s+/g, ' ')}|${Number(valor).toFixed(2)}|${data}`;

/**
 * Títulos do Bauner cujo número não corresponde a nenhum pedido do Angular.
 * Se um deles tiver o mesmo cliente, valor e data de uma venda, é a mesma
 * venda lançada com outro número: importar de novo duplicaria, e o Bauner não
 * barra, porque o número é diferente.
 */
function titulosSemPedido(vendas, contasBauner) {
  const numeros = new Set();
  for (const v of vendas) {
    for (const k of ['id_do_pedido', 'pedido']) if (texto(v[k])) numeros.add(texto(v[k]));
  }
  const suspeitos = new Map(); // chave -> títulos (cada título pode ter duas datas)
  contasBauner.forEach((t, i) => {
    if (numeros.has(texto(t.Documento))) return;
    if (texto(t.Status).toLowerCase() === 'cancelado') return;
    const valor = numero(t.Valor);
    if (!valor) return;
    const datas = new Set(['Dt Emissão', 'Dt Vencimento'].map((c) => iso(paraData(t[c]))).filter(Boolean));
    for (const d of datas) {
      const k = chaveTitulo(t.Cliente, valor, d);
      if (!suspeitos.has(k)) suspeitos.set(k, []);
      suspeitos.get(k).push(i);
    }
  });
  return suspeitos;
}

const dataBr = (d) => iso(d).split('-').reverse().join('/');

/**
 * Confere se o relatório do Bauner serve para comparar sem risco de duplicar.
 * "bloqueio" impede gerar; "atencao" só avisa.
 */
export function diagnosticarBauner({ vendas = [], contasBauner = [], inicio = null } = {}) {
  const avisos = [];
  const ids = new Set(vendas.map((v) => texto(v.id_do_pedido)).filter(Boolean));
  const pedidos = new Set(vendas.map((v) => texto(v.pedido)).filter(Boolean));
  let porId = 0, porPedido = 0, menor = null;
  const status = {};

  for (const t of contasBauner) {
    const doc = texto(t.Documento);
    if (ids.has(doc)) porId++;
    else if (pedidos.has(doc)) porPedido++;
    const s = texto(t.Status) || '(sem status)';
    status[s] = (status[s] || 0) + 1;
    const d = paraData(t['Dt Emissão']);
    if (d && (!menor || d < menor)) menor = d;
  }

  if (porPedido > 0 && porPedido >= porId) {
    avisos.push({
      nivel: 'bloqueio',
      texto: `No relatório do Bauner, ${porPedido} títulos usam o número da coluna "pedido" do Angular e só ${porId} usam o "id_do_pedido". O sistema gera pelo "id_do_pedido", então o mesmo pedido entraria duas vezes com números diferentes. Chame a Tecnologia antes de importar.`,
    });
  } else if (porPedido > 0) {
    avisos.push({
      nivel: 'atencao',
      texto: `${porPedido} títulos do Bauner usam o número da coluna "pedido" do Angular. Esses pedidos foram deixados de fora para não duplicar.`,
    });
  }

  const temLiquidado = Object.keys(status).some((s) => s.toLowerCase() === 'liquidado');
  if (contasBauner.length && !temLiquidado) {
    avisos.push({
      nivel: 'atencao',
      texto: 'O relatório do Bauner não tem nenhum título Liquidado. Se ele foi exportado só com os Pendentes, os títulos já baixados parecem não existir e seriam gerados de novo. Se o período ainda não teve nenhuma baixa, pode seguir.',
    });
  }

  if (inicio && menor && menor > inicio) {
    avisos.push({
      nivel: 'atencao',
      texto: `O relatório do Bauner começa em ${dataBr(menor)}, depois do início do período (${dataBr(inicio)}). Um título desses primeiros dias que já esteja no Bauner não aparece para comparar. Exporte o Bauner a partir de uma data anterior, ou confirme que esses dias nunca foram importados.`,
    });
  }

  return { avisos, porId, porPedido, status, bloqueado: avisos.some((a) => a.nivel === 'bloqueio') };
}

/**
 * Etapa 1: gera as linhas de clientes e de contas a receber.
 * Entradas: linhas já lidas dos relatórios.
 */
export function processarEtapa1({
  vendas = [],
  clientesPeriodo = [],
  clientesBase = [],
  clientesBauner = [],
  contasBauner = [],
  inicio = null,
  fim = null,
} = {}) {
  const cadastros = indexaClientes(clientesPeriodo, clientesBase);
  const noBauner = indexaClientesBauner(clientesBauner);
  const titulos = indexaTitulos(contasBauner);
  const suspeitos = titulosSemPedido(vendas, contasBauner);
  const suspeitosUsados = new Set();
  const diagnostico = diagnosticarBauner({ vendas, contasBauner, inicio });

  const naoEntraram = [];
  const contasReceber = [];
  const cpfsParaCadastrar = new Map(); // cpf -> cadastro
  const avisos = { enderecoPadrao: 0, semNumero: 0, telefoneCorrigido: 0, cadastroPelaVenda: 0 };

  const fora = (venda, motivo, extra = {}) =>
    naoEntraram.push({
      Tipo: 'Venda',
      Documento: texto(venda.id_do_pedido),
      Cliente: texto(venda.nome),
      CPF: texto(venda.cpf),
      Data: iso(paraData(venda.pago_em)) || iso(paraData(venda.data)),
      Valor: numero(venda.valor_da_unidade) || 0,
      Motivo: motivo,
      ...extra,
    });

  for (const venda of vendas) {
    const pago = paraData(venda.pago_em);
    if (inicio && (!pago || pago < inicio)) { fora(venda, MOTIVOS.foraPeriodo); continue; }
    if (fim && (!pago || pago > fim)) { fora(venda, MOTIVOS.foraPeriodo); continue; }
    if (texto(venda.status).toLowerCase() !== 'pago') { fora(venda, MOTIVOS.naoPago); continue; }
    if (texto(venda.cancelado_em)) { fora(venda, MOTIVOS.cancelada); continue; }
    if (numero(venda.valor_estornado) > 0) { fora(venda, MOTIVOS.estornada); continue; }

    const doc = texto(venda.id_do_pedido);
    const titulo = titulos.get(doc);
    if (titulo) {
      const status = texto(titulo.Status).toLowerCase();
      fora(venda, status === 'cancelado' ? MOTIVOS.canceladoBauner : MOTIVOS.jaExiste);
      continue;
    }
    if (texto(venda.pedido) && titulos.has(texto(venda.pedido))) {
      fora(venda, MOTIVOS.jaExisteOutraColuna);
      continue;
    }

    const valor = numero(venda.valor_da_unidade);
    if (!Number.isFinite(valor) || valor < 0) { fora(venda, MOTIVOS.valorInvalido); continue; }
    if (valor === 0) { fora(venda, MOTIVOS.valorZero); continue; }

    // Mesmo cliente, valor e data de um título do Bauner com número estranho:
    // segura a venda, e cada título suspeito só "explica" uma venda.
    const chaves = [...new Set([iso(pago), iso(paraData(venda.data))].filter(Boolean))]
      .map((d) => chaveTitulo(venda.nome, valor, d));
    const suspeito = chaves
      .flatMap((k) => suspeitos.get(k) || [])
      .find((i) => !suspeitosUsados.has(i));
    if (suspeito !== undefined) {
      suspeitosUsados.add(suspeito);
      fora(venda, MOTIVOS.possivelDuplicado);
      continue;
    }

    const cpf = digitos(venda.cpf);
    if (!cpf) { fora(venda, MOTIVOS.semCpf); continue; }
    if (cpf.length === 14) { fora(venda, MOTIVOS.cnpj); continue; }
    if (!cpfValido(cpf)) { fora(venda, MOTIVOS.cpfInvalido); continue; }

    const achado = cadastros.get(cpf);
    const cadastro = achado && texto(achado.nome) ? achado : cadastroDaVenda(venda);
    const precisaCadastrar = !noBauner.has(cpf);
    if (precisaCadastrar) {
      if (!texto(cadastro.nome)) { fora(venda, MOTIVOS.semNome); continue; }
      if (!texto(cadastro.email)) { fora(venda, MOTIVOS.semEmail); continue; }
      if (!cpfsParaCadastrar.has(cpf)) cpfsParaCadastrar.set(cpf, cadastro);
    }

    contasReceber.push(montaContaReceber(venda, cadastro));
  }

  const clientes = [];
  for (const cadastro of cpfsParaCadastrar.values()) {
    const { linha, usouEnderecoPadrao, semNumero } = montaCliente(cadastro);
    if (usouEnderecoPadrao) avisos.enderecoPadrao++;
    if (semNumero) avisos.semNumero++;
    if (telefoneMudou(cadastro.telefone)) avisos.telefoneCorrigido++;
    if (cadastro.origem === 'venda') avisos.cadastroPelaVenda++;
    clientes.push(linha);
  }

  const somaMotivos = {};
  for (const l of naoEntraram) {
    somaMotivos[l.Motivo] = somaMotivos[l.Motivo] || { qtd: 0, valor: 0 };
    somaMotivos[l.Motivo].qtd++;
    somaMotivos[l.Motivo].valor += l.Valor || 0;
  }

  return {
    clientes,
    contasReceber,
    naoEntraram,
    diagnostico,
    resumo: {
      vendasLidas: vendas.length,
      contasGeradas: contasReceber.length,
      valorContas: contasReceber.reduce((s, c) => s + c.Valor, 0),
      clientesGerados: clientes.length,
      naoEntraram: naoEntraram.length,
      porMotivo: somaMotivos,
      avisos,
    },
  };
}

/**
 * Etapa 2: gera as contas recebidas (a baixa que faz o Bauner emitir a nota).
 * Só entra título que já está no Bauner como Pendente e está pago no Angular.
 */
export function processarEtapa2({
  vendas = [],
  contasBauner = [],
  inicio = null,
  fim = null,
} = {}) {
  const titulos = indexaTitulos(contasBauner);
  const recebidas = [];
  const naoEntraram = [];
  const vistos = new Set();

  const fora = (venda, motivo) =>
    naoEntraram.push({
      Tipo: 'Recebimento',
      Documento: texto(venda.id_do_pedido),
      Cliente: texto(venda.nome),
      CPF: texto(venda.cpf),
      Data: iso(paraData(venda.pago_em)),
      Valor: numero(venda.valor_da_unidade) || 0,
      Motivo: motivo,
    });

  for (const venda of vendas) {
    const pago = paraData(venda.pago_em);
    if (inicio && (!pago || pago < inicio)) continue;
    if (fim && (!pago || pago > fim)) continue;
    if (texto(venda.status).toLowerCase() !== 'pago') continue;
    if (texto(venda.cancelado_em)) { fora(venda, MOTIVOS.cancelada); continue; }
    if (numero(venda.valor_estornado) > 0) { fora(venda, MOTIVOS.estornada); continue; }

    const valorVenda = numero(venda.valor_da_unidade);
    if (!valorVenda) continue; // valor zero já foi explicado na etapa 1

    const doc = texto(venda.id_do_pedido);
    if (vistos.has(doc)) continue;
    const titulo = titulos.get(doc);
    if (!titulo) { fora(venda, MOTIVOS.semTitulo); continue; }

    const status = texto(titulo.Status).toLowerCase();
    if (status !== 'pendente') { fora(venda, status === 'liquidado' ? MOTIVOS.jaExiste : MOTIVOS.naoPendente); continue; }

    // O valor da baixa é o valor do título. Se divergir da venda, não baixa.
    const valorTitulo = numero(titulo.Valor);
    if (Math.abs(valorTitulo - valorVenda) > 0.005) { fora(venda, MOTIVOS.valorDiferente); continue; }

    vistos.add(doc);
    recebidas.push({
      'Documento': doc,
      'Cliente': texto(titulo.Cliente) || texto(venda.nome),
      'Cnpj': formataCpf(venda.cpf),
      'ValorOriginal': valorTitulo,
      'ValorRecebido': valorTitulo,
      'ValorDesconto': '',
      'ValorJuros': '',
      'ValorMulta': '',
      'ValorOutros': '',
      'DataVencimento': iso(paraData(titulo['Dt Vencimento']) || pago),
      'DataRecebimento': iso(pago),
      'ContaBancaria': FIXOS.conta,
      'Categoria': FIXOS.categoria,
      'CentroCustos': FIXOS.centro,
    });
  }

  const porMotivo = {};
  for (const l of naoEntraram) {
    porMotivo[l.Motivo] = porMotivo[l.Motivo] || { qtd: 0, valor: 0 };
    porMotivo[l.Motivo].qtd++;
    porMotivo[l.Motivo].valor += l.Valor || 0;
  }

  return {
    recebidas,
    naoEntraram,
    resumo: {
      recebidasGeradas: recebidas.length,
      valorRecebidas: recebidas.reduce((s, r) => s + r.ValorRecebido, 0),
      naoEntraram: naoEntraram.length,
      porMotivo,
      pendentesNoBauner: contasBauner.filter((c) => texto(c.Status).toLowerCase() === 'pendente').length,
    },
  };
}

/**
 * Carga única: pega todo mundo que está na base do Angular e ainda não está no
 * Bauner, e divide em lotes, porque o Bauner não aguenta tudo de uma vez.
 */
export function processarCargaUnica({
  clientesBase = [],
  clientesPeriodo = [],
  clientesBauner = [],
  tamanhoLote = 500,
} = {}) {
  const cadastros = indexaClientes(clientesBase, clientesPeriodo);
  const noBauner = indexaClientesBauner(clientesBauner);

  const linhas = [];
  const naoEntraram = [];
  const avisos = { enderecoPadrao: 0, semNumero: 0, telefoneCorrigido: 0 };
  let jaCadastrados = 0;

  const fora = (c, motivo) =>
    naoEntraram.push({
      Tipo: 'Cliente',
      Cliente: texto(c.nome),
      CPF: texto(c.cpf),
      Email: texto(c.email),
      Motivo: motivo,
    });

  // Cadastro sem CPF nenhum não chega no índice, então conta à parte.
  for (const c of [...clientesBase, ...clientesPeriodo]) {
    if (!digitos(c.cpf)) fora(c, MOTIVOS.semCpf);
  }

  for (const [cpf, cadastro] of cadastros) {
    if (noBauner.has(cpf)) { jaCadastrados++; continue; }
    if (cpf.length === 14) { fora(cadastro, MOTIVOS.cnpj); continue; }
    if (!cpfValido(cpf)) { fora(cadastro, MOTIVOS.cpfInvalido); continue; }
    if (!texto(cadastro.nome)) { fora(cadastro, MOTIVOS.semNome); continue; }
    if (!texto(cadastro.email)) { fora(cadastro, MOTIVOS.semEmail); continue; }

    const { linha, usouEnderecoPadrao, semNumero } = montaCliente(cadastro);
    if (usouEnderecoPadrao) avisos.enderecoPadrao++;
    if (semNumero) avisos.semNumero++;
    if (telefoneMudou(cadastro.telefone)) avisos.telefoneCorrigido++;
    linhas.push(linha);
  }

  const lotes = [];
  const tamanho = Math.max(1, Number(tamanhoLote) || 500);
  for (let i = 0; i < linhas.length; i += tamanho) lotes.push(linhas.slice(i, i + tamanho));

  const porMotivo = {};
  for (const l of naoEntraram) {
    porMotivo[l.Motivo] = porMotivo[l.Motivo] || { qtd: 0, valor: 0 };
    porMotivo[l.Motivo].qtd++;
  }

  return {
    lotes,
    naoEntraram,
    resumo: {
      cadastrosLidos: clientesBase.length + clientesPeriodo.length,
      cpfsUnicos: cadastros.size,
      jaCadastrados,
      aCadastrar: linhas.length,
      lotes: lotes.length,
      tamanhoLote: tamanho,
      naoEntraram: naoEntraram.length,
      porMotivo,
      avisos,
    },
  };
}

// Sugere a janela: do dia seguinte à última emissão no Bauner até ontem.
export function sugerePeriodo(contasBauner = [], hoje = new Date()) {
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 1));
  let ultima = null;
  for (const c of contasBauner) {
    const d = paraData(c['Dt Emissão']) || paraData(c['Dt Vencimento']);
    if (d && (!ultima || d > ultima)) ultima = d;
  }
  const inicio = ultima
    ? new Date(Date.UTC(ultima.getUTCFullYear(), ultima.getUTCMonth(), ultima.getUTCDate() + 1))
    : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate() - 35));
  return { inicio: inicio > fim ? fim : inicio, fim };
}

export const MOTIVOS_IMPORTACAO = MOTIVOS;
