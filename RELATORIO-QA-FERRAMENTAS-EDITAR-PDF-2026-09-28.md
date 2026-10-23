# Relatório de QA — Ferramentas recomendadas de PDF

Data: 28/09/2026  
Versão: PL Studio 0.5.0-beta.1  
Plataforma: Windows x64

## Escopo

Foram testadas as oito ferramentas exibidas na seção “Ferramentas recomendadas”:

1. Editor PDF completo
2. Dividir PDF
3. Comprimir PDF
4. PDF para JPG
5. Marca d'água
6. Rodar PDF
7. Organizar PDF
8. Números de página

Os testes utilizaram PDFs controlados de três páginas e validaram os artefatos gerados por reabertura com PDF.js e pdf-lib. A conversão para JPG foi renderizada com o mesmo PDF.js usado pelo aplicativo e as imagens tiveram assinatura JPEG validada. A sessão instalada do PL Studio já estava aberta e o bloqueio de instância única impediu uma segunda sessão automatizada da interface; por isso, a validação foi feita diretamente nos mesmos motores e algoritmos das ferramentas, sem interromper a sessão existente.

## Resultado executivo

| Ferramenta | Resultado | Verificações | Observação |
|---|---:|---:|---|
| Editor PDF completo | Aprovado | 7 | Reordenar, excluir, girar, texto, assinatura, marca d'água e numeração funcionaram. |
| Dividir PDF | Reprovado | 6 | O fluxo normal funciona, mas intervalos inválidos não têm validação adequada. |
| Comprimir PDF | Reprovado | 3 | O arquivo de teste aumentou 1 byte; não existe recompressão real do conteúdo. |
| PDF para JPG | Aprovado | 7 | Dois PDFs e cinco páginas geraram JPGs válidos, com nomes únicos no ZIP. |
| Marca d'água | Aprovado | 4 | Texto aplicado e recuperado nas três páginas. |
| Rodar PDF | Aprovado | 4 | Rotação de 90° persistida em todas as páginas. |
| Organizar PDF | Aprovado | 5 | Reordenação, exclusão e rotação persistiram corretamente. |
| Números de página | Aprovado com ressalva | 4 | Numeração correta, mas sem personalização de estilo. |

Total: 8 ferramentas, 40 verificações, 5 aprovadas, 1 aprovada com ressalva e 2 reprovadas.

## Defeitos encontrados

### QA-PDF-001 — Dividir PDF não valida intervalos inválidos

Severidade: média  
Arquivo relacionado: `src/main.jsx`, fluxo `tool.id === 'split'`.

- Entrada `1,3`: funciona e gera dois PDFs unitários válidos.
- Entrada `3-1`: tenta criar um array com tamanho negativo e lança erro interno.
- Entrada `abc`: resulta em uma seleção vazia e pode gerar um ZIP vazio, em vez de explicar o erro.

Resultado esperado: validar a expressão antes do processamento, rejeitar intervalos descendentes ou normalizá-los e impedir a geração quando nenhuma página válida for selecionada.

### QA-PDF-002 — Comprimir PDF não garante redução

Severidade: alta para a promessa funcional  
Arquivo relacionado: `src/main.jsx`, salvamento final com `useObjectStreams`.

- Entrada: 3.849 bytes.
- Saída “Equilibrado”: 3.850 bytes.
- Variação: aumento de 1 byte.

A ferramenta atualmente regrava a estrutura do PDF, mas não recomprime imagens ou outros conteúdos. Isso diverge do cartão “Reduza o tamanho mantendo a melhor qualidade”.

Resultado esperado: usar um motor de compressão real, medir entrada/saída e não substituir o arquivo por uma versão maior. Como alternativa temporária, renomear a função para “Otimizar estrutura do PDF” e informar que a redução não é garantida.

### QA-PDF-003 — Personalização de números de página incompleta

Severidade: baixa  
Arquivo relacionado: `src/main.jsx`, controles de `tool.id === 'numbers'`.

A numeração `1 / N` é aplicada corretamente e a posição pode ser alterada. Entretanto, o cartão promete “estilo personalizado” e não existem controles para formato, fonte, tamanho, cor ou página inicial.

Resultado esperado: adicionar opções de estilo ou ajustar a descrição para refletir somente numeração e posição.

## Artefatos

Os arquivos abaixo foram gerados em `tmp-qa-pdf-tools/`:

- PDF de entrada com três páginas.
- PDF do editor completo.
- ZIP da divisão de páginas.
- PDF da compressão estrutural.
- ZIP com cinco imagens JPG.
- PDF com marca d'água.
- PDF rotacionado.
- PDF reorganizado.
- PDF numerado.
- `resultado.json` com os resultados estruturados.

O teste pode ser repetido com:

```powershell
node scripts/qa-pdf-edit-tools.mjs
```

## Conclusão

As operações de edição, renderização, rotação e organização estão estruturalmente íntegras. “Dividir PDF” precisa de validação de entrada antes de produção, e “Comprimir PDF” não deve ser considerado aprovado enquanto não houver redução real ou reposicionamento claro da funcionalidade. “Números de página” funciona, mas a descrição atual excede as opções disponíveis.
