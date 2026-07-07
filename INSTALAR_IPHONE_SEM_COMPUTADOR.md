# Planeta Locacoes no iPhone sem computador

Este sistema nao precisa de servidor nem banco de dados externo para guardar as informacoes. Depois de aberto no iPhone, os dados ficam salvos no proprio navegador/app instalado, usando IndexedDB.

O computador pode continuar sendo usado para desenvolvimento e teste, mas nao deve ser o servidor do uso diario no iPhone.

## Caminho recomendado

Use uma hospedagem estatica gratuita com HTTPS, como GitHub Pages, Cloudflare Pages ou Netlify. Essas opcoes servem apenas os arquivos do sistema; elas nao guardam seus clientes, estoque, locacoes ou gastos.

No iPhone:

1. Abra o link HTTPS publicado pelo Safari.
2. Toque em Compartilhar.
3. Escolha Adicionar a Tela de Inicio.
4. Abra pelo icone Planeta Locacoes.

Depois da primeira abertura, o service worker guarda os arquivos principais para o app abrir offline quando possivel.

## Publicando pelo GitHub Pages

1. Crie uma conta gratuita no GitHub.
2. Crie um repositorio chamado `planeta-locacoes`.
3. Envie todos os arquivos desta pasta para o repositorio, incluindo `index.html`, `app.js`, `db.js`, `style.css`, `manifest.json`, `service-worker.js`, `contrato_aluguel_planeta_locacoes_template.html` e a pasta `icons`.
4. No GitHub, entre em Settings > Pages.
5. Em Source, escolha Deploy from a branch.
6. Escolha a branch `main` e a pasta `/root`.
7. Abra no iPhone um endereco parecido com:

```text
https://SEU-USUARIO.github.io/planeta-locacoes/index.html?v=22
```

## Levando dados do computador para o iPhone

Se voce ja cadastrou dados no computador:

1. No computador, abra a aba Backup.
2. Exporte o backup.
3. No iPhone, abra o app instalado.
4. Entre na aba Backup.
5. Importe o arquivo de backup.

Depois disso, os novos cadastros feitos no iPhone ficam no proprio iPhone.

## Teste offline no iPhone

1. Com internet, abra o link HTTPS publicado no Safari.
2. Aguarde a tela carregar completamente.
3. Toque em Compartilhar e escolha Adicionar a Tela de Inicio.
4. Feche o Safari e abra o sistema pelo icone Planeta Locacoes.
5. Feche o app.
6. Ative o modo aviao.
7. Abra novamente pelo icone Planeta Locacoes.
8. Cadastre um item ou cliente de teste.
9. Feche e abra novamente ainda em modo aviao.
10. Confirme se o cadastro de teste continua aparecendo.

Se esse teste passar, o app esta abrindo offline e salvando dados no proprio iPhone.

## Atualizando o sistema sem perder dados

Quando alterar arquivos do app, publique os arquivos novos no GitHub Pages ou na hospedagem escolhida.

Altere a versao do cache quando mudar qualquer arquivo essencial, como:

- `index.html`
- `app.js`
- `db.js`
- `style.css`
- `manifest.json`
- `service-worker.js`
- `contrato_aluguel_planeta_locacoes_template.html`
- arquivos da pasta `icons`

Exemplo:

```text
planeta-locacoes-v22
```

Depois de publicar a nova versao:

1. Abra o app no iPhone com internet.
2. Espere carregar.
3. Feche o app.
4. Abra de novo.

Atualizar os arquivos do sistema nao apaga os dados locais do iPhone. Os dados ficam no IndexedDB. Mesmo assim, faca backup manual antes de grandes mudancas.

## Observacoes importantes

- `127.0.0.1` no iPhone significa o proprio iPhone, nao o computador.
- O endereco de rede local do computador, como `http://192.168.x.x:8765`, depende do computador ligado e serve apenas para teste.
- Para instalar e usar de forma independente no iPhone, use um endereco `https://`.
- Mantenha backups periodicos pela aba Backup, porque o armazenamento local pertence ao navegador do iPhone.
