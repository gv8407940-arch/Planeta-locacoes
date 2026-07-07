# Planeta Locacoes - pacote para analise

Este pacote contem os arquivos principais do sistema Planeta Locacoes para revisao por outra IA.

## Arquivos principais

- `index.html`: estrutura da aplicacao e telas.
- `style.css`: visual e responsividade.
- `app.js`: regras da interface, locacoes, estoque, relatorios, contratos e PWA.
- `db.js`: banco local no navegador, usando IndexedDB.
- `manifest.json`: configuracao PWA.
- `service-worker.js`: cache offline/PWA.
- `contrato_aluguel_planeta_locacoes_template.html`: modelo visual do contrato.
- `icon-180.png`, `icon-192.png` e `icon-512.png`: icones do app.
- `servidor-local.js`: servidor local apenas para teste no computador.

## Observacao importante

O sistema nao usa servidor nem banco externo para guardar clientes, estoque, locacoes ou gastos. Esses dados ficam no navegador do aparelho, via IndexedDB. Portanto, os dados reais do usuario nao devem ser enviados ao GitHub nem incluidos neste pacote.

Para uso independente no iPhone, a pasta deve ser publicada em uma hospedagem estatica HTTPS gratuita, como GitHub Pages, Cloudflare Pages ou Netlify.
