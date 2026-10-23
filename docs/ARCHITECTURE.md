# Arquitetura do PL Studio

## Direção adotada

O aplicativo continua sendo um Electron com uma interface React, mas o código
deixa de tratar `main.jsx` como repositório de todas as responsabilidades. A
separação é incremental para preservar as ferramentas já entregues.

```text
src/
  app/                         catálogo e composição da aplicação
  features/
    background-removal/        detecção facial e processamento de imagem
    history/                   persistência do histórico local
    pdf/                       política comum de leitura e criação de PDF
  shared/                      utilitários sem regra de uma ferramenta
  BackgroundRemover.jsx        interface/orquestração do removedor
  ImageStudio.jsx              interface/orquestração de imagens
  PdfWorkbench.jsx             interface/orquestração do editor de PDF
electron/
  main.cjs                     acesso ao sistema e processamento nativo
  preload.cjs                  contrato seguro entre renderer e Electron
```

## Regras de dependência

- `shared` não importa componentes nem regras de uma feature.
- Uma feature pode importar `shared`, mas não outra interface de feature.
- Componentes cuidam da interação e do estado visual; processamento reutilizável
  fica em `features`.
- Acesso a arquivo nativo e bibliotecas Node permanece no processo principal do
  Electron e só é exposto pelo `preload`.
- Ferramentas grandes são carregadas sob demanda com `React.lazy`.
- O catálogo de ferramentas tem uma única fonte em `app/toolCatalog.jsx`.

## Compatibilidade preservada nesta etapa

- IDs, títulos, categorias e formatos aceitos pelas ferramentas não mudaram.
- PDFs continuam sendo carregados com a política de compatibilidade anterior.
- O modelo MediaPipe e seus caminhos locais não mudaram.
- Limite de entrada, download e nomes de arquivo passaram a usar funções comuns.
- Nenhum processamento foi transferido para serviços externos.

## Próximas extrações

1. Mover os conversores ainda presentes em `main.jsx` para serviços por formato.
2. Dividir `BackgroundRemover.jsx` em fluxo, editor de máscara e montagem A6.
3. Separar `styles.css` por feature sem alterar seletores públicos.
4. Adicionar testes unitários para os serviços e testes de integração dos canais
   do `preload`.

Essas extrações devem ser feitas em mudanças pequenas, cada uma acompanhada de
build e do QA do fluxo afetado.
