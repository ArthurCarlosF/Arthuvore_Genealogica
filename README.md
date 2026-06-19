# Arthuvore Genealógica

Árvore genealógica colaborativa com cadastro simplificado e correspondência inteligente por nomes.

## Cadastro inicial

São solicitados apenas:

- Nome completo.
- Nome completo do pai.
- Nome completo da mãe.
- E-mail.
- Senha e confirmação.

## Correspondência

Os nomes são normalizados, ignorando acentos, diferenças entre maiúsculas/minúsculas, pontuação e espaços duplicados.

- Nenhum cadastro com o nome do pai ou mãe: cria um perfil provisório.
- Um cadastro com aquele nome: cria a conexão automaticamente.
- Mais de um cadastro com o mesmo nome: mostra uma interrogação e solicita mais dados.
- Filhos que informaram o mesmo nome de pai ou mãe ficam conectados pelo mesmo perfil provisório.

Dados opcionais usados para desempate:

- Ano de nascimento.
- Mês de nascimento.
- Dia de nascimento.
- Documento de identificação.

Uma correspondência exata tem prioridade. Se não houver valor exato, um cadastro que ainda não informou aquele dado continua sendo considerado compatível. Valores informados e conflitantes impedem a correspondência.

## Arquitetura

- Frontend: GitHub Pages.
- Backend: Google Apps Script.
- Dados: Google Sheets.
- Senhas: hash SHA-256 com salt individual e pepper secreto.
- Sessões: tokens aleatórios válidos por 30 dias.

## Atualizar o Apps Script

1. Copie `apps-script/Code.gs` para o projeto.
2. Confirme as propriedades:

```text
SPREADSHEET_ID = ID da planilha
PASSWORD_PEPPER = texto secreto longo e aleatório
```

3. Crie uma **Nova versão** da implantação como aplicativo Web.
4. Execute como você e permita acesso a qualquer pessoa.

A URL `/exec` deve retornar:

```json
{"ok":true,"data":{"service":"Arthuvore API","version":3}}
```

As novas abas `UsuariosV3` e `SessoesV3` serão criadas automaticamente. As abas antigas não são alteradas.
