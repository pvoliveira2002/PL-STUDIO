# Relatório de funcionalidades — PDFly Studio

Data: 21/08/2026  
Base avaliada: desenvolvimento posterior à versão 0.2.6

## Resumo executivo

- 24 ferramentas catalogadas.
- 22 ferramentas com fluxo local implementado.
- 2 ferramentas permanecem desabilitadas: Desbloquear PDF e PDF para PDF/A.
- Compilação de produção concluída com sucesso.
- Auditoria das dependências distribuídas: 0 vulnerabilidades conhecidas (`npm audit --omit=dev`).
- Geradores PDF, PDF protegido, DOCX e XLSX exercitados por testes automatizados.
- Proteção de PDF exercitada também em navegador Chromium real.

## Situação por ferramenta

| Ferramenta | Estado | Implementação e limitações |
|---|---|---|
| Juntar PDF | Funcional | Combina páginas de vários PDFs localmente. |
| Dividir PDF | Funcional | Extrai páginas escolhidas e entrega ZIP. |
| Comprimir PDF | Funcional básico | Otimiza a estrutura; não recomprime agressivamente imagens. |
| PDF para Word | Funcional básico | Gera DOCX editável priorizando texto. Layout complexo pode mudar. |
| PDF para PowerPoint | Funcional | Uma imagem fiel de cada página é colocada em um slide 16:9. Conteúdo interno não é editável. |
| PDF para Excel | Funcional básico | Cria uma planilha por página e tenta separar colunas. Tabelas complexas podem exigir ajustes. |
| Word para PDF | Funcional básico | Suporta DOCX e prioriza texto; estilos e paginação avançados podem mudar. DOC antigo não é suportado. |
| PowerPoint para PDF | Funcional básico | Suporta PPTX e extrai o conteúdo textual dos slides. Elementos gráficos não são reproduzidos integralmente. |
| Excel para PDF | Funcional básico | Suporta XLS/XLSX e transforma células em linhas legíveis. Não replica impressão do Excel. |
| Editar PDF | Funcional básico | Insere anotação textual no rodapé da última página. Ainda não substitui textos existentes. |
| PDF para JPG | Funcional | Suporta vários PDFs, três qualidades e ZIP único sem subpastas. |
| JPG para PDF | Funcional | Combina JPG e PNG em PDF. |
| Assinar PDF | Funcional visual | Insere assinatura textual visual. Não é assinatura criptográfica ICP-Brasil. |
| Marca d'água | Funcional | Aplica texto com transparência. |
| Rodar PDF | Funcional | Gira todas as páginas. |
| HTML para PDF | Funcional básico | Converte arquivo HTML/HTM/TXT em PDF textual. CSS complexo não é reproduzido. |
| Desbloquear PDF | Não disponível | Requer descriptografia real. O qpdf WASM testado exige memória compartilhada incompatível com o empacotamento atual. |
| Proteger PDF | Funcional | Aplica senha e restrições localmente; validado em Chromium real. |
| Organizar PDF | Funcional | Miniaturas, arrastar, girar, excluir e exportar. |
| PDF para PDF/A | Não disponível | Conformidade PDF/A exige Ghostscript/validador e perfil ICC. Não foi simulada com metadados falsos. |
| Reparar PDF | Funcional básico | Regrava e reconstrói a estrutura de PDFs que ainda podem ser analisados. Danos graves exigem Ghostscript/qpdf nativo. |
| Números de página | Funcional | Insere numeração no documento. |
| Digitalizar para PDF | Funcional | Converte imagens capturadas/importadas em PDF. |
| OCR PDF | Funcional beta | OCR local em português, modelo incluído; adiciona camada pesquisável. PDFs extensos podem consumir bastante memória. |

## Dependências e privacidade

O processamento implementado acontece localmente. O modelo OCR em português está incluído em `public/tessdata`, evitando download posterior. Arquivos não são enviados para uma API.

## Testes executados

1. `npm run build`: aprovado.
2. `npm audit --omit=dev`: 0 vulnerabilidades.
3. Geração programática de PDF: aprovada.
4. Criptografia e geração de PDF protegido: aprovada em Node e Chromium.
5. Geração de DOCX: aprovada.
6. Geração de XLSX: aprovada.

## Riscos e próximos passos

Antes de uma release pública, testar manualmente cada ferramenta com documentos reais pequenos, grandes, escaneados, protegidos e corrompidos. As conversões Office atuais são adequadas para uso pessoal e conteúdo simples, mas não prometem fidelidade equivalente ao Microsoft Office ou LibreOffice.

Para completar as duas funções restantes com qualidade:

- integrar qpdf nativo para desbloqueio;
- integrar Ghostscript e um validador como veraPDF para PDF/A;
- revisar obrigações de licença antes de redistribuir esses binários.

Não é recomendado gerar uma nova release antes dessa bateria manual de testes.
