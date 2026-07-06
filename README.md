# Planeta Locações

Sistema PWA para controle de locações, estoque, clientes, contratos e financeiro da Planeta Locações.

## Sobre o projeto

O Planeta Locações foi desenvolvido para resolver uma necessidade real de controle de aluguel de mesas, cadeiras, forros e itens para eventos.

A proposta do sistema é permitir que o usuário gerencie reservas e locações diretamente pelo celular, sem depender de computador ligado, servidor próprio ou banco de dados online.

O sistema pode ser instalado na tela inicial do iPhone como um aplicativo e funciona offline após o primeiro acesso.

## Funcionalidades

- Cadastro de estoque individual
- Controle de quantidade disponível, reservada e alugada
- Cadastro de clientes
- Criação de orçamento, reserva e locação
- Cadastro de conjuntos/kits de locação
- Adição rápida de conjuntos na locação
- Controle de frete, desconto, sinal e valor restante
- Geração de contrato de aluguel
- Relatório financeiro
- Controle de gastos, custos, investimentos e parcelas
- Agenda dos próximos dias
- Lembretes de reservas
- Backup, exportação e importação de dados
- Funcionamento offline como PWA

## Tecnologias utilizadas

- HTML
- CSS
- JavaScript
- IndexedDB
- Service Worker
- PWA
- GitHub Pages

## Funcionamento offline

O sistema utiliza Service Worker para armazenar os arquivos principais em cache.

Após o primeiro acesso online, o app pode ser aberto novamente mesmo sem internet.

Os dados são armazenados localmente no próprio navegador ou dispositivo usando IndexedDB.

## Privacidade dos dados

O sistema não possui backend e não envia dados para servidor externo.

Clientes, estoque, locações, gastos e contratos ficam salvos localmente no aparelho do usuário.

Nenhum dado real de cliente deve ser enviado ao repositório.

## Instalação no iPhone

1. Abra o link do sistema no Safari.
2. Toque no botão de compartilhar.
3. Escolha “Adicionar à Tela de Início”.
4. Abra pelo ícone “Planeta Locações”.

## Backup

O sistema possui uma área de backup para exportar e importar os dados manualmente.

É recomendado exportar backups periodicamente para evitar perda de dados locais.

## Objetivo do projeto

Este projeto foi criado como uma solução prática para uso real em uma operação de locação de itens para eventos, com foco em:

- uso pelo celular;
- funcionamento offline;
- controle simples de estoque;
- geração de contratos;
- organização financeira;
- independência de serviços pagos.
