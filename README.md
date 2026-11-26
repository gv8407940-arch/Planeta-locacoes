# Planeta Locações

Sistema web para organizar locações de mesas, cadeiras, forros e outros produtos para eventos. Criado para atender a uma necessidade real, com foco no uso pelo celular e no acesso offline.

## Acesse o sistema

[Abrir o Planeta Locações](https://gv8407940-arch.github.io/Planeta-locacoes/)

O projeto pode ser instalado na tela inicial do celular como um aplicativo web progressivo (PWA), sem precisar de uma loja de aplicativos.

## Funcionalidades

- Cadastro de produtos, clientes e conjuntos de locação.
- Consulta de disponibilidade por data ou período, considerando reservas e locações.
- Registro de entradas e vendas de produtos no estoque.
- Controle de devoluções, itens danificados e manutenção.
- Criação de orçamentos, reservas e locações, com desconto, frete e sinal.
- Cadastro de cliente com CPF ou CNPJ opcional, validado quando informado.
- Geração de contrato para impressão ou PDF.
- Agenda e lembretes de reservas próximas.
- Controle de gastos, investimentos, parcelas e pagamentos parciais.
- Acompanhamento de valores a receber e relatório financeiro por período.
- Registro de abatamentos comerciais vinculados a dívidas com fornecedores.
- Exportação e importação manual de backup.

As funcionalidades dependem da versão publicada. Alterações feitas no computador só chegam ao site depois de serem enviadas ao GitHub e publicadas pelo GitHub Pages.

## Como funciona

O sistema usa HTML, CSS e JavaScript. Os dados são armazenados no navegador ou aplicativo instalado, usando IndexedDB. O service worker armazena arquivos necessários para permitir o uso offline após o primeiro acesso online e o carregamento completo do aplicativo.

O GitHub Pages disponibiliza os arquivos do sistema; ele não funciona como banco de dados das locações. O aplicativo não exige um computador ligado durante o uso no celular.

## Instalar no iPhone

1. Abra o [sistema](https://gv8407940-arch.github.io/Planeta-locacoes/) no Safari, com internet.
2. Toque em **Compartilhar** e selecione **Adicionar à Tela de Início**.
3. Abra o aplicativo pelo novo ícone e aguarde o carregamento.
4. Teste o funcionamento em modo avião antes de depender do acesso offline.

## Dados e backups

- Os dados ficam no aparelho e não são sincronizados automaticamente entre celular e computador. Para transferi-los, use a exportação e importação de backup.
- Exporte backups regularmente e guarde cópias em local seguro. Eles podem conter dados pessoais de clientes.
- Remover o aplicativo, limpar os dados do navegador ou perder o aparelho pode causar perda de informações locais. Não dependa do cache como backup.
- O repositório é público. Não envie backups, documentos de clientes, senhas ou outros dados pessoais para o GitHub.

## Tecnologias

- HTML, CSS e JavaScript
- IndexedDB para armazenamento local
- Service worker e Web App Manifest para recursos de PWA
- Git e GitHub para versionamento
- GitHub Pages para publicação

## Executar no computador

O endereço público acima é a forma mais simples de abrir o sistema. Para desenvolvimento local, o projeto também inclui `servidor-local.js` e arquivos para iniciar o site no Windows. Um servidor local é útil para testar recursos de PWA; ele não é necessário para usar a versão publicada no celular.
