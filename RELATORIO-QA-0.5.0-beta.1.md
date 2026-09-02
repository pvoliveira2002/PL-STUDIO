# Relatório de QA — PL Studio 0.5.0-beta.1

Data: 02/09/2026  
Plataforma: Windows x64

## Resultado

A versão beta foi compilada e empacotada com sucesso em formato instalador NSIS e portátil.

## Verificações aprovadas

- Compilação de produção com Vite.
- Validação sintática dos processos principal e preload do Electron.
- Auditoria de dependências: zero vulnerabilidades após atualização corretiva.
- PDF/A removido da interface desta versão.
- Detecção de PDF protegido por senha.
- Rejeição de senha incorreta.
- Descriptografia local com senha correta.
- PDF resultante validado como não criptografado e estruturalmente íntegro.
- Senha gravada apenas em arquivo temporário de acesso restrito e removida após a operação.
- qpdf 12.4.1 e bibliotecas de execução presentes no pacote.
- Licença Apache 2.0 do qpdf presente na distribuição.
- Interface carregada com sucesso a partir do app.asar empacotado.
- Inicialização da versão empacotada confirmada no Windows.

## Artefatos

- PL Studio Setup 0.5.0-beta.1.exe — 263.461.963 bytes
- PL Studio 0.5.0-beta.1.exe — 263.192.411 bytes

## Observações da beta

- Os executáveis ainda não possuem certificado comercial de assinatura de código; o Windows SmartScreen pode exibir aviso.
- A primeira abertura do portátil pode ser mais lenta por causa da extração temporária.
- Recomenda-se teste piloto em máquinas Windows 10 e Windows 11 diferentes antes da versão 1.0.
