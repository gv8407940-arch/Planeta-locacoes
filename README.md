# Planeta Locações

PWA em JavaScript para gerenciar a locação de mesas, cadeiras, forros e outros itens para eventos, com uso pelo celular, dados locais e acesso offline após o primeiro carregamento.

**[Abrir o aplicativo](https://gv8407940-arch.github.io/Planeta-locacoes/)** · **[Instalar no iPhone](INSTALAR_IPHONE_SEM_COMPUTADOR.md)**

## O problema que o projeto resolve

Organizar uma locação envolve disponibilidade de itens, período de reserva, cliente, frete, pagamentos e contrato. O projeto reúne essas informações em uma aplicação web instalável, sem exigir um computador ligado para guardar os dados.

## Recursos

| Área | Recursos |
| --- | --- |
| Estoque | Cadastro de itens, movimentações e controle de disponibilidade. |
| Locações | Orçamentos, reservas, locações, conjuntos/kits, frete, desconto e sinal. |
| Clientes e documentos | Cadastro de clientes e geração de contratos de aluguel. |
| Financeiro | Acompanhamento de pagamentos, valores restantes, gastos, investimentos e parcelas. |
| Agenda | Próximas entregas, retiradas, buscas e devoluções. |
| Dados | Exportação e importação manual de backups JSON. |
| Celular e offline | Manifesto PWA, Service Worker e armazenamento local com IndexedDB. |

## Experimente pelo navegador

1. Abra o [aplicativo publicado](https://gv8407940-arch.github.io/Planeta-locacoes/).
2. Para explorar o projeto, use cadastros fictícios de itens e clientes.
3. Cadastre uma locação e acompanhe os valores e a disponibilidade.
4. Consulte a área de backup para exportar os registros desse navegador.

Os dados pertencem ao navegador ou aplicativo instalado naquele aparelho. Abrir o mesmo link em outro celular não sincroniza os registros automaticamente.

## Tecnologias e decisões

- **JavaScript, HTML e CSS:** interface e regras da aplicação.
- **IndexedDB:** armazenamento de itens, clientes, locações, pagamentos e demais registros no dispositivo.
- **Service Worker e Cache API:** cache dos arquivos da aplicação para acesso offline.
- **Web App Manifest:** identidade e abertura em janela de aplicativo.
- **jsPDF:** apoio à geração de documentos em PDF.
- **GitHub Pages:** hospedagem estática da versão publicada.
- **Node.js:** servidor HTTP simples para desenvolvimento local; não é um backend de dados.

## Como executar localmente

Com Node.js instalado, abra um PowerShell na pasta do projeto:

~~~powershell
$env:HOST = "127.0.0.1"
node servidor-local.js --no-open
~~~

Acesse **http://127.0.0.1:8765/index.html?v=39**. Para encerrar, pressione **Ctrl+C**.

Para verificar os recursos PWA, use o endereço publicado em HTTPS ou localhost. Abrir o HTML diretamente como arquivo não reproduz o funcionamento do Service Worker.

## Instalação e funcionamento offline

No iPhone, abra o endereço publicado no Safari e use **Compartilhar → Adicionar à Tela de Início**. Outros navegadores compatíveis podem oferecer sua própria opção de instalação.

O primeiro acesso precisa de internet para carregar e armazenar os arquivos. O cache permite acessos posteriores offline; os registros permanecem no IndexedDB do aparelho.

## Backup e limites atuais

- A transferência entre aparelhos é manual, por exportação e importação de JSON.
- A importação oferece opções de mesclar ou substituir registros; confira a opção escolhida.
- A limpeza dos dados do navegador pode apagar os registros locais. Mantenha cópias de backup fora dele.
- A aplicação não oferece sincronização automática, contas de usuário ou banco de dados centralizado.
- O repositório contém o código da aplicação; dados reais de clientes e backups da operação não fazem parte dele.

## Organização do código

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Estrutura das telas e formulários. |
| `style.css` | Estilos e adaptação da interface. |
| `app.js` | Fluxos de locações, estoque, financeiro, contratos e instalação. |
| `db.js` | Acesso ao IndexedDB e operações de backup. |
| `manifest.json` | Configuração da PWA. |
| `service-worker.js` | Cache dos arquivos e atendimento offline. |
| `servidor-local.js` | Servidor estático para desenvolvimento. |

## Evolução planejada

Possíveis próximas melhorias são separar os módulos de `app.js`, documentar os principais fluxos com demonstrações e acrescentar testes de disponibilidade, pagamentos e importação de backups. Esses itens são propostas de evolução.

## Autor

**Gabriel Victor**, estudante de Engenharia de Software.

[LinkedIn](https://www.linkedin.com/in/gabriel-victor-1a041b3b9/) · [GitHub](https://github.com/gv8407940-arch)
