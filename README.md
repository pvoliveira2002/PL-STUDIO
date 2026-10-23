# PL Studio

Aplicativo desktop para Windows que reúne edição e conversão de PDFs, processamento de imagens e preparação de materiais para impressão. Os arquivos são processados localmente no computador.

## Recursos principais

- Editor PDF unificado com miniaturas, reordenação, rotação e exclusão de páginas.
- Texto, assinatura visual, marca-d'água e numeração com pré-visualização.
- Conversão entre PDF, imagens e formatos do Office.
- OCR local em português.
- Conversor de imagens em lote para JPG, PNG, WebP, AVIF e TIFF.
- Redimensionamento, qualidade, enquadramento e preservação de metadados.
- Montagem automática de imagens em folhas A4.
- Preparação de fotos 3x4 com múltiplas cópias.
- Remoção local de fundo com correção manual e montagem para impressão A6 paisagem.
- Histórico local e temas claro/escuro.

## Desenvolvimento

Requisitos: Node.js 20 ou superior e Windows x64 para gerar os executáveis.

```bash
npm install
npm run dev
```

Para compilar a interface:

```bash
npm run build
```

Para abrir o aplicativo Electron localmente:

```bash
npm run desktop:dev
```

Para gerar instalador e portátil de 64 bits:

```bash
npm run desktop:build
```

## Estrutura

- `src/`: interface React, Editor PDF e Editor de Imagens.
- `electron/`: processo principal, preload seguro e integração com Sharp.
- `public/`: marca, OCR em português e recursos estáticos.
- `scripts/`: testes automatizados dos motores de documentos.

## Observações

- A remoção de fundo usa `@imgly/background-removal-node` e executa localmente, sem serviço externo, chave de API ou custo por imagem.
- A opção histórica `preserveDetails` não preenche mais buracos transparentes. Ela passou a significar preservação do alpha intermediário gerado pelo modelo. O preenchimento antigo permanece apenas na comparação técnica de desenvolvimento.
- O acabamento mantém separadas a imagem normalizada, a saída bruta, a máscara original, a máscara refinada e o PNG final. O refinamento local de borda e a limpeza conservadora podem ser desativados; a descontaminação de halo é opcional.
- A versão instalada do motor contém os modelos `small` e `medium`. O PL Studio mantém `medium` como padrão; o modelo `large`, embora citado nos tipos da biblioteca, não está presente nos recursos locais desta versão.

- Desbloquear PDF e conversão PDF/A ainda estão marcados como “Em breve”.
- A assinatura atual é visual e não equivale a uma assinatura digital ICP-Brasil.
- Conversões complexas do Office podem apresentar diferenças de layout.
