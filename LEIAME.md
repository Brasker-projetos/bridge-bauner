# Bridge Bauner (Angular → Bauner)

Página que recebe os relatórios do Angular e do Bauner, compara, trata os dados e
gera as planilhas de importação do Bauner. Tudo roda no navegador: nenhum arquivo
é enviado para servidor.

## Rodar

```
npx http-server . -p 4173 -c-1
```

## Arquivos

- `index.html`, `estilo.css`, `app.js` — a tela.
- `regras.js` — as regras (comparação, tratamento e montagem das planilhas). Sem
  dependência de navegador, para rodar igual nos testes.
- `testes/rodar.mjs` — roda as regras contra os relatórios reais e confere os números.
- `vendor/xlsx.full.min.js` — biblioteca de planilha, embutida para funcionar offline.
- `_amostra-local/` — cópias dos relatórios para teste. **Fora do git: tem dado pessoal.**

## O que a tela faz

1. Etapa 1: gera `Importar Clientes`, `Importar Contas a Receber` e `Não entraram`.
2. Etapa 2: com o relatório do Bauner exportado depois da importação, gera
   `Importar Contas Recebidas`. O botão só libera depois da confirmação, porque a
   baixa é o que dispara a nota fiscal.
3. Carga única: divide em lotes os clientes antigos que ainda não estão no Bauner.

A documentação do processo está em `I:\Meu Drive\Work\bridge-bauner`.
