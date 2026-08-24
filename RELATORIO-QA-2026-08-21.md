# Relatório de QA — PDFly Studio

Data: 21/08/2026  
Versão avaliada: código-fonte 0.2.6 com alterações ainda não publicadas

## Resultado executivo

Status: **aprovado com ressalvas para teste manual; ainda não liberar como versão final**.

O projeto compila, abre no Electron sem crash e os motores automatizados de PDF, criptografia, DOCX e XLSX passaram. A auditoria de dependências de produção não encontrou vulnerabilidades conhecidas. Antes da release, as conversões devem ser verificadas visualmente com documentos reais, principalmente PowerPoint, Office para PDF e OCR.

## Testes executados

| Teste | Resultado | Evidência |
|---|---|---|
| Build Vite de produção | Aprovado | 2.342 módulos transformados; build concluído em 8,61 s |
| Inicialização Electron | Aprovado | Interface carregada pelo `dist/index.html` sem crash |
| Tempo observado até interface carregada | Aprovado | Aproximadamente 3 s no computador de desenvolvimento |
| Geração de PDF | Aprovado | Arquivo de teste com 864 bytes |
| Proteção/criptografia de PDF | Aprovado | Arquivo criptografado com 1.357 bytes |
| Geração de DOCX | Aprovado | Arquivo de teste com 8.497 bytes |
| Geração de XLSX | Aprovado | Arquivo de teste com 6.407 bytes |
| Auditoria de dependências de produção | Aprovado | 0 vulnerabilidades encontradas |
| Recursos locais de OCR | Aprovado | Worker, núcleo WASM e idioma português presentes no `dist` |

## Problemas e riscos encontrados

### Alta prioridade

1. **Conversões complexas ainda precisam de validação visual.** O teste automatizado comprova que os arquivos são gerados, mas não garante fidelidade de layout nem que PowerPoint/Word/Excel os abrirão sem aviso.
2. **PDF para PowerPoint usa um gerador Open XML próprio.** É obrigatório abrir o resultado em uma instalação real do PowerPoint ou LibreOffice Impress antes da release.
3. **Office para PDF possui fidelidade limitada.** Word, Excel e PowerPoint são convertidos principalmente a partir do conteúdo textual; documentos com tabelas complexas, imagens, gráficos ou fontes especiais podem perder layout.
4. **OCR é beta.** Deve ser testado com PDF escaneado real, acentos em português, páginas tortas e documentos longos.

### Média prioridade

1. O bundle inicial possui arquivos JavaScript grandes (até aproximadamente 1,19 MB minificado), o que pode aumentar o tempo da primeira abertura em computadores lentos.
2. O build alerta que `crypto` foi externalizado para compatibilidade do navegador pelo pacote `pdf-lib-plus-encrypt`. O teste funcional de criptografia passou, mas deve continuar coberto em cada release.
3. `Desbloquear PDF` e `PDF para PDF/A` continuam marcados como **Em breve** e não devem ser apresentados como funcionais.
4. A pasta temporária `tmp-engine-test` permanece no projeto após o teste. Ela não é empacotada, mas deve ser removida antes da release.

## Observação do ambiente de QA

Na primeira tentativa, o Electron foi iniciado com `ELECTRON_RUN_AS_NODE=1`, fazendo `require('electron')` se comportar como Node e impedindo o acesso a `app`. Após remover essa variável somente da sessão de teste, o aplicativo abriu normalmente. Isso não representa o comportamento esperado do instalador, mas vale verificar se essa variável não existe nos computadores usados para desenvolvimento ou automação.

## Roteiro manual obrigatório antes da release

1. Abrir a aplicação em Windows 10 e Windows 11.
2. Testar PDF para JPG com 1 PDF e com vários PDFs; confirmar o ZIP e a ordem das imagens.
3. Abrir no Office real os arquivos gerados por PDF para Word, PowerPoint e Excel.
4. Converter DOCX, PPTX e XLSX contendo texto, imagens e tabelas; comparar o PDF visualmente.
5. Proteger um PDF, fechar o aplicativo e confirmar a senha em outro leitor de PDF.
6. Aplicar OCR em um PDF escaneado e confirmar que o texto pode ser pesquisado e copiado.
7. Testar juntar, dividir, organizar, girar, marca-d'água e números de página com PDFs de 1, 10 e 100 páginas.
8. Instalar e executar em outro computador sem Node.js, sem Office e sem acesso à internet.

## Critério para liberar

Gerar a próxima release somente depois que todos os itens do roteiro manual forem marcados como aprovados ou tiverem suas limitações claramente aceitas e documentadas.
